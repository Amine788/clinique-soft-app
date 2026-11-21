import { BillingPayment } from '../models/billingPayment.js';
import { cents, amount } from './money.js';
export const paymentInclude = { model: BillingPayment, as: 'paiements', attributes: ['id', 'montant', 'payeur', 'modePaiement', 'datePaiement', 'creeParUserId', 'reference'] };
export function billingDetails(f) {
    const data = f.toJSON ? f.toJSON() : f;
    const payments = data.paiements || [];
    const patientPaid = payments.filter(p => p.payeur === 'patient').reduce((s, p) => s + cents(p.montant), 0);
    const insurancePaid = payments.filter(p => p.payeur === 'assurance').reduce((s, p) => s + cents(p.montant), 0);
    const legacyPaid = data.statut === 'payee' && !payments.length && !data.creationKey;
    return { ...data, montantEncaisse: amount(patientPaid + insurancePaid),
        soldePatient: legacyPaid ? 0 : amount(Math.max(0, cents(data.resteACharge) - patientPaid)),
        soldeAssurance: legacyPaid ? 0 : amount(Math.max(0, cents(data.assuranceMontant) - insurancePaid)),
        encaissementHistorique: legacyPaid,
        lignes: (data.lignes || []).map(l => ({ ...l,
            designation: l.sourceType === 'medicament' ? 'Produits pharmaceutiques' : l.sourceType === 'examen' ? 'Acte technique' : l.designation })) };
}
