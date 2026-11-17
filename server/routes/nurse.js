// Routes « nurse » : montage des sous-routeurs (logique dans routes/nurse/).
import { Router } from 'express';
import { patientAccess } from '../services/patientAccess.js';
import { authenticateJWT, requireClinicId } from '../middleware/auth.js';
import consultationRoutes from './nurse/consultation.js';
import medicamentsRoutes from './nurse/medicaments.js';
import hospitalisesRoutes from './nurse/hospitalises.js';

const router = Router();
router.use(authenticateJWT, requireClinicId, patientAccess('nurse'));

router.use(consultationRoutes);
router.use(medicamentsRoutes);
router.use(hospitalisesRoutes);

export { setNurseSocketIO } from './nurse/hospitalises.js';
export default router;
