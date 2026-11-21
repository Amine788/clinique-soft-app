// Facturation — création, liste, historique d'un patient et détail d'une facture.
import { Router } from 'express';
import { createInvoice } from '../../services/createInvoice.js';
import { billingDetails, paymentInclude } from '../../services/billingDetails.js';
import { accessQuery } from '../../services/patientAccess.js';
import { authenticateJWT, authorizeRole } from '../../middleware/auth.js';
import { Op } from 'sequelize';
import { Facture, LigneFacture, Patient, Medecin, User, RendezVous, Hospitalisation, ExamenPatient } from '../../models/index.js';
import { Prescription } from '../../models/prescription.js';
import { inClinic } from '../../services/tenant.js';
import { minuitClinique, ajouterJours } from '../../services/dates.js';

const router = Router();

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/billing — Créer une facture
// ─────────────────────────────────────────────────────────────────────────────
router.post('/', authenticateJWT, authorizeRole('secretary', 'admin'), async (req, res, next) => {
    try { res.status(201).json({ success: true, facture: await createInvoice(req) }); }
    catch (error) { next(error); }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/billing — Liste des factures
// ─────────────────────────────────────────────────────────────────────────────
// Filtres facultatifs (écran Finances de l'administrateur) : from/to (date de facture, AAAA-MM-JJ),
// statut, q (CIN ou nom du patient), assurance (organisme ou « aucune »), medecinId, limit (1 à 500).
// Sans filtre : les 100 dernières factures, comme avant.
const STATUTS = ['en_attente', 'partielle', 'payee', 'annulee', 'impayee'];
const dateValide = s => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && new Date(s + 'T12:00:00Z').toISOString().slice(0, 10) === s;
router.get('/', authenticateJWT, authorizeRole('secretary', 'admin'), async (req, res) => {
    try {
        const { statut, patientCin, from, to, q, assurance, medecinId } = req.query;
        for (const v of [statut, patientCin, from, to, q, assurance, medecinId, req.query.limit]) {
            if (v !== undefined && typeof v !== 'string') return res.status(400).json({ error: 'Filtre invalide' });
        }
        if (statut && !STATUTS.includes(statut)) return res.status(400).json({ error: 'Statut de facture invalide' });
        if ((from && !dateValide(from)) || (to && !dateValide(to)) || (from && to && from > to)) return res.status(400).json({ error: 'Période invalide' });
        if (medecinId && !/^[1-9]\d{0,9}$/.test(medecinId)) return res.status(400).json({ error: 'Médecin invalide' });
        if (q && q.length > 100) return res.status(400).json({ error: 'Recherche trop longue' });
        const limit = req.query.limit === undefined ? 100 : Number(req.query.limit);
        if (!Number.isInteger(limit) || limit < 1 || limit > 500) return res.status(400).json({ error: 'Nombre de résultats invalide (1 à 500)' });

        const where = inClinic(req);
        if (statut) where.statut = statut;
        if (patientCin) where.patientCin = patientCin.toUpperCase();
        if (from || to) where.createdAt = { ...(from && { [Op.gte]: minuitClinique(from) }), ...(to && { [Op.lt]: minuitClinique(ajouterJours(to, 1)) }) };
        const patientWhere = {};
        if (q?.trim()) {
            const terme = `%${q.trim().replace(/[\\%_]/g, c => '\\' + c)}%`;
            patientWhere[Op.or] = [{ cinNumero: { [Op.like]: terme } }, { nom: { [Op.like]: terme } }, { prenom: { [Op.like]: terme } }];
        }
        if (assurance === 'aucune') patientWhere[Op.and] = [{ [Op.or]: [{ assuranceOrganisme: null }, { assuranceOrganisme: '' }] }];
        else if (assurance) patientWhere.assuranceOrganisme = assurance;
        const filtrePatient = Reflect.ownKeys(patientWhere).length > 0;

        // Le filtre par médecin se calcule après la lecture : la limite s'applique ensuite
        const factures = await Facture.findAll(await accessQuery(req, Facture, {
            where,
            include: [{ model: LigneFacture, as: 'lignes' }, paymentInclude,
                { model: Patient, attributes: ['nom', 'prenom', 'assuranceOrganisme'], required: filtrePatient, ...(filtrePatient && { where: patientWhere }) }],
            order: [['createdAt', 'DESC'], ['id', 'DESC']],
            ...(medecinId ? {} : { limit }),
        }));
        const medecins = await medecinsDesFactures(req, factures);

        const liste = factures.map(f => {
            const fJson = billingDetails(f);
            if (!Array.isArray(fJson.lignes)) {
                fJson.lignes = JSON.parse(fJson.lignes || '[]');
            }
            if (Array.isArray(fJson.lignes)) fJson.lignes = fJson.lignes.map(l => ({ ...l, designation: l.sourceType === 'medicament' ? 'Produits pharmaceutiques' : l.sourceType === 'examen' ? 'Acte technique' : l.designation }));
            const medecin = medecins.get(f.id);
            fJson.patientNom = f.Patient ? `${f.Patient.prenom} ${f.Patient.nom}` : null;
            fJson.insurance = f.Patient?.assuranceOrganisme || null;
            fJson.medecinId = medecin?.id ?? null;
            fJson.medecinNom = medecin?.nom ?? null;
            delete fJson.Patient;
            return fJson;
        });
        res.json(medecinId ? liste.filter(f => f.medecinId === Number(medecinId)).slice(0, limit) : liste);
    } catch (err) {
        console.error('[BILLING LIST]', err.message);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// Médecin d'une facture : celui du rendez-vous d'en-tête, sinon de la première prestation qui en a un
// (consultation, séjour, examen, ordonnance). Les lignes manuelles n'en ont pas.
async function medecinsDesFactures(req, factures) {
    const ids = { consultation: new Set(), chambre: new Set(), examen: new Set(), medicament: new Set() };
    for (const f of factures) {
        if (f.rdvId) ids.consultation.add(f.rdvId);
        for (const l of f.lignes || []) if (l.sourceId && ids[l.sourceType]) ids[l.sourceType].add(l.sourceId);
    }
    const lire = async (Model, set) => set.size ? Model.findAll({ where: inClinic(req, { id: { [Op.in]: [...set] } }), attributes: ['id', 'medecinId'] }) : [];
    const [rdvs, sejours, examens, ordonnances] = await Promise.all([
        lire(RendezVous, ids.consultation), lire(Hospitalisation, ids.chambre), lire(ExamenPatient, ids.examen), lire(Prescription, ids.medicament),
    ]);
    const parSource = { consultation: new Map(rdvs.map(r => [r.id, r.medecinId])), chambre: new Map(sejours.map(r => [r.id, r.medecinId])),
        examen: new Map(examens.map(r => [r.id, r.medecinId])), medicament: new Map(ordonnances.map(r => [r.id, r.medecinId])) };
    const medecinIds = new Set(Object.values(parSource).flatMap(m => [...m.values()]).filter(Boolean));
    const fiches = medecinIds.size ? await Medecin.findAll({ where: inClinic(req, { id: { [Op.in]: [...medecinIds] } }), include: [{ model: User, attributes: ['nom', 'prenom'] }] }) : [];
    const noms = new Map(fiches.map(m => [m.id, [m.titre, m.User?.prenom, m.User?.nom].filter(Boolean).join(' ')]));
    const resultat = new Map();
    for (const f of factures) {
        let id = f.rdvId ? parSource.consultation.get(f.rdvId) : null;
        for (const type of ['consultation', 'chambre', 'examen', 'medicament']) {
            if (id) break;
            const ligne = (f.lignes || []).find(l => l.sourceType === type && parSource[type].get(l.sourceId));
            id = ligne ? parSource[type].get(ligne.sourceId) : null;
        }
        if (id && noms.has(id)) resultat.set(f.id, { id, nom: noms.get(id) });
    }
    return resultat;
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/billing/patient/:cin — Historique patient
// ─────────────────────────────────────────────────────────────────────────────
router.get('/patient/:cin', authenticateJWT, authorizeRole('secretary', 'admin'), async (req, res) => {
    try {
        const factures = await Facture.findAll(await accessQuery(req, Facture, {
            where: inClinic(req, { patientCin: req.params.cin.toUpperCase() }),
            include: [{ model: LigneFacture, as: 'lignes' }, paymentInclude],
            order: [['created_at', 'DESC']]
        }));
        res.json(factures.map(f => {
            const fJson = billingDetails(f);
            if (!Array.isArray(fJson.lignes)) {
                fJson.lignes = JSON.parse(fJson.lignes || '[]');
            }
            if (Array.isArray(fJson.lignes)) fJson.lignes = fJson.lignes.map(l => ({ ...l, designation: l.sourceType === 'medicament' ? 'Produits pharmaceutiques' : l.sourceType === 'examen' ? 'Acte technique' : l.designation }));
            return fJson;
        }));
    } catch (err) {
        console.error('[BILLING PATIENT HISTORY]', err);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/billing/:id — Détail facture
// ─────────────────────────────────────────────────────────────────────────────
router.get('/:id', authenticateJWT, authorizeRole('secretary', 'admin'), async (req, res) => {
    try {
        const f = await Facture.findOne(await accessQuery(req, Facture, {
            where: inClinic(req, { id: req.params.id }),
            include: [{ model: LigneFacture, as: 'lignes' }, paymentInclude]
        }));
        if (!f) return res.status(404).json({ error: 'Non trouvée' });

        const fJson = billingDetails(f);
        if (!Array.isArray(fJson.lignes)) {
            fJson.lignes = JSON.parse(fJson.lignes || '[]');
        }
        if (Array.isArray(fJson.lignes)) fJson.lignes = fJson.lignes.map(l => ({ ...l, designation: l.sourceType === 'medicament' ? 'Produits pharmaceutiques' : l.sourceType === 'examen' ? 'Acte technique' : l.designation }));
        res.json(fJson);
    } catch (err) {
        console.error('[BILLING DETAIL ERROR]', err);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

export default router;
