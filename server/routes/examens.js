import { patientAccess, accessQuery, audit, updateScoped } from '../services/patientAccess.js';
import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { authenticateJWT, authorizeRole, requireClinicId } from '../middleware/auth.js';
import { ExamenCatalog, ExamenPatient, Patient, Medecin, User, RendezVous } from '../models/index.js';
import { clinicSocket } from '../socket/clinicSocket.js';
import { inClinic } from '../services/tenant.js';
const uploadDir = 'uploads/examens/';
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}





// Configuration Multer pour les résultats d'examens (PDF, Images)
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'uploads/examens/');
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, 'EXAM-' + uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({
    storage,
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
    fileFilter: (req, file, cb) => {
        const allowedTypes = /jpeg|jpg|png|pdf/;
        const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
        const mimetype = allowedTypes.test(file.mimetype);
        if (extname && mimetype) return cb(null, true);
        cb(new Error('Seuls les fichiers JPEG, PNG et PDF sont autorisés.'));
    }
});

const router = Router();
router.use(authenticateJWT, requireClinicId, patientAccess('examens'));

// ============================================================
// GET /api/examens/catalog
// Récupère la liste des examens disponibles (labo et radio)
// ============================================================
router.get('/catalog', authenticateJWT, authorizeRole('doctor', 'nurse', 'lab_technician'), async (req, res) => {
    try {
        const catalog = await ExamenCatalog.findAll({
            where: { actif: true },
            order: [['type', 'ASC'], ['nom', 'ASC']]
        });
        res.json(catalog);
    } catch (error) {
        console.error('[EXAMENS CATALOG] Erreur :', error);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// ============================================================
// GET /api/examens/patient/:cin
// Historique des examens d'un patient
// ============================================================
router.get('/patient/:cin', authenticateJWT, async (req, res) => {
    try {
        const { cin } = req.params;
        const patient = await Patient.findOne(await accessQuery(req, Patient, { where: inClinic(req, { cinNumero: cin.toUpperCase() }) }));
        if (!patient) return res.status(404).json({ error: 'Patient non trouvé' });

        const examens = await ExamenPatient.findAll(await accessQuery(req, ExamenPatient, {
            where: inClinic(req, { patientId: patient.id }),
            include: [
                { model: ExamenCatalog, as: 'examenDetails' },
                { model: Medecin, include: [{ model: User, attributes: ['nom', 'prenom'] }] }
            ],
            order: [['createdAt', 'DESC']]
        }));

        res.json(examens);
    } catch (error) {
        console.error('[EXAMENS PATIENT] Erreur :', error);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// ============================================================
// GET /api/examens
// Liste de TOUS les examens pour le module Secrétariat/Labo
// Filtre optionnel par statut
// ============================================================
router.get('/', authenticateJWT, authorizeRole('doctor', 'lab_technician', 'nurse'), async (req, res) => {
    try {
        const where = inClinic(req);
        if (req.query.statut) {
            where.statut = req.query.statut;
        }

        const examens = await ExamenPatient.findAll(await accessQuery(req, ExamenPatient, {
            where,
            include: [
                { model: ExamenCatalog, as: 'examenDetails' },
                { model: Patient, attributes: ['numeroDossier', 'cinNumero', 'nom', 'prenom'] },
                { model: Medecin, include: [{ model: User, attributes: ['nom', 'prenom'] }] }
            ],
            order: [['createdAt', 'DESC']]
        }));

        res.json(examens);
    } catch (error) {
        console.error('[EXAMENS LIST] Erreur :', error);
        res.status(500).json({ error: 'Erreur serveur', detail: error.message });
    }
});

// ============================================================
// POST /api/examens
// Prescrire un nouvel examen (Médecin)
// ============================================================
router.post('/', authenticateJWT, authorizeRole('doctor'), async (req, res) => {
    try {
        const { patientCin, rdvId, examensIds, notesObligatoires } = req.body;

        if (!patientCin || !examensIds || !Array.isArray(examensIds) || examensIds.length === 0) {
            return res.status(400).json({ error: 'Données invalides (CIN et liste d\'examens requis)' });
        }

        const clinicFilter = req.user.clinic_id ? { clinic_id: req.user.clinic_id } : {};
        const patient = await Patient.findOne(await accessQuery(req, Patient, { where: { cinNumero: patientCin.toUpperCase(), ...clinicFilter } }));
        if (!patient) return res.status(404).json({ error: 'Patient non trouvé' });

        const medecin = await Medecin.findOne(await accessQuery(req, Medecin, { where: { userId: req.user.id } }));
        if (!medecin) return res.status(404).json({ error: 'Médecin non identifié' });

        // Le front envoie le numéro de RDV (« RDV-… ») : consultation_id attend l'id interne
        let consultationId = null;
        if (rdvId && rdvId !== 'demo') {
            const rdv = await RendezVous.findOne(await accessQuery(req, RendezVous, { where: { numeroRdv: rdvId, patientId: patient.id, ...clinicFilter } }));
            if (!rdv) return res.status(404).json({ error: 'Rendez-vous non trouvé pour ce patient' });
            consultationId = rdv.id;
        }

        const createdExamens = [];
        let hasLaboratoire = false;

        for (const examenId of examensIds) {
            const catalogItem = await ExamenCatalog.findByPk(examenId);
            if (!catalogItem) continue;

            const examen = await ExamenPatient.create({
                clinic_id: patient.clinic_id,
                patientId: patient.id,
                medecinId: medecin.id,
                consultationId,
                examenId: examenId,
                statut: 'en_attente',
                notesObligatoires: notesObligatoires || '',
                prixFacture: catalogItem.prixStandard
            });
            createdExamens.push(examen);
            if (catalogItem.type === 'laboratoire') hasLaboratoire = true;
        }

        // Notifier les infirmiers qu'un prélèvement est à effectuer
        if (hasLaboratoire) {
            clinicSocket.emitToRole(req.user.clinic_id, 'nurse', 'examen_a_prelever', {
                patientNom: `${patient.prenom} ${patient.nom}`,
                patientCin: patient.cinNumero,
                count: createdExamens.length
            });
        }

        res.status(201).json({ success: true, count: createdExamens.length, examens: createdExamens });
    } catch (error) {
        console.error('[EXAMENS CREATE] Erreur :', error);
        res.status(500).json({ error: 'Erreur serveur lors de la prescription' });
    }
});

// ============================================================
// PATCH /api/examens/:id/statut
// Mettre à jour le statut d'un examen (Secrétaire/Labo) + Upload fichier
// ============================================================
// ============================================================
// GET /api/examens/:id/fichier
// Fichier de résultat (scan, radio, PDF) : servi seulement aux rôles concernés de la clinique,
// jamais en accès libre sous /uploads
// ============================================================
router.get('/:id/fichier', authenticateJWT, authorizeRole('doctor', 'lab_technician'), async (req, res) => {
    try {
        const examen = await ExamenPatient.findOne(await accessQuery(req, ExamenPatient, { where: inClinic(req, { id: req.params.id }), attributes: ['id', 'fichierResultat'] }));
        if (!examen?.fichierResultat) return res.status(404).json({ error: 'Fichier non trouvé' });

        // Seul le nom du fichier est repris : aucun chemin ne peut sortir du dossier des résultats
        const chemin = path.resolve(uploadDir, path.basename(examen.fichierResultat));
        if (!fs.existsSync(chemin)) return res.status(404).json({ error: 'Fichier non trouvé' });
        res.sendFile(chemin);
    } catch (error) {
        console.error('[EXAMENS FICHIER] Erreur :', error);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

router.patch('/:id/statut', authenticateJWT, authorizeRole('lab_technician', 'nurse'), (req, res, next) => { if (req.user.role === 'nurse' && req.is('multipart/form-data')) return res.status(403).json({ error: 'Dépôt de résultat réservé au laboratoire' }); next(); }, upload.single('fichier'), async (req, res) => {
    try {
        const { statut, resultats, dateResultatPrevue, prixFacture } = req.body;

        if (!['en_attente', 'preleve', 'en_cours', 'termine', 'annule'].includes(statut)) {
            return res.status(400).json({ error: 'Statut invalide' });
        }

        const examen = await ExamenPatient.findOne(await accessQuery(req, ExamenPatient, {
            where: inClinic(req, { id: req.params.id }),
            include: [
                { model: ExamenCatalog, as: 'examenDetails' },
                { model: Patient, attributes: ['nom', 'prenom', 'cinNumero'] },
                { model: Medecin, attributes: ['userId'] }
            ]
        }));

        if (!examen) return res.status(404).json({ error: 'Examen non trouvé' });

        // Infirmier : seul le prélèvement d'un examen de laboratoire en attente est autorisé
        if (req.user.role === 'nurse') {
            if (['resultats', 'dateResultatPrevue', 'prixFacture'].some(k => Object.hasOwn(req.body, k))) return res.status(403).json({ error: 'Modification de résultat interdite' });
            if (statut !== 'preleve') {
                return res.status(403).json({ error: "L'infirmier ne peut que marquer un examen comme prélevé" });
            }
            if (examen.examenDetails?.type !== 'laboratoire') {
                return res.status(400).json({ error: 'Seuls les examens de laboratoire nécessitent un prélèvement' });
            }
            if (examen.statut !== 'en_attente') {
                return res.status(400).json({ error: 'Cet examen a déjà été traité' });
            }
        }

        // Labo : un examen de laboratoire doit d'abord être prélevé par un infirmier
        if (['lab_technician', 'secretary', 'admin'].includes(req.user.role)) {
            if (examen.examenDetails?.type === 'laboratoire' && statut === 'en_cours' && examen.statut === 'en_attente') {
                return res.status(400).json({ error: "Cet examen doit d'abord être prélevé par un infirmier" });
            }
        }

        const updateData = {
            statut,
            resultats: resultats !== undefined ? resultats : examen.resultats
        };

        if (dateResultatPrevue !== undefined) updateData.dateResultatPrevue = dateResultatPrevue;
        if (prixFacture !== undefined) updateData.prixFacture = parseFloat(prixFacture);

        if (req.file) {
            updateData.fichierResultat = `/uploads/examens/${req.file.filename}`;
        }

        await audit(req, 'examen.process', { patientId: examen.patientId, resourceType: 'examen', resourceId: examen.id });
        await updateScoped(req, examen, updateData);

        // Notification : échantillon prélevé → labo
        if (statut === 'preleve') {
            clinicSocket.emitToRole(req.user.clinic_id, 'lab_technician', 'echantillon_preleve', {
                examenId: examen.id,
                patientNom: `${examen.Patient?.prenom} ${examen.Patient?.nom}`,
                examenNom: examen.examenDetails?.nom
            });
        }

        // Notification automatique si terminé
        if (statut === 'termine') {
            console.log(`[SOCKET] Notification examen terminé pour patient ${examen.Patient?.cinNumero}`);

            // 1. Notifier le médecin
            if (examen.Medecin?.userId) {
                clinicSocket.emitToUser(examen.Medecin.userId, 'examen_ready', {
                    examenId: examen.id,
                    patientNom: `${examen.Patient?.prenom} ${examen.Patient?.nom}`,
                    examenNom: examen.examenDetails?.nom
                });
            }

            // 2. Notifier le patient (si son CIN est utilisé comme room)
            // On peut créer une méthode emitToPatient si on veut être propre
            // Mais ici on peut utiliser une émission directe si on expose io ou via une room spécifique
            // Pour l'instant on se concentre sur le médecin qui est le plus important
        }

        res.json({ success: true, examen });
    } catch (error) {
        console.error('[EXAMENS STATUS UPDATE] Erreur :', error);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

export default router;
