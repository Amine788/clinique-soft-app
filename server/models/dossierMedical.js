import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';

// ============================================================
// DOSSIER_MEDICAL  (lié au patient, pas besoin de clinic_id propre)
// ============================================================
export const DossierMedical = sequelize.define('DossierMedical', {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    patientId: { type: DataTypes.INTEGER, allowNull: false, unique: true, field: 'patient_id' },
    groupeSanguin: { type: DataTypes.ENUM('A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'), field: 'groupe_sanguin' },
    allergies: DataTypes.JSON,
    maladiesChroniques: { type: DataTypes.JSON, field: 'maladies_chroniques' },
    antecedentsChirurgi: { type: DataTypes.JSON, field: 'antecedents_chirurgi' },
    traitementsCours: { type: DataTypes.JSON, field: 'traitements_cours' },
    tailleCm: { type: DataTypes.DECIMAL(5, 1), field: 'taille_cm' },
    poidsKg: { type: DataTypes.DECIMAL(5, 1), field: 'poids_kg' },
}, { tableName: 'dossiers_medicaux', createdAt: false });
