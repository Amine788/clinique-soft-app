import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';

// ============================================================
// CLINIC (SaaS Multi-Tenant — table principale de la hiérarchie)
// ============================================================
export const Clinic = sequelize.define('Clinic', {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    name: { type: DataTypes.STRING(150), allowNull: false },
    // Plan SaaS (Starter / Pro) : sert au revenu mensuel du super-admin et à la page Abonnement
    type: { type: DataTypes.STRING(50), defaultValue: 'Starter' },
    // Spécialité médicale saisie par l'admin (general, cardio…), distincte du plan
    specialite: { type: DataTypes.STRING(100), allowNull: true },
    address: DataTypes.STRING(255),
    email: DataTypes.STRING(150),
    phone: DataTypes.STRING(20),
    logoUrl: { type: DataTypes.STRING(500), field: 'logo_url' },

    // Champs fiscaux et bancaires (pied des factures et ordonnances)
    raisonSociale: { type: DataTypes.STRING(200), field: 'raison_sociale' }, // migration 009
    ice: { type: DataTypes.STRING(50) },
    ifNum: { type: DataTypes.STRING(50), field: 'if_num' },
    rc: { type: DataTypes.STRING(50) },
    tp: { type: DataTypes.STRING(50) },
    rib: { type: DataTypes.STRING(100) },

    subscriptionStatus: {
        type: DataTypes.ENUM('trial', 'active', 'suspended'),
        defaultValue: 'trial',
        field: 'subscription_status'
    },
    // Fin d'essai fixée par le super-admin (prolongation) ; NULL = création + 24 h (config/trial.js)
    trialEndsAt: {
        type: DataTypes.DATE,
        allowNull: true,
        field: 'trial_ends_at'
    },
    activeModules: {
        type: DataTypes.JSON,
        defaultValue: ['patients', 'appointments'],
        field: 'active_modules',
        // MariaDB stocke JSON en LONGTEXT et le renvoie en chaîne : toujours exposer la valeur décodée
        // (la page Réglages lit un objet { email_reminders, realtime_notifications })
        get() {
            const valeur = this.getDataValue('activeModules');
            if (typeof valeur !== 'string') return valeur;
            try { return JSON.parse(valeur); } catch { return valeur; }
        }
    },
    // 🔐 Clé de licence — stockée hashée (SHA-256), jamais en clair
    // La clé brute est affichée UNE SEULE FOIS à la création (comme GitHub PAT)
    keyHash: {
        type: DataTypes.STRING(64),
        unique: true,
        allowNull: true,
        field: 'key_hash'
    },
    keyPrefix: {
        type: DataTypes.STRING(12),
        allowNull: true,
        field: 'key_prefix'
    }
}, { tableName: 'clinics' });

// ℹ️  La génération + hashage de la clé se fait dans auth.js au moment de Clinic.create()
//     afin de pouvoir retourner la clé brute une seule fois dans la réponse HTTP.
