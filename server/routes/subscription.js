import { Router } from 'express';
import { authenticateJWT } from '../middleware/auth.js';
import { Clinic } from '../models/index.js';
import { trialEndFor } from '../config/trial.js';

const router = Router();

// Toutes les routes nécessitent une authentification
router.use(authenticateJWT);

// Helper
function getClinicId(req) {
    return req.user?.clinic_id || req.user?.clinicId || null;
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/subscription/status — Statut de l'abonnement de la clinique
// Retourne : status, daysLeft (si trial), plan
// ─────────────────────────────────────────────────────────────────────────────
router.get('/status', async (req, res) => {
    try {
        const clinicId = getClinicId(req);
        if (!clinicId) return res.status(403).json({ error: 'Aucune clinique associée' });

        const clinic = await Clinic.findByPk(clinicId, {
            attributes: ['id', 'name', 'subscriptionStatus', 'type', 'createdAt', 'trialEndsAt']
        });

        if (!clinic) return res.status(404).json({ error: 'Clinique non trouvée' });

        const status = clinic.subscriptionStatus;
        let daysLeft = null;
        let hoursLeft = null;
        let trialEndDate = null;

        if (status === 'trial') {
            const trialEnd = trialEndFor(clinic);
            const msLeft = trialEnd.getTime() - Date.now();
            daysLeft = Math.max(0, Math.ceil(msLeft / (1000 * 60 * 60 * 24)));
            hoursLeft = Math.max(0, Math.ceil(msLeft / (1000 * 60 * 60)));
            trialEndDate = trialEnd.toISOString();
        }

        res.json({
            clinicId: clinic.id,
            clinicName: clinic.name,
            status,               // 'trial' | 'active' | 'suspended'
            plan: clinic.type || 'Starter',
            daysLeft,             // null si non-trial, 0 si expiré
            hoursLeft,            // null si non-trial, 0 si expiré
            trialEndDate,         // null si non-trial
            isExpired: status === 'trial' && daysLeft === 0,
            isSuspended: status === 'suspended',
            isActive: status === 'active',
        });
    } catch (error) {
        console.error('[SUBSCRIPTION STATUS]', error.message);
        res.status(500).json({ error: error.message });
    }
});

// L'activation et la suspension ne sont pas libre-service : seul le super-admin change le statut
// d'une clinique (PUT /api/super-admin/clinics/:id/status, POST …/extend-trial).

export default router;
