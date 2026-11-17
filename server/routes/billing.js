// Routes « billing » : montage des sous-routeurs (logique dans routes/billing/).
import { Router } from 'express';
import { patientAccess } from '../services/patientAccess.js';
import { authenticateJWT, requireClinicId } from '../middleware/auth.js';
import aFacturerRoutes from './billing/aFacturer.js';
import facturesRoutes from './billing/factures.js';
import paiementRoutes from './billing/paiement.js';

const router = Router();
router.use(authenticateJWT, requireClinicId, patientAccess('billing'));

router.use(aFacturerRoutes);
router.use(facturesRoutes);
router.use(paiementRoutes);

export default router;
