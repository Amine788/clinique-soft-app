import { Router } from 'express';
import crypto from 'node:crypto';
import { Op } from 'sequelize';
import { authenticateJWT, authorizeRole, requireClinicId } from '../middleware/auth.js';
import { Patient, User, Medecin, Departement, Hospitalisation, ExamenPatient } from '../models/index.js';
import { Prescription } from './prescriptions.js';
import { PatientAssignment, NurseService, ClinicResponsibility, ExceptionalGrant, AccessAudit } from '../models/access.js';
import { doctorPatientIds, audit } from '../services/patientAccess.js';
import { inClinic } from '../services/tenant.js';
import sequelize from '../config/database.js';

const router = Router();
router.use(authenticateJWT, requireClinicId);
const scopesAllowed = ['patients', 'prescriptions', 'examens', 'hospitalisations'];
const wrap = fn => async (req, res, next) => { try { await fn(req, res); } catch (err) { next(err); } };
const fail = (status, message) => { throw Object.assign(new Error(message), { status }); };
const clinicPatient = async (req, id) => {
    if (id === undefined || id === null || id === '') fail(400, 'Patient requis');
    const patient = await Patient.findOne({ where: inClinic(req, { id }), attributes: ['id', 'clinic_id', 'cinNumero'] });
    if (!patient) fail(404, 'Patient non trouvé');
    return patient;
};
const attached = async (req, patientId) => (await doctorPatientIds(req.user)).ids.includes(patientId);

router.post('/exceptional-access/requests', authorizeRole('admin'), wrap(async (req, res) => {
    const { patientId, justification, scopes } = req.body;
    const patient = await clinicPatient(req, patientId);
    if (typeof justification !== 'string' || justification.trim().length < 30 || justification.length > 1000
        || !Array.isArray(scopes) || !scopes.length || scopes.some(s => !scopesAllowed.includes(s))) fail(400, 'Justification de 30 à 1000 caractères et périmètre explicite requis');
    const grant = await sequelize.transaction(async transaction => {
        const result = await ExceptionalGrant.create({ clinic_id: req.user.clinic_id, patientId: patient.id, actorUserId: req.user.id, justification: justification.trim(), scopes: [...new Set(scopes)] }, { transaction });
        await AccessAudit.create({ clinic_id: req.user.clinic_id, actorUserId: req.user.id, actorRole: req.user.role,
            grantId: result.id, patientId: patient.id, action: 'exceptional.request', outcome: 'allowed', requestId: crypto.randomUUID(), method: req.method, route: '/api/patient-access/exceptional-access/requests' }, { transaction });
        return result;
    });
    res.status(201).json(grant);
}));
router.get('/exceptional-access/requests', authorizeRole('admin', 'doctor'), wrap(async (req, res) => {
    const filter = req.user.role === 'admin' ? { actorUserId: req.user.id }
        : { patientId: { [Op.in]: (await doctorPatientIds(req.user)).ids } };
    res.json(await ExceptionalGrant.findAll({ where: inClinic(req, filter), order: [['createdAt', 'DESC']], limit: 100 }));
}));
for (const decision of ['approve', 'reject', 'revoke']) {
    router.post(`/exceptional-access/requests/:id/${decision}`, authorizeRole('doctor', ...(decision === 'revoke' ? ['admin'] : [])), wrap(async (req, res) => {
        await sequelize.transaction(async transaction => {
            const grant = await ExceptionalGrant.findOne({ where: inClinic(req, { id: req.params.id }), transaction, lock: transaction.LOCK.UPDATE });
            if (!grant) fail(404, 'Demande non trouvée');
            const isActor = grant.actorUserId === req.user.id;
            const isDoctor = req.user.role === 'doctor' && await attached(req, grant.patientId);
            if (decision === 'revoke' ? !(isActor || isDoctor) : (!isDoctor || isActor)) fail(403, 'Décision non autorisée');
            if (decision !== 'revoke' && grant.status !== 'pending') fail(409, 'Demande déjà traitée');
            if (decision === 'revoke' && !['pending', 'approved'].includes(grant.status)) fail(409, 'Accès déjà fermé');
            const now = new Date();
            await grant.update(decision === 'approve' ? { status: 'approved', approvedBy: req.user.id, approvedAt: now, expiresAt: new Date(now.getTime() + 30 * 60000) }
                : decision === 'reject' ? { status: 'rejected', approvedBy: req.user.id, approvedAt: now }
                    : { status: 'revoked', revokedAt: now, revokedBy: req.user.id }, { transaction });
            await AccessAudit.create({ clinic_id: req.user.clinic_id, actorUserId: req.user.id, actorRole: req.user.role, grantId: grant.id,
                patientId: grant.patientId, action: `exceptional.${decision}`, outcome: 'allowed', requestId: crypto.randomUUID(), method: req.method, route: `/api/patient-access/exceptional-access/requests/:id/${decision}` }, { transaction });
        });
        res.json({ success: true });
    }));
}
router.get('/audit', wrap(async (req, res) => {
    const responsibility = await ClinicResponsibility.findOne({ where: inClinic(req, { userId: req.user.id }) });
    const ownGrants = await ExceptionalGrant.findAll({ where: inClinic(req, { actorUserId: req.user.id }), attributes: ['id'] });
    const filters = [{ actorUserId: { [Op.ne]: req.user.id } }];
    // NOT IN sur une liste vide peut produire NOT IN (NULL) et masquer tous
    // les accès exceptionnels au médecin qui n'a lui-même demandé aucun droit.
    if (ownGrants.length) filters.push({ [Op.or]: [{ grantId: null }, { grantId: { [Op.notIn]: ownGrants.map(g => g.id) } }] });
    if (!responsibility) {
        if (req.user.role !== 'doctor') fail(403, 'Habilitation de responsable requise');
        filters.push({ patientId: { [Op.in]: (await doctorPatientIds(req.user)).ids } });
    }
    const before = Number(req.query.before);
    if (before > 0) filters.push({ id: { [Op.lt]: before } });
    res.json(await AccessAudit.findAll({ where: inClinic(req, { [Op.and]: filters }), order: [['id', 'DESC']], limit: 100 }));
}));

