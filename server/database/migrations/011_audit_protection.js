import { AUDIT_TABLE, AUDIT_TRIGGERS, AUDIT_DENIAL, AUDIT_STATUS_SQL,
    AUDIT_STATUS_ROUTINE, validAuditTrigger, verifyAuditProtection } from '../../services/auditProtection.js';

const normalize = sql => String(sql).trim().replace(/;$/, '').replace(/\s+/g, ' ').toLowerCase();

// Exécution administrative uniquement, API arrêtée. Les DDL MySQL ne sont pas
// transactionnels : contrôler les objets existants avant toute création.
export async function installAuditProtection(db) {
    if (db.getDialect() !== 'mysql') throw new Error('Protection du journal : MySQL requis');
    const [rows] = await db.query(AUDIT_STATUS_SQL);
    for (const expected of AUDIT_TRIGGERS) {
        const existing = rows.find(row => row.name === expected.name);
        if (existing && !validAuditTrigger(existing, expected)) {
            throw new Error(`Installation refusée : ${expected.name} non conforme, contrôle administratif requis`);
        }
    }
    const [routines] = await db.query(`SELECT ROUTINE_DEFINITION AS definition, SECURITY_TYPE AS securityType,
        SQL_DATA_ACCESS AS dataAccess FROM information_schema.ROUTINES
        WHERE ROUTINE_SCHEMA = DATABASE() AND ROUTINE_NAME = '${AUDIT_STATUS_ROUTINE}' AND ROUTINE_TYPE = 'PROCEDURE'`);
    const existing = routines[0];
    if (existing && (normalize(existing.definition) !== normalize(AUDIT_STATUS_SQL)
        || existing.securityType !== 'DEFINER' || existing.dataAccess !== 'READS SQL DATA')) {
        throw new Error('Installation refusée : routine de contrôle non conforme, contrôle administratif requis');
    }
    for (const expected of AUDIT_TRIGGERS) {
        if (!rows.some(row => row.name === expected.name)) {
            await db.query(`CREATE TRIGGER ${expected.name} BEFORE ${expected.operation} ON ${AUDIT_TABLE} FOR EACH ROW ${AUDIT_DENIAL}`);
        }
    }
    if (!existing) {
        await db.query(`CREATE PROCEDURE ${AUDIT_STATUS_ROUTINE}() SQL SECURITY DEFINER READS SQL DATA ${AUDIT_STATUS_SQL}`);
    }
    await verifyAuditProtection(db);
}
