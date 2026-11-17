import { patientAccess, accessQuery, scopedByPk } from '../services/patientAccess.js';
import { Router } from 'express';
import { authenticateJWT, authorizeRole, requireClinicId } from '../middleware/auth.js';
import { Op } from 'sequelize';
import { RendezVous, ProduitPharmacie, Medecin, Facture, LigneFacture, ExamenPatient, Chambre, Patient, User } from '../models/index.js';
import { Prescription } from './prescriptions.js';
import { jourClinique, minuitClinique, premierDuMois, premierDeLAnnee, ajouterJours } from '../services/dates.js';
const router = Router();
router.use(authenticateJWT, requireClinicId, patientAccess('dashboard'));

// Statuts d'un patient présent dans la clinique : chez l'infirmier, prêt, en consultation
const STATUTS_SALLE_ATTENTE = ['arrive', 'pret', 'en_cours'];

// Rendez-vous du jour (calendrier de la clinique), au même format que GET /api/appointments
async function rdvDuJour(req, where) {
    const rdvs = await RendezVous.findAll(await accessQuery(req, RendezVous, {
        where: { ...where, dateRdv: jourClinique() },
        include: [
            { model: Patient, attributes: ['nom', 'prenom'] },
            { model: Medecin, include: [{ model: User, attributes: ['nom', 'prenom'] }] },
        ],
        order: [['heureDebut', 'ASC']],
    }));
    return rdvs.map(r => ({
        id: r.id,
        patient: r.Patient ? `${r.Patient.prenom} ${r.Patient.nom}` : '—',
        doctor: r.Medecin?.User ? `Dr. ${r.Medecin.User.prenom} ${r.Medecin.User.nom}` : '—',
        time: r.heureDebut?.slice(0, 5),
        motif: r.motif,
        status: r.statut,
    }));
}

