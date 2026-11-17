// Facturation — création, liste, historique d'un patient et détail d'une facture.
import { Router } from 'express';
import crypto from 'node:crypto';
import { accessQuery } from '../../services/patientAccess.js';
import { authenticateJWT, authorizeRole } from '../../middleware/auth.js';
import { Patient, Facture, LigneFacture } from '../../models/index.js';
import { inClinic } from '../../services/tenant.js';

const router = Router();

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/billing — Créer une facture
// ─────────────────────────────────────────────────────────────────────────────
router.post('/', authenticateJWT, authorizeRole('secretary', 'admin'), async (req, res) => {
    try {
        const { patientCin, rdvId, lignes, assuranceTaux = 0, notes } = req.body;

        if (!patientCin || !lignes?.length) {
            return res.status(400).json({ error: 'CIN patient et lignes requises' });
        }

        const patient = await Patient.findOne(await accessQuery(req, Patient, { where: inClinic(req, { cinNumero: patientCin.toUpperCase() }) }));
        if (!patient) return res.status(404).json({ error: 'Patient non trouvé' });

        const { RendezVous, ExamenPatient, Hospitalisation } = await import('../../models/index.js');
        const { Prescription } = await import('../prescriptions.js');
        if (rdvId && !await RendezVous.findOne({ where: inClinic(req, { id: rdvId, patientId: patient.id }) })) return res.status(404).json({ error: 'Rendez-vous non trouvé' });
        for (const line of lignes) {
            const type = line.sourceType;
            const Model = { consultation: RendezVous, medicament: Prescription, examen: ExamenPatient, chambre: Hospitalisation }[type];
            if (Model && (!line.sourceId || !await Model.findOne({ where: inClinic(req, { id: line.sourceId, ...(type === 'medicament' ? { patientCin: patient.cinNumero } : { patientId: patient.id }) }) }))) return res.status(404).json({ error: 'Source de facturation non trouvée pour ce patient' });
            if (!Model && line.sourceId) return res.status(400).json({ error: 'Référence de facturation invalide' });
        }

        // Calcul
        const sousTotal = lignes.reduce((sum, l) => sum + (l.quantite * l.prixUnitaire), 0);
        const tva = Math.round(sousTotal * 0.07 * 100) / 100;
        const total = sousTotal + tva;
        const assuranceMontant = Math.round(total * (assuranceTaux / 100) * 100) / 100;
        const resteACharge = Math.round((total - assuranceMontant) * 100) / 100;

        const numero = `FC-${crypto.randomUUID().replaceAll('-', '').slice(0, 16)}`;

        const facture = await Facture.create({
            numero,
            patientCin: patientCin.toUpperCase(),
            clinic_id: patient.clinic_id,
            patientId: patient.id,
            rdvId: rdvId || null,
            sousTotal, tva, total, assuranceTaux,
            assuranceMontant, resteACharge,
            notes,
            creeParUserId: req.user.id
        });

        // Créer les lignes de facture associées
        const lignesData = lignes.map(l => ({
            factureId: facture.id,
            sourceType: l.sourceType || 'manuel',
            sourceId: l.sourceId || null,
            designation: l.sourceType === 'medicament' ? 'Produits pharmaceutiques' : l.sourceType === 'examen' ? 'Acte technique' : l.designation,
            quantite: Number(l.quantite),
            prixUnitaire: Number(l.prixUnitaire),
            montantTotal: Number(l.quantite) * Number(l.prixUnitaire)
        }));

        await LigneFacture.bulkCreate(lignesData);

        console.log(`[BILLING] Facture ${numero} créée — Patient: ${patientCin} — Total: ${total} MAD`);
        res.status(201).json({
            success: true,
            facture: { ...facture.toJSON(), lignes: lignesData, numero }
        });

    } catch (error) {
        console.error('[BILLING] Erreur:', error.message);
        res.status(500).json({ error: 'Erreur serveur', details: error.message });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/billing — Liste des factures
// ─────────────────────────────────────────────────────────────────────────────
router.get('/', authenticateJWT, authorizeRole('secretary', 'admin'), async (req, res) => {
    try {
        const where = inClinic(req);
        if (req.query.statut) where.statut = req.query.statut;
        if (req.query.patientCin) where.patientCin = req.query.patientCin.toUpperCase();

        const factures = await Facture.findAll(await accessQuery(req, Facture, {
            where,
            include: [{ model: LigneFacture, as: 'lignes' }],
            order: [['createdAt', 'DESC']],
            limit: 100
        }));

        res.json(factures.map(f => {
            const fJson = f.toJSON();
            if (!Array.isArray(fJson.lignes)) {
                fJson.lignes = JSON.parse(fJson.lignes || '[]');
            }
            if (Array.isArray(fJson.lignes)) fJson.lignes = fJson.lignes.map(l => ({ ...l, designation: l.sourceType === 'medicament' ? 'Produits pharmaceutiques' : l.sourceType === 'examen' ? 'Acte technique' : l.designation }));
            return fJson;
        }));
    } catch (err) {
        console.error('[BILLING LIST]', err.message);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/billing/patient/:cin — Historique patient
// ─────────────────────────────────────────────────────────────────────────────
router.get('/patient/:cin', authenticateJWT, authorizeRole('secretary', 'admin'), async (req, res) => {
    try {
        const factures = await Facture.findAll(await accessQuery(req, Facture, {
            where: inClinic(req, { patientCin: req.params.cin.toUpperCase() }),
            include: [{ model: LigneFacture, as: 'lignes' }],
            order: [['created_at', 'DESC']]
        }));
        res.json(factures.map(f => {
            const fJson = f.toJSON();
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
            include: [{ model: LigneFacture, as: 'lignes' }]
        }));
        if (!f) return res.status(404).json({ error: 'Non trouvée' });

        const fJson = f.toJSON();
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
