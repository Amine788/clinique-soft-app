import '../loadEnv.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sequelize from '../models/index.js';
import '../models/access.js';
import '../models/prescription.js';
import { repairAccessColumns } from './migrations/010_access_columns.js';
import { installAuditProtection } from './migrations/011_audit_protection.js';
import { installBillingIdempotency } from './migrations/013_facturation_idempotence.js';
// Les anciennes tables et colonnes de départements d'une base existante ne sont ni lues ni supprimées :
// leurs données restent en base, intactes.
export async function installDatabase(db = sequelize) {
    await db.authenticate();
    await repairAccessColumns(db);
    await installBillingIdempotency(db);
    await db.sync({ force: false, alter: false });
    await installAuditProtection(db);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    try {
        await installDatabase();
        console.log('Schéma et protections du journal installés et vérifiés.');
    } catch (error) {
        console.error(`Installation de la base refusée : ${error.message}`);
        process.exitCode = 1;
    } finally {
        await sequelize.close();
    }
}
