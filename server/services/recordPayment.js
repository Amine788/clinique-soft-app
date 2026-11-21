import crypto from 'node:crypto';
import { Op } from 'sequelize';
import sequelize, { Facture, LigneFacture, RendezVous, ExamenPatient, Hospitalisation } from '../models/index.js';
import { Prescription } from '../models/prescription.js';
import { BillingPayment } from '../models/billingPayment.js';
import { accessQuery, audit } from './patientAccess.js';
import { inClinic } from './tenant.js';
import { cents, amount, distribute, invoiceShares, financeError } from './money.js';
import { billingDetails } from './billingDetails.js';
export async function recordPayment(req) {
    const payer = req.body.payeur ?? 'patient';
    const mode = req.body.modePaiement ?? 'especes';
    if (!['patient', 'assurance'].includes(payer) || !['especes', 'carte', 'cheque', 'virement', 'mobile'].includes(mode)) throw financeError(400, 'Payeur ou mode de paiement invalide');
    const reference = req.body.reference ?? crypto.randomUUID();
    if (typeof reference !== 'string' || !/^[a-zA-Z0-9_-]{8,80}$/.test(reference)) throw financeError(400, 'Référence de paiement invalide');
    return sequelize.transaction(async transaction => {
        const invoice = await Facture.findOne(await accessQuery(req, Facture, { where: inClinic(req, { id: req.params.id }), transaction, lock: transaction.LOCK.UPDATE }));
        if (!invoice) throw financeError(404, 'Facture non trouvée');
        const lines = await LigneFacture.findAll({ where: { factureId: invoice.id }, transaction, order: [['id', 'ASC']] });
        const payments = await BillingPayment.findAll({ where: inClinic(req, { factureId: invoice.id }), transaction });
        const result = () => billingDetails({ ...invoice.toJSON(), lignes: lines.map(l => l.toJSON()), paiements: payments.map(p => p.toJSON()) });
        const duplicate = payments.find(p => p.reference === reference);
        if (duplicate) {
            if (duplicate.payeur !== payer || duplicate.modePaiement !== mode || (req.body.montant != null && cents(duplicate.montant) !== cents(req.body.montant))) throw financeError(409, 'Cette référence correspond à un autre paiement');
            return result();
        }
        if (invoice.statut === 'annulee') throw financeError(409, 'Une facture annulée ne peut pas être encaissée');
        if (invoice.statut === 'payee') throw financeError(400, 'Déjà payée');
        const payerPaid = payments.filter(p => p.payeur === payer).reduce((s, p) => s + cents(p.montant), 0);
        const due = cents(payer === 'patient' ? invoice.resteACharge : invoice.assuranceMontant) - payerPaid;
        const value = req.body.montant == null ? due : cents(req.body.montant);
        // Pas de paiement partiel : chaque payeur (patient, puis assurance) règle la totalité de sa part en une fois
        if (due > 0 && value !== due) throw financeError(409, `Pas de paiement partiel : la part ${payer === 'patient' ? 'du patient' : 'de l’assurance'} se règle en totalité (${amount(due).toFixed(2)} MAD)`);
        const totalPaid = payments.reduce((s, p) => s + cents(p.montant), 0);
        if (value > cents(invoice.total) - totalPaid) throw financeError(409, 'Montant supérieur au solde total de la facture');
        if (invoice.statut === 'partielle' && !payments.length && !invoice.creationKey) throw financeError(409, 'Les paiements historiques de cette facture doivent être vérifiés avant un nouvel encaissement');
        if (value <= 0 || value > due) throw financeError(409, 'Montant supérieur au solde du payeur ou solde déjà réglé');
        const shares = invoiceShares({ ...invoice.toJSON(), lignes: lines.map(l => l.toJSON()) });
        const previous = new Map();
        for (const p of payments) {
            const allocations = typeof p.repartition === 'string' ? JSON.parse(p.repartition) : p.repartition;
            for (const part of allocations) previous.set(part.lineId, (previous.get(part.lineId) || 0) + part.cents);
        }
        const capacities = shares.map(s => s.ttc - (previous.get(s.line.id) || 0));
        if (capacities.some(n => n < 0)) throw financeError(409, 'Répartition existante incohérente');
        const split = distribute(value, capacities);
        const repartition = shares.map((s, i) => ({ lineId: s.line.id, cents: split[i] }));
        const payment = await BillingPayment.create({ clinic_id: req.user.clinic_id, factureId: invoice.id,
            montant: amount(value), payeur: payer, modePaiement: mode, reference,
            creeParUserId: req.user.id, datePaiement: new Date(), repartition }, { transaction });
        payments.push(payment);
        const paid = payments.reduce((s, p) => s + cents(p.montant), 0);
        await invoice.update({ statut: paid === cents(invoice.total) ? 'payee' : 'partielle',
            modePaiement: mode, datePaiement: payment.datePaiement }, { transaction });
        // Compatibilité des anciennes factures non encore marquées à l'émission.
        for (const [type, Model, flag] of [['consultation', RendezVous, 'estFacture'], ['examen', ExamenPatient, 'estFacture'], ['chambre', Hospitalisation, 'estFacture'], ['medicament', Prescription, 'facturee']]) {
            const ids = lines.filter(l => l.sourceType === type && l.sourceId).map(l => l.sourceId);
            if (ids.length) await Model.update({ [flag]: true }, { where: inClinic(req, { id: { [Op.in]: ids }, ...(type === 'medicament' ? { patientCin: invoice.patientCin } : { patientId: invoice.patientId }) }), transaction });
        }
        await audit(req, 'billing.payment', { patientId: invoice.patientId, resourceType: 'payment', resourceId: payment.id });
        return result();
    });
}
