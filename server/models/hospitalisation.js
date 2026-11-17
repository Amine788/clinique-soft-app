import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';

// ============================================================
// HOSPITALISATION  — ✅ clinic_id ajouté
// ============================================================
export const Hospitalisation = sequelize.define('Hospitalisation', {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    clinic_id: { type: DataTypes.INTEGER, allowNull: true, field: 'clinic_id' },
    patientId: { type: DataTypes.INTEGER, allowNull: false, field: 'patient_id' },
    medecinId: { type: DataTypes.INTEGER, allowNull: false, field: 'medecin_id' },
    nurseId: { type: DataTypes.INTEGER, allowNull: true, field: 'nurse_id' },
    chambreId: { type: DataTypes.INTEGER, allowNull: true, field: 'chambre_id' },
    lit: { type: DataTypes.STRING(50), allowNull: true },
    diagnostic: { type: DataTypes.STRING(255), allowNull: true },
    motif: { type: DataTypes.TEXT, allowNull: true },
    dateAdmission: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW, field: 'date_admission' },
    dateSortie: { type: DataTypes.DATE, allowNull: true, field: 'date_sortie' },
    // Prévue à la planification depuis un RDV (P17), distincte de la sortie réelle
    dateSortieEstimee: { type: DataTypes.DATEONLY, allowNull: true, field: 'date_sortie_estimee' },
    etat: { type: DataTypes.ENUM('stable', 'surveillance', 'critique'), defaultValue: 'stable' },
    statut: { type: DataTypes.ENUM('demande', 'admis', 'sortie_demandee', 'termine', 'annule'), defaultValue: 'demande' },
    estFacture: { type: DataTypes.BOOLEAN, defaultValue: false, field: 'est_facture' },
    createdAt: { type: DataTypes.DATE, field: 'createdAt' },
    updatedAt: { type: DataTypes.DATE, field: 'updatedAt' }
}, { tableName: 'hospitalisations' });
