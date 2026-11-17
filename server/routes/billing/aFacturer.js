// Facturation — actes en attente de facturation pour un patient.
import { Router } from 'express';
import { accessQuery, scopedByPk } from '../../services/patientAccess.js';
import { authenticateJWT, authorizeRole } from '../../middleware/auth.js';
import { Patient } from '../../models/index.js';
import { Op } from 'sequelize';
import { parseMedicaments } from '../../services/posologie.js';
import { inClinic } from '../../services/tenant.js';

const router = Router();

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/billing/pending/:cin — Récupérer tout ce qui n'est pas encore facturé
// ─────────────────────────────────────────────────────────────────────────────
router.get('/pending/:cin', authenticateJWT, authorizeRole('secretary', 'admin'), async (req, res) => {
    try {
        const cin = req.params.cin.toUpperCase();
        const clinicId = req.user.clinic_id;
        const patient = await Patient.findOne(await accessQuery(req, Patient, { where: { cinNumero: cin, clinic_id: clinicId } })); // ✅

        if (!patient) return res.status(404).json({ error: 'Patient non trouvé' });

        const lignesPending = [];

        // 1. Récupérer les consultations 'termine' qui n'ont pas de facture associée
        // On importe RendezVous depuis les modèles
        const { RendezVous, ProduitPharmacie, ExamenPatient, ExamenCatalog, Hospitalisation, Chambre } = await import('../../models/index.js');
        const { Prescription } = await import('../prescriptions.js');

        const pastMonth = new Date();
        pastMonth.setDate(pastMonth.getDate() - 30); // On regarde jusqu'à 1 mois en arrière pour éviter les vieilles erreurs

        // a) Chercher les RDVs 'termine' qui ne sont pas facturés
        const whereRdv = {
            patientCin: cin,
            statut: 'termine',
            estFacture: false,
            dateRdv: { [Op.gte]: pastMonth }
        };

        const consultationsPending = await RendezVous.findAll(await accessQuery(req, RendezVous, { where: whereRdv }));

        // c) Convertir les consultations en lignes de facturation
        for (const rdv of consultationsPending) {
            const PRIX = { premiere: 300, urgente: 200, suivi: 100 };
            let prix = PRIX[rdv.typeConsultation] ?? 300;

            // Pré-opératoire : récupérer le prix de la chambre si dispo
            if (rdv.typeConsultation === 'preoperation') {
                try {
                    const { Chambre } = await import('../../models/index.js');
                    if (rdv.chambreId) {
                        const chambre = await scopedByPk(req, Chambre, rdv.chambreId);
                        if (chambre && rdv.dateAdmission && rdv.dateSortieEstimee) {
                            const jours = Math.max(1, Math.ceil((new Date(rdv.dateSortieEstimee) - new Date(rdv.dateAdmission)) / 86400000));
                            prix = (chambre.prixParNuit || chambre.price || 0) * jours;
                        }
                    }
                } catch { prix = 0; }
            }

            lignesPending.push({
                sourceType: 'consultation',
                sourceId: rdv.id,
                designation: `Consultation (${rdv.typeConsultation}) - ${new Date(rdv.dateRdv).toLocaleDateString('fr-FR')}`,
                quantite: 1,
                prixUnitaire: prix
            });
        }

        // 2. Récupérer les prescriptions 'remise' non facturées
        const prescriptionsPending = await Prescription.findAll(await accessQuery(req, Prescription, {
            where: {
                ...inClinic(req),
                patientCin: cin,
                statut: 'remise',
                facturee: false
            }
        }));

        for (const presc of prescriptionsPending) {
            try {
                const meds = parseMedicaments(presc.medicaments);
                for (const med of meds) {
                    // Essayer de trouver le produit par nom (le premier mot)
                    const searchTerm = med.nom ? med.nom.split(' ')[0] : '';
                    let prod = null;
                    if (searchTerm) {
                        prod = await ProduitPharmacie.findOne(await accessQuery(req, ProduitPharmacie, {
                            where: { nomCommercial: { [Op.like]: `%${searchTerm}%` } }
                        }));
                    }

                    const prixUnitaire = prod ? Number(prod.prixVente) : 0;

                    if (prixUnitaire > 0) {
                        lignesPending.push({
                            sourceType: 'medicament',
                            sourceId: presc.id,
                            designation: 'Produits pharmaceutiques',
                            quantite: med.quantite || 1, // par défaut 1 boîte si non précisé
                            prixUnitaire: prixUnitaire
                        });
                    } else {
                        // Ajouter quand même pour mémoire à 0 MAD (La secrétaire peut corriger manuellement)
                        lignesPending.push({
                            sourceType: 'medicament',
                            sourceId: presc.id,
                            designation: 'Produits pharmaceutiques',
                            quantite: med.quantite || 1,
                            prixUnitaire: 0
                        });
                    }
                }
            } catch (e) { console.error('Erreur parsing medicaments facture', e); }
        }

        // 3. Récupérer les examens terminés non facturés
        const examensPending = await ExamenPatient.findAll(await accessQuery(req, ExamenPatient, {
            where: {
                patientId: patient.id,
                statut: 'termine',
                estFacture: false
            },
            include: [{ model: ExamenCatalog, as: 'examenDetails' }]
        }));

        for (const exam of examensPending) {
            // Prix fixe 500 DH par examen
            const prixUnitaire = 500;
            lignesPending.push({
                sourceType: 'examen',
                sourceId: exam.id,
                designation: 'Acte technique',
                quantite: 1,
                prixUnitaire
            });
        }

        // 4. Récupérer les hospitalisations (chambre) non facturées
        const hospitalisationsPending = await Hospitalisation.findAll(await accessQuery(req, Hospitalisation, {
            where: {
                patientId: patient.id,
                estFacture: false,
                statut: { [Op.in]: ['admis', 'sortie_demandee', 'termine'] }
            },
            include: [{ model: Chambre }]
        }));

        for (const hosp of hospitalisationsPending) {
            if (!hosp.Chambre) continue;
            const debut = new Date(hosp.dateAdmission);
            const fin = hosp.dateSortie ? new Date(hosp.dateSortie) : new Date();
            const nuits = Math.max(1, Math.ceil((fin - debut) / 86400000));
            const prixUnitaire = Number(hosp.Chambre.tarifTtc || 0);

            lignesPending.push({
                sourceType: 'chambre',
                sourceId: hosp.id,
                designation: `Hospitalisation - Chambre ${hosp.Chambre.numero} (${hosp.Chambre.typeChambre}) - ${nuits} nuit(s)`,
                quantite: nuits,
                prixUnitaire
            });
        }

        res.json({
            patient: { nom: patient.nom, prenom: patient.prenom, cin: patient.cinNumero },
            lignes: lignesPending
        });

    } catch (error) {
        console.error('[BILLING PENDING]', error);
        res.status(500).json({ error: 'Erreur serveur lors de la récupération des charges' });
    }
});

export default router;
