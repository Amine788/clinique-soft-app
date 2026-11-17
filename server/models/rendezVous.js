import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';

// ============================================================
// RENDEZ_VOUS  — ✅ clinic_id ajouté
// ============================================================
export const RendezVous = sequelize.define('RendezVous', {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    clinic_id: { type: DataTypes.INTEGER, allowNull: true, field: 'clinic_id' },
    numeroRdv: { type: DataTypes.STRING(20), allowNull: false, unique: true, field: 'numero_rdv' },
    patientId: { type: DataTypes.INTEGER, allowNull: false, field: 'patient_id' },
    patientCin: { type: DataTypes.STRING(20), allowNull: false, field: 'patient_cin' },
    medecinId: { type: DataTypes.INTEGER, allowNull: false, field: 'medecin_id' },
    dateRdv: { type: DataTypes.DATEONLY, allowNull: false, field: 'date_rdv' },
    heureDebut: { type: DataTypes.TIME, allowNull: false, field: 'heure_debut' },
    heureFin: { type: DataTypes.TIME, allowNull: false, field: 'heure_fin' },
    typeConsultation: { type: DataTypes.ENUM('premiere', 'suivi', 'urgente', 'bilan', 'vaccination', 'teleconsultation'), allowNull: false, field: 'type_consultation' },
    mode: { type: DataTypes.ENUM('presentiel', 'teleconsultation'), defaultValue: 'presentiel' },
    motif: { type: DataTypes.TEXT, allowNull: false },
    statut: { type: DataTypes.ENUM('planifie', 'confirme', 'arrive', 'pret', 'en_cours', 'termine', 'reporte', 'annule', 'non_presente'), defaultValue: 'planifie' },
    salle: DataTypes.STRING(50),
    vitals: { type: DataTypes.JSON, allowNull: true },
    heureArrivee: { type: DataTypes.DATE, field: 'heure_arrivee' },
    pointePar: { type: DataTypes.INTEGER, field: 'pointe_par' },
    modePointage: { type: DataTypes.ENUM('saisie_cin', 'scan_cin', 'qr_code', 'app_mobile'), field: 'mode_pointage' },
    rappel24hEnvoye: { type: DataTypes.BOOLEAN, defaultValue: false, field: 'rappel_24h_envoye' },
    creePar: { type: DataTypes.INTEGER, allowNull: false, field: 'cree_par' },
    estFacture: { type: DataTypes.BOOLEAN, defaultValue: false, field: 'est_facture' },
}, { tableName: 'rendez_vous' });
