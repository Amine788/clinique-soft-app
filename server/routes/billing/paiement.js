import { Router } from 'express';
import { authenticateJWT, authorizeRole } from '../../middleware/auth.js';
import { recordPayment } from '../../services/recordPayment.js';
const router = Router();
router.patch('/:id/pay', authenticateJWT, authorizeRole('secretary', 'admin'), async (req, res, next) => {
    try {
        const facture = await recordPayment(req);
        res.json({ success: true, numero: facture.numero, statut: facture.statut, facture });
    } catch (error) { next(error); }
});
export default router;
