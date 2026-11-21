import { randomUUID } from 'node:crypto';
import { Op } from 'sequelize';
import { Patient, Medecin, RendezVous, Hospitalisation } from '../models/index.js';
import { PatientAssignment, ExceptionalGrant, AccessAudit } from '../models/access.js';

const bad = (status, message) => Object.assign(new Error(message), { status });
const days = (key, fallback) => {
    const value = Number(process.env[key] ?? fallback);
    if (!Number.isInteger(value) || value < 0 || value > 3650) throw new Error(`${key} invalide`);
    return value;
};
const activeAssignment = now => ({ revokedAt: null, startsAt: { [Op.lte]: now }, endsAt: { [Op.gt]: now } });
export async function doctorPatientIds(user, now = new Date()) {
    const clinic_id = user.clinic_id;
    const doctor = await Medecin.findOne({ where: { clinic_id, userId: user.id } });
    if (!doctor) return { doctor: null, ids: [] };
    const from = new Date(now.getTime() - days('DOCTOR_APPOINTMENT_ACCESS_DAYS', 90) * 86400000).toISOString().slice(0, 10);
    const dischargeFrom = new Date(now.getTime() - days('DOCTOR_DISCHARGE_ACCESS_DAYS', 30) * 86400000);
    const [primary, appointments, stays, assignments] = await Promise.all([
        Patient.findAll({ where: { clinic_id, medecinTraitantId: user.id }, attributes: ['id'] }),
        RendezVous.findAll({ where: { clinic_id, medecinId: doctor.id, statut: { [Op.ne]: 'annule' }, dateRdv: { [Op.gte]: from } }, attributes: ['patientId'] }),
        Hospitalisation.findAll({ where: { clinic_id, medecinId: doctor.id, [Op.or]: [
            { statut: { [Op.in]: ['admis', 'sortie_demandee'] } },
            { statut: 'termine', dateSortie: { [Op.gte]: dischargeFrom } },
        ] }, attributes: ['patientId'] }),
        PatientAssignment.findAll({ where: { clinic_id, doctorUserId: user.id, ...activeAssignment(now) }, attributes: ['patientId'] }),
    ]);
    return { doctor, ids: [...new Set([...primary.map(p => p.id), ...appointments.map(p => p.patientId), ...stays.map(p => p.patientId), ...assignments.map(p => p.patientId)])] };
}
export async function audit(req, action, { grantId, patientId, outcome = 'allowed', resourceType, resourceId, reasonCode } = {}) {
    return AccessAudit.create({ clinic_id: req.user.clinic_id, actorUserId: req.user.id, actorRole: req.user.role,
        grantId, patientId, action, outcome, resourceType, resourceId: resourceId == null ? null : String(resourceId), reasonCode,
        requestId: req.requestId ||= randomUUID(), method: req.method,
        route: `${req.baseUrl}${req.route?.path || ''}`.slice(0, 160) });
}
export function patientAccess(group) {
    return async (req, res, next) => {
        try {
            req.accessGroup = group;
            const role = req.user.role;
            const clinic_id = req.user.clinic_id;
            req.patientAccessIds = null;
            if (role === 'doctor') {
                const { doctor, ids } = await doctorPatientIds(req.user);
                if (!doctor) throw bad(403, 'Profil médecin requis');
                req.accessDoctorId = doctor.id;
                req.patientAccessIds = ids;
            } else if (role === 'nurse') {
                // Rôle infirmier : les patients hospitalisés de la clinique ; écriture sur ceux dont il a la charge.
                const stays = await Hospitalisation.findAll({ where: { clinic_id, statut: { [Op.in]: ['admis', 'sortie_demandee'] } }, attributes: ['patientId', 'nurseId'] });
                req.patientAccessIds = [...new Set(stays.map(s => s.patientId))];
                req.patientWriteIds = [...new Set(stays.filter(s => s.nurseId === req.user.id).map(s => s.patientId))];
            }
            // Un grant est toujours explicite, jamais un élargissement implicite d'un rôle.
            if (req.headers['x-exceptional-access']) {
                const grantId = String(req.headers['x-exceptional-access']);
                const grant = await ExceptionalGrant.findOne({ where: { id: grantId, clinic_id, actorUserId: req.user.id, status: 'approved', expiresAt: { [Op.gt]: new Date() } } });
                const scopes = grant && (typeof grant.scopes === 'string' ? JSON.parse(grant.scopes) : grant.scopes);
                if (role !== 'admin' || req.method !== 'GET' || !grant || !scopes.includes(group)) {
                    await audit(req, 'exceptional.read', { grantId: grant?.id, patientId: grant?.patientId, outcome: 'denied', reasonCode: 'invalid_grant' });
                    throw bad(403, 'Accès exceptionnel refusé');
                }
                req.exceptionalAccess = grant;
                req.patientAccessIds = [grant.patientId];
                await audit(req, 'exceptional.read', { grantId: grant.id, patientId: grant.patientId, resourceType: group });
            }
            const administrative = ['secretary', 'admin'].includes(role) && !req.exceptionalAccess;
            if (administrative && ['prescriptions', 'examens', 'nurse'].includes(group)) throw bad(403, 'Accès médical refusé');
            if (administrative && group === 'hospitalisations' && !(/^\/(nurses|admissions|administrative-stays)$/.test(req.path) || /^\/[^/]+\/(admit|close)$/.test(req.path) || /^\/chambres\/[^/]+\/clean$/.test(req.path))) throw bad(403, 'Accès médical refusé');
            if (group === 'patients' && req.method !== 'GET') {
                const medicalKeys = ['bloodType', 'allergies', 'chronic', 'diagnostic', 'diagnostique', 'vitals', 'poidsKg', 'tailleCm', 'medecinTraitantId', 'maladiesChroniques'];
                if ((administrative || role === 'nurse') && medicalKeys.some(k => Object.hasOwn(req.body || {}, k))) throw bad(403, 'Écriture médicale refusée');
            }
            if (administrative && group !== 'dashboard') {
                const json = res.json.bind(res);
                res.json = body => json(administrativeResponse(body, group));
            }
            if (administrative && group === 'dashboard') {
                const json = res.json.bind(res);
                res.json = body => json(removeFields(body, new Set(['diagnostique', 'diagnostic', 'notes', 'vitals', 'chronic', 'maladiesChroniques', 'allergies', 'motif', 'medicaments', 'resultats'])));
            }
            if (role === 'doctor' && group === 'patients' && /^\/[^/]+\/upload-scan$/.test(req.path)) {
                const cin = req.path.split('/')[1].toUpperCase();
                if (!await Patient.findOne({ where: { clinic_id, cinNumero: cin, id: { [Op.in]: req.patientAccessIds } }, attributes: ['id'] })) throw bad(404, 'Patient non trouvé');
            }
            if (role === 'pharmacist' || role === 'nurse') {
                const json = res.json.bind(res);
                res.json = body => json(removeFields(body, new Set(role === 'pharmacist'
                    ? ['diagnostique', 'diagnostic', 'notes', 'vitals', 'chronic', 'maladiesChroniques']
                    : ['diagnostique', 'diagnostic', 'chronic', 'maladiesChroniques'])));
            }
            next();
        } catch (err) { next(err); }
    };
}

