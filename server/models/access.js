import { DataTypes as D } from 'sequelize';
import sequelize from '../config/database.js';

// Sequelize enrichit chaque définition (notamment son nom de colonne SQL).
// Un objet distinct est requis pour chaque attribut et chaque modèle.
const id = () => ({ type: D.INTEGER, primaryKey: true, autoIncrement: true });
const integer = () => ({ type: D.INTEGER, allowNull: false });
export const PatientAssignment = sequelize.define('PatientAssignment', {
    id: id(), clinic_id: integer(), patientId: integer(),
    doctorUserId: D.INTEGER, departmentId: D.INTEGER,
    kind: { type: D.ENUM('referral', 'replacement', 'service'), allowNull: false },
    startsAt: { type: D.DATE, allowNull: false }, endsAt: { type: D.DATE, allowNull: false },
    reason: { type: D.STRING(1000), allowNull: false }, createdBy: integer(), revokedAt: D.DATE,
}, { tableName: 'patient_access_assignments' });
export const NurseService = sequelize.define('NurseService', {
    id: id(), clinic_id: integer(), userId: integer(), departmentId: integer(),
}, { tableName: 'nurse_service_memberships' });
// Habilitation indépendante : aucune route d'administration ordinaire ne peut l'attribuer.
export const ClinicResponsibility = sequelize.define('ClinicResponsibility', {
    id: id(), clinic_id: integer(), userId: integer(),
}, { tableName: 'clinic_audit_responsibilities' });
export const ExceptionalGrant = sequelize.define('ExceptionalGrant', {
    id: { type: D.UUID, defaultValue: D.UUIDV4, primaryKey: true },
    clinic_id: integer(), patientId: integer(), actorUserId: integer(),
    approvedBy: D.INTEGER, justification: { type: D.STRING(1000), allowNull: false },
    scopes: { type: D.JSON, allowNull: false },
    status: { type: D.ENUM('pending', 'approved', 'rejected', 'revoked'), defaultValue: 'pending' },
    approvedAt: D.DATE, expiresAt: D.DATE, revokedAt: D.DATE, revokedBy: D.INTEGER,
}, { tableName: 'exceptional_access_grants' });
export const AccessAudit = sequelize.define('AccessAudit', {
    id: { type: D.BIGINT, primaryKey: true, autoIncrement: true },
    clinic_id: integer(), actorUserId: integer(), actorRole: { type: D.STRING(50), allowNull: false },
    grantId: D.UUID, patientId: D.INTEGER,
    action: { type: D.STRING(80), allowNull: false }, resourceType: D.STRING(60), resourceId: D.STRING(80),
    outcome: { type: D.STRING(30), allowNull: false }, reasonCode: D.STRING(80),
    requestId: { type: D.UUID, allowNull: false }, method: D.STRING(10), route: D.STRING(160),
    occurredAt: { type: D.DATE, allowNull: false, defaultValue: D.NOW },
}, { tableName: 'clinical_access_audit_events', timestamps: false });
const immutable = () => { throw new Error('Journal en ajout seulement'); };
for (const event of ['beforeUpdate', 'beforeBulkUpdate', 'beforeDestroy', 'beforeBulkDestroy', 'beforeUpsert']) AccessAudit.addHook(event, immutable);

