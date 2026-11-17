import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';

// ============================================================
// EXAMEN_PATIENT  — ✅ clinic_id ajouté
// ============================================================
export const ExamenPatient = sequelize.define('ExamenPatient', {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    clinic_id: { type: DataTypes.INTEGER, allowNull: true, field: 'clinic_id' },
    patientId: { type: DataTypes.INTEGER, allowNull: false, field: 'patient_id' },
    medecinId: { type: DataTypes.INTEGER, allowNull: false, field: 'medecin_id' },
    consultationId: { type: DataTypes.INTEGER, field: 'consultation_id' },
    examenId: { type: DataTypes.INTEGER, allowNull: false, field: 'examen_id' },
    statut: { type: DataTypes.ENUM('en_attente', 'preleve', 'en_cours', 'termine', 'annule'), defaultValue: 'en_attente' },
    resultats: { type: DataTypes.TEXT },
    fichierResultat: { type: DataTypes.STRING(500), field: 'fichier_resultat' },
    notesObligatoires: { type: DataTypes.TEXT, field: 'notes_obligatoires' },
    prixFacture: { type: DataTypes.DECIMAL(10, 2), field: 'prix_facture' },
    dateResultatPrevue: { type: DataTypes.DATE, field: 'date_resultat_prevue' },
    estFacture: { type: DataTypes.BOOLEAN, defaultValue: false, field: 'est_facture' }
}, { tableName: 'examens_patients' });
