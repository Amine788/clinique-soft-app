import { Router } from 'express';
import { authenticateJWT, authorizeRole, requireClinicId } from '../middleware/auth.js';
import { Op } from 'sequelize';
import { jourClinique, premierDuMois, dernierDuMois } from '../services/dates.js';
import { inClinic } from '../services/tenant.js';
import { Medecin, User, Absence, RendezVous, Patient, Facture, LigneFacture } from '../models/index.js';
const router = Router();

// Annuaire des médecins : donnée de clinique, jamais ouverte à un compte sans clinique (super-admin compris)
router.use(authenticateJWT, requireClinicId);

// GET /api/doctors — Liste des médecins
router.get('/', authenticateJWT, async (req, res) => {
    try {
        const where = inClinic(req);

        const medecins = await Medecin.findAll({
            where,
            include: [{ model: User, attributes: ['nom', 'prenom', 'email', 'telephone', 'statut', 'photoUrl'] }]
        });
        res.json(medecins.map(m => {
            let specParsed = [];
            try { specParsed = typeof m.specialites === 'string' ? JSON.parse(m.specialites) : (m.specialites || []); } catch { specParsed = [m.specialites]; }
            return {
                id: m.id,
                name: `${m.titre} ${m.User.prenom} ${m.User.nom}`,
                speciality: specParsed.length > 0 ? specParsed[0] : '', // Extract single string for easiest filtering
                specialitesArray: specParsed,
                room: m.salleConsultation,
                status: m.statut || m.User.statut,
                phone: m.User.telephone,
                email: m.User.email,
                avatar: m.User.photoUrl,
                stats: {
                    patientsToday: 0,
                    consultationsThisMonth: 0,
                    rating: 4.8,
                },
                schedule: {
                    monday: { start: '08:30', end: '16:30' },
                    tuesday: { start: '08:30', end: '16:30' },
                    wednesday: { start: '08:30', end: '16:30' },
                    thursday: { start: '08:30', end: '16:30' },
                    friday: { start: '08:30', end: '12:30' },
                }
            };
        }));
    } catch (error) {
        console.error('[DOCTORS] Erreur :', error.message);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// GET /api/doctors/:id — Profil médecin
router.get('/:id', authenticateJWT, async (req, res) => {
    try {
        const id = parseInt(req.params.id.replace('doc-', ''));
        const where = inClinic(req, { id });

        const medecin = await Medecin.findOne({
            where,
            include: [{ model: User }]
        });
        if (!medecin) return res.status(404).json({ error: 'Médecin non trouvé' });

        let specParsed = [];
        try { specParsed = typeof medecin.specialites === 'string' ? JSON.parse(medecin.specialites) : (medecin.specialites || []); } catch { specParsed = [medecin.specialites]; }

        res.json({
            id: medecin.id,
            name: `${medecin.titre} ${medecin.User.prenom} ${medecin.User.nom}`,
            speciality: specParsed.length > 0 ? specParsed[0] : '',
            specialitesArray: specParsed,
            room: medecin.salleConsultation,
            avatar: medecin.User.photoUrl,
        });
    } catch {
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// GET /api/doctors/:id/stats — Statistiques calculées sur les RDV du médecin connecté (P14)
const TYPE_LABELS = {
    premiere: '1ère Consult', suivi: 'Suivi', urgente: 'Urgence', bilan: 'Bilan',
    vaccination: 'Vaccination', teleconsultation: 'Téléconsultation',
};
const MOIS_COURTS = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin', 'Juil', 'Août', 'Sep', 'Oct', 'Nov', 'Déc'];
const JOURS = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];
const VUS = ['arrive', 'pret', 'en_cours', 'termine'];
const TRANCHES = [['0-18', 0, 18], ['18-35', 18, 35], ['35-50', 35, 50], ['50-65', 50, 65], ['65+', 65, Infinity]];

const cleMois = (dateStr) => String(dateStr).slice(0, 7);

router.get('/:id/stats', authenticateJWT, authorizeRole('doctor'), async (req, res) => {
    try {
        // Un médecin ne consulte que ses propres statistiques, dans sa clinique
        const medecin = await Medecin.findOne({ where: { userId: req.user.id } });
        if (!medecin || String(medecin.id) !== String(req.params.id)
            || (req.user.clinic_id && medecin.clinic_id !== req.user.clinic_id)) {
            return res.status(403).json({ error: 'Accès limité à vos propres statistiques' });
        }

        // Calendrier de la clinique, indépendant du fuseau du serveur
        const jour = jourClinique();
        const debutMois = premierDuMois(jour);
        const finMois = dernierDuMois(jour);
        const debutTendance = premierDuMois(jour, -6);
        const moisCourant = cleMois(jour);
        const moisPrecedent = cleMois(premierDuMois(jour, -1));

        const rdvs = await RendezVous.findAll({
            where: {
                medecinId: medecin.id,
                ...(medecin.clinic_id && { clinic_id: medecin.clinic_id }),
                dateRdv: { [Op.between]: [debutTendance, finMois] },
            },
            include: [{ model: Patient, attributes: ['id', 'dateNaissance'] }],
        });

        // Honoraires : lignes « consultation » des factures non annulées, rattachées au mois du RDV
        const rdvParId = new Map(rdvs.map(r => [r.id, r]));
        const lignes = rdvs.length ? await LigneFacture.findAll({
            where: { sourceType: 'consultation', sourceId: { [Op.in]: [...rdvParId.keys()] } },
            include: [{ model: Facture, attributes: [], where: { statut: { [Op.ne]: 'annulee' } } }],
        }) : [];
        const honorairesParMois = {};
        for (const l of lignes) {
            const mois = cleMois(rdvParId.get(l.sourceId).dateRdv);
            honorairesParMois[mois] = (honorairesParMois[mois] || 0) + Number(l.montantTotal || 0);
        }

        const duMois = rdvs.filter(r => cleMois(r.dateRdv) === moisCourant);
        const termines = duMois.filter(r => r.statut === 'termine');
        const noShows = duMois.filter(r => r.statut === 'non_presente');
        const vus = duMois.filter(r => VUS.includes(r.statut));
        const joursTravailles = new Set(termines.map(r => String(r.dateRdv))).size;

        const consultationsPerDay = Array(Number(finMois.slice(8, 10))).fill(0);
        for (const r of termines) consultationsPerDay[Number(String(r.dateRdv).slice(8, 10)) - 1]++;

        const compter = (liste, cle) => liste.reduce((acc, x) => {
            const k = cle(x);
            if (k) acc[k] = (acc[k] || 0) + 1;
            return acc;
        }, {});

        const byType = Object.entries(compter(termines, r => TYPE_LABELS[r.typeConsultation] || r.typeConsultation))
            .map(([name, value]) => ({ name, value }))
            .sort((a, b) => b.value - a.value);

        // Âge des patients distincts vus ce mois-ci
        const patientsVus = new Map(vus.filter(r => r.Patient).map(r => [r.Patient.id, r.Patient]));
        const age = (naissance) => {
            const n = String(naissance).slice(0, 10);
            const a = Number(jour.slice(0, 4)) - Number(n.slice(0, 4));
            return jour.slice(5) < n.slice(5) ? a - 1 : a; // anniversaire pas encore passé cette année
        };
        const byAge = TRANCHES.map(([name, min, max]) => ({
            name,
            value: [...patientsVus.values()].filter(p => p.dateNaissance && age(p.dateNaissance) >= min && age(p.dateNaissance) < max).length,
        }));

        const monthlyTrend = [];
        for (let i = 6; i >= 0; i--) {
            const mois = cleMois(premierDuMois(jour, -i));
            monthlyTrend.push({
                month: MOIS_COURTS[Number(mois.slice(5, 7)) - 1],
                consultations: rdvs.filter(r => cleMois(r.dateRdv) === mois && r.statut === 'termine').length,
                revenue: Math.round((honorairesParMois[mois] || 0) * 100) / 100,
            });
        }

        // Motifs les plus fréquents (regroupés sans tenir compte de la casse)
        const motifs = {};
        for (const r of termines) {
            const motif = String(r.motif || '').trim();
            if (!motif) continue;
            const cle = motif.toLowerCase();
            motifs[cle] = motifs[cle] || { name: motif, count: 0 };
            motifs[cle].count++;
        }
        const topDiagnoses = Object.values(motifs)
            .sort((a, b) => b.count - a.count)
            .slice(0, 10)
            .map((d, i) => ({ rank: i + 1, ...d, percent: Math.round(d.count / termines.length * 1000) / 10 }));

        const noShowByDay = compter(noShows, r => JOURS[new Date(`${r.dateRdv}T12:00:00Z`).getUTCDay()]);

        res.json({
            periode: new Date(`${debutMois}T12:00:00Z`).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric', timeZone: 'UTC' }),
            totalConsultations: termines.length,
            avgPerDay: joursTravailles ? Math.round(termines.length / joursTravailles * 10) / 10 : 0,
            // Présents parmi les patients attendus (présents + absents) ; null sans RDV échu
            presenceRate: vus.length + noShows.length ? Math.round(vus.length / (vus.length + noShows.length) * 100) : null,
            noShows: noShows.length,
            prevNoShows: rdvs.filter(r => cleMois(r.dateRdv) === moisPrecedent && r.statut === 'non_presente').length,
            monthlyRevenue: monthlyTrend[6].revenue,
            prevMonthRevenue: monthlyTrend[5].revenue,
            consultationsPerDay,
            byType,
            byAge,
            monthlyTrend,
            topDiagnoses,
            noShowByDay,
        });
    } catch {
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// GET /api/doctors/:id/absences
router.get('/:id/absences', authenticateJWT, async (req, res) => {
    try {
        // Médecin de la clinique de l'utilisateur uniquement (404 sinon, sans révéler son existence ailleurs)
        const medecin = await Medecin.findOne({ where: inClinic(req, { id: req.params.id }) });
        if (!medecin) return res.status(404).json({ error: 'Médecin non trouvé' });

        const absences = await Absence.findAll({
            where: { medecinId: medecin.id },
            order: [['created_at', 'DESC']]
        });

        // Calcul des compteurs
        const counters = {
            annual: { used: 0, total: 25 },
            sick: { used: 0, total: 30 },
            training: { used: 0, total: 5 }
        };

        const list = absences.map(a => {
            const start = new Date(a.dateDebut);
            const end = new Date(a.dateFin);
            const diffTime = Math.abs(end - start);
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;

            if (a.statut === 'valide') {
                if (a.typeAbsence === 'conge_annuel') counters.annual.used += diffDays;
                else if (a.typeAbsence === 'maladie') counters.sick.used += diffDays;
                else if (a.typeAbsence === 'formation') counters.training.used += diffDays;
            }

            const typeLabels = {
                conge_annuel: 'Congé annuel',
                maladie: 'Maladie',
                formation: 'Formation',
                sans_solde: 'Congé sans solde',
                autre: 'Autre'
            };

            const statutLabels = {
                en_attente: 'En attente',
                valide: 'Validé',
                refuse: 'Refusé'
            };

            return {
                id: a.id,
                type: typeLabels[a.typeAbsence] || a.typeAbsence,
                startDate: a.dateDebut,
                endDate: a.dateFin,
                days: diffDays,
                reason: a.motif,
                status: statutLabels[a.statut] || a.statut
            };
        });

        res.json({
            absences: list,
            counters
        });
    } catch (err) {
        console.error('[DOCTOR ABSENCES]', err);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

export default router;
