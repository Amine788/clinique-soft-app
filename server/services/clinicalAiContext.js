import { Op } from 'sequelize';
import { Patient, DossierMedical, ProduitPharmacie } from '../models/index.js';
import { accessQuery } from './patientAccess.js';
import { getDoctorChatPrompt, getSecretaryChatPrompt, getPharmacistChatPrompt } from './promptTemplates.js';

export async function patientSummary(req, id) {
    const p = await Patient.findOne(await accessQuery(req, Patient, { where: { [Op.or]: [{ id: /^\d+$/.test(String(id)) ? Number(id) : 0 }, { numeroDossier: String(id) }] }, include: [{ model: DossierMedical }] }));
    if (!p) return null;
    return { age: new Date().getFullYear() - Number(p.dateNaissance.slice(0,4)), sexe: p.sexe,
        groupeSanguin: p.DossierMedical?.groupeSanguin, allergies: p.DossierMedical?.allergies, maladiesChroniques: p.DossierMedical?.maladiesChroniques };
}
export async function chatPrompt(req, context = {}) {
    if (context.patientId && req.user.role !== 'doctor') throw Object.assign(new Error('Contexte patient réservé au médecin rattaché'), { status: 403 });
    if (req.user.role === 'doctor') {
        const data = context.patientId ? await patientSummary(req, context.patientId) : null;
        if (context.patientId && !data) throw Object.assign(new Error('Patient non trouvé'), { status: 404 });
        return getDoctorChatPrompt(req.user.name, null, data ? JSON.stringify(data) : null);
    }
    if (req.user.role === 'pharmacist') {
        const products = await ProduitPharmacie.findAll({ where: { clinic_id: req.user.clinic_id }, attributes: ['nomCommercial', 'stockActuel', 'stockMinimum'] });
        return getPharmacistChatPrompt(req.user.name, products.filter(p=>p.stockActuel<p.stockMinimum).map(p=>`${p.nomCommercial}: ${p.stockActuel}`).join('\n'));
    }
    return getSecretaryChatPrompt(req.user.name, null);
}
