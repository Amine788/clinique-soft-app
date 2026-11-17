// Infirmerie — accueil en consultation : file d'attente, scan du patient, constantes, dossier.
import { Router } from 'express';
import { accessQuery, updateScoped } from '../../services/patientAccess.js';
import { Op } from 'sequelize';
import { authenticateJWT, authorizeRole } from '../../middleware/auth.js';
import { RendezVous, Patient, Medecin, User, DossierMedical } from '../../models/index.js';
import { inClinic } from '../../services/tenant.js';
import { ROLES_SOINS } from '../../services/circuitOrdonnance.js';
import { getTodayStr } from './_commun.js';

const router = Router();

// ─── 1. GET /queue ────────────────────────────────────────────────────────
// Retrieve all today's appointments that are in 'arrive' or 'pret' status
router.get('/queue', authenticateJWT, authorizeRole(...ROLES_SOINS), async (req, res) => {
    try {
        const todayStr = getTodayStr();
        const clinicId = req.user.clinic_id;

        const whereClause = {
            dateRdv: todayStr,
            statut: { [Op.in]: ['arrive', 'pret'] }
        };
        // Filtrer par clinique si l'utilisateur appartient à une clinique
        if (clinicId) whereClause.clinic_id = clinicId;

        const rdvs = await RendezVous.findAll(await accessQuery(req, RendezVous, {
            where: whereClause,
            include: [
                { model: Patient, attributes: ['nom', 'prenom', 'cinNumero', 'dateNaissance', 'telephonePrincipal', 'numeroDossier'] },
                { model: Medecin, include: [{ model: User, attributes: ['nom', 'prenom'] }] }
            ],
            order: [['heureDebut', 'ASC']]
        }));

        const mapped = rdvs.map(r => {
            const age = r.Patient?.dateNaissance
                ? new Date().getFullYear() - new Date(r.Patient.dateNaissance).getFullYear()
                : 30;
            // Parser vitals si c'est une string JSON
            let vitals = r.vitals;
            if (vitals && typeof vitals === 'string') {
                try { vitals = JSON.parse(vitals); } catch { vitals = null; }
            }
            return {
                id: r.numeroRdv,
                patientId: r.Patient?.numeroDossier,
                patientCin: r.patientCin,
                nom: r.Patient ? `${r.Patient.prenom} ${r.Patient.nom}` : '—',
                age,
                rdv: r.heureDebut?.slice(0, 5),
                medecin: r.Medecin?.User ? `Dr. ${r.Medecin.User.prenom} ${r.Medecin.User.nom}` : '—',
                motif: r.motif,
                statut: r.statut,
                vitals
            };
        });

        res.json(mapped);
    } catch (error) {
        console.error('[NURSE QUEUE GET] Erreur :', error.message);
        res.status(500).json({ error: 'Erreur serveur', details: error.message });
    }
});

// ─── 2. GET /scan/:token ──────────────────────────────────────────────────
// Retrieve a specific appointment (must be active today and in 'arrive' or 'pret' status) by QR token or CIN
router.get('/scan/:token', authenticateJWT, authorizeRole(...ROLES_SOINS), async (req, res) => {
    try {
        const token = req.params.token.trim();
        const todayStr = getTodayStr();
        const clinicId = req.user.clinic_id;

        const buildWhere = (extra) => {
            const w = { dateRdv: todayStr, statut: { [Op.in]: ['arrive', 'pret'] }, ...extra };
            if (clinicId) w.clinic_id = clinicId;
            return w;
        };

        // Chercher par numéro RDV d'abord
        let rdv = await RendezVous.findOne(await accessQuery(req, RendezVous, {
            where: buildWhere({ numeroRdv: token }),
            include: [
                { model: Patient, attributes: ['nom', 'prenom', 'cinNumero', 'dateNaissance', 'telephonePrincipal', 'numeroDossier'] },
                { model: Medecin, include: [{ model: User, attributes: ['nom', 'prenom'] }] }
            ]
        }));

        // Sinon chercher par CIN patient
        if (!rdv) {
            rdv = await RendezVous.findOne(await accessQuery(req, RendezVous, {
                where: buildWhere({ patientCin: token.toUpperCase() }),
                include: [
                    { model: Patient, attributes: ['nom', 'prenom', 'cinNumero', 'dateNaissance', 'telephonePrincipal', 'numeroDossier'] },
                    { model: Medecin, include: [{ model: User, attributes: ['nom', 'prenom'] }] }
                ]
            }));
        }

        if (!rdv) {
            return res.status(404).json({ error: 'Aucun rendez-vous actif aujourd\'hui pour ce patient ou ce jeton.' });
        }

        const age = rdv.Patient?.dateNaissance
            ? new Date().getFullYear() - new Date(rdv.Patient.dateNaissance).getFullYear()
            : 30;

        // Parser vitals si c'est une string JSON
        let vitals = rdv.vitals;
        if (vitals && typeof vitals === 'string') {
            try { vitals = JSON.parse(vitals); } catch { vitals = null; }
        }

        res.json({
            id: rdv.numeroRdv,
            patientId: rdv.Patient?.numeroDossier,
            patientCin: rdv.patientCin,
            nom: rdv.Patient ? `${rdv.Patient.prenom} ${rdv.Patient.nom}` : '—',
            age,
            rdv: rdv.heureDebut?.slice(0, 5),
            medecin: rdv.Medecin?.User ? `Dr. ${rdv.Medecin.User.prenom} ${rdv.Medecin.User.nom}` : '—',
            motif: rdv.motif,
            statut: rdv.statut,
            vitals: vitals || { ta: '', pouls: '', temp: '', poids: '', spo2: '' }
        });
    } catch (error) {
        console.error('[NURSE SCAN GET] Erreur :', error.message);
        res.status(500).json({ error: 'Erreur serveur', details: error.message });
    }
});

