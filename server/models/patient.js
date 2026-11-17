import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';

// ============================================================
// PATIENT  — ✅ clinic_id ajouté
// ============================================================
export const Patient = sequelize.define('Patient', {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    // ✅ clinic_id : isolation multi-tenant
    clinic_id: { type: DataTypes.INTEGER, allowNull: true, field: 'clinic_id' },
    cinNumero: {
        type: DataTypes.STRING(20), allowNull: false, field: 'cin_numero',
    },
    cinType: { type: DataTypes.ENUM('CIN', 'Passeport', 'CarteSejour', 'LaissezPasser'), defaultValue: 'CIN', field: 'cin_type' },
    cinDateExpiration: { type: DataTypes.DATEONLY, allowNull: false, field: 'cin_date_expiration' },
    cinEstVerifiee: { type: DataTypes.BOOLEAN, defaultValue: false, field: 'cin_est_verifiee' },
    cinMethodeVerif: { type: DataTypes.ENUM('Non_verifie', 'IA_OCR', 'Manuel'), defaultValue: 'Non_verifie', field: 'cin_methode_verif' },
    numeroDossier: { type: DataTypes.STRING(20), allowNull: false, field: 'numero_dossier' },
    nom: { type: DataTypes.STRING(100), allowNull: false },
    prenom: { type: DataTypes.STRING(100), allowNull: false },
    dateNaissance: { type: DataTypes.DATEONLY, allowNull: false, field: 'date_naissance' },
    lieuNaissance: { type: DataTypes.STRING(100), field: 'lieu_naissance' },
    sexe: { type: DataTypes.ENUM('M', 'F'), allowNull: false },
    telephonePrincipal: { type: DataTypes.STRING(20), allowNull: false, field: 'telephone_principal' },
    telephoneSecondaire: { type: DataTypes.STRING(20), field: 'telephone_secondaire' },
    email: DataTypes.STRING(150),
    adresseRue: { type: DataTypes.STRING(200), field: 'adresse_rue' },
    adresseVille: { type: DataTypes.STRING(100), field: 'adresse_ville' },
    adresseCodePostal: { type: DataTypes.STRING(10), field: 'adresse_code_postal' },
    contactUrgenceNom: { type: DataTypes.STRING(200), field: 'contact_urgence_nom' },
    contactUrgenceTel: { type: DataTypes.STRING(20), field: 'contact_urgence_tel' },
    assuranceOrganisme: { type: DataTypes.STRING(150), field: 'assurance_organisme' },
    assuranceNumero: { type: DataTypes.STRING(100), field: 'assurance_numero' },
    assuranceTaux: { type: DataTypes.DECIMAL(5, 2), field: 'assurance_taux' },
    medecinTraitantId: { type: DataTypes.INTEGER, field: 'medecin_traitant_id' },
    photoUrl: { type: DataTypes.STRING(500), field: 'photo_url' },
    qrCodeToken: { type: DataTypes.STRING(255), field: 'qr_code_token' },
    creeParUserId: { type: DataTypes.INTEGER, allowNull: false, field: 'cree_par_user_id' },
}, {
    tableName: 'patients',
});
