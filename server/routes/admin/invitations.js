// Administration — invitation d'un membre de l'équipe par e-mail.
import { Router } from 'express';
import jwt from 'jsonwebtoken';
import { JWT_SECRET } from '../../middleware/auth.js';
import { User, Medecin, Clinic } from '../../models/index.js';
import { jourClinique } from '../../services/dates.js';
import sequelize from '../../config/database.js';
import { getClinicId, ROLES_CLINIQUE } from './_commun.js';

const router = Router();

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/admin/users/invite — Inviter un membre du personnel  ✅
// ─────────────────────────────────────────────────────────────────────────────
router.post('/users/invite', async (req, res) => {
    const { email, name, role } = req.body;

    if (!email || !name || !role) {
        return res.status(400).json({ error: 'Champs requis : email, name, role' });
    }

    if (!ROLES_CLINIQUE.includes(role)) {
        return res.status(400).json({ error: `Rôle invalide. Rôles acceptés: ${ROLES_CLINIQUE.join(', ')}` });
    }

    const t = await sequelize.transaction();
    try {
        const clinicId = getClinicId(req, res);
        if (!clinicId) { await t.rollback(); return; }

        const clinic = await Clinic.findByPk(clinicId, { transaction: t });
        const clinicName = clinic ? clinic.name : 'votre Clinique';

        const existing = await User.findOne({ where: { email }, transaction: t, toutesCliniques: true });
        if (existing) { await t.rollback(); return res.status(409).json({ error: 'Cet email est déjà lié à un compte' }); }

        const prefix = role === 'doctor' ? 'MED' : role === 'secretary' ? 'SEC' : role === 'pharmacist' ? 'PHA' : role === 'lab_technician' ? 'LAB' : role === 'nurse' ? 'INF' : 'ADM';
        // Colonne matricule : VARCHAR(20). Date.now() en décimal (13 chiffres) donnait 21 caractères et faisait échouer toute invitation.
        const matricule = `${prefix}-INV-${Date.now().toString(36).toUpperCase()}`;
        const names = name.split(' ');

        // Créer l'utilisateur avec statut 'inactif'
        const newUser = await User.create({
            clinic_id: clinicId,  // ✅
            matricule,
            nom: names.slice(1).join(' ') || 'Invite',
            prenom: names[0] || 'Invite',
            email,
            passwordHash: 'PENDING_INVITE',
            role,
            statut: 'inactif'
        }, { transaction: t });

        // Si médecin, créer le profil médecin de base
        if (role === 'doctor') {
            await Medecin.create({
                userId: newUser.id,
                clinic_id: clinicId,  // ✅
                matricule,
                titre: 'Dr.',
                numeroOrdre: `ORDRE-${Date.now()}`,
                specialites: ['Généraliste'],
                dateDebut: jourClinique(),
                salleConsultation: '',
                dureeRdvMinutes: 30,
                statut: 'inactif',
            }, { transaction: t });
        }

        await t.commit();

        // Générer le token d'invitation (TTL 48h)
        const setupToken = jwt.sign(
            { userId: newUser.id, clinicId, type: 'INVITATION', source: 'invite_team' },
            JWT_SECRET,
            { expiresIn: '48h' }
        );

        const setupLink = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/setup-password?token=${setupToken}`;

        // Envoyer l'email d'invitation
        const { sendInvitationEmail } = await import('../../services/emailService.js');
        await sendInvitationEmail({
            email,
            prenom: newUser.prenom,
            nom: newUser.nom,
            role,
            clinicName,
            setupLink
        });

        res.json({
            success: true,
            message: `Invitation envoyée avec succès à ${name} (${email})`
        });

    } catch (error) {
        if (t) await t.rollback();
        console.error('[ADMIN USER INVITE]', error.message);
        res.status(500).json({ error: error.message || 'Erreur lors de l\'invitation du membre' });
    }
});

export default router;
