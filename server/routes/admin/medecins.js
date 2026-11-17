// Administration — médecins de la clinique.
import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { User, Medecin } from '../../models/index.js';
import { getClinicId } from './_commun.js';

const router = Router();

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/admin/doctors — Médecins de la clinique  ✅
// ─────────────────────────────────────────────────────────────────────────────
router.get('/doctors', async (req, res) => {
    try {
        const clinicId = getClinicId(req, res);
        if (!clinicId) return;

        const doctors = await Medecin.findAll({
            where: { clinic_id: clinicId },  // ✅
            include: [{ model: User, attributes: ['id', 'nom', 'prenom', 'email', 'telephone', 'statut', 'photoUrl', 'matricule'] }]
        });
        res.json(doctors);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.put('/doctors/:id/password', async (req, res) => {
    const { password } = req.body;
    if (!password || password.length < 6) return res.status(400).json({ error: 'Mot de passe trop court' });
    try {
        const clinicId = getClinicId(req, res);
        if (!clinicId) return;

        const medecin = await Medecin.findOne({ where: { id: req.params.id, clinic_id: clinicId } });
        if (!medecin) return res.status(404).json({ error: 'Médecin non trouvé dans votre clinique' });
        const user = await User.findByPk(medecin.userId);
        await user.update({ passwordHash: await bcrypt.hash(password, 12) });
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

export default router;
