import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { resetDatabase, startServer, loadModels, seedClinic, client, createRdv } from './helpers.js';
import { cents, distribute } from '../services/money.js';
let server, m, A, B;
const req = (method, url, body, user) => client(server.base, user || A.users.admin)(method, url, body);
const manual = (extra = {}) => ({ sourceType: 'manuel', designation: 'Acte de test', quantite: 1, prixUnitaire: 100, ...extra });
const invoice = async (lines, extra = {}) => {
    const r = await req('POST', '/api/billing', { patientCin: A.patient.cinNumero, lignes: lines, ...extra });
    assert.equal(r.status, 201, JSON.stringify(r.body)); return r.body.facture;
};
before(async () => {
    await resetDatabase(); server = await startServer(); m = await loadModels();
    A = await seedClinic(m, 'FacturationA'); B = await seedClinic(m, 'FacturationB');
});
after(async () => { await server?.stop(); await m?.sequelize.close(); });

test('Clinique simple : plus aucune route de départements, de services ni de répartition', async () => {
    for (const [method, url] of [
        ['GET', '/api/clinic/departements'], ['POST', '/api/clinic/departements'], ['GET', '/api/clinic/organisation'],
        ['GET', '/api/clinic/workspace'], ['POST', '/api/clinic/services'], ['PUT', '/api/clinic/organisation/staff/' + A.users.secretary.id],
        ['GET', '/api/performance/departements'], ['PUT', '/api/admin/doctors/' + A.medecin.id + '/department'],
    ]) assert.equal((await req(method, url, method === 'GET' ? undefined : { nom: 'x', departmentIds: [1] })).status, 404, method + ' ' + url);
});
test('Clinique simple : un rendez-vous se crée sans département, un champ département envoyé est ignoré', async () => {
    const r = await req('POST', '/api/appointments', { patientCin: A.patient.cinNumero, doctorId: A.medecin.id, date: '2027-02-10', heure: '08:00', motif: 'Consultation de test', departmentId: 12345 });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    assert.ok(!Object.hasOwn(r.body, 'departmentId'));
    const list = await req('GET', '/api/appointments?date=2027-02-10&departmentId=12345', undefined, A.users.secretary);
    assert.equal(list.status, 200);
    assert.ok(list.body.some(rdv => rdv.id === r.body.id), 'filtre de département sans effet');
});
test('Facturation : lignes sans répartition, champs département/service/réalisateur ignorés', async () => {
    const f = await invoice([manual({ departmentId: 3, serviceId: 4, performedById: A.medecin.id })]);
    for (const key of ['departmentId', 'serviceId', 'performedById', 'departmentName', 'serviceName', 'doctorName', 'allocationKind']) {
        assert.ok(!Object.hasOwn(f.lignes[0], key), key);
    }
    assert.equal(cents(f.total), 10700);
});
test('Facturation : une consultation n’est facturée qu’une fois et disparaît des prestations à facturer', async () => {
    const rdv = await createRdv(m, A, { statut: 'termine' });
    await invoice([manual({ sourceType: 'consultation', sourceId: rdv.id })]);
    const again = await req('POST', '/api/billing', { patientCin: A.patient.cinNumero, lignes: [manual({ sourceType: 'consultation', sourceId: rdv.id })] });
    assert.equal(again.status, 409);
    const pending = await req('GET', '/api/billing/pending/' + A.patient.cinNumero);
    assert.ok(!pending.body.lignes.some(l => l.sourceType === 'consultation' && l.sourceId === rdv.id));
});
test('Facturation : deux requêtes concurrentes ne facturent pas deux fois la même prestation', async () => {
    const rdv = await createRdv(m, A, { statut: 'termine' });
    const body = { patientCin: A.patient.cinNumero, lignes: [manual({ sourceType: 'consultation', sourceId: rdv.id })] };
    const results = await Promise.all([req('POST', '/api/billing', body), req('POST', '/api/billing', body)]);
    assert.deepEqual(results.map(r => r.status).sort(), [201, 409]);
});
test('Facturation : clé idempotente pour les lignes manuelles, clé réutilisée avec un autre montant refusée', async () => {
    const body = { patientCin: A.patient.cinNumero, creationKey: 'manual-request-2026', lignes: [manual()] };
    const a = await req('POST', '/api/billing', body), b = await req('POST', '/api/billing', body);
    assert.equal(a.status, 201); assert.equal(b.status, 201); assert.equal(a.body.facture.id, b.body.facture.id);
    assert.equal((await req('POST', '/api/billing', { ...body, lignes: [manual({ prixUnitaire: 200 })] })).status, 409);
});
test('Paiements : pas de paiement partiel ; part patient puis part assurance, chacune en totalité, au centime', async () => {
    const f = await invoice([manual({ prixUnitaire: 0.01 }), manual({ prixUnitaire: 0.02 }), manual({ prixUnitaire: 100 })], { assuranceTaux: 80 });
    // Un montant inférieur à la part du payeur est refusé, sans rien enregistrer
    let r = await req('PATCH', '/api/billing/' + f.id + '/pay', { payeur: 'patient', montant: 1.01, reference: 'payment-partial-2026' });
    assert.equal(r.status, 409, JSON.stringify(r.body));
    assert.equal(await m.BillingPayment.count({ where: { factureId: f.id } }), 0);
    // Le montant exact de la part est accepté ; une nouvelle tentative avec la même référence ne crée pas de doublon
    r = await req('PATCH', '/api/billing/' + f.id + '/pay', { payeur: 'patient', montant: f.resteACharge, modePaiement: 'carte', reference: 'payment-one-2026' });
    assert.equal(r.status, 200, JSON.stringify(r.body)); assert.equal(r.body.statut, 'partielle'); assert.equal(r.body.facture.soldePatient, 0);
    const retry = await req('PATCH', '/api/billing/' + f.id + '/pay', { payeur: 'patient', montant: f.resteACharge, modePaiement: 'carte', reference: 'payment-one-2026' });
    assert.equal(retry.status, 200);
    assert.equal((await req('PATCH', '/api/billing/' + f.id + '/pay', { payeur: 'patient' })).status, 409, 'part patient déjà réglée');
    assert.equal((await req('PATCH', '/api/billing/' + f.id + '/pay', { payeur: 'assurance', montant: 1 })).status, 409, 'assurance partielle refusée');
    r = await req('PATCH', '/api/billing/' + f.id + '/pay', { payeur: 'assurance', modePaiement: 'virement' });
    assert.equal(r.status, 200); assert.equal(r.body.statut, 'payee');
    assert.equal(cents(r.body.facture.montantEncaisse), cents(f.total));
    const records = await m.BillingPayment.findAll({ where: { factureId: f.id } });
    assert.equal(records.length, 2);
    assert.deepEqual(records.map(p => [p.payeur, p.modePaiement]).sort(), [['assurance', 'virement'], ['patient', 'carte']]);
    const parts = records.flatMap(p => typeof p.repartition === 'string' ? JSON.parse(p.repartition) : p.repartition);
    assert.equal(parts.reduce((s, part) => s + part.cents, 0), cents(f.total));
    assert.ok(parts.every(part => Object.keys(part).sort().join() === 'cents,lineId'), 'répartition par ligne uniquement');
});
test('Paiements : trop-perçu, concurrence et accès interclinique refusés', async () => {
    const f = await invoice([manual()]);
    assert.equal((await req('PATCH', '/api/billing/' + f.id + '/pay', { montant: 108 })).status, 409);
    assert.equal((await req('PATCH', '/api/billing/' + f.id + '/pay', {}, B.users.admin)).status, 404);
    const results = await Promise.all([req('PATCH', '/api/billing/' + f.id + '/pay', { reference: 'pay-concurrent-one' }), req('PATCH', '/api/billing/' + f.id + '/pay', { reference: 'pay-concurrent-two' })]);
    assert.deepEqual(results.map(r => r.status).sort(), [200, 400]);
});
test('Montants : répartitions déterministes, bornées et exactes au centime', () => {
    for (let total = 0; total < 200; total++) {
        for (const weights of [[1, 1, 1], [1500, 1500, 900, 500, 500, 200], [0, 1, 20]]) {
            const parts = distribute(total, weights);
            assert.equal(parts.reduce((a, b) => a + b, 0), total);
            assert.ok(parts.every(Number.isSafeInteger)); assert.ok(parts.every(n => n >= 0));
        }
    }
});
test('Migration : relance de l’installation sans perte de factures, lignes ni paiements', async () => {
    const { installDatabase } = await import('../database/install.js');
    const counts = async () => [await m.Facture.count(), await m.LigneFacture.count(), await m.BillingPayment.count()];
    const beforeCounts = await counts();
    const saved = await m.BillingPayment.findAll({ order: [['id', 'ASC']] });
    await installDatabase(m.sequelize);
    assert.deepEqual(await counts(), beforeCounts);
    const afterPayments = await m.BillingPayment.findAll({ order: [['id', 'ASC']] });
    assert.deepEqual(afterPayments.map(p => p.repartition), saved.map(p => p.repartition));
});
test('Assurance à 100 % : aucun encaissement patient inventé', async () => {
    const f = await invoice([manual()], { assuranceTaux: 100 });
    assert.equal(f.soldePatient, 0);
    assert.equal((await req('PATCH', '/api/billing/' + f.id + '/pay', { payeur: 'patient' })).status, 409);
    const r = await req('PATCH', '/api/billing/' + f.id + '/pay', { payeur: 'assurance' });
    assert.equal(r.status, 200); assert.equal(r.body.statut, 'payee');
    assert.equal(r.body.facture.paiements[0].payeur, 'assurance');
    assert.equal(r.body.facture.montantEncaisse, 107);
});
test('Traçabilité : un compte ayant enregistré un paiement ne se supprime pas', async () => {
    const user = await m.User.create({ clinic_id: A.clinic.id, matricule: 'FACT-PAY-ONLY', nom: 'CAISSE', prenom: 'Test', email: 'fact-payment-only@test.test', passwordHash: 'x', role: 'secretary', statut: 'actif' });
    const f = await invoice([manual()]);
    assert.equal((await req('PATCH', '/api/billing/' + f.id + '/pay', {}, user)).status, 200);
    const r = await req('DELETE', '/api/admin/users/' + user.id);
    assert.equal(r.status, 409, JSON.stringify(r.body)); assert.ok(await m.User.findByPk(user.id));
});
test('Validation monétaire : pas de fraction de centime, de montant négatif ni de valeur non numérique', () => {
    for (const value of [0.001, 1.005, -1, 'NaN', true, [], {}]) assert.throws(() => cents(value));
    assert.equal(cents('99999999.99'), 9999999999); assert.equal(cents('0.01'), 1);
});
test('Finances : liste filtrée par médecin, assurance, patient, statut et période, sans fuite entre cliniques', async () => {
    const userDoc2 = await m.User.create({ clinic_id: A.clinic.id, matricule: 'FIN-DOC2', nom: 'CARDIO', prenom: 'Finance', email: 'fin-doc2@test.test', passwordHash: 'x', role: 'doctor', statut: 'actif' });
    const med2 = await m.Medecin.create({ clinic_id: A.clinic.id, userId: userDoc2.id, matricule: 'MED-FIN2', numeroOrdre: 'ORD-FIN2', specialites: ['Cardiologie'], dateDebut: '2020-01-01' });
    const p2 = await m.Patient.create({ clinic_id: A.clinic.id, cinNumero: 'FN998877', cinDateExpiration: '2030-01-01', numeroDossier: 'PAT-FIN-2', nom: 'ZAHIRI', prenom: 'Salma',
        dateNaissance: '1985-02-02', sexe: 'F', telephonePrincipal: '0611111111', creeParUserId: A.users.secretary.id, assuranceOrganisme: 'CNOPS', assuranceTaux: 80 });
    const rdv1 = await createRdv(m, A, { statut: 'termine' });
    const rdv2 = await m.RendezVous.create({ clinic_id: A.clinic.id, numeroRdv: 'RDV-FIN-2', patientId: p2.id, patientCin: p2.cinNumero, medecinId: med2.id, dateRdv: rdv1.dateRdv,
        heureDebut: '10:00', heureFin: '10:30', typeConsultation: 'premiere', motif: 'Test', statut: 'termine', creePar: A.users.secretary.id });
    const f1 = await invoice([manual({ sourceType: 'consultation', sourceId: rdv1.id })]);
    const r2 = await req('POST', '/api/billing', { patientCin: p2.cinNumero, assuranceTaux: 80, lignes: [manual({ sourceType: 'consultation', sourceId: rdv2.id })] });
    assert.equal(r2.status, 201, JSON.stringify(r2.body)); const f2 = r2.body.facture;
    const f3 = await invoice([manual({ designation: 'Certificat médical' })]);
    const ids = r => r.body.map(f => f.id);

    let r = await req('GET', '/api/billing?limit=500');
    assert.equal(r.status, 200);
    const l1 = r.body.find(f => f.id === f1.id), l2 = r.body.find(f => f.id === f2.id), l3 = r.body.find(f => f.id === f3.id);
    assert.equal(l1.medecinId, A.medecin.id); assert.ok(l1.medecinNom.includes('FinanceA') || l1.medecinNom.length > 0);
    assert.equal(l2.medecinId, med2.id); assert.equal(l2.insurance, 'CNOPS'); assert.equal(l2.patientNom, 'Salma ZAHIRI');
    assert.equal(l3.medecinId, null);

    r = await req('GET', '/api/billing?medecinId=' + med2.id);
    assert.deepEqual(ids(r), [f2.id]);
    r = await req('GET', '/api/billing?assurance=CNOPS&limit=500');
    assert.ok(ids(r).includes(f2.id) && !ids(r).includes(f1.id));
    r = await req('GET', '/api/billing?assurance=aucune&limit=500');
    assert.ok(!ids(r).includes(f2.id) && ids(r).includes(f1.id));
    r = await req('GET', '/api/billing?q=zahi');
    assert.deepEqual(ids(r), [f2.id]);
    r = await req('GET', '/api/billing?q=FN9988');
    assert.deepEqual(ids(r), [f2.id]);
    const today = (await import('../services/dates.js')).jourClinique();
    r = await req('GET', `/api/billing?from=${today}&to=${today}&statut=en_attente&limit=500`);
    assert.ok(ids(r).includes(f1.id) && r.body.every(f => f.statut === 'en_attente'));
    r = await req('GET', '/api/billing?from=2020-01-01&to=2020-01-31');
    assert.deepEqual(r.body, []);
    r = await req('GET', '/api/billing?limit=1');
    assert.equal(r.body.length, 1);
    r = await req('GET', '/api/billing?q=zahi', undefined, A.users.secretary);
    assert.equal(r.status, 200); assert.deepEqual(ids(r), [f2.id]);

    for (const bad of ['statut=nimporte', 'from=2026-02-31', 'from=2026-05-02&to=2026-05-01', 'limit=0', 'limit=501', 'medecinId=abc', 'q[]=x', 'assurance[a]=1'])
        assert.equal((await req('GET', '/api/billing?' + bad)).status, 400, bad);
    r = await req('GET', '/api/billing?q=zahi', undefined, B.users.admin);
    assert.deepEqual(r.body, []);
    r = await req('GET', '/api/billing?medecinId=' + med2.id, undefined, B.users.admin);
    assert.deepEqual(r.body, []);
    assert.equal((await req('GET', '/api/billing', undefined, A.users.doctor)).status, 403);
});
