import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';

// ============================================================
// LIGNE_FACTURE
// ============================================================
export const LigneFacture = sequelize.define('LigneFacture', {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    factureId: { type: DataTypes.INTEGER, allowNull: false, field: 'facture_id' },
    sourceType: { type: DataTypes.STRING(50), allowNull: true, field: 'source_type' },
    sourceId: { type: DataTypes.INTEGER, allowNull: true, field: 'source_id' },
    designation: { type: DataTypes.STRING(200), allowNull: false },
    quantite: { type: DataTypes.DECIMAL(10, 2), allowNull: false },
    prixUnitaire: { type: DataTypes.DECIMAL(10, 2), allowNull: false, field: 'prix_unitaire' },
    montantTotal: { type: DataTypes.DECIMAL(10, 2), allowNull: false, field: 'montant_total' },
}, { 
    tableName: 'lignes_facture', 
    timestamps: false 
});
