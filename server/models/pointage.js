import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';

// ============================================================
// POINTAGE  — ✅ clinic_id ajouté
// ============================================================
export const Pointage = sequelize.define('Pointage', {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    clinic_id: { type: DataTypes.INTEGER, allowNull: true, field: 'clinic_id' },
    patientId: { type: DataTypes.INTEGER, allowNull: false, field: 'patient_id' },
    patientCin: { type: DataTypes.STRING(20), allowNull: false, field: 'patient_cin' },
    rdvId: { type: DataTypes.INTEGER, field: 'rdv_id' },
    heureArrivee: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW, field: 'heure_arrivee' },
    modePointage: { type: DataTypes.ENUM('saisie_cin', 'scan_cin', 'qr_code', 'app_mobile'), allowNull: false, field: 'mode_pointage' },
    pointePar: { type: DataTypes.INTEGER, allowNull: false, field: 'pointe_par' },
    cinExpiree: { type: DataTypes.BOOLEAN, defaultValue: false, field: 'cin_expiree' },
    impayeDetecte: { type: DataTypes.BOOLEAN, defaultValue: false, field: 'impaye_detecte' },
}, { tableName: 'pointages', timestamps: false });
