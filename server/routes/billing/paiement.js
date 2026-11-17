// Facturation — encaissement d'une facture.
import { Router } from 'express';
import { accessQuery, updateScoped } from '../../services/patientAccess.js';
import { authenticateJWT, authorizeRole } from '../../middleware/auth.js';
import { Facture, LigneFacture } from '../../models/index.js';
import { Op } from 'sequelize';
import { inClinic } from '../../services/tenant.js';

const router = Router();

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /api/billing/:id/pay — Enregistrer paiement
// ─────────────────────────────────────────────────────────────────────────────
router.patch('/:id/pay', authenticateJWT, authorizeRole('secretary', 'admin'), async (req, res) => {
    try {
        const { modePaiement } = req.body;
        const facture = await Facture.findOne(await accessQuery(req, Facture, {
            where: inClinic(req, { id: req.params.id }),
            include: [{ model: LigneFacture, as: 'lignes' }]
        }));
        if (!facture) return res.status(404).json({ error: 'Facture non trouvée' });
        if (facture.statut === 'payee') return res.status(400).json({ error: 'Déjà payée' });

        await updateScoped(req, facture, { statut: 'payee', modePaiement: modePaiement || 'especes', datePaiement: new Date() });

        try {
            const { Prescription } = await import('../prescriptions.js');
            const lignes = Array.isArray(facture.lignes) ? facture.lignes : JSON.parse(facture.lignes || '[]');

            // Trouver les prescriptions liées dans cette facture et les marquer comme facturées
            const prescriptionIds = lignes
                .filter(l => l.sourceType === 'medicament' && l.sourceId)
                .map(l => l.sourceId);

            if (prescriptionIds.length > 0) {
                // Deduplicate IDs
                const uniqueIds = [...new Set(prescriptionIds)];
                await Prescription.update(
                    { facturee: true },
                    await accessQuery(req, Prescription, { where: inClinic(req, { id: { [Op.in]: uniqueIds }, patientCin: facture.patientCin }) })
                );
            }

            // Trouver les examens liés dans cette facture et les marquer comme facturés
            const examIds = lignes
                .filter(l => l.sourceType === 'examen' && l.sourceId)
                .map(l => l.sourceId);

            if (examIds.length > 0) {
                const uniqueExamIds = [...new Set(examIds)];
                const { ExamenPatient } = await import('../../models/index.js');
                await ExamenPatient.update(
                    { estFacture: true },
                    await accessQuery(req, ExamenPatient, { where: inClinic(req, { id: { [Op.in]: uniqueExamIds }, patientId: facture.patientId }) })
                );
            }

            // Trouver les consultations liées dans cette facture et les marquer comme facturées
            const rdvIds = lignes
                .filter(l => l.sourceType === 'consultation' && l.sourceId)
                .map(l => l.sourceId);

            if (rdvIds.length > 0) {
                const uniqueRdvIds = [...new Set(rdvIds)];
                const { RendezVous } = await import('../../models/index.js');
                await RendezVous.update(
                    { estFacture: true },
                    await accessQuery(req, RendezVous, { where: inClinic(req, { id: { [Op.in]: uniqueRdvIds }, patientId: facture.patientId }) })
                );
            }

            // Trouver les hospitalisations (chambre) liées dans cette facture et les marquer comme facturées
            const hospIds = lignes
                .filter(l => l.sourceType === 'chambre' && l.sourceId)
                .map(l => l.sourceId);

            if (hospIds.length > 0) {
                const uniqueHospIds = [...new Set(hospIds)];
                const { Hospitalisation } = await import('../../models/index.js');
                await Hospitalisation.update(
                    { estFacture: true },
                    await accessQuery(req, Hospitalisation, { where: inClinic(req, { id: { [Op.in]: uniqueHospIds }, patientId: facture.patientId }) })
                );
            }
        } catch (e) {
            console.error('[BILLING] Erreur lors du marquage des prescriptions:', e);
        }

        console.log(`[BILLING] Facture ${facture.numero} payée — Mode: ${modePaiement}`);
        res.json({ success: true, numero: facture.numero, statut: 'payee' });
    } catch (err) {
        console.error('[BILLING PAY ERROR]', err);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

export default router;
