import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';

// ============================================================
// USER
// ============================================================
export const User = sequelize.define('User', {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    matricule: { type: DataTypes.STRING(20), allowNull: false, unique: true },
    nom: { type: DataTypes.STRING(100), allowNull: false },
    prenom: { type: DataTypes.STRING(100), allowNull: false },
    email: { type: DataTypes.STRING(150), allowNull: false, unique: true },
    passwordHash: { type: DataTypes.STRING(255), allowNull: false, field: 'password_hash' },
    role: { type: DataTypes.STRING(50), allowNull: false },
    telephone: DataTypes.STRING(20),
    photoUrl: { type: DataTypes.STRING(500), field: 'photo_url' },
    statut: { type: DataTypes.ENUM('actif', 'conge', 'inactif'), defaultValue: 'actif' },
    lastLogin: { type: DataTypes.DATE, field: 'last_login' },
    doctorId: { type: DataTypes.INTEGER, field: 'doctor_id', allowNull: true },
    // ✅ clinic_id : clé d'isolation multi-tenant
    clinic_id: { type: DataTypes.INTEGER, allowNull: true, field: 'clinic_id' },
}, { tableName: 'users' });
