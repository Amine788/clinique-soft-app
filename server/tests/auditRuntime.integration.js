// Exécution séparée après provisionnement administratif du seul compte jetable.
// Ce processus ne reçoit jamais les identifiants root et ne réinitialise aucune base.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { Sequelize } from 'sequelize';
import { DB, startServer, loadModels, seedClinic, client } from './helpers.js';
import { verifyAuditProtection } from '../services/auditProtection.js';

let server, db, m, ctx;
before(async () => {
    db = new Sequelize(DB.name, 'security_test_runtime', 'disposable-runtime-password', {
        host: DB.host, port: DB.port, dialect: 'mysql', logging: false,
    });
    const [[identity]] = await db.query('SELECT @@hostname AS hostname, CURRENT_USER() AS account');
    assert.equal(identity.hostname, 'nextclinic-security-test-db');
    assert.equal(identity.account, 'security_test_runtime@%');
    server = await startServer({}, { prepareDatabase: false, runtimeAccount: true });
    m = await loadModels();
    ctx = await seedClinic(m, 'AuditRuntime');
});
after(async () => { await server?.stop(); await db?.close(); await m?.sequelize.close(); });

test('Compte applicatif : démarrage et journalisation sans privilèges DDL ni visibilité TRIGGER', async () => {
    const [metadata] = await db.query("SELECT TRIGGER_NAME FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA = DATABASE()");
    assert.deepEqual(metadata, []);
    await verifyAuditProtection(db);
    const made = await client(server.base, ctx.users.admin)('POST', '/api/patient-access/exceptional-access/requests', {
        patientId: ctx.patient.id, justification: 'Vérification de journalisation avec le compte applicatif limité', scopes: ['patients'],
    });
    assert.equal(made.status, 201, JSON.stringify(made.body));
    const [[row]] = await db.query("SELECT COUNT(*) AS total FROM clinical_access_audit_events WHERE action = 'exceptional.request'");
    assert.ok(Number(row.total) > 0);
    for (const sql of [
        'UPDATE clinical_access_audit_events SET outcome = \'tampered\'',
        'DELETE FROM clinical_access_audit_events',
        'TRUNCATE TABLE clinical_access_audit_events',
        'DROP TABLE clinical_access_audit_events',
        'DROP TRIGGER clinical_audit_no_update',
        'CREATE TABLE audit_unwanted_ddl (id INT)',
        'DROP PROCEDURE nextclinic_audit_protection_status',
    ]) await assert.rejects(db.query(sql), error => [1142, 1143, 1370].includes(error.original?.errno), sql);
});

test('Compte applicatif : redémarrage avec les mêmes droits limités', async () => {
    await server.stop(); server = null;
    server = await startServer({}, { prepareDatabase: false, runtimeAccount: true });
    assert.equal((await client(server.base, ctx.users.admin)('GET', '/api/patients')).status, 200);
});

