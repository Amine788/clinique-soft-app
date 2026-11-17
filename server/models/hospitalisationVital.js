import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';

// ============================================================
// HOSPITALISATION_VITAL
// ============================================================
export const HospitalisationVital = sequelize.define('HospitalisationVital', {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    hospitalisationId: { type: DataTypes.INTEGER, allowNull: false, field: 'hospitalisation_id' },
    temperature: { type: DataTypes.STRING(20), allowNull: true },
    tension: { type: DataTypes.STRING(20), allowNull: true },
    saturation: { type: DataTypes.STRING(20), allowNull: true },
    glycemie: { type: DataTypes.STRING(20), allowNull: true },
    pouls: { type: DataTypes.STRING(20), allowNull: true },
    respiration: { type: DataTypes.STRING(20), allowNull: true },
    poids: { type: DataTypes.STRING(20), allowNull: true },
    prisPar: { type: DataTypes.INTEGER, allowNull: false, field: 'pris_par' },
    prisAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW, field: 'pris_at' }
}, { tableName: 'hospitalisation_vitals', timestamps: false });
