// Routes « patients » : montage des sous-routeurs (logique dans routes/patients/).
import { Router } from 'express';
import { patientAccess } from '../services/patientAccess.js';
import { authenticateJWT, requireClinicId } from '../middleware/auth.js';
import listeRoutes from './patients/liste.js';
import accueilRoutes from './patients/accueil.js';
import dossierRoutes from './patients/dossier.js';
import documentsRoutes from './patients/documents.js';

const router = Router();
router.use(authenticateJWT, requireClinicId, patientAccess('patients'));

router.use(listeRoutes);
router.use(accueilRoutes);
router.use(dossierRoutes);
router.use(documentsRoutes);

export default router;