// ─── 3. POST /vitals ──────────────────────────────────────────────────────
// Save Patient Vitals and set status to 'pret'
router.post('/vitals', authenticateJWT, authorizeRole(...ROLES_SOINS), async (req, res) => {
    try {
        const { rdvId, vitals } = req.body;
        if (!rdvId || !vitals) {
            return res.status(400).json({ error: 'Rendez-vous ID (numeroRdv) et constantes requis' });
        }

        const rdv = await RendezVous.findOne(await accessQuery(req, RendezVous, {
            where: inClinic(req, { numeroRdv: rdvId })
        }));

        if (!rdv) {
            return res.status(404).json({ error: 'Rendez-vous non trouvé' });
        }

        await updateScoped(req, rdv, {
            vitals,
            statut: 'pret'
        });

        res.json({ success: true, message: 'Constantes enregistrées avec succès', statut: 'pret' });
    } catch (error) {
        console.error('[NURSE VITALS POST] Erreur :', error.message);
        res.status(500).json({ error: 'Erreur serveur', details: error.message });
    }
});

// ─── 3b. GET /vitals-history/:patientCin ──────────────────────────────────
// Retrieve past vitals for a specific patient
router.get('/vitals-history/:patientCin', authenticateJWT, authorizeRole(...ROLES_SOINS), async (req, res) => {
    try {
        const { patientCin } = req.params;
        const history = await RendezVous.findAll(await accessQuery(req, RendezVous, {
            where: inClinic(req, {
                patientCin: patientCin.toUpperCase(),
                vitals: { [Op.ne]: null }
            }),
            attributes: ['dateRdv', 'vitals'],
            order: [['dateRdv', 'DESC']],
            limit: 5
        }));

        const parsedHistory = history.map(h => {
            let vitals = h.vitals;
            if (vitals && typeof vitals === 'string') {
                try { vitals = JSON.parse(vitals); } catch { vitals = null; }
            }
            return {
                dateRdv: h.dateRdv,
                vitals
            };
        });

        res.json(parsedHistory);
    } catch (error) {
        console.error('[NURSE VITALS HISTORY] Erreur :', error.message);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// ─── 3c. GET /patient-by-dossier/:dossierId ────────────────────────────────
// Scan QR patient → récupérer toutes les infos du patient par son numéro de dossier
router.get('/patient-by-dossier/:dossierId', authenticateJWT, authorizeRole('nurse', 'doctor'), async (req, res) => {
    try {
        const { dossierId } = req.params;
        const clinicId = req.user.clinic_id;

        const patient = await Patient.findOne(await accessQuery(req, Patient, {
            where: { numeroDossier: dossierId, clinic_id: clinicId },
            include: [{ model: DossierMedical }]
        }));

        if (!patient) {
            return res.status(404).json({ error: 'Patient non trouvé dans cette clinique', code: 'NOT_FOUND' });
        }

        const dossier = patient.DossierMedical;
        const allergies = dossier?.allergies
            ? (typeof dossier.allergies === 'string' ? JSON.parse(dossier.allergies) : dossier.allergies)
            : [];
        const chronic = dossier?.maladiesChroniques
            ? (typeof dossier.maladiesChroniques === 'string' ? JSON.parse(dossier.maladiesChroniques) : dossier.maladiesChroniques)
            : [];

        const age = patient.dateNaissance
            ? Math.floor((new Date() - new Date(patient.dateNaissance)) / (365.25 * 24 * 60 * 60 * 1000))
            : null;

        // Chercher le dernier RDV du jour
        const todayStr = getTodayStr();
        const rdvAujourdhui = await RendezVous.findOne(await accessQuery(req, RendezVous, {
            where: {
                patientId: patient.id,
                dateRdv: todayStr,
                statut: { [Op.in]: ['arrive', 'pret', 'planifie', 'confirme'] }
            },
            include: [{ model: Medecin, include: [{ model: User, attributes: ['nom', 'prenom'] }] }],
            order: [['heureDebut', 'ASC']]
        }));

        console.log(`[NURSE QR SCAN] Dossier ${dossierId} consulté par ${req.user.name} (Clinique #${clinicId})`);

        res.json({
            id: patient.numeroDossier,
            cin: patient.cinNumero,
            nom: patient.nom,
            prenom: patient.prenom,
            name: `${patient.prenom} ${patient.nom}`,
            dateNaissance: patient.dateNaissance,
            age,
            sexe: patient.sexe,
            phone: patient.telephonePrincipal,
            email: patient.email,
            address: patient.adresseRue,
            ville: patient.adresseVille,
            bloodType: dossier?.groupeSanguin || null,
            allergies,
            chronic,
            insurance: patient.assuranceOrganisme || null,
            cinExpiree: patient.cinDateExpiration && new Date(patient.cinDateExpiration) < new Date(),
            rdvAujourdhui: rdvAujourdhui ? {
                id: rdvAujourdhui.numeroRdv,
                heure: rdvAujourdhui.heureDebut?.slice(0, 5),
                motif: rdvAujourdhui.motif,
                statut: rdvAujourdhui.statut,
                medecin: rdvAujourdhui.Medecin?.User
                    ? `Dr. ${rdvAujourdhui.Medecin.User.prenom} ${rdvAujourdhui.Medecin.User.nom}`
                    : null,
                vitals: rdvAujourdhui.vitals || null,
            } : null,
        });
    } catch (error) {
        console.error('[NURSE PATIENT BY DOSSIER] Erreur :', error.message);
        res.status(500).json({ error: 'Erreur serveur', details: error.message });
    }
});

export default router;
