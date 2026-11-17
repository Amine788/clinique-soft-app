import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { resetDatabase, loadModels, startServer } from './helpers.js';
import { verifyAuditProtection } from '../services/auditProtection.js';
import { installAuditProtection } from '../database/migrations/011_audit_protection.js';

let m, installDatabase;
before(async () => {
    await resetDatabase();
    m = await loadModels();
    ({ installDatabase } = await import('../database/install.js'));
});
after(async () => { await m?.sequelize.close(); });

test('Installation : base neuve, protections SQL effectives, relance sans perte de journal', async () => {
    await installDatabase();
    await m.sequelize.query(`INSERT INTO clinical_access_audit_events
        (clinic_id, actor_user_id, actor_role, action, outcome, occurred_at, request_id)
        VALUES (1, 1, 'doctor', 'installation.test', 'allowed', NOW(), UUID())`);
    await installDatabase();
    const [[row]] = await m.sequelize.query('SELECT COUNT(*) AS total FROM clinical_access_audit_events');
    assert.equal(Number(row.total), 1);
    await verifyAuditProtection(m.sequelize);
    for (const sql of ['UPDATE clinical_access_audit_events SET outcome = \'tampered\'', 'DELETE FROM clinical_access_audit_events']) {
        await assert.rejects(m.sequelize.query(sql), /Append-only clinical audit/);
    }
});

test('Installation : un trigger existant non protecteur est refusé sans réparation implicite', async () => {
    await m.sequelize.query('DROP TRIGGER clinical_audit_no_update');
    try {
        await m.sequelize.query('CREATE TRIGGER clinical_audit_no_update BEFORE UPDATE ON clinical_access_audit_events FOR EACH ROW SET NEW.outcome = OLD.outcome');
        await assert.rejects(installAuditProtection(m.sequelize), /non conforme/);
        await assert.rejects(verifyAuditProtection(m.sequelize), /Protection du journal indisponible/);
        await assert.rejects(m.sequelize.query('DELETE FROM clinical_access_audit_events'), /Append-only clinical audit/);
    } finally {
        await m.sequelize.query('DROP TRIGGER clinical_audit_no_update');
        await installAuditProtection(m.sequelize);
    }
});

test('Démarrage : un trigger absent bloque l’API sans tenter de le recréer', async () => {
    await m.sequelize.query('DROP TRIGGER clinical_audit_no_delete');
    try {
        await assert.rejects(startServer({}, { prepareDatabase: false }), /Protection du journal indisponible/);
        const [rows] = await m.sequelize.query("SELECT TRIGGER_NAME FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA = DATABASE() AND TRIGGER_NAME = 'clinical_audit_no_delete'");
        assert.equal(rows.length, 0);
    } finally { await installAuditProtection(m.sequelize); }
});

test('Démarrage : routine absente refusée, réinstallation administrative et redémarrage possibles', async () => {
    await m.sequelize.query('DROP PROCEDURE nextclinic_audit_protection_status');
    await assert.rejects(startServer({}, { prepareDatabase: false }), /Protection du journal indisponible/);
    await installAuditProtection(m.sequelize);
    const server = await startServer({}, { prepareDatabase: false });
    try { assert.equal((await fetch(`${server.base}/api/health`)).status, 200); }
    finally { await server.stop(); }
});
