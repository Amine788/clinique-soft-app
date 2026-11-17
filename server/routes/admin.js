// Routes « admin » : montage des sous-routeurs (logique dans routes/admin/).
import { Router } from 'express';
import { authenticateJWT, authorizeRole } from '../middleware/auth.js';
import comptesRoutes from './admin/comptes.js';
import medecinsRoutes from './admin/medecins.js';
import invitationsRoutes from './admin/invitations.js';

const router = Router();
// Toutes les routes admin nécessitent le rôle admin
router.use(authenticateJWT, authorizeRole('admin'));

router.use(comptesRoutes);
router.use(medecinsRoutes);
router.use(invitationsRoutes);

export default router;
