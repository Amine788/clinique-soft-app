import crypto from 'node:crypto';
import { Op } from 'sequelize';
import sequelize, { Patient, Facture, LigneFacture, RendezVous, ExamenPatient, Hospitalisation } from '../models/index.js';
import { Prescription } from '../models/prescription.js';
import { BillingPayment } from '../models/billingPayment.js';
import { accessQuery, audit } from './patientAccess.js';
import { inClinic } from './tenant.js';
import { cents, amount, financeError } from './money.js';
import { billingDetails } from './billingDetails.js';
const sources = { consultation: RendezVous, medicament: Prescription, examen: ExamenPatient, chambre: Hospitalisation };
export async function createInvoice(req) {
    const { patientCin, rdvId, lignes, notes } = req.body;
    const rawRate = req.body.assuranceTaux ?? 0;
    if (!['string', 'number'].includes(typeof rawRate)) throw financeError(400, 'Taux assurance invalide');
    const rate = Number(rawRate);
    if (typeof patientCin !== 'string' || !patientCin.trim() || !Array.isArray(lignes) || !lignes.length || lignes.length > 500) throw financeError(400, 'CIN patient et lignes valides requis');
    if (!Number.isInteger(rate) || rate < 0 || rate > 100) throw financeError(400, 'Taux assurance invalide (0 à 100)');
    if (notes != null && (typeof notes !== 'string' || notes.length > 4000)) throw financeError(400, 'Notes invalides');
    const key = req.body.creationKey ?? crypto.randomUUID();
    if (typeof key !== 'string' || !/^[a-zA-Z0-9_-]{8,80}$/.test(key)) throw financeError(400, 'Référence de création invalide');
    const fingerprint = crypto.createHash('sha256').update(JSON.stringify({ patientCin: patientCin.trim().toUpperCase(), rdvId, lignes, rate, notes })).digest('hex');
    return sequelize.transaction(async transaction => {
        const patient = await Patient.findOne(await accessQuery(req, Patient, { where: inClinic(req, { cinNumero: patientCin.trim().toUpperCase() }), transaction, lock: transaction.LOCK.UPDATE }));
        if (!patient) throw financeError(404, 'Patient non trouvé');
        const existing = await Facture.findOne({ where: inClinic(req, { creationKey: key }), include: [{ model: LigneFacture, as: 'lignes' }, { model: BillingPayment, as: 'paiements' }], transaction });
        if (existing) {
            if (existing.creationFingerprint !== fingerprint) throw financeError(409, 'Cette référence de création a déjà été utilisée pour une autre facture');
            return billingDetails(existing);
        }
        const visit = rdvId ? await RendezVous.findOne({ where: inClinic(req, { id: rdvId, patientId: patient.id }), transaction }) : null;
        if (rdvId && !visit) throw financeError(404, 'Rendez-vous non trouvé');
        const data = [], reserved = new Map();
        let subtotal = 0;
        for (const line of lignes) {
            if (!line || typeof line !== 'object') throw financeError(400, 'Ligne invalide');
            const type = ['autre', 'manual'].includes(line.sourceType) ? 'manuel' : line.sourceType || 'manuel';
            if (!['manuel', ...Object.keys(sources)].includes(type)) throw financeError(400, 'Type de prestation invalide');
            const quantity = Number(line.quantite), price = cents(line.prixUnitaire);
            if (!Number.isFinite(quantity) || quantity <= 0 || Math.abs(quantity * 100 - Math.round(quantity * 100)) > 0.000001) throw financeError(400, 'Quantité positive à deux décimales requise');
            const quantityUnits = cents(line.quantite);
            const lineAmount = Number((BigInt(quantityUnits) * BigInt(price) + 50n) / 100n);
            if (lineAmount > 9999999999 || subtotal + lineAmount > 9345794392) throw financeError(400, 'Montant de facture trop élevé');
            let source = null;
            if (sources[type]) {
                if (!Number.isSafeInteger(line.sourceId) || line.sourceId < 1) throw financeError(400, 'Référence de prestation invalide');
                source = await sources[type].findOne({ where: inClinic(req, { id: line.sourceId, ...(type === 'medicament' ? { patientCin: patient.cinNumero } : { patientId: patient.id }) }), transaction, lock: transaction.LOCK.UPDATE });
                if (!source) throw financeError(404, 'Source de facturation non trouvée pour ce patient');
                const sourceKey = type + ':' + source.id;
                if (reserved.has(sourceKey) && type !== 'medicament') throw financeError(409, 'La même prestation apparaît plusieurs fois');
                if (!reserved.has(sourceKey)) {
                    const billed = await LigneFacture.findOne({ where: { sourceType: type, sourceId: source.id }, include: [{ model: Facture, required: true, where: inClinic(req, { statut: { [Op.ne]: 'annulee' } }) }], transaction });
                    if (billed) throw financeError(409, 'Cette prestation figure déjà sur une facture non annulée');
                    reserved.set(sourceKey, { source, type });
                }
            } else if (line.sourceId != null) throw financeError(400, 'Référence de facturation invalide');
            if (typeof line.designation !== 'string' || !line.designation.trim() || line.designation.length > 200) throw financeError(400, 'Désignation requise (200 caractères maximum)');
            data.push({ sourceType: type, sourceId: source?.id ?? null,
                designation: type === 'medicament' ? 'Produits pharmaceutiques' : type === 'examen' ? 'Acte technique' : line.designation.trim(),
                quantite: quantity, prixUnitaire: amount(price), montantTotal: amount(lineAmount) });
            subtotal += lineAmount;
        }
        const tax = Math.round(subtotal * 7 / 100), total = subtotal + tax;
        const insurance = Math.round(total * rate / 100);
        const invoice = await Facture.create({ clinic_id: req.user.clinic_id, numero: 'FC-' + crypto.randomUUID().replaceAll('-', '').slice(0, 16),
            patientCin: patient.cinNumero, patientId: patient.id, rdvId: visit?.id ?? null,
            sousTotal: amount(subtotal), tva: amount(tax), total: amount(total), assuranceTaux: rate,
            assuranceMontant: amount(insurance), resteACharge: amount(total - insurance), notes,
            statut: total === 0 ? 'payee' : 'en_attente', creationKey: key, creationFingerprint: fingerprint, creeParUserId: req.user.id }, { transaction });
        const lines = await LigneFacture.bulkCreate(data.map(line => ({ ...line, factureId: invoice.id })), { transaction });
        // Facturé dès l'émission, indépendamment du règlement.
        for (const { source, type } of reserved.values()) await source.update(type === 'medicament' ? { facturee: true } : { estFacture: true }, { transaction });
        await audit(req, 'billing.create', { patientId: patient.id, resourceType: 'invoice', resourceId: invoice.id });
        return billingDetails({ ...invoice.toJSON(), lignes: lines.map(l => l.toJSON()), paiements: [] });
    }).catch(error => { if (error.name === 'SequelizeUniqueConstraintError') throw financeError(409, 'Référence de facture déjà utilisée'); throw error; });
}
