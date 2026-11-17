import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { Clinic, Departement } from '../models/index.js';
import { authenticateJWT, authorizeRole } from '../middleware/auth.js';
import { trialEndFor } from '../config/trial.js';
import { majTempsReel } from '../socket/clinicSocket.js';
const router = Router();

// Logos des cliniques : un fichier par clinique, servi publiquement sous /uploads/logos (pas une donnée sensible)
const LOGO_DIR = 'uploads/logos/';
if (!fs.existsSync(LOGO_DIR)) fs.mkdirSync(LOGO_DIR, { recursive: true });
const TYPES_LOGO = { 'image/png': '.png', 'image/jpeg': '.jpg' };
const uploadLogo = multer({
    storage: multer.diskStorage({
        destination: (req, file, cb) => cb(null, LOGO_DIR),
        filename: (req, file, cb) => cb(null, `clinic-${req.user.clinic_id}-${Date.now()}${TYPES_LOGO[file.mimetype]}`),
    }),
    limits: { fileSize: 2 * 1024 * 1024 },
    fileFilter: (req, file, cb) => cb(null, Boolean(TYPES_LOGO[file.mimetype])),
}).single('logo');

// ─────────────────────────────────────────────────────────────────────────────
// Helper
// ─────────────────────────────────────────────────────────────────────────────
function getClinicId(req, res) {
    const clinicId = req.user.clinicId || req.user.clinic_id || null;
    if (!clinicId) {
        res.status(403).json({ error: 'Aucune clinique associée à cet utilisateur' });
        return null;
    }
    return clinicId;
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/clinic — Informations de la clinique (avec clé d'activation)
// ─────────────────────────────────────────────────────────────────────────────
router.get('/', authenticateJWT, async (req, res) => {
    try {
        const clinicId = getClinicId(req, res);
        if (!clinicId) return;

        const clinic = await Clinic.findByPk(clinicId);
        if (!clinic) return res.json({});

        // 🔐 Ne jamais retourner keyHash — uniquement le préfixe pour identification visuelle
        const clinicData = clinic.toJSON();
        delete clinicData.keyHash;
        // Fin d'essai calculée côté serveur (création + 24 h ou prolongation du super-admin)
        clinicData.trialEnd = clinic.subscriptionStatus === 'trial' ? trialEndFor(clinic).toISOString() : null;
        // Construire la version masquée : "CLN-A3F9-****-****"
        clinicData.displayKey = clinic.keyPrefix
            ? `${clinic.keyPrefix}-****-****`
            : null;

        res.json(clinicData);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// PUT /api/clinic — Mise à jour (admin uniquement)
// ─────────────────────────────────────────────────────────────────────────────
router.put('/', authenticateJWT, authorizeRole('admin'), async (req, res) => {
    const { name, raisonSociale, address, email, phone, specialty, ice, ifNum, rc, tp, rib, activeModules } = req.body;
    try {
        const clinicId = getClinicId(req, res);
        if (!clinicId) return;

        let clinic = await Clinic.findByPk(clinicId);
        // type = plan SaaS, jamais modifié ici ; la spécialité a sa propre colonne
        // Seuls les champs envoyés sont modifiés (Réglages n'envoie que activeModules, Ma Clinique la fiche)
        const champs = { name, raisonSociale, address, email, phone, ice, ifNum, rc, tp, rib, specialite: specialty, activeModules };
        const updateData = Object.fromEntries(Object.entries(champs).filter(([, valeur]) => valeur !== undefined));
        if (updateData.name !== undefined && !String(updateData.name).trim()) {
            return res.status(400).json({ error: 'Le nom de la clinique est obligatoire' });
        }

        if (!clinic) {
            clinic = await Clinic.create({ id: clinicId, ...updateData });
        } else {
            await clinic.update(updateData);
        }
        majTempsReel(clinic); // bascule « Notifications temps réel » appliquée immédiatement
        const clinicData = clinic.toJSON();
        delete clinicData.keyHash; // empreinte de la clé : jamais renvoyée
        res.json({ success: true, clinic: clinicData });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});


// ─────────────────────────────────────────────────────────────────────────────
// POST /api/clinic/logo — Logo de la clinique (admin) : factures, ordonnances PDF, menu
// ─────────────────────────────────────────────────────────────────────────────
router.post('/logo', authenticateJWT, authorizeRole('admin'), (req, res) => {
    uploadLogo(req, res, async (err) => {
        if (err || !req.file) {
            return res.status(400).json({ error: 'Logo : image PNG ou JPEG de 2 Mo maximum' });
        }
        try {
            const clinicId = getClinicId(req, res);
            if (!clinicId) return;
            const clinic = await Clinic.findByPk(clinicId);
            if (!clinic) return res.status(404).json({ error: 'Clinique non trouvée' });

            const ancien = clinic.logoUrl;
            const logoUrl = `/uploads/logos/${req.file.filename}`;
            await clinic.update({ logoUrl });

            // L'ancien logo de cette clinique n'est plus référencé
            if (ancien?.startsWith('/uploads/logos/')) {
                fs.rm(path.join(LOGO_DIR, path.basename(ancien)), { force: true }, () => {});
            }
            res.json({ success: true, logoUrl });
        } catch (error) {
            fs.rm(req.file.path, { force: true }, () => {});
            res.status(500).json({ error: error.message });
        }
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// DÉPARTEMENTS — CRUD complet
// ─────────────────────────────────────────────────────────────────────────────

// GET /api/clinic/departements — Liste tous les départements de la clinique
router.get('/departements', authenticateJWT, async (req, res) => {
    try {
        const clinicId = getClinicId(req, res);
        if (!clinicId) return;

        const deps = await Departement.findAll({
            where: { clinic_id: clinicId },
            order: [['createdAt', 'ASC']]
        });
        res.json(deps);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// POST /api/clinic/departements — Créer un département
router.post('/departements', authenticateJWT, authorizeRole('admin'), async (req, res) => {
    const { nom, chef, lits, statut, description } = req.body;
    if (!nom) return res.status(400).json({ error: 'Le nom du département est obligatoire' });
    try {
        const clinicId = getClinicId(req, res);
        if (!clinicId) return;

        const dep = await Departement.create({
            clinic_id: clinicId,
            nom,
            chef: chef || '',
            lits: lits ? parseInt(lits) : 0,
            statut: statut || 'actif',
            description: description || null
        });
        res.status(201).json(dep);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// PUT /api/clinic/departements/:id — Modifier un département
router.put('/departements/:id', authenticateJWT, authorizeRole('admin'), async (req, res) => {
    const { nom, chef, lits, statut, description } = req.body;
    try {
        const clinicId = getClinicId(req, res);
        if (!clinicId) return;

        const dep = await Departement.findOne({ where: { id: req.params.id, clinic_id: clinicId } });
        if (!dep) return res.status(404).json({ error: 'Département non trouvé' });

        await dep.update({
            nom: nom || dep.nom,
            chef: chef !== undefined ? chef : dep.chef,
            lits: lits !== undefined ? parseInt(lits) : dep.lits,
            statut: statut || dep.statut,
            description: description !== undefined ? description : dep.description
        });
        res.json(dep);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// PATCH /api/clinic/departements/:id/toggle — Activer / Désactiver
router.patch('/departements/:id/toggle', authenticateJWT, authorizeRole('admin'), async (req, res) => {
    try {
        const clinicId = getClinicId(req, res);
        if (!clinicId) return;

        const dep = await Departement.findOne({ where: { id: req.params.id, clinic_id: clinicId } });
        if (!dep) return res.status(404).json({ error: 'Département non trouvé' });

        const newStatut = dep.statut === 'actif' ? 'inactif' : 'actif';
        await dep.update({ statut: newStatut });
        res.json({ success: true, statut: newStatut });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// DELETE /api/clinic/departements/:id — Supprimer un département
router.delete('/departements/:id', authenticateJWT, authorizeRole('admin'), async (req, res) => {
    try {
        const clinicId = getClinicId(req, res);
        if (!clinicId) return;

        const dep = await Departement.findOne({ where: { id: req.params.id, clinic_id: clinicId } });
        if (!dep) return res.status(404).json({ error: 'Département non trouvé' });

        await dep.destroy();
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

export default router;
