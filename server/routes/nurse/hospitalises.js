// Infirmerie — patients hospitalisés et alerte au médecin.
import { Router } from 'express';
import { accessQuery, scopedByPk } from '../../services/patientAccess.js';
import { Op } from 'sequelize';
import { authenticateJWT, authorizeRole } from '../../middleware/auth.js';
import { RendezVous, Patient, Medecin, DossierMedical } from '../../models/index.js';
import { Prescription } from '../prescriptions.js';
import { parseMedicaments } from '../../services/posologie.js';
import { inClinic } from '../../services/tenant.js';
import { getTodayStr } from './_commun.js';

const router = Router();

// Socket.io instance (optionnel — injecté si disponible)
let _io = null;

export function setNurseSocketIO(io) { _io = io; }

// ─── 8. GET /hospitalized ─────────────────────────────────────────────────
// Patients hospitalisés avec ordonnances actives pour le tableau de bord infirmier
router.get('/hospitalized', authenticateJWT, authorizeRole('nurse', 'doctor'), async (req, res) => {
    try {
        const prescriptions = await Prescription.findAll(await accessQuery(req, Prescription, {
            where: inClinic(req, { statut: { [Op.in]: ['remise', 'administree'] } }),
            order: [['created_at', 'DESC']],
            limit: 100
        }));

        const patientMap = {};
        await Promise.all(prescriptions.map(async p => {
            const patient = await Patient.findOne(await accessQuery(req, Patient, {
                where: { cinNumero: p.patientCin, clinic_id: p.clinic_id },
                include: [{ model: DossierMedical }]
            }));
            if (!patient) return;

            const medecin = await scopedByPk(req, Medecin, p.medecinId);
            let doctorLabel = 'Médecin';
            if (medecin) {
                const docUser = await medecin.getUser();
                if (docUser) doctorLabel = `Dr. ${docUser.prenom} ${docUser.nom}`;
            }

            // Listes parfois encodées deux fois (POST /patients) : même lecture que patients.js
            const parseList = (val) => {
                if (!val) return [];
                if (Array.isArray(val)) return val;
                try {
                    const parsed = JSON.parse(val);
                    if (typeof parsed === 'string') return JSON.parse(parsed);
                    return Array.isArray(parsed) ? parsed : [];
                } catch { return []; }
            };
            const dossier = patient.DossierMedical;
            const allergies = parseList(dossier?.allergies);
            const chronic = parseList(dossier?.maladiesChroniques);
            const age = patient.dateNaissance
                ? Math.floor((new Date() - new Date(patient.dateNaissance)) / (365.25 * 24 * 3600 * 1000)) : null;

            const todayStr = getTodayStr();
            const rdvAujourdhui = await RendezVous.findOne(await accessQuery(req, RendezVous, {
                where: { patientId: patient.id, dateRdv: todayStr },
                order: [['heureDebut', 'ASC']]
            }));

            const pid = patient.id;
            if (!patientMap[pid]) {
                patientMap[pid] = {
                    id: pid,
                    name: `${patient.prenom} ${patient.nom}`,
                    room: null,
                    age,
                    doctor: doctorLabel,
                    bloodType: dossier?.groupeSanguin || null,
                    allergies,
                    chronic,
                    insurance: patient.assuranceOrganisme || null,
                    rdvAujourdhui: rdvAujourdhui ? {
                        id: rdvAujourdhui.numeroRdv,
                        vitals: rdvAujourdhui.vitals || null
                    } : null,
                    prescriptions: []
                };
            }

            const items = parseMedicaments(p.medicaments).map(item => ({
                id: item.id,
                med: item.nom || 'Médicament',
                dose: item.posologie || '1 dose',
                moment: item.moment || 'Après repas',
                timesPerDay: item.timesPerDay || 1,
            }));

            const statusMap = { 'remise': 'delivered', 'administree': 'administered' };
            const slots = p.slots ? (typeof p.slots === 'string' ? JSON.parse(p.slots) : p.slots) : [];

            patientMap[pid].prescriptions.push({
                id: p.id,
                numero: p.numero,
                doctor: doctorLabel,
                createdAt: new Date(p.createdAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
                status: statusMap[p.statut] || 'delivered',
                items,
                slots
            });
        }));

        res.json(Object.values(patientMap));
    } catch (error) {
        console.error('[NURSE HOSPITALIZED GET] Erreur :', error.message);
        res.status(500).json({ error: 'Erreur serveur', details: error.message });
    }
});

// ─── 9. POST /alert ───────────────────────────────────────────────────────
// Envoyer une alerte/observation infirmière → remonte vers le médecin via Socket.IO
router.post('/alert', authenticateJWT, authorizeRole('nurse'), async (req, res) => {
    try {
        const { patientId, patientName, message, urgency } = req.body;
        if (!message) return res.status(400).json({ error: 'Message requis' });

        const patient = await Patient.findOne(await accessQuery(req, Patient, { where: { [Op.or]: [{ id: /^\d+$/.test(String(patientId)) ? Number(patientId) : 0 }, { numeroDossier: String(patientId) }, { cinNumero: String(patientId).toUpperCase() }] } }));
        if (!patient) return res.status(404).json({ error: 'Patient non trouvé' });
        const alertPayload = {
            patientId,
            patientNom: patientName,
            message,
            urgency: urgency || 'normal',
            nurseId: req.user.id,
            nurseName: req.user.name,
            timestamp: new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
            clinicId: req.user.clinic_id
        };

        // Émettre via WebSocket si disponible
        if (_io) {
            // Médecins de la clinique uniquement (diffusion globale auparavant)
            if (req.user.clinic_id) _io.to(`clinic:${req.user.clinic_id}:role:doctor`).emit('nurse_alert', alertPayload);
            console.log(`[NURSE ALERT] Alerte émise par ${req.user.name} pour patient ${patientName}`);
        }

        res.json({ success: true, message: 'Alerte envoyée', payload: alertPayload });
    } catch (error) {
        console.error('[NURSE ALERT POST] Erreur :', error.message);
        res.status(500).json({ error: 'Erreur serveur', details: error.message });
    }
});

export default router;
