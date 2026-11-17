import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';

// ============================================================
// CHAMBRE  — ✅ clinic_id ajouté
// ============================================================
export const Chambre = sequelize.define('Chambre', {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    clinic_id: { type: DataTypes.INTEGER, allowNull: true, field: 'clinic_id' },
    numero: { type: DataTypes.STRING(20), allowNull: false },
    typeChambre: { type: DataTypes.ENUM('suite', 'privee', 'double', 'commune', 'urgences', 'usi'), allowNull: false, field: 'type_chambre' },
    nbLits: { type: DataTypes.SMALLINT, allowNull: false, field: 'nb_lits' },
    tarifTtc: { type: DataTypes.DECIMAL(10, 2), field: 'tarif_ttc' },
    statut: { type: DataTypes.ENUM('disponible', 'occupee', 'reservee', 'nettoyage', 'hors_service'), defaultValue: 'disponible' },
    equipements: DataTypes.JSON,
}, { tableName: 'chambres', timestamps: false });
