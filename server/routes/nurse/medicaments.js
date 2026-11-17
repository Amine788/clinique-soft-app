// Infirmerie — circuit du médicament : traitements à donner, remise, administration, avancement.
import { Router } from 'express';
import { accessQuery, scopedByPk, audit, updateScoped } from '../../services/patientAccess.js';
import { Op } from 'sequelize';
import { authenticateJWT, authorizeRole } from '../../middleware/auth.js';
import { Patient, Medecin, User, Chambre, Hospitalisation } from '../../models/index.js';
import { Prescription } from '../prescriptions.js';
import { generateSlots, parseMedicaments } from '../../services/posologie.js';
import { inClinic, byIdInClinic } from '../../services/tenant.js';
import { clinicSocket } from '../../socket/clinicSocket.js';
import { ROLES_SOINS, refusTransition } from '../../services/circuitOrdonnance.js';

const router = Router();

// Get prescriptions matching all status for pharmacy & medication flows
router.get('/medications', authenticateJWT, authorizeRole('pharmacist', ...ROLES_SOINS), async (req, res) => {
    try {
        const clinicId = req.user.clinic_id;
        const prescriptions = await Prescription.findAll(await accessQuery(req, Prescription, {
            where: inClinic(req),
            order: [['created_at', 'DESC']],
            limit: 100
        }));

        const mapped = await Promise.all(prescriptions.map(async p => {
            const patient = await Patient.findOne(await accessQuery(req, Patient, { where: { cinNumero: p.patientCin, ...(clinicId && { clinic_id: clinicId }) } }));
            const medecin = await scopedByPk(req, Medecin, p.medecinId);
            let doctorLabel = 'Docteur';
            if (medecin) {
                const docUser = await medecin.getUser();
                if (docUser) {
                    doctorLabel = `Dr. ${docUser.prenom} ${docUser.nom}`;
                }
            }

            let dispenseParNom = 'Pharmacien';
            if (p.dispenseParUserId) {
                const dispensateur = await scopedByPk(req, User, p.dispenseParUserId);
                if (dispensateur) dispenseParNom = `${dispensateur.prenom} ${dispensateur.nom}`;
            }

            const items = parseMedicaments(p.medicaments).map(item => ({
                id: item.id,
                med: item.nom || 'Médicament',
                dose: item.posologie || '1 dose',
                moment: item.moment || 'Après repas',
                timesPerDay: item.timesPerDay || 1,
                qty: item.quantite
            }));

            const statusMap = {
                'en_attente': 'pending',
                'en_preparation': 'pending',
                'preparee': 'prepared',
                'remise': 'delivered',
                'administree': 'administered'
            };

            // Chambre de l'hospitalisation en cours ; null si le patient n'est pas hospitalisé
            const hosp = patient && await Hospitalisation.findOne(await accessQuery(req, Hospitalisation, {
                where: { patientId: patient.id, statut: { [Op.in]: ['admis', 'sortie_demandee'] } },
                include: [{ model: Chambre, attributes: ['numero'] }],
                order: [['dateAdmission', 'DESC']]
            }));
            const room = hosp?.Chambre ? `Chambre ${hosp.Chambre.numero}${hosp.lit ? ` · lit ${hosp.lit}` : ''}` : null;
            const age = patient?.dateNaissance
                ? new Date().getFullYear() - new Date(patient.dateNaissance).getFullYear()
                : null;

            const slots = p.slots ? (typeof p.slots === 'string' ? JSON.parse(p.slots) : p.slots) : [];

            return {
                id: p.id,
                numero: p.numero,
                patientId: patient ? patient.id : p.patientCin,
                patientCin: p.patientCin,
                patientNom: patient ? `${patient.prenom} ${patient.nom}` : p.patientCin,
                room,
                hospitalisationId: hosp?.id ?? null,
                age,
                doctor: doctorLabel,
                createdAt: new Date(p.createdAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
                items,
                status: statusMap[p.statut] || 'pending',
                preparedAt: p.updatedAt ? new Date(p.updatedAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : null,
                preparedBy: dispenseParNom,
                deliveredAt: p.updatedAt ? new Date(p.updatedAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : null,
                deliveredBy: dispenseParNom,
                slots: slots
            };
        }));

        res.json(mapped);
    } catch (error) {
        console.error('[NURSE MEDICATIONS GET] Erreur :', error.message);
        res.status(500).json({ error: 'Erreur serveur', details: error.message });
    }
});

// ─── 5. POST /prescriptions/:id/deliver ───────────────────────────────────
// Advance prescription status to 'delivered' ('remise') and initialize slots
router.post('/prescriptions/:id/deliver', authenticateJWT, authorizeRole('pharmacist', ...ROLES_SOINS), async (req, res) => {
    try {
        const prescription = await Prescription.findOne(await accessQuery(req, Prescription, byIdInClinic(req)));
        if (!prescription) return res.status(404).json({ error: 'Ordonnance non trouvée' });

        const refus = refusTransition(req.user.role, prescription.statut, 'remise');
        if (refus) return res.status(refus.status).json({ error: refus.error });

        const items = parseMedicaments(prescription.medicaments);

        const slots = generateSlots(items);

        await audit(req, 'prescription.process', { resourceType: 'prescription', resourceId: prescription.id });
        await updateScoped(req, prescription, {
            statut: 'remise',
            slots: JSON.stringify(slots)
        });

        res.json({ success: true, statut: 'remise', slots });
    } catch (error) {
        console.error('[NURSE DELIVER POST] Erreur :', error.message);
        res.status(500).json({ error: 'Erreur serveur', details: error.message });
    }
});

// ─── 6. POST /prescriptions/:id/administer ───────────────────────────────
// Administer a specific slot (or update any other slot)
router.post('/prescriptions/:id/administer', authenticateJWT, authorizeRole(...ROLES_SOINS), async (req, res) => {
    try {
        const { itemId, slotIndex, done } = req.body;
        const prescription = await Prescription.findOne(await accessQuery(req, Prescription, byIdInClinic(req)));
        if (!prescription) return res.status(404).json({ error: 'Ordonnance non trouvée' });

        let slots = prescription.slots ? (typeof prescription.slots === 'string' ? JSON.parse(prescription.slots) : prescription.slots) : [];

        // Let's find slot
        let count = 0;
        let targetIdx = -1;
        slots.forEach((sl, idx) => {
            if (sl.itemId === itemId) {
                if (count === slotIndex) {
                    targetIdx = idx;
                }
                count++;
            }
        });

        if (targetIdx >= 0) {
            const doneAt = new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
            slots[targetIdx].done = done !== false;
            slots[targetIdx].doneAt = done !== false ? doneAt : null;
            slots[targetIdx].doneBy = done !== false ? (req.user?.name || 'Infirmière') : null;
        } else {
            return res.status(400).json({ error: 'Créneau non trouvé pour ce médicament' });
        }

        // Check if all slots are done
        const allDone = slots.every(sl => sl.done);
        const nextStatus = allDone ? 'administree' : 'remise';

        await audit(req, 'prescription.process', { resourceType: 'prescription', resourceId: prescription.id });
        await updateScoped(req, prescription, {
            statut: nextStatus,
            slots: JSON.stringify(slots)
        });

        // Traitement entièrement administré → notifier le médecin prescripteur
        if (allDone) {
            try {
                const medecin = await scopedByPk(req, Medecin, prescription.medecinId);
                if (medecin) {
                    const patient = await Patient.findOne(await accessQuery(req, Patient, { where: { cinNumero: prescription.patientCin, clinic_id: prescription.clinic_id } }));
                    clinicSocket?.emitToUser(medecin.userId, 'meds_administered', {
                        type: 'meds_administered',
                        title: '✅ Traitement administré',
                        message: `${patient ? `${patient.prenom} ${patient.nom}` : prescription.patientCin} — ordonnance ${prescription.numero} entièrement administrée`,
                        urgent: false,
                        data: { id: prescription.id, numero: prescription.numero },
                        timestamp: new Date().toISOString()
                    });
                }
            } catch { /* La notification est facultative ; la mutation métier est conservée. */ }
        }

        res.json({ success: true, statut: nextStatus, slots });
    } catch (error) {
        console.error('[NURSE ADMINISTER POST] Erreur :', error.message);
        res.status(500).json({ error: 'Erreur serveur', details: error.message });
    }
});

// ─── 7. POST /prescriptions/:id/advance ──────────────────────────────────
// Advance status of a prescription (supporting prepared, delivered, administered status)
router.post('/prescriptions/:id/advance', authenticateJWT, authorizeRole('pharmacist', ...ROLES_SOINS), async (req, res) => {
    try {
        const { nextStatus } = req.body;
        const prescription = await Prescription.findOne(await accessQuery(req, Prescription, byIdInClinic(req)));
        if (!prescription) return res.status(404).json({ error: 'Ordonnance non trouvée' });

        const statusMapFEtoDB = {
            'pending': 'en_attente',
            'prepared': 'preparee',
            'delivered': 'remise',
            'administered': 'administree'
        };

        const dbStatus = statusMapFEtoDB[nextStatus] || nextStatus;

        const refus = refusTransition(req.user.role, prescription.statut, dbStatus);
        if (refus) return res.status(refus.status).json({ error: refus.error });

        const updateData = { statut: dbStatus };
        
        if (dbStatus === 'remise') {
            updateData.slots = JSON.stringify(generateSlots(parseMedicaments(prescription.medicaments)));
        }

        await audit(req, 'prescription.process', { resourceType: 'prescription', resourceId: prescription.id });
        await updateScoped(req, prescription, updateData);

        const rawSlots = updateData.slots || prescription.slots;
        let parsedSlots = [];
        if (rawSlots) {
            try {
                parsedSlots = typeof rawSlots === 'string' ? JSON.parse(rawSlots) : rawSlots;
            } catch {
                parsedSlots = [];
            }
        }

        res.json({ success: true, statut: dbStatus, slots: parsedSlots });
    } catch (error) {
        console.error('[NURSE ADVANCE POST] Erreur :', error.message);
        res.status(500).json({ error: 'Erreur serveur', details: error.message });
    }
});

export default router;
