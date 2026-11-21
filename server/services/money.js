export const financeError = (status, message) => Object.assign(new Error(message), { status });
export function cents(value) {
    const n = Number(value);
    if ((typeof value !== 'number' && typeof value !== 'string') || value === '' || !Number.isFinite(n) || n < 0 || n > 99999999.99) throw financeError(400, 'Montant invalide');
    if (Number(n.toFixed(2)) !== n) throw financeError(400, 'Montant à deux décimales requis');
    return Math.round((n + Number.EPSILON) * 100);
}
export const amount = value => value / 100;
// Plus forts restes : somme exacte, ordre stable et aucun centime perdu.
export function distribute(total, weights) {
    if (!Number.isSafeInteger(total) || total < 0 || weights.some(n => !Number.isSafeInteger(n) || n < 0)) throw financeError(400, 'Répartition invalide');
    const sum = weights.reduce((a, b) => a + b, 0);
    if (!sum) {
        if (total) throw financeError(409, 'Montant sans lignes à répartir');
        return weights.map(() => 0);
    }
    const divisor = BigInt(sum);
    const parts = weights.map((w, index) => {
        const product = BigInt(total) * BigInt(w);
        return { index, value: Number(product / divisor), remainder: product % divisor };
    });
    let remaining = total - parts.reduce((s, p) => s + p.value, 0);
    const ranked = [...parts].sort((a, b) => a.remainder === b.remainder ? a.index - b.index : a.remainder > b.remainder ? -1 : 1);
    for (const p of ranked) { if (!remaining) break; parts[p.index].value++; remaining--; }
    return parts.map(p => p.value);
}
export function invoiceShares(invoice) {
    const original = [...(invoice.lignes || [])].sort((a, b) => a.id - b.id);
    const usable = original.length && (original.some(l => cents(l.montantTotal) > 0) || cents(invoice.total) === 0);
    const lines = usable ? original : [{ id: null, montantTotal: invoice.total, designation: 'Facture historique sans ventilation exploitable' }];
    const weights = lines.map(l => cents(l.montantTotal));
    const ht = distribute(cents(invoice.sousTotal), weights);
    const tax = distribute(cents(invoice.tva), weights);
    const ttc = distribute(cents(invoice.total), weights);
    return lines.map((line, i) => ({ line, ht: ht[i], tva: tax[i], ttc: ttc[i] }));
}
