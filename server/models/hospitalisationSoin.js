import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';

// ============================================================
// HOSPITALISATION_SOIN
// ============================================================
export const HospitalisationSoin = sequelize.define('HospitalisationSoin', {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    hospitalisationId: { type: DataTypes.INTEGER, allowNull: false, field: 'hospitalisation_id' },
    typeSoin: { type: DataTypes.ENUM('pansement', 'perfusion', 'injection', 'catheter', 'oxygene', 'autre'), allowNull: false, field: 'type_soin' },
    notes: { type: DataTypes.TEXT, allowNull: true },
    realisePar: { type: DataTypes.INTEGER, allowNull: false, field: 'realise_par' },
    realiseAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW, field: 'realise_at' }
}, { tableName: 'hospitalisation_soins', timestamps: false });
