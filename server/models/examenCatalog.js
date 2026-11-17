import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';

// ============================================================
// EXAMEN_CATALOG  (catalogue global, pas besoin de clinic_id)
// ============================================================
export const ExamenCatalog = sequelize.define('ExamenCatalog', {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    code: { type: DataTypes.STRING(20), allowNull: false, unique: true },
    nom: { type: DataTypes.STRING(200), allowNull: false },
    type: { type: DataTypes.ENUM('laboratoire', 'radiologie'), allowNull: false },
    categorie: { type: DataTypes.STRING(100) },
    prixStandard: { type: DataTypes.DECIMAL(10, 2), allowNull: false, field: 'prix_standard' },
    actif: { type: DataTypes.BOOLEAN, defaultValue: true },
}, { tableName: 'examens_catalog', timestamps: false });
