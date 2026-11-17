import { Router } from 'express';
import { authenticateJWT, authorizeRole } from '../middleware/auth.js';
import { Medecin, User, Absence, RendezVous } from '../models/index.js';
import { inClinic } from '../services/tenant.js';
import { clinicSocket } from '../socket/clinicSocket.js';
import { Op } from 'sequelize';
const router = Router();

// RDV encore à honorer, déplacés ou annulés par la clinique si l'absence est validée
const STATUTS_RDV_ACTIFS = ['planifie', 'confirme', 'arrive', 'pret'];

/** Nombre de RDV actifs du médecin pendant la période */
export function rdvImpactes(medecinId, dateDebut, dateFin) {
    return RendezVous.count({
        where: { medecinId, dateRdv: { [Op.between]: [dateDebut, dateFin] }, statut: { [Op.in]: STATUTS_RDV_ACTIFS } },
    });
}

/** Absence validée du médecin couvrant ce jour (bloque la prise de RDV), sinon null */
export function absenceValideeLe(medecinId, date) {
    return Absence.findOne({
        where: { medecinId, statut: 'valide', dateDebut: { [Op.lte]: date }, dateFin: { [Op.gte]: date } },
    });
}

// Jointure médecin limitée à la clinique de l'utilisateur (cloisonnement des absences)
const medecinDeLaClinique = (req, avecNom = false) => ({
    model: Medecin,
    as: 'medecin',
    required: true,
    where: inClinic(req),
    attributes: ['id', 'userId', 'clinic_id'],
    ...(avecNom && { include: [{ model: User, attributes: ['nom', 'prenom'] }] }),
});

function mapAbsenceFromDb(a) {
    if (!a) return null;
    const aJson = a.toJSON();
    if (aJson.statut === 'valide') aJson.statut = 'validee';
    else if (aJson.statut === 'refuse') aJson.statut = 'refusee';

    if (aJson.typeAbsence === 'sans_solde') aJson.typeAbsence = 'conge_sans_solde';
    
    // Pour compatibilité avec l'affichage de medecinNom
    if (a.medecin && a.medecin.User) {
        aJson.medecinNom = `${a.medecin.User.prenom} ${a.medecin.User.nom}`;
    }
    return aJson;
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/absences — Soumettre une demande d'absence (médecin)
// ─────────────────────────────────────────────────────────────────────────────
router.post('/', authenticateJWT, authorizeRole('doctor'), async (req, res) => {
    try {
        const { typeAbsence, dateDebut, dateFin, motif } = req.body;
        if (!dateDebut || !dateFin) return res.status(400).json({ error: 'Dates requises' });
        if (dateFin < dateDebut) return res.status(400).json({ error: 'La date de fin doit suivre la date de début' });
        if (!motif) return res.status(400).json({ error: 'Motif requis' });

        const medecin = await Medecin.findOne({ where: inClinic(req, { userId: req.user.id }) });
        if (!medecin) return res.status(404).json({ error: 'Médecin non trouvé' });

        // Mappage du type de congé si nécessaire
        let mappedType = typeAbsence || 'conge_annuel';
        if (mappedType === 'conge_sans_solde') mappedType = 'sans_solde';
        if (!Absence.getAttributes().typeAbsence.values.includes(mappedType)) return res.status(400).json({ error: "Type d'absence invalide" });

        const absence = await Absence.create({
            medecinId: medecin.id,
            typeAbsence: mappedType,
            dateDebut,
            dateFin,
            motif
        });

        // Notification Socket → secrétaire + admin
        try {
            clinicSocket?.notifyAbsenceRequest({
                id: absence.id,
                dateDebut, dateFin,
                typeAbsence: typeAbsence || 'conge_annuel',
                nombreRdvImpactes: await rdvImpactes(medecin.id, dateDebut, dateFin),
                motif
            }, req.user.name, req.user.clinic_id);
        } catch { /* La notification est facultative ; la mutation métier est conservée. */ }

        console.log(`[ABSENCE] Demande soumise par ${req.user.name} — ${dateDebut} au ${dateFin}`);
        res.status(201).json({ success: true, absence: mapAbsenceFromDb(absence) });

    } catch (error) {
        console.error('[ABSENCE] Erreur:', error.message);
        res.status(500).json({ error: 'Erreur serveur', details: error.message });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/absences — Liste (médecin = les siennes, secrétaire/admin = toutes)
// ─────────────────────────────────────────────────────────────────────────────
router.get('/', authenticateJWT, authorizeRole('doctor', 'secretary', 'admin'), async (req, res) => {
    try {
        const where = {};

        if (req.user.role === 'doctor') {
            const medecin = await Medecin.findOne({ where: { userId: req.user.id } });
            if (medecin) where.medecinId = medecin.id;
        }

        if (req.query.statut) {
            let mappedStatut = req.query.statut;
            if (mappedStatut === 'validee') mappedStatut = 'valide';
            else if (mappedStatut === 'refusee') mappedStatut = 'refuse';
            where.statut = mappedStatut;
        }

        // Récupérer les absences avec jointure Medecin + User pour forcer l'isolation par clinic_id ( INNER JOIN )
        const absences = await Absence.findAll({
            where,
            include: [medecinDeLaClinique(req, true)],
            order: [['created_at', 'DESC']]
        });

        res.json(await Promise.all(absences.map(async a => ({
            ...mapAbsenceFromDb(a),
            rdvImpactes: await rdvImpactes(a.medecinId, a.dateDebut, a.dateFin),
        }))));
    } catch (err) {
        console.error('[ABSENCE LIST ERROR]', err);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /api/absences/:id — Valider ou refuser (secrétaire/admin)
// ─────────────────────────────────────────────────────────────────────────────
router.patch('/:id', authenticateJWT, authorizeRole('secretary', 'admin'), async (req, res) => {
    try {
        const { statut } = req.body; // 'validee' ou 'refusee'
        if (!['validee', 'refusee'].includes(statut)) return res.status(400).json({ error: 'Statut invalide' });

        // Absence d'un médecin de la clinique de l'utilisateur uniquement
        const absence = await Absence.findOne({
            where: { id: req.params.id },
            include: [medecinDeLaClinique(req)]
        });

        if (!absence) return res.status(404).json({ error: 'Absence non trouvée' });

        const dbStatut = statut === 'validee' ? 'valide' : 'refuse';
        await absence.update({
            statut: dbStatut,
            traitePar: req.user.id
        });

        // Notifier le médecin
        try {
            // Récupérer le userId du médecin pour lui envoyer la notification socket
            const doc = await Medecin.findByPk(absence.medecinId);
            if (doc && doc.userId) {
                clinicSocket?.emitToUser(doc.userId, 'absence_decision', {
                    type: 'absence_decision',
                    title: statut === 'validee' ? '✅ Absence validée' : '❌ Absence refusée',
                    message: `Du ${absence.dateDebut} au ${absence.dateFin}`,
                    data: mapAbsenceFromDb(absence),
                    timestamp: new Date().toISOString()
                });
            }
        } catch { /* La notification est facultative ; la mutation métier est conservée. */ }

        console.log(`[ABSENCE] ${absence.id} → ${dbStatut} par ${req.user.name}`);
        res.json({ success: true, statut, rdvImpactes: await rdvImpactes(absence.medecinId, absence.dateDebut, absence.dateFin) });
    } catch (err) {
        console.error('[ABSENCE PATCH ERROR]', err);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

export { Absence };
export default router;
