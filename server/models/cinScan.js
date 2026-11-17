import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';

// ============================================================
// CIN_SCAN  — ✅ clinic_id ajouté
// ============================================================
export const CinScan = sequelize.define('CinScan', {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    clinic_id: { type: DataTypes.INTEGER, allowNull: true, field: 'clinic_id' },
    patientId: { type: DataTypes.INTEGER, allowNull: true, field: 'patient_id' },
    cinNumero: { type: DataTypes.STRING(20), allowNull: false, field: 'cin_numero' },
    face: { type: DataTypes.ENUM('recto', 'verso'), allowNull: false },
    fichierNom: { type: DataTypes.STRING(255), allowNull: false, field: 'fichier_nom' },
    fichierPath: { type: DataTypes.STRING(500), allowNull: false, field: 'fichier_path' },
    fichierTaille: { type: DataTypes.INTEGER, field: 'fichier_taille' },
    fichierFormat: { type: DataTypes.STRING(50), field: 'fichier_format' },
    fichierHash: { type: DataTypes.STRING(64), field: 'fichier_hash' },
    ocrEffectue: { type: DataTypes.BOOLEAN, defaultValue: false, field: 'ocr_effectue' },
    ocrDonnees: { type: DataTypes.JSON, field: 'ocr_donnees' },
    ocrConfiance: { type: DataTypes.DECIMAL(5, 2), field: 'ocr_confiance' },
    ocrDate: { type: DataTypes.DATE, field: 'ocr_date' },
    uploadeParUserId: { type: DataTypes.INTEGER, allowNull: false, field: 'uploade_par_user_id' },
}, { tableName: 'cin_scans', updatedAt: false, createdAt: 'uploaded_at' });
