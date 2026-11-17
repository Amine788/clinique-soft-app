import { Router } from 'express';
import { Op } from 'sequelize';
import { authenticateJWT, authorizeRole } from '../middleware/auth.js';
import { RendezVous, Medecin, Chambre, User, Facture } from '../models/index.js';
import { jourClinique, minuitClinique, premierDuMois, dernierDuMois, premierDeLAnnee, ajouterJours } from '../services/dates.js';

const router = Router();

// Toutes les routes nécessitent le rôle admin
router.use(authenticateJWT, authorizeRole('admin'));

// Chaque requête est filtrée par clinic_id : le hook multi-tenant ne filtre ni les lectures,
// ni les count (beforeCount), ni les sum/aggregate (aucun hook)
router.use((req, res, next) => {
    if (!req.user.clinic_id) return res.status(403).json({ error: 'Clinique non définie pour cet utilisateur' });
    next();
});

/* ──────────────────────────────────────────────────────────────────────────
   Utilitaire : plage de dates
──────────────────────────────────────────────────────────────────────────── */
// specialites est un tableau JSON ; sous MariaDB il revient en texte, parfois encodé deux fois
function premiereSpecialite(specialites) {
    let valeur = specialites;
    for (let i = 0; i < 3 && typeof valeur === 'string'; i++) {
        try {
            valeur = JSON.parse(valeur);
        } catch {
            return valeur.trim() || 'Général'; // texte simple : « Cardiologie »
        }
    }
    if (Array.isArray(valeur)) return valeur[0] || 'Général';
    return typeof valeur === 'string' && valeur ? valeur : 'Général';
}

// Début de période dans le calendrier de la clinique : startStr pour les DATEONLY (dateRdv),
// start (minuit, heure de la clinique) pour les DATETIME (factures)
function getDateRange(period = 'mois') {
    const jour = jourClinique();
    const startStr = period === 'jour' ? jour : period === 'annee' ? premierDeLAnnee(jour) : premierDuMois(jour);
    return { start: minuitClinique(startStr), startStr, end: new Date() };
}

/* ──────────────────────────────────────────────────────────────────────────
   GET /api/performance/overview
   KPIs exécutifs : consultations du jour, CA, taux occupation, satisfaction
──────────────────────────────────────────────────────────────────────────── */
router.get('/overview', async (req, res) => {
    try {
        const { period = 'mois' } = req.query;
        const { start, startStr } = getDateRange(period);
        const todayStr = jourClinique();

        // Consultations du jour
        const consultationsJour = await RendezVous.count({
            where: {
                clinic_id: req.user.clinic_id,
                dateRdv: todayStr,
                statut: { [Op.in]: ['planifie', 'confirme', 'arrive', 'en_cours', 'termine'] }
            }
        });

        // CA de la période (factures payées)
        const factures = await Facture.findAll({
            where: { clinic_id: req.user.clinic_id, statut: 'payee', updatedAt: { [Op.gte]: start } }
        });
        const caTotal = factures.reduce((s, f) => s + Number(f.total || 0), 0);

        // Taux occupation lits
        const totalLits = await Chambre.sum('nbLits', { where: { clinic_id: req.user.clinic_id } }) || 0;
        const litsOccupes = await Chambre.sum('nbLits', { where: { clinic_id: req.user.clinic_id, statut: 'occupee' } }) || 0;
        const tauxOccupation = totalLits > 0 ? Math.round((litsOccupes / totalLits) * 100) : 0;

        // Alertes : factures en attente > 30 jours
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        const alertes = await Facture.count({
            where: { clinic_id: req.user.clinic_id, statut: 'en_attente', createdAt: { [Op.lte]: thirtyDaysAgo } }
        });

        // Consultations de la période (pour la tendance)
        const consultationsPeriode = await RendezVous.count({
            where: {
                clinic_id: req.user.clinic_id,
                dateRdv: { [Op.gte]: startStr },
                statut: { [Op.in]: ['termine', 'confirme', 'arrive', 'en_cours'] }
            }
        });

        res.json({
            consultationsJour,
            consultationsPeriode,
            caTotal: Math.round(caTotal),
            litsOccupes,
            totalLits,
            tauxOccupation,
            alertes,
            satisfaction: null,  // Non mesuré : aucun questionnaire de satisfaction (pas de modèle Feedback)
            period
        });
    } catch (error) {
        console.error('[PERF OVERVIEW]', error);
        res.status(500).json({ error: error.message });
    }
});

