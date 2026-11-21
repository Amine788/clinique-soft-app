import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';

// ============================================================
// FACTURE — ✅ clinic_id / isolation multi-tenant
// ============================================================
export const Facture = sequelize.define('Facture', {
    creationKey: { type: DataTypes.STRING(80), field: 'creation_key' },
    creationFingerprint: { type: DataTypes.STRING(64), field: 'creation_fingerprint' },
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    clinic_id: { type: DataTypes.INTEGER, allowNull: true, field: 'clinic_id' },
    numero: { type: DataTypes.STRING(20), unique: true, field: 'numero_facture' },
    patientCin: { type: DataTypes.STRING(20), allowNull: false, field: 'patient_cin' },
    patientId: { type: DataTypes.INTEGER, allowNull: true, field: 'patient_id' },
    rdvId: { type: DataTypes.INTEGER, allowNull: true, field: 'rdv_id' },
    sousTotal: { type: DataTypes.DECIMAL(10, 2), defaultValue: 0, field: 'sous_total' },
    tva: { type: DataTypes.DECIMAL(10, 2), defaultValue: 0, field: 'tva' },
    total: { type: DataTypes.DECIMAL(10, 2), defaultValue: 0, field: 'total_ttc' },
    assuranceTaux: { type: DataTypes.INTEGER, defaultValue: 0, field: 'assurance_taux' },
    assuranceMontant: { type: DataTypes.DECIMAL(10, 2), defaultValue: 0, field: 'part_assurance' },
    resteACharge: { type: DataTypes.DECIMAL(10, 2), defaultValue: 0, field: 'reste_a_charge' },
    statut: { 
        type: DataTypes.ENUM('en_attente', 'payee', 'annulee', 'impayee', 'partielle'), 
        defaultValue: 'en_attente', 
        field: 'statut' 
    },
    modePaiement: { type: DataTypes.STRING(30), allowNull: true, field: 'mode_paiement' },
    datePaiement: { type: DataTypes.DATE, field: 'date_paiement' },
    notes: { type: DataTypes.TEXT, field: 'notes' },
    creeParUserId: { type: DataTypes.INTEGER, field: 'cree_par' },
    createdAt: { type: DataTypes.DATE, field: 'created_at' },
    updatedAt: { type: DataTypes.DATE, field: 'updated_at' }
}, { 
    tableName: 'factures',
    indexes: [{ name: 'invoice_creation_key', unique: true, fields: ['clinic_id', 'creation_key'] }]
});
