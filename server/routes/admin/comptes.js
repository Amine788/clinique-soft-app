// Administration — comptes de la clinique : liste, création, modification, mot de passe, activation, suppression.
import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { User, Medecin } from '../../models/index.js';
import { jourClinique } from '../../services/dates.js';
import { compteAvecHistorique } from '../../services/historique.js';
import { clinicSocket } from '../../socket/clinicSocket.js';
import sequelize from '../../config/database.js';
import multer from 'multer';
import fs from 'fs';
import { getClinicId, ROLES_CLINIQUE } from './_commun.js';

const router = Router();

// Multer config — photos de profil publiques : uniquement de vraies images, extension déduite du type
// (jamais du nom envoyé par le client : pas de .html ni de .svg exécutables sous /uploads/profiles)
const TYPES_PHOTO = { 'image/png': '.png', 'image/jpeg': '.jpg', 'image/webp': '.webp' };

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const dir = 'uploads/profiles/';
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        cb(null, dir);
    },
    filename: (req, file, cb) => {
        cb(null, `admin-${Date.now()}-${Math.round(Math.random() * 1E9)}${TYPES_PHOTO[file.mimetype]}`);
    }
});

const upload = multer({
    storage,
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        if (TYPES_PHOTO[file.mimetype]) cb(null, true);
        else cb(Object.assign(new Error('Format de photo non supporté (PNG, JPEG ou WebP)'), { status: 400 }));
    }
});

