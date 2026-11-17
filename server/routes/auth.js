import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { JWT_SECRET, authenticateJWT } from '../middleware/auth.js';
import { User, Medecin } from '../models/index.js';
import sequelize from '../config/database.js';
import { sendAdminWelcomeEmail, sendNewClientNotification, emailConfigure } from '../services/emailService.js';
import { trialEndFor } from '../config/trial.js';
import multer from 'multer';
import fs from 'fs';
const router = Router();

const MESSAGE_EMAIL_NON_ENVOYE = "Votre clinique est créée, mais l'e-mail de configuration n'a pas pu être envoyé. Contactez le support NextClinic pour recevoir votre lien d'activation.";

// E-mail de bienvenue avec le lien de création du mot de passe : true s'il est parti.
// Un échec n'annule pas l'inscription, mais la page doit le dire au client (sans lien, pas de connexion possible).
async function envoyerLienConfiguration({ email, prenom, clinicName, setupLink, finEssai }) {
    if (!emailConfigure()) {
        console.error('[INSCRIPTION] Envoi d\'e-mails non configuré (GMAIL_USER / GMAIL_APP_PASSWORD) : lien non envoyé à', email);
        return false;
    }
    try {
        await sendAdminWelcomeEmail({ email, prenom, clinicName, setupLink, finEssai });
        return true;
    } catch (err) {
        console.error('[INSCRIPTION] E-mail de configuration non envoyé :', err.message);
        return false;
    }
}

// Durée des jetons de session (les liens d'activation gardent leur propre durée)
const SESSION_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '8h';

// ─────────────────────────────────────────────────────────────────────────────
// Génération + hashage de la clé de licence (comme GitHub PAT / Stripe secret)
// La clé brute n'est JAMAIS stockée en base — seulement son SHA-256 + préfixe
// ─────────────────────────────────────────────────────────────────────────────
function generateActivationKey() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const seg = () => Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
    const rawKey = `CLN-${seg()}-${seg()}-${seg()}`;
    const keyHash = crypto.createHash('sha256').update(rawKey).digest('hex');
    const keyPrefix = rawKey.split('-').slice(0, 2).join('-'); // ex: "CLN-A3F9"
    return { rawKey, keyHash, keyPrefix };
}



// Configuration Multer pour les photos de profil
// Photos de profil : servies publiquement sous /uploads/profiles, donc uniquement de vraies images, avec une
// extension déduite du type et jamais du nom envoyé par le client (pas de .html ni de .svg exécutables)
const TYPES_PHOTO = { 'image/png': '.png', 'image/jpeg': '.jpg', 'image/webp': '.webp' };
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        // Comme routes/admin.js : le dossier peut manquer hors image Docker (installation neuve)
        const dir = 'uploads/profiles/';
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        cb(null, dir);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, 'profile-' + uniqueSuffix + TYPES_PHOTO[file.mimetype]);
    }
});
const upload = multer({
    storage,
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB max
    fileFilter: (req, file, cb) => {
        if (TYPES_PHOTO[file.mimetype]) cb(null, true);
        else cb(Object.assign(new Error('Format de photo non supporté (PNG, JPEG ou WebP)'), { status: 400 }));
    }
});

// Contenu de session commun à /login et /setup-password (doctorId, doctorName… inclus)
async function buildSessionPayload(user) {
    let doctorId = null;
    let doctorSpecialty = null;
    let doctorName = null;
    if (user.role === 'doctor') {
        const medecin = await Medecin.findOne({ where: { userId: user.id } });
        doctorId = medecin?.id || null;
    } else if (user.role === 'nurse') {
        doctorId = user.doctorId || null;
        if (doctorId) {
            const medecin = await Medecin.findByPk(doctorId, {
                include: [{ model: User, attributes: ['nom', 'prenom'] }]
            });
            if (medecin) {
                try {
                    const specs = typeof medecin.specialites === 'string' ? JSON.parse(medecin.specialites) : medecin.specialites;
                    doctorSpecialty = specs?.[0] || 'Généraliste';
                } catch {
                    doctorSpecialty = 'Généraliste';
                }
                doctorName = medecin.User ? `${medecin.User.prenom} ${medecin.User.nom}` : null;
            }
        }
    }

    await user.update({ lastLogin: new Date() });

    return {
        id: user.id,
        email: user.email,
        name: `${user.prenom} ${user.nom}`,
        role: user.role,
        avatar: user.photoUrl || (user.prenom?.[0] + user.nom?.[0]),
        clinicId: user.clinic_id || user.clinicId || null,
        clinic_id: user.clinic_id || user.clinicId || null,
        doctorId,
        doctorSpecialty,
        doctorName
    };
}

