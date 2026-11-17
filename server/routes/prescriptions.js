import crypto from 'node:crypto';
import { patientAccess, accessQuery, scopedByPk, audit, updateScoped } from '../services/patientAccess.js';
import { Router } from 'express';
import { authenticateJWT, authorizeRole, requireClinicId } from '../middleware/auth.js';
import { Patient, Medecin, RendezVous, User } from '../models/index.js';
import { clinicSocket } from '../socket/clinicSocket.js';
import { Op } from 'sequelize';
import { Prescription } from '../models/prescription.js';
import { generateSlots, normalizeMedicament, parseMedicaments, medicamentsInvalides } from '../services/posologie.js';
import { inClinic, byIdInClinic } from '../services/tenant.js';
import { refusTransition } from '../services/circuitOrdonnance.js';
const router = Router();
router.use(authenticateJWT, requireClinicId, patientAccess('prescriptions'));

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/prescriptions — Créer une ordonnance (médecin)
// ─────────────────────────────────────────────────────────────────────────────
// Seul le médecin prescrit, en son nom : une ordonnance engage le médecin qui la signe
router.post('/', authenticateJWT, authorizeRole('doctor'), async (req, res) => {
    try {
        const { patientCin, rdvId, notes, diagnostique } = req.body;
        let { medicaments } = req.body;

        if (!patientCin || !medicaments?.length) {
            return res.status(400).json({ error: 'Patient CIN et médicaments requis' });
        }

        // Schéma unique, avec un nombre de prises explicite pour le plan d'administration infirmier
        const invalide = medicamentsInvalides(medicaments);
        if (invalide) return res.status(400).json({ error: invalide });
        medicaments = medicaments.map(normalizeMedicament);

        // Trouver infos patient
        const patient = await Patient.findOne(await accessQuery(req, Patient, { where: inClinic(req, { cinNumero: patientCin.toUpperCase() }) }));
        if (!patient) return res.status(404).json({ error: 'Patient non trouvé' });

        // Médecin prescripteur : toujours le médecin connecté (un medecinId envoyé est ignoré)
        const medecin = await Medecin.findOne(await accessQuery(req, Medecin, { where: inClinic(req, { userId: req.user.id }) }));
        if (!medecin) return res.status(400).json({ error: 'Fiche médecin introuvable pour ce compte' });
        const medecinId = medecin.id;

        // Résoudre l'ID interne (entier) du rendez-vous
        let internalRdvId = null;
        if (rdvId && rdvId !== 'demo') {
            const rdv = await RendezVous.findOne(await accessQuery(req, RendezVous, { where: inClinic(req, { numeroRdv: rdvId }) }));
            if (!rdv || rdv.patientId !== patient.id || rdv.medecinId !== medecinId) return res.status(404).json({ error: 'Rendez-vous non trouvé pour ce patient et ce médecin' });
            internalRdvId = rdv.id;
        }

        // Générer numéro ordonnance
        const numero = `ORD-${crypto.randomUUID().replaceAll('-', '').slice(0, 16)}`;

        const prescription = await Prescription.create({
            numero,
            clinic_id: req.user.clinic_id,
            patientCin: patientCin.toUpperCase(),
            medecinId,
            rdvId: internalRdvId,
            medicaments: JSON.stringify(medicaments),
            notes, diagnostique
        });

        // Notification Socket → pharmacien
        const ordonnanceData = {
            id: prescription.id,
            numero,
            patientCin: patientCin.toUpperCase(),
            patientNom: `${patient.prenom} ${patient.nom}`,
            medecinNom: req.user.name,
            medecinId: req.user.id,
            medicaments,
            statut: 'en_attente',
            createdAt: prescription.createdAt
        };

        try { clinicSocket?.notifyNewPrescription(ordonnanceData, req.user.clinic_id); } catch { /* socket optionnel */ }

        console.log(`[PRESCRIPTION] ${numero} créée par ${req.user.name} pour ${patientCin}`);
        res.status(201).json({ success: true, ordonnance: ordonnanceData });

    } catch (error) {
        console.error('[PRESCRIPTION] Erreur création:', error.message);
        res.status(500).json({ error: 'Erreur serveur', details: error.message });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/prescriptions — Liste (pharmacien = toutes, médecin = les siennes)
// ─────────────────────────────────────────────────────────────────────────────
router.get('/', authenticateJWT, authorizeRole('doctor', 'pharmacist', 'nurse'), async (req, res) => {
    try {
        const where = inClinic(req);
        if (req.query.statut) where.statut = req.query.statut;
        if (req.query.patientCin) where.patientCin = req.query.patientCin;

        const prescriptions = await Prescription.findAll(await accessQuery(req, Prescription, {
            where,
            order: [['created_at', 'DESC']],
            limit: 100
        }));

        // Mapping manuel car les associations ne sont pas définies pour le modèle inline.
        // Patients et médecins chargés en deux requêtes (au lieu de 3 par ordonnance, V2) ;
        // le patient est cherché dans la clinique : un même CIN peut exister ailleurs.
        const cins = [...new Set(prescriptions.map(p => p.patientCin))];
        const medecinIds = [...new Set(prescriptions.map(p => p.medecinId))];
        const [patients, medecins] = await Promise.all([
            cins.length ? Patient.findAll(await accessQuery(req, Patient, { where: inClinic(req, { cinNumero: { [Op.in]: cins } }) })) : [],
            medecinIds.length ? Medecin.findAll(await accessQuery(req, Medecin, { where: { id: { [Op.in]: medecinIds } }, include: [{ model: User }] })) : [],
        ]);
        const patientParCin = new Map(patients.map(pt => [pt.cinNumero, pt]));
        const medecinParId = new Map(medecins.map(md => [md.id, md]));

        const result = prescriptions.map(p => {
            const patient = patientParCin.get(p.patientCin);
            const medecin = medecinParId.get(p.medecinId);
            let doctorLabel = 'Docteur';
            let docSpec = '';

            if (medecin) {
                const docUser = medecin.User;
                if (docUser) {
                    doctorLabel = `Dr. ${docUser.prenom} ${docUser.nom}`;
                }
                const specs = medecin.specialites ? (typeof medecin.specialites === 'string' ? JSON.parse(medecin.specialites) : medecin.specialites) : [];
                docSpec = specs[0] || '';
            }

            return {
                id: p.id,
                numero: p.numero,
                patientCin: p.patientCin,
                patientNom: patient ? `${patient.prenom} ${patient.nom}` : '',
                medecinId: p.medecinId,
                medecinNom: doctorLabel,
                medecinSpecialite: docSpec,
                medicaments: parseMedicaments(p.medicaments),
                statut: p.statut,
                ...(req.user.role === 'doctor' ? { notes: p.notes, diagnostique: p.diagnostique } : {}),
                createdAt: p.createdAt
            };
        });

        res.json(result);
    } catch {
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /api/prescriptions/:id/status — Changer statut (pharmacien)
// ─────────────────────────────────────────────────────────────────────────────
router.patch('/:id/status', authenticateJWT, authorizeRole('pharmacist'), async (req, res) => {
    try {
        const { statut } = req.body;
        const prescription = await Prescription.findOne(await accessQuery(req, Prescription, byIdInClinic(req)));
        if (!prescription) return res.status(404).json({ error: 'Ordonnance non trouvée' });

        const refus = refusTransition(req.user.role, prescription.statut, statut);
        if (refus) return res.status(refus.status).json({ error: refus.error });

        const updateData = { statut };
        if (statut === 'remise' || statut === 'preparee') {
            updateData.dispenseParUserId = req.user.id;
        }

        // À la remise, générer les créneaux d'administration pour l'infirmier·ère
        if (statut === 'remise') {
            updateData.slots = JSON.stringify(generateSlots(parseMedicaments(prescription.medicaments)));
        }

        await audit(req, 'prescription.process', { resourceType: 'prescription', resourceId: prescription.id });
        await updateScoped(req, prescription, updateData);

        const patient = await Patient.findOne(await accessQuery(req, Patient, { where: { cinNumero: prescription.patientCin, clinic_id: prescription.clinic_id } }));
        const medecin = await scopedByPk(req, Medecin, prescription.medecinId);
        const patientNom = patient ? `${patient.prenom} ${patient.nom}` : prescription.patientCin;

        // Si préparée → notifier le médecin prescripteur (via son userId, pas l'id Medecin)
        if (statut === 'preparee' && medecin) {
            const ordData = { numero: prescription.numero, patientNom, patientCin: prescription.patientCin };
            try { clinicSocket?.notifyPrescriptionReady(ordData, medecin.userId); } catch { /* La notification est facultative ; la mutation métier est conservée. */ }
        }

        // Si remise → notifier les infirmier·ères qu'un traitement est prêt à administrer
        if (statut === 'remise') {
            try {
                clinicSocket?.emitToRole(req.user.clinic_id, 'nurse', 'meds_delivered', {
                    type: 'meds_delivered',
                    title: '💊 Médicaments remis',
                    message: `${patientNom} — ordonnance ${prescription.numero} prête pour administration`,
                    urgent: false,
                    data: { id: prescription.id, numero: prescription.numero, patientNom, patientCin: prescription.patientCin },
                    timestamp: new Date().toISOString()
                });
            } catch { /* La notification est facultative ; la mutation métier est conservée. */ }
        }

        res.json({ success: true, statut });
    } catch {
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/prescriptions/:id — Détail
// ─────────────────────────────────────────────────────────────────────────────
router.get('/:id', authenticateJWT, authorizeRole('doctor', 'pharmacist', 'nurse'), async (req, res) => {
    try {
        const p = await Prescription.findOne(await accessQuery(req, Prescription, byIdInClinic(req)));
        if (!p) return res.status(404).json({ error: 'Non trouvée' });
        res.json({ ...p.toJSON(), medicaments: parseMedicaments(p.medicaments) });
    } catch {
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

export { Prescription };
export default router;