// Médecin référent d'un infirmier : obligatoirement un médecin de la même clinique
async function medecinReferentInvalide(doctorId, clinicId) {
    if (!doctorId) return false;
    return !(await Medecin.findOne({ where: { id: doctorId, clinic_id: clinicId }, attributes: ['id'] }));
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/admin/users — Liste les comptes de la clinique de l'admin ✅
// ─────────────────────────────────────────────────────────────────────────────
router.get('/users', async (req, res) => {
    try {
        const clinicId = getClinicId(req, res);
        if (!clinicId) return;

        const where = { clinic_id: clinicId };  // ✅ toujours filtré
        if (req.query.role) where.role = req.query.role;

        const users = await User.findAll({
            where,
            attributes: ['id', 'nom', 'prenom', 'email', 'telephone', 'role', 'statut', 'photoUrl', 'matricule', 'createdAt', 'lastLogin', 'doctor_id'],
            order: [['createdAt', 'DESC']]
        });

        // Enrichir les médecins avec leur spécialité (uniquement ceux de cette clinique)
        const medecins = await Medecin.findAll({
            where: { clinic_id: clinicId },  // ✅
            attributes: ['userId', 'specialites', 'salleConsultation', 'titre', 'id'],
            include: [{ model: User, attributes: ['nom', 'prenom'] }]
        });
        const medecinByUserIdMap = {};
        const medecinByIdMap = {};
        for (const m of medecins) {
            medecinByUserIdMap[m.userId] = m;
            medecinByIdMap[m.id] = m;
        }

        res.json(users.map(u => {
            const userJson = u.toJSON();
            const doctorMedecin = userJson.doctor_id ? medecinByIdMap[userJson.doctor_id] : null;
            return {
                ...userJson,
                medecinInfo: medecinByUserIdMap[u.id] ? {
                    medecinId: medecinByUserIdMap[u.id].id,
                    titre: medecinByUserIdMap[u.id].titre,
                    specialites: (() => {
                        try { return typeof medecinByUserIdMap[u.id].specialites === 'string' ? JSON.parse(medecinByUserIdMap[u.id].specialites) : medecinByUserIdMap[u.id].specialites; } catch { return []; }
                    })(),
                    salle: medecinByUserIdMap[u.id].salleConsultation
                } : null,
                doctorInfo: doctorMedecin ? {
                    id: doctorMedecin.id,
                    nom: doctorMedecin.User?.nom,
                    prenom: doctorMedecin.User?.prenom,
                    titre: doctorMedecin.titre,
                    specialites: (() => {
                        try { return typeof doctorMedecin.specialites === 'string' ? JSON.parse(doctorMedecin.specialites) : doctorMedecin.specialites; } catch { return []; }
                    })()
                } : null
            };
        }));
    } catch (error) {
        console.error('[ADMIN USERS]', error.message);
        res.status(500).json({ error: error.message });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/admin/stats — Statistiques filtrées par clinic_id ✅
// ─────────────────────────────────────────────────────────────────────────────
router.get('/stats', async (req, res) => {
    try {
        const clinicId = getClinicId(req, res);
        if (!clinicId) return;

        const roles = ['doctor', 'secretary', 'pharmacist', 'lab_technician', 'nurse', 'admin'];
        const counts = {};
        for (const role of roles) {
            counts[role] = await User.count({ where: { role, clinic_id: clinicId } });  // ✅
        }
        const actifs = await User.count({ where: { statut: 'actif', clinic_id: clinicId } });  // ✅
        const total = await User.count({ where: { clinic_id: clinicId } });  // ✅
        res.json({ ...counts, actifs, total });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/admin/users — Créer un compte lié à la clinique de l'admin ✅
// ─────────────────────────────────────────────────────────────────────────────
router.post('/users', upload.single('photo'), async (req, res) => {
    const { nom, prenom, email, password, telephone, role, specialite, titre, salleConsultation, doctorId } = req.body;

    if (!nom || !prenom || !email || !password || !role) {
        return res.status(400).json({ error: 'Champs obligatoires : nom, prénom, email, mot de passe, rôle' });
    }
    if (password.length < 6) return res.status(400).json({ error: 'Mot de passe trop court (6 caractères min)' });
    if (!ROLES_CLINIQUE.includes(role)) return res.status(400).json({ error: `Rôle invalide. Rôles acceptés : ${ROLES_CLINIQUE.join(', ')}` });

    const t = await sequelize.transaction();
    try {
        const clinicId = getClinicId(req, res);
        if (!clinicId) { await t.rollback(); return; }
        if (role === 'nurse' && await medecinReferentInvalide(doctorId, clinicId)) {
            await t.rollback();
            return res.status(400).json({ error: 'Médecin référent introuvable dans votre clinique' });
        }

        const existing = await User.findOne({ where: { email }, transaction: t, toutesCliniques: true });
        if (existing) { await t.rollback(); return res.status(409).json({ error: 'Email déjà utilisé' }); }

        const prefix = role === 'doctor' ? 'MED' : role === 'secretary' ? 'SEC' : role === 'pharmacist' ? 'PHA' : role === 'lab_technician' ? 'LAB' : role === 'nurse' ? 'INF' : 'ADM';
        let matricule;
        let attempt = await User.count({ where: { clinic_id: clinicId }, transaction: t }) + 1;
        while (true) {
            matricule = `${prefix}-${new Date().getFullYear()}-${String(attempt).padStart(4, '0')}`;
            const exists = await User.findOne({ where: { matricule }, transaction: t, toutesCliniques: true });
            if (!exists) break;
            attempt++;
        }
        const passwordHash = await bcrypt.hash(password, 12);
        const photoUrl = req.file ? `/uploads/profiles/${req.file.filename}` : null;

        const user = await User.create({
            matricule, nom, prenom, email, passwordHash, photoUrl,
            role, telephone: telephone || null, statut: 'actif',
            clinic_id: clinicId,  // ✅ lier à la clinique de l'admin
            doctorId: role === 'nurse' && doctorId ? doctorId : null
        }, { transaction: t });

        // Si c'est un médecin, créer aussi le profil Medecin
        let medecinId = null;
        if (role === 'doctor') {
            const medecin = await Medecin.create({
                userId: user.id,
                clinic_id: clinicId,  // ✅
                matricule,
                titre: titre || 'Dr.',
                numeroOrdre: `ORDRE-${Date.now()}`,
                specialites: specialite ? [specialite] : ['Généraliste'],
                dateDebut: jourClinique(),
                salleConsultation: salleConsultation || '',
                dureeRdvMinutes: 30,
                statut: 'actif',
            }, { transaction: t });
            medecinId = medecin.id;
        }

        await t.commit();
        res.status(201).json({ success: true, userId: user.id, medecinId });
    } catch (error) {
        await t.rollback();
        console.error('[ADMIN USERS POST]', error.name, error.errors ? error.errors.map(e => `${e.path}: ${e.message}`) : error.message);
        res.status(500).json({ error: error.message, details: error.errors?.map(e => `${e.path}: ${e.message}`) });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// PUT /api/admin/users/:id — Modifier un compte  ✅ vérifie clinic_id
// ─────────────────────────────────────────────────────────────────────────────
router.put('/users/:id', async (req, res) => {
    const { nom, prenom, email, telephone, statut, specialite, salleConsultation, doctorId } = req.body;
    try {
        const clinicId = getClinicId(req, res);
        if (!clinicId) return;

        // ✅ Vérification que l'utilisateur appartient à la clinique de l'admin
        const user = await User.findOne({ where: { id: req.params.id, clinic_id: clinicId } });
        if (!user) return res.status(404).json({ error: 'Utilisateur non trouvé dans votre clinique' });

        if (user.id === req.user.id && statut && statut !== 'actif') {
            return res.status(400).json({ error: 'Vous ne pouvez pas désactiver votre propre compte' });
        }
        if (email && email !== user.email && await User.findOne({ where: { email }, attributes: ['id'], toutesCliniques: true })) {
            return res.status(409).json({ error: 'Email déjà utilisé' });
        }
        if (user.role === 'nurse' && await medecinReferentInvalide(doctorId, clinicId)) {
            return res.status(400).json({ error: 'Médecin référent introuvable dans votre clinique' });
        }

        await user.update({ nom, prenom, email, telephone, statut, doctorId: user.role === 'nurse' && doctorId ? doctorId : null });
        if (user.statut === 'inactif') clinicSocket.deconnecterUser(user.id);

        // Si médecin, mettre à jour sa spécialité/salle
        if (user.role === 'doctor' && (specialite || salleConsultation)) {
            const medecin = await Medecin.findOne({ where: { userId: user.id, clinic_id: clinicId } });
            if (medecin) {
                const updates = {};
                if (specialite) updates.specialites = [specialite];
                if (salleConsultation) updates.salleConsultation = salleConsultation;
                await medecin.update(updates);
            }
        }

        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// PUT /api/admin/users/:id/password — Reset mot de passe  ✅ vérifie clinic_id
// ─────────────────────────────────────────────────────────────────────────────
router.put('/users/:id/password', async (req, res) => {
    const { password } = req.body;
    if (!password || password.length < 6) return res.status(400).json({ error: 'Mot de passe trop court' });
    try {
        const clinicId = getClinicId(req, res);
        if (!clinicId) return;

        const user = await User.findOne({ where: { id: req.params.id, clinic_id: clinicId } });
        if (!user) return res.status(404).json({ error: 'Utilisateur non trouvé dans votre clinique' });
        const passwordHash = await bcrypt.hash(password, 12);
        await user.update({ passwordHash });
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /api/admin/users/:id/toggle — Activer / Désactiver  ✅ vérifie clinic_id
// ─────────────────────────────────────────────────────────────────────────────
router.patch('/users/:id/toggle', async (req, res) => {
    try {
        const clinicId = getClinicId(req, res);
        if (!clinicId) return;

        const user = await User.findOne({ where: { id: req.params.id, clinic_id: clinicId } });
        if (!user) return res.status(404).json({ error: 'Utilisateur non trouvé dans votre clinique' });
        if (user.id === req.user.id) return res.status(400).json({ error: 'Vous ne pouvez pas désactiver votre propre compte' });
        const newStatut = user.statut === 'actif' ? 'inactif' : 'actif';
        await user.update({ statut: newStatut });
        if (newStatut === 'inactif') clinicSocket.deconnecterUser(user.id);
        res.json({ success: true, statut: newStatut });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /api/admin/users/:id — Supprimer un compte  ✅ vérifie clinic_id
// ─────────────────────────────────────────────────────────────────────────────
router.delete('/users/:id', async (req, res) => {
    try {
        const clinicId = getClinicId(req, res);
        if (!clinicId) return;

        const user = await User.findOne({ where: { id: req.params.id, clinic_id: clinicId } });
        if (!user) return res.status(404).json({ error: 'Utilisateur non trouvé dans votre clinique' });
        if (user.role === 'admin') return res.status(403).json({ error: 'Impossible de supprimer un admin' });
        // Un compte qui a un historique (RDV, ordonnances, soins…) se désactive : sa suppression effacerait
        // en cascade des dossiers médicaux (hospitalisations du médecin, soins et constantes de l'infirmier)
        if (await compteAvecHistorique(user)) {
            return res.status(409).json({ error: 'Ce compte a un historique médical ou administratif : désactivez-le au lieu de le supprimer.' });
        }

        // Supprimer le profil médecin si c'en est un
        if (user.role === 'doctor') {
            await Medecin.destroy({ where: { userId: user.id, clinic_id: clinicId } });
        }
        await user.destroy();
        clinicSocket.deconnecterUser(user.id);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

export default router;