// GET /api/dashboard/secretary
router.get('/secretary', authenticateJWT, authorizeRole('secretary'), async (req, res) => {
    try {
        const clinicId = req.user.clinic_id;
        // Jour et minuit de la clinique (pas ceux du serveur ni d'UTC)
        const jour = jourClinique();
        const today = minuitClinique(jour);

        // CA du Jour (Factures payées aujourd'hui) ✅ filtré par clinic_id
        const facturesToday = await Facture.findAll(await accessQuery(req, Facture, {
            where: {
                clinic_id: clinicId,  // ✅
                statut: 'payee',
                updatedAt: { [Op.gte]: today }
            }
        }));
        const caJour = facturesToday.reduce((sum, f) => sum + Number(f.total || 0), 0);

        // Consultations du jour ✅ filtrées par clinic_id
        const todayStr = jour;
        const consultations = await RendezVous.count(await accessQuery(req, RendezVous, {
            where: {
                clinic_id: clinicId,  // ✅
                dateRdv: { [Op.between]: [todayStr, todayStr] },
                statut: { [Op.in]: ['confirme', 'arrive', 'en_cours', 'termine'] }
            }
        }));

        // Taux d'occupation des chambres : occupées / utilisables (hors service exclues)
        // null quand la clinique n'a encore aucune chambre utilisable
        const chambres = await Chambre.findAll(await accessQuery(req, Chambre, { where: { clinic_id: clinicId }, attributes: ['statut'] }));
        const chambresTotal = chambres.filter(c => c.statut !== 'hors_service').length;
        const chambresOccupees = chambres.filter(c => c.statut === 'occupee').length;
        const tauxOccupation = chambresTotal === 0 ? null : Math.round((chambresOccupees / chambresTotal) * 100);

        // Revenus encaissés sur les 7 derniers jours (même règle que le CA du jour : factures payées)
        const premierJour = ajouterJours(jour, -6);
        const payees7j = await Facture.findAll(await accessQuery(req, Facture, {
            where: { clinic_id: clinicId, statut: 'payee', updatedAt: { [Op.gte]: minuitClinique(premierJour) } },
            attributes: ['total', 'updatedAt'],
        }));
        const revenus7j = Array.from({ length: 7 }, (_, i) => ({ date: ajouterJours(premierJour, i), total: 0 }));
        for (const f of payees7j) {
            const jourFacture = revenus7j.find(r => r.date === jourClinique(new Date(f.updatedAt)));
            if (jourFacture) jourFacture.total += Number(f.total || 0);
        }

        // Salle d'attente : patients du jour présents dans la clinique
        const salleAttente = await rdvDuJour(req, { clinic_id: clinicId, statut: { [Op.in]: STATUTS_SALLE_ATTENTE } });

        // Impayés (>30J)
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        const facturesUnpaid = await Facture.findAll(await accessQuery(req, Facture, {
            where: {
                clinic_id: clinicId, // ✅ Filtre d'isolation
                statut: 'en_attente',
                createdAt: { [Op.lte]: thirtyDaysAgo }
            }
        }));
        const impayes = facturesUnpaid.reduce((sum, f) => sum + Number(f.total || 0), 0);

        res.json({
            caJour,
            consultations,
            tauxOccupation,
            chambresOccupees,
            chambresTotal,
            impayes,
            revenus7j,
            salleAttente
        });
    } catch (error) {
        console.error('[DASHBOARD SEC]', error);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// GET /api/dashboard/doctor
router.get('/doctor', authenticateJWT, authorizeRole('doctor'), async (req, res) => {
    try {
        const medecin = await Medecin.findOne(await accessQuery(req, Medecin, { where: { userId: req.user.id } }));
        if (!medecin) return res.status(404).json({ error: 'Medecin non trouvé' });

        const startOfMonthStr = premierDuMois(jourClinique());

        const consultsMois = await RendezVous.count(await accessQuery(req, RendezVous, {
            where: {
                medecinId: medecin.id,
                statut: 'termine',
                dateRdv: { [Op.gte]: startOfMonthStr }
            }
        }));

        const noshowsMois = await RendezVous.count(await accessQuery(req, RendezVous, {
            where: {
                medecinId: medecin.id,
                statut: 'non_presente',
                dateRdv: { [Op.gte]: startOfMonthStr }
            }
        }));

        const totalAppts = consultsMois + noshowsMois;
        const presenceRate = totalAppts === 0 ? 100 : Math.round((consultsMois / totalAppts) * 100);

        // Honoraires
        const rdvsMois = await RendezVous.findAll(await accessQuery(req, RendezVous, {
            where: { medecinId: medecin.id, dateRdv: { [Op.gte]: startOfMonthStr } },
            attributes: ['id']
        }));
        const rdvIds = rdvsMois.map(r => r.id);

        let honoraires = 0;
        if (rdvIds.length > 0) {
            const factures = await Facture.findAll(await accessQuery(req, Facture, {
                where: { rdvId: { [Op.in]: rdvIds }, statut: 'payee' }
            }));
            honoraires = factures.reduce((s, f) => s + Number(f.total), 0);
        }

        // Planning du jour du médecin (la salle d'attente en est extraite côté interface)
        const planningJour = await rdvDuJour(req, { medecinId: medecin.id, statut: { [Op.notIn]: ['annule', 'reporte'] } });

        res.json({
            consultations: consultsMois,
            presenceRate,
            noShows: noshowsMois,
            honoraires,
            planningJour
        });
    } catch (error) {
        console.error('[DASHBOARD DOC]', error);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// GET /api/dashboard/pharmacist
router.get('/pharmacist', authenticateJWT, authorizeRole('pharmacist'), async (req, res) => {
    try {
        const clinicId = req.user.clinic_id;
        const tousLesProduits = await ProduitPharmacie.findAll(await accessQuery(req, ProduitPharmacie, {
            where: { clinic_id: clinicId } // ✅ Filtre d'isolation
        }));

        const produitsEnStock = tousLesProduits.length;
        const rupturesImminentes = tousLesProduits.filter(p => p.stockActuel <= p.stockMinimum).length;
        const peremptionsProches = 0; // Not tracked in DB yet

        const firstDayOfMonth = new Date();
        firstDayOfMonth.setDate(1);
        firstDayOfMonth.setHours(0, 0, 0, 0);

        // Trouver les médecins de la clinique pour filtrer les ordonnances
        const medecins = await Medecin.findAll(await accessQuery(req, Medecin, { where: { clinic_id: clinicId }, attributes: ['id'] }));
        const medecinIds = medecins.map(m => m.id);

        const dispensationsMois = await Prescription.count(await accessQuery(req, Prescription, {
            where: {
                medecinId: { [Op.in]: medecinIds }, // ✅ Filtre d'isolation
                statut: 'remise',
                updated_at: { [Op.gte]: firstDayOfMonth }
            }
        }));

        res.json({
            produitsEnStock,
            rupturesImminentes,
            peremptionsProches,
            dispensations: dispensationsMois
        });
    } catch (error) {
        console.error('[DASHBOARD PHARMA]', error);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// GET /api/dashboard/lab_technician
router.get('/lab_technician', authenticateJWT, authorizeRole('lab_technician'), async (req, res) => {
    try {
        const today = minuitClinique(jourClinique());

        const [enAttente, preleve, enCours, termineAujourdhui] = await Promise.all([
            ExamenPatient.count(await accessQuery(req, ExamenPatient, { where: { clinic_id: req.user.clinic_id, statut: 'en_attente' } })),
            ExamenPatient.count(await accessQuery(req, ExamenPatient, { where: { clinic_id: req.user.clinic_id, statut: 'preleve' } })),
            ExamenPatient.count(await accessQuery(req, ExamenPatient, { where: { clinic_id: req.user.clinic_id, statut: 'en_cours' } })),
            ExamenPatient.count(await accessQuery(req, ExamenPatient, { where: { clinic_id: req.user.clinic_id, statut: 'termine', updatedAt: { [Op.gte]: today } } }))
        ]);

        res.json({ enAttente, preleve, enCours, termineAujourdhui });
    } catch (error) {
        console.error('[DASHBOARD LAB]', error);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// GET /api/dashboard/admin
router.get('/admin', authenticateJWT, authorizeRole('admin'), async (req, res) => {
    try {
        const period = req.query.period || 'mois'; // 'jour', 'mois', 'annee'
        const jour = jourClinique();
        // mois par défaut ; bornes à minuit, heure de la clinique
        const startDate = minuitClinique(period === 'jour' ? jour : period === 'annee' ? premierDeLAnnee(jour) : premierDuMois(jour));

        const clinicId = req.user.clinic_id;

        // Fetch paid invoices for this clinic only
        const factures = await Facture.findAll(await accessQuery(req, Facture, {
            where: {
                clinic_id: clinicId, // ✅ Filtre d'isolation
                statut: 'payee',
                updated_at: { [Op.gte]: startDate }
            },
            include: [{ model: LigneFacture, as: 'lignes' }]
        }));

        // Parse lines
        let globalTotal = 0;
        let pharmacyTotal = 0;
        let examTotal = 0;
        let hospitalizationTotal = 0;
        let consultTotal = 0;
        const consultLines = [];
        const pharmLines = [];

        for (const f of factures) {
            globalTotal += Number(f.total);
            try {
                const lignes = Array.isArray(f.lignes) ? f.lignes : JSON.parse(f.lignes || '[]');
                for (const l of lignes) {
                    const lineTotal = Number(l.quantite) * Number(l.prixUnitaire);
                    if (l.sourceType === 'medicament') {
                        pharmacyTotal += lineTotal;
                        if (l.sourceId) {
                            pharmLines.push({ prescId: l.sourceId, amount: lineTotal });
                        }
                    } else if (l.sourceType === 'examen') {
                        examTotal += lineTotal;
                        // On attribue aussi les examens aux médecins s'ils les ont demandés (optionnel, mais on va juste les ajouter au total général)
                    } else if (l.sourceType === 'consultation' && l.designation?.toLowerCase().includes('pré-opératoire')) {
                        hospitalizationTotal += lineTotal;
                        consultLines.push({ rdvId: l.sourceId, amount: lineTotal }); // Optionnel si on veut attribuer la chambre au chiffre médecin
                    } else if (l.sourceType === 'consultation') {
                        consultTotal += lineTotal;
                        consultLines.push({
                            rdvId: l.sourceId,
                            amount: lineTotal
                        });
                    } else if (f.rdvId && (!l.sourceType || l.sourceType !== 'medicament')) {
                        // Retro-compatibilité pour anciennes factures avec rdvId
                        if (l.designation?.toLowerCase().includes('examen')) {
                            examTotal += lineTotal;
                        } else if (!l.designation?.toLowerCase().includes('médicament')) {
                            consultTotal += lineTotal;
                            consultLines.push({ rdvId: f.rdvId, amount: lineTotal, patientCin: f.patientCin });
                        }
                    } else if (!l.sourceType || l.sourceType === 'consultation') {
                        // Facture 100% manuelle sans rdvId ni sourceId
                        if (l.designation?.toLowerCase().includes('examen')) {
                            examTotal += lineTotal;
                        } else if (!l.designation?.toLowerCase().includes('médicament')) {
                            consultTotal += lineTotal;
                            consultLines.push({ rdvId: null, amount: lineTotal, patientCin: f.patientCin });
                        }
                    }
                }
            } catch (e) { console.error('Erreur parsing lignes Facture admin', e); }
        }

        // Tenter de lier les factures manuelles avec le dernier RDV du patient
        for (const cl of consultLines) {
            if (!cl.rdvId && cl.patientCin) {
                const lastRdv = await RendezVous.findOne(await accessQuery(req, RendezVous, {
                    where: { 
                        clinic_id: clinicId, // ✅ Filtre d'isolation
                        patientCin: cl.patientCin 
                    },
                    order: [['created_at', 'DESC']],
                    attributes: ['id']
                }));
                if (lastRdv) cl.rdvId = lastRdv.id;
            }
        }

        // Aggregate by doctor
        const doctorStats = {}; // medecinId -> { amount, patients }

        if (consultLines.length > 0) {
            const rdvIds = consultLines.map(c => c.rdvId).filter(id => id);
            const rdvs = await RendezVous.findAll(await accessQuery(req, RendezVous, {
                where: { 
                    clinic_id: clinicId, // ✅ Filtre d'isolation
                    id: { [Op.in]: [...new Set(rdvIds)] } 
                }
            }));

            // Map rdv id to medecinId
            const rdvToMedecin = {};
            for (const rdv of rdvs) {
                rdvToMedecin[rdv.id] = rdv.medecinId;
            }

            // Fill doctorStats
            for (const cl of consultLines) {
                const docId = rdvToMedecin[cl.rdvId];
                if (docId) {
                    if (!doctorStats[docId]) doctorStats[docId] = { amount: 0, patients: 0 };
                    doctorStats[docId].amount += cl.amount;
                    doctorStats[docId].patients += 1;
                }
            }
        }

        // Fetch doctors info to return nice format
        const medecins = await Medecin.findAll(await accessQuery(req, Medecin, {
            where: { clinic_id: clinicId } // ✅ Filtre d'isolation
        }));
        const { User } = await import('../models/index.js');
        const { Prescription } = await import('./prescriptions.js');
        
        const medecinsData = [];

        for (const m of medecins) {
            const stats = doctorStats[m.id] || { amount: 0, patients: 0 };
            const u = await scopedByPk(req, User, m.userId);
            medecinsData.push({
                id: m.id,
                nom: u ? u.nom : 'Inconnu',
                prenom: u ? u.prenom : '',
                titre: m.titre || 'Dr.',
                specialite: (m.specialites && Array.isArray(m.specialites) && m.specialites[0]) ? m.specialites[0] : 'Général',
                revenue: stats.amount,
                patients: stats.patients
            });
        }

        // Aggregate by Pharmacist
        const pharmacistStats = {}; // userId -> { amount, patients }
        if (pharmLines.length > 0) {
            const prescIds = pharmLines.map(p => p.prescId).filter(id => id);
            if (prescIds.length > 0) {
                const prescriptions = await Prescription.findAll(await accessQuery(req, Prescription, {
                    where: { id: { [Op.in]: [...new Set(prescIds)] } }
                }));
                const prescToPharma = {};
                for (const p of prescriptions) {
                    if (p.dispenseParUserId) prescToPharma[p.id] = p.dispenseParUserId;
                }
                
                for (const pl of pharmLines) {
                    const userId = prescToPharma[pl.prescId];
                    if (userId) {
                        if (!pharmacistStats[userId]) pharmacistStats[userId] = { amount: 0, patients: 0 };
                        pharmacistStats[userId].amount += pl.amount;
                        // On compte chaque prescription dispensée comme 1 "patient/acte"
                        pharmacistStats[userId].patients += 1;
                    }
                }
            }
        }

        // Fetch pharmacists info
        const pharmacistsData = [];
        const pharmacistUsers = await User.findAll(await accessQuery(req, User, {
            where: { 
                clinic_id: clinicId, // ✅ Filtre d'isolation
                role: 'pharmacist' 
            } 
        }));
        
        for (const u of pharmacistUsers) {
            const stats = pharmacistStats[u.id] || { amount: 0, patients: 0 };
            pharmacistsData.push({
                id: u.id,
                nom: u.nom,
                prenom: u.prenom,
                titre: 'Pharmacien',
                specialite: 'Délivrance Rx',
                revenue: stats.amount,
                patients: stats.patients
            });
        }

        res.json({
            period,
            globalTotal,
            pharmacyTotal,
            examTotal,
            hospitalizationTotal,
            consultTotal,
            doctors: medecinsData.sort((a, b) => b.revenue - a.revenue),
            pharmacists: pharmacistsData.sort((a, b) => b.revenue - a.revenue)
        });

    } catch (error) {
        console.error('[DASHBOARD ADMIN]', error);
        res.status(500).json({ error: 'Erreur serveur admin' });
    }
});

export default router;
