import { DataTypes, QueryTypes } from 'sequelize';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const columns = {
    patient_access_assignments: ['patient_id', 'created_by'],
    nurse_service_memberships: ['user_id', 'department_id'],
    clinic_audit_responsibilities: ['user_id'],
    exceptional_access_grants: ['patient_id', 'actor_user_id'],
    clinical_access_audit_events: ['actor_user_id'],
};

// L'ancienne définition écrasait plusieurs identifiants dans clinic_id.
// Des valeurs déjà écrasées ne peuvent pas être reconstituées automatiquement.
export async function repairAccessColumns(sequelize) {
    if (sequelize.getDialect() !== 'mysql') throw new Error('Migration des accès : MySQL requis');
    const query = sequelize.getQueryInterface();
    const tables = new Set((await query.showAllTables()).map(table => typeof table === 'string' ? table : table.tableName));
    const pending = [];
    for (const [table, expected] of Object.entries(columns)) {
        // Sur une base neuve, le démarrage créera directement les tables corrigées.
        if (!tables.has(table)) continue;
        const schema = await query.describeTable(table);
        const missing = expected.filter(column => !Object.hasOwn(schema, column));
        if (!missing.length) continue;
        const [row] = await sequelize.query(`SELECT COUNT(*) AS total FROM ${query.queryGenerator.quoteTable(table)}`, { type: QueryTypes.SELECT });
        if (Number(row.total) !== 0) {
            throw new Error(`Migration refusée : ${table} contient ${row.total} ligne(s) avec des identifiants potentiellement écrasés. Réconciliation manuelle requise ; aucune colonne modifiée.`);
        }
        pending.push({ table, missing });
    }
    // Toutes les tables sont contrôlées avant la première modification DDL.
    for (const { table, missing } of pending) {
        for (const column of missing) await query.addColumn(table, column, { type: DataTypes.INTEGER, allowNull: false });
    }
    return pending;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    await import('../../loadEnv.js');
    const { default: sequelize } = await import('../../config/database.js');
    try {
        const changes = await repairAccessColumns(sequelize);
        console.log(JSON.stringify({ migration: '010_access_columns', changes }));
    } catch (error) {
        console.error(error.message);
        process.exitCode = 1;
    } finally {
        await sequelize.close();
    }
}
