import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';

// Modèle partagé par l'API et l'installateur, sans dépendance aux routes HTTP.
export const Prescription = sequelize.define('Prescription', {
    clinic_id: { type: DataTypes.INTEGER, allowNull: true },
    numero: { type: DataTypes.STRING(20), unique: true },
    patientCin: { type: DataTypes.STRING(10), allowNull: false },
    medecinId: { type: DataTypes.INTEGER, allowNull: false },
    rdvId: { type: DataTypes.INTEGER, allowNull: true },
    hospitalisationId: { type: DataTypes.INTEGER, allowNull: true },
    dispenseParUserId: { type: DataTypes.INTEGER, allowNull: true },
    medicaments: { type: DataTypes.TEXT, allowNull: false },
    slots: { type: DataTypes.TEXT, allowNull: true },
    statut: { type: DataTypes.ENUM('en_attente', 'en_preparation', 'preparee', 'remise', 'administree'), defaultValue: 'en_attente' },
    notes: { type: DataTypes.TEXT },
    diagnostique: { type: DataTypes.TEXT },
    facturee: { type: DataTypes.BOOLEAN, defaultValue: false },
}, { tableName: 'prescriptions', underscored: true });
