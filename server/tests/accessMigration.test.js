import { test, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { Sequelize, DataTypes } from 'sequelize';
import { DB, resetDatabase } from './helpers.js';
import { repairAccessColumns } from '../database/migrations/010_access_columns.js';

const expected = {
    patient_access_assignments: ['patient_id', 'created_by'],
    nurse_service_memberships: ['user_id', 'department_id'],
    clinic_audit_responsibilities: ['user_id'],
    exceptional_access_grants: ['patient_id', 'actor_user_id'],
    clinical_access_audit_events: ['actor_user_id'],
};
let db, query;
before(async () => {
    await resetDatabase();
    db = new Sequelize(DB.name, DB.user, DB.password, { host: DB.host, port: DB.port, dialect: 'mysql', logging: false });
    query = db.getQueryInterface();
});
beforeEach(async () => {
    for (const table of Object.keys(expected)) {
        await query.dropTable(table);
        await query.createTable(table, {
            id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
            clinic_id: { type: DataTypes.INTEGER, allowNull: false },
        });
    }
});
after(async () => { await db?.close(); });

test('Migration des accès : ajoute les colonnes absentes aux tables vides, relance sans modification', async () => {
    assert.equal((await repairAccessColumns(db)).length, 5);
    for (const [table, columns] of Object.entries(expected)) {
        const schema = await query.describeTable(table);
        for (const column of columns) {
            assert.ok(schema[column], `${table}.${column} absent`);
            assert.equal(schema[column].allowNull, false);
        }
    }
    assert.deepEqual(await repairAccessColumns(db), []);
});

test('Migration des accès : refuse les données anciennes sans modifier aucune des cinq tables', async () => {
    await query.bulkInsert('clinical_access_audit_events', [{ clinic_id: 321 }]);
    await assert.rejects(repairAccessColumns(db), /Réconciliation manuelle requise/);
    for (const [table, columns] of Object.entries(expected)) {
        const schema = await query.describeTable(table);
        for (const column of columns) assert.equal(schema[column], undefined, `${table} a été modifiée avant le refus`);
    }
    const [rows] = await db.query('SELECT clinic_id FROM clinical_access_audit_events');
    assert.deepEqual(rows, [{ clinic_id: 321 }]);
});