// Adressage/remplacement : uniquement par un médecin déjà rattaché ; borné et révocable.
router.post('/assignments', authorizeRole('doctor', 'admin'), wrap(async (req, res) => {
    const { patientId, doctorUserId, departmentId, kind, startsAt, endsAt, reason } = req.body;
    const patient = await clinicPatient(req, patientId);
    const start = new Date(startsAt), end = new Date(endsAt);
    if (!Number.isFinite(+start) || !Number.isFinite(+end) || end <= start || typeof reason !== 'string' || reason.trim().length < 10 || reason.length > 1000) fail(400, 'Dates et justification requises');
    if (kind === 'service') {
        if (req.user.role !== 'admin' || doctorUserId || !await Departement.findOne({ where: inClinic(req, { id: departmentId }) })) fail(403, 'Affectation au service refusée');
    } else {
        if (!['referral', 'replacement'].includes(kind) || departmentId || req.user.role !== 'doctor' || !await attached(req, patient.id)) fail(403, 'Adressage refusé');
        if (!await Medecin.findOne({ where: inClinic(req, { userId: doctorUserId }) })) fail(404, 'Médecin non trouvé');
    }
    await audit(req, 'assignment.create', { patientId: patient.id, resourceType: 'assignment' });
    const assignment = await PatientAssignment.create({ clinic_id: req.user.clinic_id, patientId: patient.id,
        doctorUserId: kind === 'service' ? null : doctorUserId, departmentId: kind === 'service' ? departmentId : null,
        kind, startsAt: start, endsAt: end, reason, createdBy: req.user.id });
    res.status(201).json(assignment);
}));
router.post('/assignments/:id/revoke', authorizeRole('doctor', 'admin'), wrap(async (req, res) => {
    const assignment = await PatientAssignment.findOne({ where: inClinic(req, { id: req.params.id }) });
    if (!assignment) fail(404, 'Affectation non trouvée');
    if (assignment.kind === 'service' ? req.user.role !== 'admin' : req.user.role !== 'doctor' || !await attached(req, assignment.patientId)) fail(403, 'Révocation refusée');
    await audit(req, 'assignment.revoke', { patientId: assignment.patientId, resourceType: 'assignment', resourceId: assignment.id });
    await assignment.update({ revokedAt: new Date() });
    res.json({ success: true });
}));
router.post('/nurse-services', authorizeRole('admin'), wrap(async (req, res) => {
    const { userId, departmentId } = req.body;
    if (!await User.findOne({ where: inClinic(req, { id: userId, role: 'nurse' }) }) || !await Departement.findOne({ where: inClinic(req, { id: departmentId }) })) fail(404, 'Infirmier ou service non trouvé');
    const [membership] = await NurseService.findOrCreate({ where: inClinic(req, { userId, departmentId }) });
    res.status(201).json(membership);
}));
router.delete('/nurse-services/:id', authorizeRole('admin'), wrap(async (req, res) => {
    await NurseService.destroy({ where: inClinic(req, { id: req.params.id }) });
    res.json({ success: true });
}));

// Lecture permanente limitée aux écrits du médecin ; aucun résultat, soin ou constante d'un tiers.
router.get('/authored/:patientId', authorizeRole('doctor'), wrap(async (req, res) => {
    const doctor = await Medecin.findOne({ where: inClinic(req, { userId: req.user.id }) });
    if (!doctor) fail(403, 'Profil médecin requis');
    const patient = await clinicPatient(req, req.params.patientId);
    const [prescriptions, examens, hospitalisations] = await Promise.all([
        Prescription.findAll({ where: inClinic(req, { patientCin: patient.cinNumero, medecinId: doctor.id }), attributes: ['id', 'numero', 'medicaments', 'notes', 'diagnostique', 'createdAt'] }),
        ExamenPatient.findAll({ where: inClinic(req, { patientId: patient.id, medecinId: doctor.id }), attributes: ['id', 'notesObligatoires', 'createdAt'] }),
        Hospitalisation.findAll({ where: inClinic(req, { patientId: patient.id, medecinId: doctor.id }), attributes: ['id', 'diagnostic', 'motif', 'createdAt'] }),
    ]);
    if (!prescriptions.length && !examens.length && !hospitalisations.length) fail(404, 'Aucun écrit personnel');
    res.json({ prescriptions, examens, hospitalisations });
}));
export default router;