const administrativeFields = new Set(['error','code','success','message','valid','exists','mode','count','patient','patients',
    'id','dbId','numeroDossier','cin','numero','type','dateExpiration','estVerifiee','methodeVerification','nom','prenom','name',
    'dateNaissance','age','sexe','gender','phone','telephonePrincipal','email','address','ville','insurance','status','statut','hospitalisationId',
    'cinExpiree','cinMasque','lastVisit','createdAt','updatedAt','adresseRue','adresseVille','cinNumero',
    'cinType','cinDateExpiration','telephone','chambreId','lit','nurseId','medecinId','patientId','dateAdmission','dateSortie',
    'dateSortieEstimee','Patient','Medecin','User','Chambre','nurse','nbLits','typeChambre','tarifTtc',
    'alertes','rdv','rdvId','heure','date','heureDebut','heureFin','numeroRdv','time','doctor','doctorId','medecinNom','patientNom','patientCin',
    'typeConsultation','salle','medecin','sousTotal','tva','total','assuranceTaux','assuranceMontant','resteACharge','lignes','facture',
    'factureId','sourceType','sourceId','designation','quantite','prixUnitaire','montantTotal','modePaiement','datePaiement','clinic_id',
    'paiements','montant','payeur','reference','montantEncaisse','soldePatient','soldeAssurance','encaissementHistorique','alreadyPresent','arrivedAt','creeParUserId','estFacture','titre','format','url','face','roomKey','number','beds','price','statusFr','equipements','hospitalisation']);
