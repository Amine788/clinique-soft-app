// Hospitalisations — parcours administratif : demande, admission, clôture du séjour, chambre.
import { Router } from 'express';
import { accessQuery, updateScoped } from '../../services/patientAccess.js';
import { Op } from 'sequelize';
import { authenticateJWT, authorizeRole } from '../../middleware/auth.js';
import { Hospitalisation, Patient, Chambre, User, Medecin } from '../../models/index.js';
import { inClinic, byIdInClinic } from '../../services/tenant.js';

const router = Router();

// Séjour demandé ou en cours : un seul à la fois par patient
const STATUTS_EN_COURS = ['demande', 'admis', 'sortie_demandee'];

// GET /api/hospitalisations/nurses — Liste des nurses de la clinique
router.get('/nurses', authenticateJWT, authorizeRole('secretary', 'admin', 'doctor', 'nurse'), async (req, res) => {
    try {
        const where = { role: 'nurse' };
        if (req.user.clinic_id) where.clinic_id = req.user.clinic_id;
        const nurses = await User.findAll(await accessQuery(req, User, {
            where,
            attributes: ['id', 'nom', 'prenom', 'email']
        }));
        res.json(nurses);
    } catch {
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// 1. POST /api/hospitalisations — Création d'une demande d'hospitalisation par le médecin
router.post('/', authenticateJWT, authorizeRole('doctor'), async (req, res) => {
    try {
        const { patientId, diagnostic, motif, etat } = req.body;
        if (!patientId) return res.status(400).json({ error: 'Patient ID requis' });

        const medecin = await Medecin.findOne(await accessQuery(req, Medecin, { where: { userId: req.user.id } }));
        if (!medecin) return res.status(403).json({ error: 'Médecin non trouvé' });

        const patient = await Patient.findOne(await accessQuery(req, Patient, { where: inClinic(req, { id: patientId }) }));
        if (!patient) return res.status(404).json({ error: 'Patient non trouvé' });

        // Un seul séjour demandé ou en cours par patient
        const enCours = await Hospitalisation.findOne(await accessQuery(req, Hospitalisation, { where: inClinic(req, { patientId: patient.id, statut: { [Op.in]: STATUTS_EN_COURS } }) }));
        if (enCours) return res.status(409).json({ error: 'Ce patient a déjà une hospitalisation demandée ou en cours' });

        const hosp = await Hospitalisation.create({
            patientId,
            medecinId: medecin.id,
            diagnostic,
            motif,
            etat: etat || 'stable',
            statut: 'demande',
            clinic_id: req.user.clinic_id
        });

        // Envoyer notif websocket à la secrétaire
        try {
            import('../../index.js').then(({ clinicSocket }) => {
                clinicSocket?.emitToRole(req.user.clinic_id, 'secretary', 'hosp_demande', {
                    id: hosp.id,
                    patientNom: patient ? `${patient.prenom} ${patient.nom}` : 'Patient',
                    medecinNom: `Dr. ${req.user.name}`,
                    statut: 'demande'
                });
            });
        } catch (e) {
            console.error("Socket error:", e.message);
        }

        res.status(201).json(hosp);
    } catch (error) {
        console.error('[HOSPITALISATIONS POST] Erreur :', error.message);
        res.status(500).json({ error: 'Erreur serveur', details: error.message });
    }
});

// 2. GET /api/hospitalisations/admissions — Liste des demandes en attente d'admission (pour secrétaire)
router.get('/admissions', authenticateJWT, authorizeRole('secretary', 'admin'), async (req, res) => {
    try {
        const where = { statut: 'demande' };
        // ✅ Filtrer par clinic_id pour isoler les demandes de cette clinique
        if (req.user.clinic_id) where.clinic_id = req.user.clinic_id;

        const admissions = await Hospitalisation.findAll(await accessQuery(req, Hospitalisation, {
            where,
            include: [
                { model: Patient, attributes: ['id', 'nom', 'prenom', 'cinNumero', 'dateNaissance', 'sexe', 'numeroDossier'] },
                { model: Medecin, include: [{ model: User, attributes: ['nom', 'prenom'] }] }
            ],
            order: [['createdAt', 'DESC']]
        }));
        res.json(admissions);
    } catch (error) {
        console.error('[HOSPITALISATIONS ADMISSIONS] Erreur :', error.message);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// 3. PUT /api/hospitalisations/:id/admit — Valider l'admission d'un patient (secrétaire)
router.get('/administrative-stays', authenticateJWT, authorizeRole('secretary', 'admin'), async (req, res, next) => {
    try {
        res.json(await Hospitalisation.findAll(await accessQuery(req, Hospitalisation, {
            where: { statut: { [Op.in]: ['admis', 'sortie_demandee'] } },
            attributes: ['id', 'patientId', 'chambreId', 'lit', 'nurseId', 'medecinId', 'statut', 'dateAdmission', 'dateSortie', 'dateSortieEstimee'],
            include: [{ model: Patient, attributes: ['id', 'nom', 'prenom', 'cinNumero', 'numeroDossier'] }, { model: Chambre }],
        })));
    } catch (err) { next(err); }
});

router.put('/:id/admit', authenticateJWT, authorizeRole('secretary', 'admin'), async (req, res) => {
    try {
        const { chambreId, lit, nurseId } = req.body;
        if (!chambreId || !nurseId) {
            return res.status(400).json({ error: 'Chambre et Nurse responsables sont obligatoires' });
        }

        const hosp = await Hospitalisation.findOne(await accessQuery(req, Hospitalisation, {
            ...byIdInClinic(req),
            include: [
                { model: Patient },
                { model: Medecin }  // ✅ Inclure Medecin pour récupérer userId
            ]
        }));
        if (!hosp) return res.status(404).json({ error: 'Demande non trouvée' });

        // Chambre et infirmier·ère de la même clinique
        const chambre = await Chambre.findOne(await accessQuery(req, Chambre, { where: inClinic(req, { id: chambreId }) }));
        if (!chambre) return res.status(404).json({ error: 'Chambre non trouvée' });
        const nurse = await User.findOne(await accessQuery(req, User, { where: inClinic(req, { id: nurseId, role: 'nurse' }) }));
        if (!nurse) return res.status(404).json({ error: 'Infirmier·ère non trouvé·e' });

        if (hosp.statut !== 'demande') return res.status(409).json({ error: "Cette demande n'est plus en attente d'admission" });
        if (chambre.statut !== 'disponible') return res.status(409).json({ error: `La chambre ${chambre.numero} n'est pas disponible` });
        const dejaAdmis = await Hospitalisation.findOne(await accessQuery(req, Hospitalisation, {
            where: inClinic(req, { patientId: hosp.patientId, id: { [Op.ne]: hosp.id }, statut: { [Op.in]: ['admis', 'sortie_demandee'] } }),
        }));
        if (dejaAdmis) return res.status(409).json({ error: 'Ce patient est déjà hospitalisé' });

        // Mise à jour conditionnelle : deux validations simultanées n'admettent qu'une fois
        const [admises] = await Hospitalisation.update({
            chambreId,
            lit,
            nurseId,
            statut: 'admis',
            dateAdmission: new Date()
        }, await accessQuery(req, Hospitalisation, { where: { id: hosp.id, statut: 'demande' } }));
        if (!admises) return res.status(409).json({ error: "Cette demande n'est plus en attente d'admission" });

        // Mettre à jour la chambre à "occupee"
        await Chambre.update({ statut: 'occupee' }, await accessQuery(req, Chambre, { where: { id: chambreId } }));

        // ✅ Notifier Médecin (par userId) et Nurse via Websocket
        try {
            import('../../index.js').then(({ clinicSocket }) => {
                const patientNom = hosp.Patient ? `${hosp.Patient.prenom} ${hosp.Patient.nom}` : 'Patient';
                // ✅ Utiliser Medecin.userId (User.id du médecin) au lieu de hosp.medecinId (Medecin.id)
                const medecinUserId = hosp.Medecin?.userId || hosp.Medecin?.user_id;
                if (medecinUserId) {
                    clinicSocket?.emitToUser(medecinUserId, 'hosp_validated', { id: hosp.id, patientNom });
                }
                // Notifier la nurse assignée (nurseId = User.id de l'infirmier ✅)
                clinicSocket?.emitToUser(parseInt(nurseId), 'hosp_validated', { id: hosp.id, patientNom });
                // Notifier tout le monde que la chambre est mise à jour
                clinicSocket?.emitToRole(req.user.clinic_id, 'secretary', 'chambre_status_changed', { chambreId, status: 'occupied' });
            });
        } catch (e) {
            console.error("Socket notification error:", e.message);
        }

        res.json({ success: true, message: 'Admission validée avec succès' });
    } catch (error) {
        console.error('[HOSPITALISATIONS ADMIT] Erreur :', error.message);
        res.status(500).json({ error: 'Erreur serveur', details: error.message });
    }
});

// 12. PUT /api/hospitalisations/:id/close — Finaliser la sortie du patient (Secrétaire)
router.put('/:id/close', authenticateJWT, authorizeRole('secretary', 'admin'), async (req, res) => {
    try {
        const hosp = await Hospitalisation.findOne(await accessQuery(req, Hospitalisation, byIdInClinic(req)));
        if (!hosp) return res.status(404).json({ error: 'Hospitalisation non trouvée' });

        const chambreId = hosp.chambreId;

        await updateScoped(req, hosp, {
            statut: 'termine',
            dateSortie: new Date()
        });

        // La chambre passe en "nettoyage"
        if (chambreId) {
            await Chambre.update({ statut: 'nettoyage' }, await accessQuery(req, Chambre, { where: { id: chambreId } }));
        }

        // Notifier médecin, nurse et réceptionnistes de la mise à jour de la chambre
        try {
            import('../../index.js').then(({ clinicSocket }) => {
                clinicSocket?.emitToRole(req.user.clinic_id, 'secretary', 'chambre_status_changed', { chambreId, status: 'maintenance' });
                clinicSocket?.emitToRole(req.user.clinic_id, 'nurse', 'chambre_status_changed', { chambreId, status: 'maintenance' });
            });
        } catch (e) {
            console.error("Socket close error:", e.message);
        }

        res.json({ success: true, message: 'Sortie finalisée et chambre mise en nettoyage.' });
    } catch {
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// 13. PUT /api/hospitalisations/chambres/:id/clean — Finaliser le nettoyage de la chambre (Nurse ou Secrétaire)
router.put('/chambres/:id/clean', authenticateJWT, authorizeRole('secretary', 'nurse', 'admin'), async (req, res) => {
    try {
        const chambre = await Chambre.findOne(await accessQuery(req, Chambre, byIdInClinic(req)));
        if (!chambre) return res.status(404).json({ error: 'Chambre non trouvée' });

        await updateScoped(req, chambre, { statut: 'disponible' });

        // Notifier de la libération de la chambre
        try {
            import('../../index.js').then(({ clinicSocket }) => {
                clinicSocket?.emitToRole(req.user.clinic_id, 'secretary', 'chambre_status_changed', { chambreId: chambre.id, status: 'available' });
                clinicSocket?.emitToRole(req.user.clinic_id, 'nurse', 'chambre_status_changed', { chambreId: chambre.id, status: 'available' });
            });
        } catch (e) {
            console.error("Socket clean error:", e.message);
        }

        res.json({ success: true, message: 'Chambre de nouveau disponible.' });
    } catch {
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

export default router;
