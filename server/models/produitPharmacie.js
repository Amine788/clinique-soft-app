import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';

// ============================================================
// PRODUIT_PHARMACIE  — ✅ clinic_id ajouté
// ============================================================
export const ProduitPharmacie = sequelize.define('ProduitPharmacie', {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    clinic_id: { type: DataTypes.INTEGER, allowNull: true, field: 'clinic_id' },
    codeProduit: { type: DataTypes.STRING(20), allowNull: false, field: 'code_produit' },
    dci: { type: DataTypes.STRING(200), allowNull: false },
    nomCommercial: { type: DataTypes.STRING(200), allowNull: false, field: 'nom_commercial' },
    forme: { type: DataTypes.ENUM('comprime', 'sirop', 'injectable', 'pommade', 'autre'), allowNull: false },
    dosage: DataTypes.STRING(100),
    categorie: { type: DataTypes.STRING(100), allowNull: false, defaultValue: 'medicament' },
    prixAchat: { type: DataTypes.DECIMAL(10, 2), field: 'prix_achat' },
    prixVente: { type: DataTypes.DECIMAL(10, 2), field: 'prix_vente' },
    stockMinimum: { type: DataTypes.INTEGER, defaultValue: 10, field: 'stock_minimum' },
    stockActuel: { type: DataTypes.INTEGER, defaultValue: 0, field: 'stock_actuel' },
    actif: { type: DataTypes.BOOLEAN, defaultValue: true },
}, { tableName: 'produits_pharmacie', timestamps: false });
