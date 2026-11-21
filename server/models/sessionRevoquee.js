import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';

// ============================================================
// SESSIONS RÉVOQUÉES — sessions fermées par « Déconnexion » avant leur expiration.
// Une ligne par session (identifiant « jti » du jeton), supprimée une fois la session expirée (services/purges.js).
// ============================================================
export const SessionRevoquee = sequelize.define('SessionRevoquee', {
    jti: { type: DataTypes.STRING(36), primaryKey: true },
    expireLe: { type: DataTypes.DATE, allowNull: false, field: 'expire_le' },
}, {
    tableName: 'sessions_revoquees',
    timestamps: false,
    indexes: [{ name: 'idx_sessions_revoquees_expire_le', fields: ['expire_le'] }],
});
