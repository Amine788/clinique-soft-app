// Routes « hospitalisations » : montage des sous-routeurs (logique dans routes/hospitalisations/).
import { Router } from 'express';
import { patientAccess } from '../services/patientAccess.js';
import { authenticateJWT, requireClinicId } from '../middleware/auth.js';
import admissionsRoutes from './hospitalisations/admissions.js';
import suiviRoutes from './hospitalisations/suivi.js';
import soinsRoutes from './hospitalisations/soins.js';

const router = Router();
router.use(authenticateJWT, requireClinicId, patientAccess('hospitalisations'));

router.use(admissionsRoutes);
router.use(suiviRoutes);
router.use(soinsRoutes);

export default router;