/* ──────────────────────────────────────────────────────────────────────────
   GET /api/performance/activity
   Activité mensuelle : nombre de consultations par mois sur N mois
──────────────────────────────────────────────────────────────────────────── */
router.get('/activity', async (req, res) => {
    try {
        const { months = 6 } = req.query;
        const result = [];

        const jour = jourClinique();
        for (let i = Number(months) - 1; i >= 0; i--) {
            const firstStr = premierDuMois(jour, -i);
            const lastStr  = dernierDuMois(jour, -i);
            // Factures du mois entier : de minuit le 1er à minuit le lendemain du dernier jour
            const firstDay = minuitClinique(firstStr);
            const lastDay  = minuitClinique(ajouterJours(lastStr, 1));

            const consultations = await RendezVous.count({
                where: { clinic_id: req.user.clinic_id, dateRdv: { [Op.between]: [firstStr, lastStr] } }
            });

            const factures = await Facture.findAll({
                where: {
                    clinic_id: req.user.clinic_id,
                    statut: 'payee',
                    updatedAt: { [Op.gte]: firstDay, [Op.lt]: lastDay }
                }
            });
            const ca = factures.reduce((s, f) => s + Number(f.total || 0), 0);

            result.push({
                mois: new Date(`${firstStr}T12:00:00Z`).toLocaleString('fr-FR', { month: 'short', timeZone: 'UTC' }).toUpperCase(),
                annee: Number(firstStr.slice(0, 4)),
                consultations,
                ca: Math.round(ca / 1000) // en milliers MAD
            });
        }

        res.json(result);
    } catch (error) {
        console.error('[PERF ACTIVITY]', error);
        res.status(500).json({ error: error.message });
    }
});

/* ──────────────────────────────────────────────────────────────────────────
   GET /api/performance/occupancy
   Taux d'occupation des chambres
──────────────────────────────────────────────────────────────────────────── */
router.get('/occupancy', async (req, res) => {
    try {
        const chambres = await Chambre.findAll({ where: { clinic_id: req.user.clinic_id } });
        const total = chambres.reduce((s, c) => s + (c.nbLits || 0), 0);
        const occupees = chambres
            .filter(c => c.statut === 'occupee')
            .reduce((s, c) => s + (c.nbLits || 0), 0);
        const horsService = chambres
            .filter(c => c.statut === 'hors_service')
            .reduce((s, c) => s + (c.nbLits || 0), 0);

        const repartition = [
            { label: 'Occupées', val: occupees },
            { label: 'Disponibles', val: total - occupees - horsService },
            { label: 'Hors service', val: horsService }
        ];

        res.json({
            total,
            occupees,
            horsService,
            disponibles: total - occupees - horsService,
            tauxOccupation: total > 0 ? Math.round((occupees / total) * 100) : 0,
            repartition
        });
    } catch (error) {
        console.error('[PERF OCCUPANCY]', error);
        res.status(500).json({ error: error.message });
    }
});

