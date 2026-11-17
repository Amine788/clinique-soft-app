// Hospitalisations — suivi médical : séjours en cours, détail, traitement, demande de sortie.
import crypto from 'node:crypto';
import { Router } from 'express';
import { accessQuery, updateScoped } from '../../services/patientAccess.js';
import { Op } from 'sequelize';
import { authenticateJWT, authorizeRole } from '../../middleware/auth.js';
import { Hospitalisation, HospitalisationSoin, HospitalisationVital, HospitalisationAlerte, Patient, Chambre, User, Medecin, DossierMedical } from '../../models/index.js';
import { Prescription } from '../prescriptions.js';
import { generateSlots, normalizeMedicament, parseMedicaments, medicamentsInvalides } from '../../services/posologie.js';
import { byIdInClinic } from '../../services/tenant.js';

const router = Router();

// Ancien format écrit par l'écran d'hospitalisation ({ med, dose }, sans nom) : depuis la
// normalisation (services/posologie.js), aucune autre ordonnance n'est enregistrée ainsi.
function isAncienTraitement(prescription) {
    try {
        const items = JSON.parse(prescription.medicaments || '[]');
        return items.length > 0 && items.every(i => i.med && !i.nom);
    } catch {
        return false;
    }
}

// Ordonnance de traitement propre à l'hospitalisation (hospitalisation_id).
// Avant cette colonne, le traitement était rangé dans une ordonnance « remise » du même médecin,
// au format { med, dose } : elle est reprise, puis rattachée à la première modification.
// Une ordonnance de consultation ou du dossier patient n'a jamais ce format : elle n'est pas touchée.
async function findTreatmentPrescription(hosp, req) {
    const linked = await Prescription.findOne(await accessQuery(req, Prescription, {
        where: { hospitalisationId: hosp.id },
        order: [['createdAt', 'DESC']]
    }));
    if (linked || !hosp.Patient?.cinNumero) return linked;
    const candidates = await Prescription.findAll(await accessQuery(req, Prescription, {
        where: {
            hospitalisationId: null,
            clinic_id: hosp.clinic_id,
            patientCin: hosp.Patient.cinNumero,
            medecinId: hosp.medecinId,
            statut: { [Op.in]: ['remise', 'administree'] },
            updatedAt: { [Op.gte]: hosp.dateAdmission }
        },
        order: [['updatedAt', 'DESC'], ['id', 'DESC']]
    }));
    return candidates.find(isAncienTraitement) || null;
}

const parseSlots = p => p?.slots ? (typeof p.slots === 'string' ? JSON.parse(p.slots) : p.slots) : [];

function formatTreatment(prescription) {
    if (!prescription) return null;
    return {
        ...prescription.toJSON(),
        medicaments: parseMedicaments(prescription.medicaments),
        slots: parseSlots(prescription)
    };
}

// 4. GET /api/hospitalisations/active — Liste des patients hospitalisés actifs
router.get('/active', authenticateJWT, authorizeRole('doctor', 'nurse'), async (req, res) => {
    try {
        const where = { statut: { [Op.in]: ['admis', 'sortie_demandee'] } };

        // ✅ Toujours filtrer par clinic_id (multi-tenant)
        if (req.user.clinic_id) {
            where.clinic_id = req.user.clinic_id;
        }

        if (req.user.role === 'doctor') {
            const medecin = await Medecin.findOne(await accessQuery(req, Medecin, { where: { userId: req.user.id } }));
            if (!medecin) {
                // Médecin non trouvé dans la table médecins → retourner liste vide
                return res.json([]);
            }
            where.medecinId = medecin.id;
        } else if (req.user.role === 'nurse') {
            where.nurseId = req.user.id;
        }

        const list = await Hospitalisation.findAll(await accessQuery(req, Hospitalisation, {
            where,
            include: [
                { model: Patient, attributes: ['id', 'nom', 'prenom', 'cinNumero', 'dateNaissance', 'sexe', 'numeroDossier'], include: [{ model: DossierMedical }] },
                { model: Chambre },
                { model: User, as: 'nurse', attributes: ['id', 'nom', 'prenom'] },
                { model: Medecin, include: [{ model: User, attributes: ['nom', 'prenom'] }] },
                { model: HospitalisationAlerte, as: 'alertes', where: { statut: 'active' }, required: false }
            ],
            order: [['dateAdmission', 'DESC']]
        }));

        const listWithPrescriptions = await Promise.all(list.map(async (h) => ({
            ...h.toJSON(),
            activePrescription: formatTreatment(await findTreatmentPrescription(h, req))
        })));

        res.json(listWithPrescriptions);
    } catch (error) {
        console.error('[HOSPITALISATIONS ACTIVE] Erreur :', error.message);
        res.status(500).json({ error: 'Erreur serveur', details: error.message });
    }
});

