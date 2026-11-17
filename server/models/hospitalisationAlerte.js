import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';

// ============================================================
// HOSPITALISATION_ALERTE
// ============================================================
export const HospitalisationAlerte = sequelize.define('HospitalisationAlerte', {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    hospitalisationId: { type: DataTypes.INTEGER, allowNull: false, field: 'hospitalisation_id' },
    typeAlerte: { type: DataTypes.ENUM('temperature', 'tension', 'saturation', 'pouls', 'glycemie', 'douleur', 'refus_traitement', 'perfusion', 'malaise', 'chute', 'urgence'), allowNull: false, field: 'type_alerte' },
    description: { type: DataTypes.TEXT, allowNull: true },
    urgency: { type: DataTypes.ENUM('normal', 'urgent', 'critique'), defaultValue: 'normal' },
    statut: { type: DataTypes.ENUM('active', 'resolue'), defaultValue: 'active' },
    creeAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW, field: 'cree_at' },
    resoluAt: { type: DataTypes.DATE, allowNull: true, field: 'resolu_at' },
    resoluPar: { type: DataTypes.INTEGER, allowNull: true, field: 'resolu_par' }
}, { tableName: 'hospitalisation_alertes', timestamps: false });