// POST /api/auth/login
// Limitation des échecs de connexion (force brute) : par IP et e-mail, en mémoire (une seule instance d'API).
// Une connexion réussie n'est jamais freinée et remet le compteur à zéro.
const ECHECS_MAX = 10;
const FENETRE_ECHECS_MS = 15 * 60 * 1000;
const echecsConnexion = new Map();
const cleConnexion = (req, email) => `${req.ip}|${String(email).trim().toLowerCase()}`;
const connexionBloquee = (cle) => {
    const e = echecsConnexion.get(cle);
    return Boolean(e) && Date.now() - e.debut < FENETRE_ECHECS_MS && e.n >= ECHECS_MAX;
};
const noterEchec = (cle) => {
    const e = echecsConnexion.get(cle);
    if (!e || Date.now() - e.debut >= FENETRE_ECHECS_MS) echecsConnexion.set(cle, { n: 1, debut: Date.now() });
    else e.n += 1;
};
setInterval(() => {
    for (const [cle, e] of echecsConnexion) if (Date.now() - e.debut >= FENETRE_ECHECS_MS) echecsConnexion.delete(cle);
}, FENETRE_ECHECS_MS).unref();

router.post('/login', async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) {
        return res.status(400).json({ error: 'Email et mot de passe requis' });
    }
    const cle = cleConnexion(req, email);
    if (connexionBloquee(cle)) {
        return res.status(429).json({ error: 'Trop de tentatives de connexion. Réessayez dans 15 minutes.', code: 'too_many_attempts' });
    }

    try {
        const user = await User.findOne({ where: { email } });
        if (!user) { noterEchec(cle); return res.status(401).json({ error: 'Identifiants invalides' }); }

        const validPassword = await bcrypt.compare(password, user.passwordHash);
        if (!validPassword) { noterEchec(cle); return res.status(401).json({ error: 'Identifiants invalides' }); }
        echecsConnexion.delete(cle);

        // Vérification du statut du compte
        if (user.statut === 'inactif') {
            return res.status(403).json({ error: 'Ce compte est suspendu. Veuillez contacter l\'administrateur.' });
        }

        const payload = await buildSessionPayload(user);

        const token = jwt.sign(payload, JWT_SECRET, { expiresIn: SESSION_EXPIRES_IN });

        res.json({ token, user: payload });
    } catch (error) {
        console.error('[AUTH] Erreur login :', error.message);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// POST /api/auth/register-clinic — Inscription SaaS Simplifiée
router.post('/register-clinic', async (req, res) => {
    const { clinicName, clinicType, ownerName, email } = req.body;

    if (!clinicName || !ownerName || !email) {
        return res.status(400).json({ error: 'Tous les champs sont obligatoires' });
    }

    const t = await sequelize.transaction();
    try {
        const existing = await User.findOne({ where: { email }, transaction: t });
        if (existing) {
            await t.rollback();
            return res.status(409).json({ error: 'Cet email est déjà utilisé' });
        }

        const { Clinic } = await import('../models/index.js');
        // 🔐 Générer la clé : rawKey affichée UNE SEULE FOIS, jamais stockée en clair
        const { rawKey, keyHash, keyPrefix } = generateActivationKey();
        const clinic = await Clinic.create({
            name: clinicName,
            type: 'Starter',          // plan SaaS par défaut
            specialite: clinicType || null,
            email: email,
            subscriptionStatus: 'trial',
            keyHash,
            keyPrefix
        }, { transaction: t });

        // Créer l'Administrateur sans mot de passe (statut 'inactif' jusqu'au setup)
        const count = await User.count({ transaction: t });
        const matricule = `ADM-${new Date().getFullYear()}-${String(count + 1).padStart(4, '0')}`;
        const names = ownerName.split(' ');
        
        // On génère un token temporaire pour le setup
        const setupToken = jwt.sign({ email, clinicId: clinic.id }, JWT_SECRET, { expiresIn: '24h' });

        const user = await User.create({
            clinic_id: clinic.id, // (clinicId n'est pas un attribut du modèle : l'admin restait sans clinique)
            matricule,
            nom: names.slice(1).join(' ') || 'Admin',
            prenom: names[0],
            email,
            passwordHash: 'PENDING_SETUP', // Sera mis à jour via l'email
            role: 'admin',
            statut: 'inactif'
        }, { transaction: t });

        await t.commit();

        // Envoi de l'email de Setup via Gmail
        const setupLink = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/setup-password?token=${setupToken}`;
        
        // Sans cet e-mail, l'admin ne peut pas créer son mot de passe : le résultat est renvoyé à la page
        const emailEnvoye = await envoyerLienConfiguration({ email: user.email, prenom: user.prenom, clinicName: clinic.name, setupLink, finEssai: trialEndFor(clinic) });

        // ⚠️  rawKey retourné UNE SEULE FOIS ici — ne sera plus jamais accessible après
        res.status(201).json({
            success: true,
            rawKey,              // La clé brute à sauvegarder immédiatement
            keyPrefix,           // CLN-XXXX — identifiant visuel pour l'avenir
            emailEnvoye,
            message: emailEnvoye ? 'Un email de configuration a été envoyé.' : MESSAGE_EMAIL_NON_ENVOYE
        });

    } catch (error) {
        if (t) await t.rollback();
        console.error('[AUTH REGISTER CLINIC]', error.message);
        res.status(500).json({ error: 'Erreur lors de la création du compte' });
    }
});

// POST /api/auth/setup-password — Finalisation du compte (Définition du mot de passe)
// Gère deux cas :
//   1. Admin clinique  → token généré à l'inscription (source: register-clinic / register)
//   2. Membre d'équipe → token d'invitation généré par /users/invite (source: invite_team)
router.post('/setup-password', async (req, res) => {
    const { token, password } = req.body;
    if (!token || !password) return res.status(400).json({ error: 'Token et mot de passe requis' });
    if (password.length < 6) return res.status(400).json({ error: 'Mot de passe trop court (6 car. min)' });

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        const { email, userId } = decoded;
        const passwordHash = await bcrypt.hash(password, 12);

        let user = null;
        if (userId) {
            user = await User.findByPk(userId);
        } else if (email) {
            user = await User.findOne({ where: { email } });
        }

        // ── Utilisateur existant (inscription clinique ou invitation équipe) ──────
        // Lien à usage unique : il sert à créer le premier mot de passe, jamais à changer celui d'un compte actif
        if (user && !String(user.passwordHash).startsWith('PENDING_')) {
            return res.status(409).json({ error: 'Ce lien a déjà été utilisé. Connectez-vous avec votre mot de passe.' });
        }
        if (user) {
            const t = await sequelize.transaction();
            try {
                await user.update({ passwordHash, statut: 'actif' }, { transaction: t });

                // Activer également le médecin si c'est son rôle
                if (user.role === 'doctor') {
                    const medecin = await Medecin.findOne({ where: { userId: user.id }, transaction: t });
                    if (medecin) {
                        await medecin.update({ statut: 'actif' }, { transaction: t });
                    }
                }
                await t.commit();
            } catch (err) {
                await t.rollback();
                throw err;
            }

            const payload = await buildSessionPayload(user);
            const sessionToken = jwt.sign(payload, JWT_SECRET, { expiresIn: SESSION_EXPIRES_IN });
            return res.json({ success: true, token: sessionToken, user: payload });
        }

        // Aucun cas correspondant
        return res.status(404).json({ error: 'Utilisateur non trouvé. Veuillez recommencer l\'inscription.' });

    } catch (error) {
        console.error('[AUTH SETUP PASSWORD]', error.message);
        if (error.name === 'TokenExpiredError') {
            return res.status(401).json({ error: 'Le lien a expiré. Contactez le support NextClinic pour en recevoir un nouveau.' });
        }
        if (error.name === 'JsonWebTokenError') {
            return res.status(400).json({ error: 'Lien invalide. Contactez le support NextClinic pour en recevoir un nouveau.' });
        }
        res.status(500).json({ error: 'Erreur lors de la configuration du mot de passe' });
    }
});

// POST /api/auth/register — Inscription SaaS Multi-Tenant (Création automatique du Tenant)
router.post('/register', async (req, res) => {
    const { clinicName, ownerName, email, phone, country, plan } = req.body;

    if (!clinicName || !ownerName || !email) {
        return res.status(400).json({ error: 'Champs obligatoires : Nom de la clinique, Nom du responsable, Email professionnel' });
    }

    const t = await sequelize.transaction();
    try {
        const existing = await User.findOne({ where: { email }, transaction: t });
        if (existing) {
            await t.rollback();
            return res.status(409).json({ error: 'Cet email est déjà lié à un compte' });
        }

        const { Clinic } = await import('../models/index.js');
        
        // Générer le slug de la clinique (ex: clinique-al-shifa)
        const slug = clinicName
            .toLowerCase()
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "") // Supprimer les accents
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/(^-|-$)/g, '');

        // 🔐 Générer la clé : rawKey affichée UNE SEULE FOIS, jamais stockée en clair
        const { rawKey, keyHash, keyPrefix } = generateActivationKey();
        const clinic = await Clinic.create({
            name: clinicName,
            type: plan || 'Starter',
            email: email,
            phone: phone || null,
            address: country || null,
            subscriptionStatus: 'trial',
            keyHash,
            keyPrefix
        }, { transaction: t });

        // Créer l'Administrateur avec statut 'inactif'
        const count = await User.count({ transaction: t });
        const matricule = `ADM-${new Date().getFullYear()}-${String(count + 1).padStart(4, '0')}`;
        const names = ownerName.split(' ');

        const user = await User.create({
            clinicId: clinic.id,
            clinic_id: clinic.id,
            matricule,
            nom: names.slice(1).join(' ') || 'Admin',
            prenom: names[0] || 'Admin',
            email,
            passwordHash: 'PENDING_SETUP', // Sera défini via l'email de configuration
            role: 'admin',
            statut: 'inactif'
        }, { transaction: t });

        await t.commit();

        // Jeton de configuration JWT sécurisé (TTL 24h)
        const setupToken = jwt.sign(
            { userId: user.id, clinicId: clinic.id, type: 'SETUP_PASSWORD', source: 'register' },
            JWT_SECRET,
            { expiresIn: '24h' }
        );

        const setupLink = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/setup-password?token=${setupToken}`;

        // ── 1. Email de configuration envoyé AU CLIENT (lien setup mot de passe) ; résultat renvoyé à la page
        const emailEnvoye = await envoyerLienConfiguration({ email: user.email, prenom: user.prenom, clinicName, setupLink, finEssai: trialEndFor(clinic) });

        // ── 2. Notification interne envoyée à l'équipe NextClinic (ADMIN_NOTIFICATION_EMAIL)
        sendNewClientNotification({
            prenom:     user.prenom,
            nom:        user.nom,
            email:      email,
            clinicName: clinicName,
            phone:      phone || null,
            plan:       plan || 'Pro'
        }).catch(err => console.error('[SAAS REGISTER] Erreur notification admin:', err.message));

        // ⚠️  rawKey retourné UNE SEULE FOIS — ne sera plus jamais accessible après
        res.status(201).json({
            success: true,
            clinicId: clinic.id,
            rawKey,              // La clé brute à sauvegarder immédiatement
            keyPrefix,           // CLN-XXXX — identifiant visuel pour l'avenir
            slug,
            emailEnvoye,
            ...(!emailEnvoye && { message: MESSAGE_EMAIL_NON_ENVOYE })
        });

    } catch (error) {
        if (t) await t.rollback();
        console.error('[SAAS REGISTER]', error.message);
        res.status(500).json({ error: error.message || 'Erreur lors de l\'inscription de la clinique' });
    }
});


// POST /api/auth/profile-photo — Uploader la photo de profil du médecin
const PHOTO_MEDECIN_SEULEMENT = 'Seuls les médecins peuvent avoir une photo de profil personnalisée pour le moment.';
// Rôle (relu en base par authenticateJWT) vérifié AVANT multer : un refus ne laisse aucun fichier sur le disque
const medecinSeulement = (req, res, next) => req.user.role === 'doctor' ? next() : res.status(403).json({ error: PHOTO_MEDECIN_SEULEMENT });
// Photo enregistrée mais requête en échec : le fichier ne doit pas rester orphelin dans uploads/profiles
const supprimerPhoto = (req) => req.file && fs.promises.unlink(req.file.path).catch(() => {});

router.post('/profile-photo', authenticateJWT, medecinSeulement, upload.single('photo'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'Aucun fichier reçu' });
        }

        const user = await User.findByPk(req.user.id);
        if (!user) { await supprimerPhoto(req); return res.status(404).json({ error: 'Utilisateur non trouvé' }); }

        if (user.role !== 'doctor') {
            await supprimerPhoto(req);
            return res.status(403).json({ error: PHOTO_MEDECIN_SEULEMENT });
        }

        const photoUrl = `/uploads/profiles/${req.file.filename}`;
        await user.update({ photoUrl });

        res.json({ success: true, photoUrl });
    } catch (error) {
        await supprimerPhoto(req);
        console.error('[AUTH UPLOAD]', error.message);
        res.status(500).json({ error: 'Erreur lors de l\'upload de la photo' });
    }
});

// GET /api/auth/me
router.get('/me', authenticateJWT, async (req, res) => {
    // Refresh user to get the latest photoUrl
    const dbUser = await User.findByPk(req.user.id);

    // Si l'utilisateur n'existe plus ou qu'il a été désactivé entre temps
    if (!dbUser || dbUser.statut === 'inactif') {
        return res.status(403).json({ error: 'Compte suspendu ou introuvable', code: 'account_suspended' });
    }

    const updatedPayload = { ...req.user, avatar: dbUser.photoUrl || (dbUser.prenom[0] + dbUser.nom[0]) };
    res.json({ user: updatedPayload });
});

export default router;