function administrativeResponse(value, group) {
    if (value?.toJSON) value = value.toJSON();
    if (Array.isArray(value)) return value.filter(v => group !== 'patients' || v?.type !== 'examen').map(v => administrativeResponse(v, group));
    if (value instanceof Date || value === null || typeof value !== 'object') return value;
    return Object.fromEntries(Object.entries(value).filter(([k]) => administrativeFields.has(k)).map(([k,v]) => [k, administrativeResponse(v, group)]));
}
function removeFields(value, fields) {
    if (value?.toJSON) value = value.toJSON();
    if (Array.isArray(value)) return value.map(v => removeFields(v, fields));
    if (value instanceof Date || value === null || typeof value !== 'object') return value;
    return Object.fromEntries(Object.entries(value).filter(([k]) => !fields.has(k)).map(([k,v]) => [k, removeFields(v, fields)]));
}

// Chaque route passe explicitement ses requêtes à ce constructeur ; aucun hook global.
export async function accessQuery(req, Model, options = {}) {
    const clinic_id = req.user?.clinic_id;
    if (!clinic_id) throw bad(403, 'Clinique requise');
    const name = Model.name;
    const conditions = [options.where || {}];
    if (Model.rawAttributes.clinic_id) conditions.push({ clinic_id });
    const ids = req.method === 'GET' ? req.patientAccessIds : (req.patientWriteIds ?? req.patientAccessIds);
    if (ids !== null && ids !== undefined) {
        if (name === 'Patient') conditions.push({ id: { [Op.in]: ids } });
        if (['RendezVous', 'ExamenPatient', 'Hospitalisation', 'CinScan', 'Pointage'].includes(name)) conditions.push({ patientId: { [Op.in]: ids } });
        if (name === 'Prescription') {
            const patients = await Patient.findAll({ where: { clinic_id, id: { [Op.in]: ids } }, attributes: ['cinNumero'] });
            const permitted = { patientCin: { [Op.in]: patients.map(p => p.cinNumero) } };
            conditions.push(permitted);
        }
    }
    const result = { ...options, where: { [Op.and]: conditions } };
    if (options.include) result.include = await Promise.all(options.include.filter(include =>
        !(include.model?.name === 'DossierMedical' && ['secretary', 'admin'].includes(req.user.role) && !req.exceptionalAccess)
    ).map(async include => {
        if (!include.model) return include;
        // Le parent déjà restreint porte le périmètre ; chaque association porte sa clinique.
        const nested = await accessQuery(req, include.model, include);
        if (include.model.name === 'DossierMedical' && req.user.role === 'nurse') nested.attributes = ['patientId', 'groupeSanguin', 'allergies'];
        if (include.required === undefined && !include.where) nested.required = false;
        return nested;
    }));
    return result;
}
export async function scopedByPk(req, Model, id, options = {}) {
    return Model.findOne(await accessQuery(req, Model, { ...options, where: { [Op.and]: [options.where || {}, { [Model.primaryKeyAttribute]: id }] } }));
}

export async function assertPatient(req, patientId) {
    const patient = await Patient.findOne(await accessQuery(req, Patient, { where: { id: patientId } }));
    if (!patient) throw bad(404, 'Patient non trouvé');
    return patient;
}

export async function updateScoped(req, instance, values) {
    const Model = instance.constructor;
    const key = Model.primaryKeyAttribute;
    const scope = await accessQuery(req, Model, { where: { [key]: instance.get(key) } });
    const [changed] = await Model.update(values, scope);
    // MySQL compte les lignes réellement modifiées : 0 signifie aussi « valeurs identiques » (même seconde).
    // Refus seulement si la ressource n'est pas dans le périmètre autorisé.
    if (!changed && !(await Model.count(scope))) throw bad(404, 'Ressource non trouvée');
    instance.set(values);
    return instance;
}
