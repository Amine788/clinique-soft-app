import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';

// ============================================================
// DEPARTEMENT — Services internes de la clinique
// ============================================================
export const Departement = sequelize.define('Departement', {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    clinic_id: { type: DataTypes.INTEGER, allowNull: false, field: 'clinic_id' },
    nom: { type: DataTypes.STRING(120), allowNull: false },
    chef: { type: DataTypes.STRING(150), defaultValue: '' },
    lits: { type: DataTypes.INTEGER, defaultValue: 0 },
    statut: {
        type: DataTypes.ENUM('actif', 'inactif'),
        defaultValue: 'actif'
    },
    description: { type: DataTypes.TEXT, allowNull: true },
}, { tableName: 'departements' });
