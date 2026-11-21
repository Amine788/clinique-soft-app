// Patients — scans de CIN et documents du dossier (jamais servis en accès libre).
import { Router } from 'express';
import { accessQuery } from '../../services/patientAccess.js';
import { Op } from 'sequelize';
import { existsSync, mkdirSync } from 'fs';
import { join, basename } from 'path';
import { authenticateJWT, authorizeRole } from '../../middleware/auth.js';
import { Patient, CinScan, ExamenPatient, ExamenCatalog } from '../../models/index.js';
import { recevoirScanCin, envoyerScanCin, dossierScansCin } from '../../services/scansCin.js';

const router = Router();

const UPLOAD_DIR = dossierScansCin();

if (!existsSync(UPLOAD_DIR)) mkdirSync(UPLOAD_DIR, { recursive: true });

// Scans de CIN : face, type réel et nom de fichier contrôlés par le serveur (services/scansCin.js)
const uploadScan = recevoirScanCin(UPLOAD_DIR);

// ============================================================
// POST /api/patients/:cin/upload-scan  ✅ clinic_id injecté
// ============================================================
router.post('/:cin/upload-scan', authenticateJWT, authorizeRole('secretary', 'doctor', 'admin'), uploadScan, async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: 'Fichier non supporté ou manquant. (JPG, PNG, PDF uniquement)' });

        const cin = req.params.cin.toUpperCase();
        const face = req.body.face || 'recto';
        const clinicId = req.user.clinic_id;

        const patient = await Patient.findOne(await accessQuery(req, Patient, { where: { cinNumero: cin, clinic_id: clinicId } }));

        await CinScan.create({
            clinic_id: clinicId,  // ✅
            patientId: patient ? patient.id : null,
            cinNumero: cin,
            face,
            fichierNom: req.file.filename,
            fichierPath: req.file.path,
            fichierTaille: req.file.size,
            fichierFormat: req.file.mimetype,
            uploadeParUserId: req.user.id
        });

        console.log(`[SCAN] ${face} uploadé pour CIN ${cin} — Clinique #${clinicId}`);
        res.json({ success: true, face, cin, file: { name: req.file.filename, size: req.file.size } });
    } catch (err) {
        console.error('[UPLOAD ERROR]', err);
        res.status(500).json({ error: 'Erreur lors de l\'enregistrement du scan' });
    }
});

// ============================================================
// DELETE /api/patients/:id — Suppression  ✅ vérifie clinic_id
// ============================================================
// ============================================================
// GET /api/patients/:id/documents — Documents du dossier : scans de CIN et résultats d'examens
// Les fichiers ne sont jamais servis en accès libre : chaque lien pointe vers une route authentifiée
// ============================================================
router.get('/:id/documents', authenticateJWT, authorizeRole('secretary', 'doctor', 'nurse', 'admin'), async (req, res) => {
    try {
        const patient = await Patient.findOne(await accessQuery(req, Patient, { where: { numeroDossier: req.params.id, clinic_id: req.user.clinic_id } }));
        if (!patient) return res.status(404).json({ error: 'Patient non trouvé' });

        const scans = await CinScan.findAll(await accessQuery(req, CinScan, { where: { patientId: patient.id, clinic_id: req.user.clinic_id }, order: [['id', 'DESC']] }));
        const examens = ['secretary', 'admin', 'nurse'].includes(req.user.role) && !req.exceptionalAccess ? [] : await ExamenPatient.findAll(await accessQuery(req, ExamenPatient, {
            where: { patientId: patient.id, clinic_id: req.user.clinic_id, fichierResultat: { [Op.ne]: null } },
            include: [{ model: ExamenCatalog, as: 'examenDetails', attributes: ['nom', 'type'] }],
            order: [['id', 'DESC']],
        }));

        res.json([
            ...scans.map(s => ({
                type: 'cin', id: s.id, titre: `CIN ${s.cinNumero} — ${s.face}`, format: s.fichierFormat,
                date: s.uploaded_at || null, url: `/patients/${patient.numeroDossier}/documents/cin/${s.id}`,
            })),
            ...examens.map(e => ({
                type: 'examen', id: e.id, titre: e.examenDetails?.nom || 'Résultat d’examen', categorie: e.examenDetails?.type,
                date: e.updatedAt || null, url: `/examens/${e.id}/fichier`,
            })),
        ]);
    } catch (error) {
        console.error('[PATIENT DOCUMENTS]', error.message);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// GET /api/patients/:id/documents/cin/:scanId — Scan de CIN (identité) : secrétaire, médecin, admin de la clinique
router.get('/:id/documents/cin/:scanId', authenticateJWT, authorizeRole('secretary', 'doctor', 'admin'), async (req, res) => {
    try {
        const patient = await Patient.findOne(await accessQuery(req, Patient, { where: { numeroDossier: req.params.id, clinic_id: req.user.clinic_id }, attributes: ['id'] }));
        const scan = patient && await CinScan.findOne(await accessQuery(req, CinScan, { where: { id: req.params.scanId, patientId: patient.id, clinic_id: req.user.clinic_id } }));
        if (!scan) return res.status(404).json({ error: 'Document non trouvé' });
        // Seul le nom du fichier est repris : aucun chemin ne peut sortir du dossier des scans
        const chemin = join(UPLOAD_DIR, basename(scan.fichierNom));
        if (!existsSync(chemin)) return res.status(404).json({ error: 'Fichier introuvable' });
        await envoyerScanCin(res, chemin);
    } catch (error) {
        console.error('[PATIENT DOCUMENT CIN]', error.message);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

export default router;