// 5. GET /api/hospitalisations/:id — Détail d'une hospitalisation
router.get('/:id', authenticateJWT, authorizeRole('doctor', 'nurse'), async (req, res) => {
    try {
        const hosp = await Hospitalisation.findOne(await accessQuery(req, Hospitalisation, {
            ...byIdInClinic(req),
            include: [
                { model: Patient, include: [{ model: DossierMedical }] },
                { model: Chambre },
                { model: User, as: 'nurse', attributes: ['id', 'nom', 'prenom'] },
                { model: Medecin, include: [{ model: User, attributes: ['nom', 'prenom'] }] },
                { model: HospitalisationSoin, as: 'soins', include: [{ model: User, as: 'nurseActor', attributes: ['nom', 'prenom'] }] },
                { model: HospitalisationVital, as: 'vitals', include: [{ model: User, as: 'nurseActorVitals', attributes: ['nom', 'prenom'] }] },
                { model: HospitalisationAlerte, as: 'alertes', include: [{ model: User, as: 'resolvingDoctor', attributes: ['nom', 'prenom'] }] }
            ]
        }));

        if (!hosp) return res.status(404).json({ error: 'Hospitalisation non trouvée' });

        // Traitement de cette hospitalisation
        const prescription = await findTreatmentPrescription(hosp, req);

        res.json({
            ...hosp.toJSON(),
            activePrescription: formatTreatment(prescription)
        });
    } catch (error) {
        console.error('[HOSPITALISATIONS GET BY ID] Erreur :', error.message);
        res.status(500).json({ error: 'Erreur serveur', details: error.message });
    }
});

// 6. PUT /api/hospitalisations/:id/treatment — Modifier le traitement et/ou l'état
router.put('/:id/treatment', authenticateJWT, authorizeRole('doctor'), async (req, res) => {
    try {
        const hosp = await Hospitalisation.findOne(await accessQuery(req, Hospitalisation, {
            ...byIdInClinic(req),
            include: [{ model: Patient }]
        }));
        if (!hosp) return res.status(404).json({ error: 'Hospitalisation non trouvée' });

        const { medicaments, etat } = req.body;

        // Mettre à jour l'état si fourni
        if (etat && ['stable', 'surveillance', 'critique'].includes(etat)) {
            await updateScoped(req, hosp, { etat });
        }

        // Si pas de médicaments, retourner juste l'état mis à jour
        if (!medicaments) {
            return res.json({ success: true, message: 'État mis à jour' });
        }

        const invalide = medicamentsInvalides(medicaments);
        if (invalide) return res.status(400).json({ error: invalide });
        const items = medicaments.map(normalizeMedicament);

        // Ordonnance de cette hospitalisation : jamais celle d'une consultation du patient
        let prescription = await findTreatmentPrescription(hosp, req);

        // Les prises déjà validées par l'infirmier·ère sont conservées
        const anciens = parseSlots(prescription);
        const slots = generateSlots(items).map(s =>
            anciens.find(o => o.done && o.itemId === s.itemId && o.time === s.time) || s
        );

        if (!prescription) {
            // numero est UNIQUE sur toute la table : un compteur par clinique (ORD-AAAA-000001) entrait en collision
            // dès la deuxième clinique. Même format aléatoire que les ordonnances de consultation (prescriptions.js).
            const numero = `ORD-${crypto.randomUUID().replaceAll('-', '').slice(0, 16)}`;
            prescription = await Prescription.create({
                numero,
                patientCin: hosp.Patient?.cinNumero,
                medecinId: hosp.medecinId,
                clinic_id: hosp.clinic_id,
                hospitalisationId: hosp.id,
                medicaments: JSON.stringify(items),
                statut: 'remise',
                slots: JSON.stringify(slots)
            });
        } else {
            await updateScoped(req, prescription, {
                hospitalisationId: hosp.id,
                medicaments: JSON.stringify(items),
                slots: JSON.stringify(slots)
            });
        }

        // Notifier la nurse assignée
        try {
            import('../../index.js').then(({ clinicSocket }) => {
                clinicSocket?.emitToUser(hosp.nurseId, 'treatment_updated', {
                    hospitalisationId: hosp.id,
                    patientNom: `${hosp.Patient?.prenom} ${hosp.Patient?.nom}`
                });
            });
        } catch (e) {
            console.error("Socket notification error:", e.message);
        }

        res.json({ success: true, message: 'Traitement mis à jour', prescription });
    } catch (error) {
        console.error('[HOSPITALISATIONS TREATMENT] Erreur :', error.message);
        res.status(500).json({ error: 'Erreur serveur', details: error.message });
    }
});

// 11. PUT /api/hospitalisations/:id/discharge — Préparer la sortie (Médecin)
router.put('/:id/discharge', authenticateJWT, authorizeRole('doctor'), async (req, res) => {
    try {
        const hosp = await Hospitalisation.findOne(await accessQuery(req, Hospitalisation, {
            ...byIdInClinic(req),
            include: [{ model: Patient }]
        }));
        if (!hosp) return res.status(404).json({ error: 'Hospitalisation non trouvée' });

        await updateScoped(req, hosp, { statut: 'sortie_demandee' });

        // Notifier la secrétaire de préparer les papiers de sortie
        try {
            import('../../index.js').then(({ clinicSocket }) => {
                clinicSocket?.emitToRole(req.user.clinic_id, 'secretary', 'discharge_requested', {
                    id: hosp.id,
                    patientNom: `${hosp.Patient?.prenom} ${hosp.Patient?.nom}`
                });
            });
        } catch (e) {
            console.error("Socket discharge error:", e.message);
        }

        res.json({ success: true, message: 'Sortie demandée avec succès' });
    } catch {
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

export default router;
