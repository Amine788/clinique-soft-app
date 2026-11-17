import { Sequelize, Op } from 'sequelize';
import cls from 'cls-hooked';

const namespace = cls.createNamespace('clinicsoft-tenant');
Sequelize.useCLS(namespace);

const sequelize = process.env.DATABASE_URL 
    ? new Sequelize(process.env.DATABASE_URL, {
        dialect: 'postgres',
        dialectOptions: {
            ssl: {
                require: true,
                rejectUnauthorized: false // Indispensable pour se connecter à Neon
            }
        },
        logging: false
    })
    : new Sequelize(
          process.env.DB_NAME || 'clinicsoft_db',
          process.env.DB_USER || 'root',
          process.env.DB_PASSWORD || '',
          {
              host: process.env.DB_HOST || 'localhost',
              port: parseInt(process.env.DB_PORT) || 3306,
              dialect: 'mysql',
              charset: 'utf8mb4',
              logging: false,
              pool: {
                  max: 10,
                  min: 2,
                  acquire: 30000,
                  idle: 10000,
              },
              define: {
                  timestamps: true,
                  underscored: true,
                  charset: 'utf8mb4',
                  collate: 'utf8mb4_unicode_ci',
              }
          }
      );

// ============================================================
// FILET MULTI-CLINIQUE — en plus des filtres explicites des routes (inClinic, accessQuery)
// Pendant la requête d'un utilisateur de clinique (clinique posée par authenticateJWT), toute lecture, tout
// comptage et toute écriture en masse (Model.update / Model.destroy) sur un modèle qui porte clinic_id
// sont limités à sa clinique, même si une route oublie son filtre.
// La condition est AJOUTÉE (ET) au filtre de la route, jamais substituée : au pire, le résultat est vide.
// Limites : rien n'est ajouté sans clinique (super-admin, connexion, tâches automatiques), ni sur les modèles
// sans colonne clinic_id (absences, lignes de facture, dossier médical…), ni sur les modèles joints par
// include, ni sur les agrégats (sum, max…). Les filtres explicites restent donc obligatoires.
// Exception explicite : { toutesCliniques: true } pour les contrôles d'unicité globale (e-mail, matricule).
// ============================================================
const limiterALaClinique = (options) => {
    const clinicId = namespace.get('clinicId');
    if (!clinicId || options.toutesCliniques) return;
    options.where = options.where ? { [Op.and]: [options.where, { clinic_id: clinicId }] } : { clinic_id: clinicId };
};
sequelize.addHook('afterDefine', (model) => {
    if (!model.rawAttributes.clinic_id) return;
    for (const hook of ['beforeFind', 'beforeCount', 'beforeBulkUpdate', 'beforeBulkDestroy']) {
        model.addHook(hook, 'filetClinique', limiterALaClinique);
    }
});

export default sequelize;
