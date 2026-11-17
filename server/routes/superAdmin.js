import { Router } from 'express';
import { authenticateJWT, authorizeRole } from '../middleware/auth.js';
import { User, Clinic, Medecin, Absence, Departement, Chambre, ProduitPharmacie } from '../models/index.js';
import { cliniqueAvecDonnees } from '../services/historique.js';
import sequelize from '../config/database.js';
import { Op } from 'sequelize';
import { trialEndFor, MAX_TRIAL_EXTENSION_HOURS } from '../config/trial.js';
import { clinicSocket } from '../socket/clinicSocket.js';

const router = Router();

// Toutes les routes nécessitent d'être connecté en tant que super_admin
router.use(authenticateJWT, authorizeRole('super_admin'));

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/super-admin/stats — Statistiques globales de la plateforme SaaS
// ─────────────────────────────────────────────────────────────────────────────
router.get('/stats', async (req, res) => {
    try {
        const totalClinics = await Clinic.count();
        // Comptes des cliniques seulement (les super-admins de la plateforme ne sont pas des utilisateurs clients)
        const totalUsers = await User.count({ where: { role: { [Op.ne]: 'super_admin' } } });

        // Répartition des statuts de cliniques
        const activeClinics = await Clinic.count({ where: { subscriptionStatus: 'active' } });
        const trialClinics = await Clinic.count({ where: { subscriptionStatus: 'trial' } });
        const suspendedClinics = await Clinic.count({ where: { subscriptionStatus: 'suspended' } });

        // Utilisateurs par rôle
        const rolesBreakdown = {};
        for (const role of ['doctor', 'secretary', 'admin', 'nurse', 'pharmacist', 'lab_technician']) {
            rolesBreakdown[role] = await User.count({ where: { role } });
        }

        // Chiffre d'affaires mensuel estimé (MRR)
        // Disons plan Starter = 999 DH/mois, Pro = 2499 DH/mois
        const clinicsList = await Clinic.findAll({ attributes: ['type', 'subscriptionStatus'] });
        let estimatedMRR = 0;
        clinicsList.forEach(c => {
            if (c.subscriptionStatus === 'active') {
                if (c.type === 'Pro') estimatedMRR += 2499;
                else if (c.type === 'Starter') estimatedMRR += 999;
            }
        });

        res.json({
            totalClinics,
            totalUsers,
            activeClinics,
            trialClinics,
            suspendedClinics,
            estimatedMRR,
            rolesBreakdown
        });
    } catch (error) {
        console.error('[SUPER-ADMIN STATS]', error.message);
        res.status(500).json({ error: error.message });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/super-admin/clinics — Liste de toutes les cliniques avec nombre d'utilisateurs
// ─────────────────────────────────────────────────────────────────────────────
router.get('/clinics', async (req, res) => {
    try {
        const clinics = await Clinic.findAll({
            attributes: { exclude: ['keyHash'] }, // empreinte de la clé de licence : jamais renvoyée
            order: [['createdAt', 'DESC']]
        });

        // Calculer le nombre d'utilisateurs par clinique
        const clinicsData = [];
        for (const c of clinics) {
            const userCount = await User.count({ where: { clinic_id: c.id } });
            clinicsData.push({
                ...c.toJSON(),
                // Fin d'essai effective (création + 24 h ou prolongation), null hors essai
                trialEnd: c.subscriptionStatus === 'trial' ? trialEndFor(c).toISOString() : null,
                userCount
            });
        }

        res.json(clinicsData);
    } catch (error) {
        console.error('[SUPER-ADMIN CLINICS]', error.message);
        res.status(500).json({ error: error.message });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// PUT /api/super-admin/clinics/:id/status — Modifier le statut d'une clinique
// ─────────────────────────────────────────────────────────────────────────────
router.put('/clinics/:id/status', async (req, res) => {
    const { status } = req.body;
    if (!['trial', 'active', 'suspended'].includes(status)) {
        return res.status(400).json({ error: 'Statut invalide' });
    }

    try {
        const clinic = await Clinic.findByPk(req.params.id);
        if (!clinic) return res.status(404).json({ error: 'Clinique non trouvée' });

        await clinic.update({ subscriptionStatus: status });
        if (status === 'suspended') clinicSocket.deconnecterClinique(clinic.id);
        res.json({ success: true, message: `Statut de la clinique mis à jour en ${status}` });
    } catch (error) {
        console.error('[SUPER-ADMIN CLINIC STATUS]', error.message);
        res.status(500).json({ error: error.message });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/super-admin/clinics/:id/extend-trial — Prolonger l'essai de { hours } heures
// La prolongation part de la fin actuelle si elle est à venir, sinon de maintenant.
// Une clinique suspendue repasse en essai ; une clinique active est refusée (409).
// ─────────────────────────────────────────────────────────────────────────────
router.post('/clinics/:id/extend-trial', async (req, res) => {
    const hours = Number(req.body?.hours);
    if (!Number.isInteger(hours) || hours < 1 || hours > MAX_TRIAL_EXTENSION_HOURS) {
        return res.status(400).json({ error: `Durée invalide : un nombre entier d'heures entre 1 et ${MAX_TRIAL_EXTENSION_HOURS}.` });
    }

    try {
        const clinic = await Clinic.findByPk(req.params.id);
        if (!clinic) return res.status(404).json({ error: 'Clinique non trouvée' });
        if (clinic.subscriptionStatus === 'active') {
            return res.status(409).json({ error: 'Cette clinique est déjà active : aucun essai à prolonger.' });
        }

        const now = Date.now();
        const currentEnd = trialEndFor(clinic).getTime();
        // Arrondi à la seconde : DATETIME ne garde pas les millisecondes, la réponse reste égale à la base
        const fin = Math.max(now, currentEnd) + hours * 60 * 60 * 1000;
        const trialEndsAt = new Date(Math.floor(fin / 1000) * 1000);

        await clinic.update({ subscriptionStatus: 'trial', trialEndsAt });
        res.json({ success: true, subscriptionStatus: 'trial', trialEnd: trialEndsAt.toISOString() });
    } catch (error) {
        console.error('[SUPER-ADMIN EXTEND TRIAL]', error.message);
        res.status(500).json({ error: error.message });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/super-admin/users — Liste tous les utilisateurs de toutes les cliniques
// ─────────────────────────────────────────────────────────────────────────────
router.get('/users', async (req, res) => {
    try {
        // Inclure le nom de la clinique de chaque utilisateur
        const users = await User.findAll({
            attributes: ['id', 'nom', 'prenom', 'email', 'role', 'statut', 'clinic_id', 'matricule', 'createdAt'],
            order: [['createdAt', 'DESC']]
        });

        const usersData = [];
        for (const u of users) {
            let clinicName = 'Platform Admin';
            if (u.clinic_id) {
                const c = await Clinic.findByPk(u.clinic_id, { attributes: ['name'] });
                if (c) clinicName = c.name;
            }
            usersData.push({
                ...u.toJSON(),
                clinicName
            });
        }

        res.json(usersData);
    } catch (error) {
        console.error('[SUPER-ADMIN USERS]', error.message);
        res.status(500).json({ error: error.message });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /api/super-admin/clinics/:id — Supprimer une clinique sans données patients
// Une clinique qui a des patients, RDV, factures, ordonnances… se suspend : la supprimer laisserait
// ses dossiers médicaux orphelins en base.
// ─────────────────────────────────────────────────────────────────────────────
router.delete('/clinics/:id', async (req, res) => {
    const clinic = await Clinic.findByPk(req.params.id).catch(() => null);
    if (!clinic) return res.status(404).json({ error: 'Clinique non trouvée' });
    if (await cliniqueAvecDonnees(clinic.id)) {
        return res.status(409).json({ error: 'Cette clinique contient des données patients : suspendez-la au lieu de la supprimer.' });
    }

    const t = await sequelize.transaction();
    try {
        const clinicId = clinic.id;
        const where = { clinic_id: clinicId };

        // Données de configuration sans patient : profils médecins (et leurs absences), départements,
        // chambres, stock de pharmacie, puis comptes et clinique
        const medecins = await Medecin.findAll({ where, attributes: ['id'], transaction: t });
        await Absence.destroy({ where: { medecinId: medecins.map(m => m.id) }, transaction: t });
        await Medecin.destroy({ where, transaction: t });
        await Departement.destroy({ where, transaction: t });
        await Chambre.destroy({ where, transaction: t });
        await ProduitPharmacie.destroy({ where, transaction: t });
        await User.destroy({ where, transaction: t });
        await Clinic.destroy({ where: { id: clinicId }, transaction: t });

        await t.commit();
        res.json({ success: true, message: 'Clinique et utilisateurs supprimés avec succès.' });
    } catch (error) {
        await t.rollback();
        console.error('[SUPER-ADMIN CLINIC DELETE]', error.message);
        res.status(500).json({ error: error.message });
    }
});

export default router;
