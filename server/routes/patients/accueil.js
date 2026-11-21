// Arrivée d'un patient : uniquement une visite du jour identifiée, sans double pointage.
import { Router } from 'express';
import { Op } from 'sequelize';
import { accessQuery } from '../../services/patientAccess.js';
import { authenticateJWT, authorizeRole } from '../../middleware/auth.js';
import sequelize, { Patient, Pointage, RendezVous, Medecin } from '../../models/index.js';
import { jourClinique } from '../../services/dates.js';
import { clinicSocket } from '../../socket/clinicSocket.js';
const router = Router();
const fail = (status, message, code) => Object.assign(new Error(message), { status, code });
router.post('/checkin', authenticateJWT, authorizeRole('secretary', 'admin'), async (req, res, next) => {
    try {
        const { cin, rdvId } = req.body;
        const mode = req.body.mode || 'saisie_cin';
        if (typeof cin !== 'string' || !cin.trim()) throw fail(400, 'CIN requis');
        if (!['saisie_cin', 'scan_cin', 'qr_code', 'app_mobile'].includes(mode)) throw fail(400, 'Mode de pointage invalide');
        const clinicId = req.user.clinic_id;
        const result = await sequelize.transaction(async transaction => {
            const patient = await Patient.findOne(await accessQuery(req, Patient, {
                where: { cinNumero: cin.trim().toUpperCase(), clinic_id: clinicId },
                transaction, lock: transaction.LOCK.UPDATE,
            }));
            if (!patient) throw fail(404, 'Patient non trouvé avec cette CIN dans votre clinique', 'patient_not_found');
            const where = { clinic_id: clinicId, patientId: patient.id, dateRdv: jourClinique() };
            if (rdvId != null) where.numeroRdv = String(rdvId);
            else where.statut = { [Op.in]: ['planifie', 'confirme', 'arrive', 'pret', 'en_cours'] };
            const visits = await RendezVous.findAll({ where, transaction, lock: transaction.LOCK.UPDATE, order: [['heureDebut', 'ASC']] });
            let rdv;
            if (rdvId != null) rdv = visits[0];
            else {
                const present = visits.filter(r => ['arrive', 'pret', 'en_cours'].includes(r.statut));
                if (present.length === 1) rdv = present[0];
                else if (visits.length === 1) rdv = visits[0];
                else if (visits.length > 1) throw fail(409, 'Plusieurs visites aujourd’hui : choisissez le rendez-vous à accueillir.', 'appointment_required');
            }
            if (!rdv) throw fail(409, 'Ce patient n’a pas de rendez-vous actif aujourd’hui. Choisissez un médecin pour l’accueillir sans rendez-vous.', 'appointment_required');
            if (!['planifie', 'confirme', 'arrive', 'pret', 'en_cours'].includes(rdv.statut)) throw fail(409, 'Cette visite est terminée ou annulée. Elle ne peut pas être remise en salle d’attente.');
            const alreadyPresent = ['arrive', 'pret', 'en_cours'].includes(rdv.statut);
            const arrival = rdv.heureArrivee || new Date();
            const cinExpiree = Boolean(patient.cinDateExpiration && patient.cinDateExpiration < jourClinique());
            if (!alreadyPresent) await rdv.update({ statut: 'arrive', heureArrivee: arrival, modePointage: mode, pointePar: req.user.id }, { transaction });
            else if (!rdv.heureArrivee) await rdv.update({ heureArrivee: arrival }, { transaction });
            const pointage = await Pointage.findOne({ where: { clinic_id: clinicId, rdvId: rdv.id }, transaction });
            if (!pointage) await Pointage.create({ clinic_id: clinicId, patientId: patient.id, patientCin: patient.cinNumero,
                rdvId: rdv.id, heureArrivee: arrival, modePointage: mode, pointePar: req.user.id, cinExpiree }, { transaction });
            const doctor = await Medecin.findOne({ where: { id: rdv.medecinId, clinic_id: clinicId }, attributes: ['userId'], transaction });
            return { success: true, alreadyPresent, patient: { id: patient.numeroDossier, cin: patient.cinNumero,
                name: patient.prenom + ' ' + patient.nom, nom: patient.nom, prenom: patient.prenom },
                rdv: { id: rdv.numeroRdv, statut: rdv.statut }, cinExpiree, arrivee: arrival,
                alertes: { cinExpiree }, doctorUserId: doctor?.userId };
        });
        if (!result.alreadyPresent && result.doctorUserId) clinicSocket?.notifyPatientArrived(result.patient, result.rdv, result.doctorUserId);
        clinicSocket?.notifyQueueChanged?.(clinicId);
        delete result.doctorUserId;
        res.json(result);
    } catch (error) { next(error); }
});
export default router;
