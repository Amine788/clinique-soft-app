import { DataTypes as D } from 'sequelize';
// Ajouts uniquement : clé de création d'une facture, pour qu'une nouvelle tentative réseau ne crée pas de doublon.
export async function installBillingIdempotency(db) {
    const q = db.getQueryInterface();
    const tables = new Set((await q.showAllTables()).map(t => typeof t === 'string' ? t : t.tableName));
    if (!tables.has('factures')) return;
    const invoiceColumns = await q.describeTable('factures');
    for (const [name, type] of Object.entries({ creation_key: D.STRING(80), creation_fingerprint: D.STRING(64) })) {
        if (!invoiceColumns[name]) await q.addColumn('factures', name, { type, allowNull: true });
    }
    const indexes = await q.showIndex('factures');
    if (!indexes.some(i => i.name === 'invoice_creation_key')) await q.addIndex('factures', ['clinic_id', 'creation_key'], { name: 'invoice_creation_key', unique: true });
}
