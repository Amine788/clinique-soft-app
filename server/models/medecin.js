import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';

// ============================================================
// MEDECIN  — ✅ clinic_id ajouté
// ============================================================
export const Medecin = sequelize.define('Medecin', {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    clinic_id: { type: DataTypes.INTEGER, allowNull: true, field: 'clinic_id' },
    userId: { type: DataTypes.INTEGER, allowNull: false, unique: true, field: 'user_id' },
    matricule: { type: DataTypes.STRING(20), allowNull: false, unique: true },
    titre: { type: DataTypes.ENUM('Dr.', 'Pr.', 'Chirurgien'), defaultValue: 'Dr.' },
    numeroOrdre: { type: DataTypes.STRING(50), allowNull: false, unique: true, field: 'numero_ordre' },
    specialites: { type: DataTypes.JSON, allowNull: false },
    dateDebut: { type: DataTypes.DATEONLY, allowNull: false, field: 'date_debut' },
    salleConsultation: { type: DataTypes.STRING(50), field: 'salle_consultation' },
    tarifStandardTtc: { type: DataTypes.DECIMAL(10, 2), field: 'tarif_standard_ttc' },
    tarifUrgenceTtc: { type: DataTypes.DECIMAL(10, 2), field: 'tarif_urgence_ttc' },
    dureeRdvMinutes: { type: DataTypes.INTEGER, defaultValue: 30, field: 'duree_rdv_minutes' },
    statut: { type: DataTypes.ENUM('actif', 'conge', 'inactif'), defaultValue: 'actif' },
}, { tableName: 'medecins', timestamps: false });
