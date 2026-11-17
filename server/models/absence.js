import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';

// ============================================================
// ABSENCE (demandes d'absence des médecins)
// ============================================================
export const Absence = sequelize.define('Absence', {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    medecinId: { type: DataTypes.INTEGER, allowNull: false, field: 'medecin_id' },
    typeAbsence: { 
        type: DataTypes.ENUM('conge_annuel', 'maladie', 'formation', 'sans_solde', 'autre'), 
        allowNull: false, 
        field: 'type_absence' 
    },
    dateDebut: { type: DataTypes.DATEONLY, allowNull: false, field: 'date_debut' },
    dateFin: { type: DataTypes.DATEONLY, allowNull: false, field: 'date_fin' },
    motif: { type: DataTypes.TEXT, allowNull: false },
    statut: { 
        type: DataTypes.ENUM('en_attente', 'valide', 'refuse'), 
        defaultValue: 'en_attente', 
        field: 'statut' 
    },
    traitePar: { type: DataTypes.INTEGER, allowNull: true, field: 'traite_par' },
}, { 
    tableName: 'absences_medecins',
    createdAt: 'created_at',
    updatedAt: false
});