/* ──────────────────────────────────────────────────────────────────────────
   GET /api/performance/finance
   CA détaillé et classement médecins
──────────────────────────────────────────────────────────────────────────── */
router.get('/finance', async (req, res) => {
    try {
        const { period = 'mois' } = req.query;
        const { start, startStr } = getDateRange(period);

        // Toutes les factures payées de la période
        const factures = await Facture.findAll({
            where: { clinic_id: req.user.clinic_id, statut: 'payee', updatedAt: { [Op.gte]: start } }
        });
        const caTotal = factures.reduce((s, f) => s + Number(f.total || 0), 0);

        // Total toutes factures (pour taux recouvrement)
        const toutesFactures = await Facture.findAll({
            where: { clinic_id: req.user.clinic_id, createdAt: { [Op.gte]: start } }
        });
        const caTotal_all = toutesFactures.reduce((s, f) => s + Number(f.total || 0), 0);
        const tauxRecouvrement = caTotal_all > 0
            ? Math.round((caTotal / caTotal_all) * 100) : 0;

        // Classement médecins
        const rdvIds = factures.map(f => f.rdvId).filter(Boolean);
        const medecinsData = [];

        if (rdvIds.length > 0) {
            const rdvs = await RendezVous.findAll({
                where: { clinic_id: req.user.clinic_id, id: { [Op.in]: [...new Set(rdvIds)] } }
            });
            const medStats = {};
            for (const rdv of rdvs) {
                if (!medStats[rdv.medecinId]) medStats[rdv.medecinId] = { ca: 0, cons: 0 };
                medStats[rdv.medecinId].cons++;
            }
            for (const f of factures) {
                if (f.rdvId) {
                    const rdv = rdvs.find(r => r.id === f.rdvId);
                    if (rdv && medStats[rdv.medecinId]) {
                        medStats[rdv.medecinId].ca += Number(f.total || 0);
                    }
                }
            }

            const medecins = await Medecin.findAll({
                where: { clinic_id: req.user.clinic_id, id: { [Op.in]: Object.keys(medStats).map(Number) } }
            });

            for (const m of medecins) {
                const u = await User.findByPk(m.userId, { attributes: ['nom', 'prenom'] });
                const stats = medStats[m.id] || { ca: 0, cons: 0 };
                medecinsData.push({
                    id: m.id,
                    nom: u ? `${u.prenom} ${u.nom}` : 'Inconnu',
                    specialite: premiereSpecialite(m.specialites),
                    ca: Math.round(stats.ca),
                    consultations: stats.cons
                });
            }
        }

        // Consultations de la période
        const consultations = await RendezVous.count({
            where: {
                clinic_id: req.user.clinic_id,
                dateRdv: { [Op.gte]: startStr },
                statut: 'termine'
            }
        });

        res.json({
            caTotal: Math.round(caTotal),
            tauxRecouvrement,
            consultations,
            medecins: medecinsData.sort((a, b) => b.ca - a.ca),
            period
        });
    } catch (error) {
        console.error('[PERF FINANCE]', error);
        res.status(500).json({ error: error.message });
    }
});

/* ──────────────────────────────────────────────────────────────────────────
   GET /api/performance/indicators
   Indicateurs clés vs objectifs
──────────────────────────────────────────────────────────────────────────── */
router.get('/indicators', async (req, res) => {
    try {
        const todayStr = jourClinique();

        const consJour = await RendezVous.count({
            where: {
                clinic_id: req.user.clinic_id,
                dateRdv: todayStr,
                statut: { [Op.in]: ['planifie', 'confirme', 'arrive', 'en_cours', 'termine'] }
            }
        });

        const totalLits = await Chambre.sum('nbLits', { where: { clinic_id: req.user.clinic_id } }) || 1;
        const litsOccupes = await Chambre.sum('nbLits', { where: { clinic_id: req.user.clinic_id, statut: 'occupee' } }) || 0;
        const tauxOcc = Math.round((litsOccupes / totalLits) * 100);

        // Taux recouvrement du mois
        const startMois = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
        const allFact = await Facture.findAll({ where: { clinic_id: req.user.clinic_id, createdAt: { [Op.gte]: startMois } } });
        const payees = allFact.filter(f => f.statut === 'payee');
        const totalAll = allFact.reduce((s, f) => s + Number(f.total || 0), 0);
        const totalPay = payees.reduce((s, f) => s + Number(f.total || 0), 0);
        const tauxRec = totalAll > 0 ? Math.round((totalPay / totalAll) * 100) : 0;

        const indicators = [
            { label: 'Consultations / jour', val: `${consJour}`, cible: '50', pct: Math.min(Math.round((consJour / 50) * 100), 100) },
            { label: 'Taux occupation lits', val: `${tauxOcc}%`, cible: '85%', pct: tauxOcc },
            // Non mesurés (aucune donnée) : pct null, affiché « Non mesuré » au lieu d'une valeur inventée
            { label: 'Délai attente moy.', val: 'Non mesuré', cible: '15 min', pct: null },
            { label: 'Taux recouvrement', val: `${tauxRec}%`, cible: '95%', pct: tauxRec },
            { label: 'Satisfaction', val: 'Non mesuré', cible: '4.8/5', pct: null }
        ];

        res.json(indicators);
    } catch (error) {
        console.error('[PERF INDICATORS]', error);
        res.status(500).json({ error: error.message });
    }
});

export default router;
