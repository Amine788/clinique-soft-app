export const AUDIT_TABLE = 'clinical_access_audit_events';
export const AUDIT_STATUS_ROUTINE = 'nextclinic_audit_protection_status';
export const AUDIT_DENIAL = "SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Append-only clinical audit'";
export const AUDIT_TRIGGERS = ['UPDATE', 'DELETE'].map(operation => ({
    name: `clinical_audit_no_${operation.toLowerCase()}`, operation,
}));
export const AUDIT_STATUS_SQL = `SELECT TRIGGER_NAME AS name, EVENT_MANIPULATION AS operation,
    EVENT_OBJECT_TABLE AS tableName, ACTION_TIMING AS timing, ACTION_STATEMENT AS statement
    FROM information_schema.TRIGGERS
    WHERE TRIGGER_SCHEMA = DATABASE()
    AND TRIGGER_NAME IN ('clinical_audit_no_update', 'clinical_audit_no_delete')`;

const normalize = sql => String(sql).trim().replace(/;$/, '').replace(/\s+/g, ' ').toLowerCase();
export function validAuditTrigger(row, expected) {
    return row?.name === expected.name && row.operation === expected.operation
        && row.tableName === AUDIT_TABLE && row.timing === 'BEFORE'
        && normalize(row.statement) === normalize(AUDIT_DENIAL);
}

// Lecture seule : aucune tentative de création ou de réparation au démarrage.
// La routine, installée par le compte de migration, lit les métadonnées avec
// ses droits ; le compte applicatif n'a besoin que d'EXECUTE sur cette routine.
export async function verifyAuditProtection(db) {
    try {
        if (db.getDialect() !== 'mysql') throw new Error('MySQL requis');
        const rows = await db.query(`CALL ${AUDIT_STATUS_ROUTINE}()`);
        for (const expected of AUDIT_TRIGGERS) {
            if (!validAuditTrigger(rows.find(row => row.name === expected.name), expected)) {
                throw new Error(`Protection ${expected.name} absente ou non conforme`);
            }
        }
    } catch (cause) {
        throw new Error('Protection du journal indisponible : exécuter npm run db:install avec le compte de migration, puis vérifier le droit EXECUTE sur la routine de contrôle.', { cause });
    }
}
