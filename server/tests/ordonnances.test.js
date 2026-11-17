// B6 (nombre de prises), B13 (ordonnances par clinique), B14/P4/B19 (ordonnance d'hospitalisation)
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { resetDatabase, startServer, loadModels, seedClinic, createHospitalisation, client } from './helpers.js';

let server, m, A, B;

before(async () => {
    await resetDatabase();
    server = await startServer();
    m = await loadModels();
    A = await seedClinic(m, 'A');
    B = await seedClinic(m, 'B'); // même CIN de patient que A (AB123456)
});
after(async () => {
    await server?.stop();
    await m?.sequelize.close();
});

const prescrire = (ctx, medicaments) =>
    client(server.base, ctx.users.doctor)('POST', '/api/prescriptions', { patientCin: ctx.patient.cinNumero, medicaments });

test('B6 : chaque fréquence proposée donne le bon nombre de créneaux à la remise', async () => {
    const attendu = { '1 fois/jour': 1, '2 fois/jour': 2, '3 fois/jour': 3, '4 fois/jour': 4, 'Matin et soir': 2, 'Au besoin': 1 };
    const medicaments = Object.keys(attendu).map(f => ({ nom: `Med ${f}`, posologie: '1 cp', frequence: f }));
    const r = await prescrire(A, medicaments);
    assert.equal(r.status, 201, JSON.stringify(r.body));

    // Circuit de la pharmacie : préparée puis remise (le saut direct est refusé)
    const pharma = client(server.base, A.users.pharmacist);
    assert.equal((await pharma('PATCH', `/api/prescriptions/${r.body.ordonnance.id}/status`, { statut: 'preparee' })).status, 200);
    const remise = await pharma('PATCH', `/api/prescriptions/${r.body.ordonnance.id}/status`, { statut: 'remise' });
    assert.equal(remise.status, 200, JSON.stringify(remise.body));

    const p = await m.Prescription.findByPk(r.body.ordonnance.id);
    const stockes = JSON.parse(p.medicaments);
    const slots = JSON.parse(p.slots);
    stockes.forEach((med, i) => {
        assert.equal(med.timesPerDay, attendu[medicaments[i].frequence], med.frequence);
        assert.equal(slots.filter(s => s.itemId === med.id).length, attendu[medicaments[i].frequence], med.frequence);
    });
    assert.deepEqual(slots.filter(s => s.itemId === stockes[3].id).map(s => s.time), ['08:00', '12:00', '16:00', '20:00']);
});

test('B6 : une fréquence non reconnue est refusée', async () => {
    const r = await prescrire(A, [{ nom: 'X', frequence: 'toutes les 8h' }]);
    assert.equal(r.status, 400);
    assert.match(r.body.error, /Fréquence non reconnue/);
});

test('P4 : les anciens champs sont normalisés à l’écriture', async () => {
    const r = await prescrire(A, [{ med: 'Amoxicilline', dosage: '500 mg', timesPerDay: 2 }]);
    assert.equal(r.status, 201, JSON.stringify(r.body));
    const p = await m.Prescription.findByPk(r.body.ordonnance.id);
    const [med] = JSON.parse(p.medicaments);
    assert.equal(med.nom, 'Amoxicilline');
    assert.equal(med.posologie, '500 mg');
    assert.equal(med.frequence, '2 fois/jour');
});

test('B13 : une clinique ne voit ni ne modifie les ordonnances d’une autre', async () => {
    const r = await prescrire(A, [{ nom: 'Secret A', frequence: '1 fois/jour' }]);
    const idA = r.body.ordonnance.id;
    assert.equal((await m.Prescription.findByPk(idA)).clinic_id, A.clinic.id);

    const listeB = await client(server.base, B.users.pharmacist)('GET', '/api/prescriptions');
    assert.equal(listeB.status, 200);
    assert.ok(!listeB.body.some(p => p.id === idA), 'ordonnance de A visible par B');

    const listeA = await client(server.base, A.users.pharmacist)('GET', '/api/prescriptions');
    assert.ok(listeA.body.some(p => p.id === idA));

    assert.equal((await client(server.base, B.users.admin)('GET', `/api/prescriptions/${idA}`)).status, 403);
    assert.equal((await client(server.base, B.users.pharmacist)('GET', `/api/prescriptions/${idA}`)).status, 404);
    assert.equal((await client(server.base, B.users.pharmacist)('PATCH', `/api/prescriptions/${idA}/status`, { statut: 'preparee' })).status, 404);
    assert.equal((await client(server.base, B.users.nurse)('POST', `/api/nurse/prescriptions/${idA}/deliver`)).status, 404);
    assert.equal((await m.Prescription.findByPk(idA)).statut, 'en_attente');

    const medsB = await client(server.base, B.users.nurse)('GET', '/api/nurse/medications');
    assert.ok(!medsB.body.some(p => p.id === idA));
});

test('B14/B19 : le traitement d’hospitalisation a sa propre ordonnance et n’écrase rien', async () => {
    // Ordonnance de consultation en attente en pharmacie, dans A et (même CIN) dans B
    const consultA = (await prescrire(A, [{ nom: 'Consultation A', frequence: '1 fois/jour' }])).body.ordonnance.id;
    const consultB = (await prescrire(B, [{ nom: 'Consultation B', frequence: '1 fois/jour' }])).body.ordonnance.id;
    const { hosp } = await createHospitalisation(m, A);
    const doc = client(server.base, A.users.doctor);

    const put = await doc('PUT', `/api/hospitalisations/${hosp.id}/treatment`, {
        medicaments: [{ id: 11, med: 'Ceftriaxone', dose: '1 g', timesPerDay: 2, moment: 'Matin' }],
    });
    assert.equal(put.status, 200, JSON.stringify(put.body));

    for (const [id, nom] of [[consultA, 'Consultation A'], [consultB, 'Consultation B']]) {
        const p = await m.Prescription.findByPk(id);
        assert.equal(JSON.parse(p.medicaments)[0].nom, nom, 'ordonnance de consultation écrasée');
    }

    const traitement = await m.Prescription.findOne({ where: { hospitalisationId: hosp.id } });
    assert.ok(traitement, 'ordonnance d’hospitalisation absente');
    assert.equal(traitement.clinic_id, A.clinic.id);
    const [med] = JSON.parse(traitement.medicaments);
    assert.equal(med.nom, 'Ceftriaxone');
    assert.equal(med.posologie, '1 g');

    const detail = await doc('GET', `/api/hospitalisations/${hosp.id}`);
    assert.equal(detail.body.activePrescription.id, traitement.id);
    assert.equal(detail.body.activePrescription.medicaments[0].nom, 'Ceftriaxone');

    // La facturation administrative conserve quantités et montants sans exposer
    // le traitement médical à la secrétaire.
    const pending = await client(server.base, A.users.secretary)('GET', `/api/billing/pending/${A.patient.cinNumero}`);
    assert.equal(pending.status, 200, JSON.stringify(pending.body));
    const lignes = pending.body.lignes || pending.body.lignesPending || [];
    const ligne = lignes.find(l => l.sourceType === 'medicament' && l.sourceId === traitement.id);
    assert.ok(ligne, JSON.stringify(lignes));
    assert.equal(ligne.designation, 'Produits pharmaceutiques');
    assert.ok(Number(ligne.quantite) > 0);
    assert.ok(Number.isFinite(Number(ligne.prixUnitaire)));
    assert.ok(!JSON.stringify(pending.body).includes('Ceftriaxone'));
    assert.ok(!lignes.some(l => /undefined/.test(l.designation)));
});

test('B14 : modifier le traitement conserve les prises déjà validées', async () => {
    const { hosp } = await createHospitalisation(m, A, { numero: '102' });
    const doc = client(server.base, A.users.doctor);
    await doc('PUT', `/api/hospitalisations/${hosp.id}/treatment`, { medicaments: [{ id: 1, nom: 'Para', timesPerDay: 2 }] });
    const p = await m.Prescription.findOne({ where: { hospitalisationId: hosp.id } });
    const slots = JSON.parse(p.slots);
    slots[0].done = true;
    slots[0].doneBy = 'Inf. Test';
    await p.update({ slots: JSON.stringify(slots) });

    await doc('PUT', `/api/hospitalisations/${hosp.id}/treatment`, {
        medicaments: [{ id: 1, nom: 'Para', timesPerDay: 2 }, { id: 2, nom: 'Ibu', timesPerDay: 1 }],
    });
    await p.reload();
    const apres = JSON.parse(p.slots);
    assert.equal(apres.length, 3);
    const matin = apres.find(s => s.itemId === 1 && s.time === '08:00');
    assert.equal(matin.done, true);
    assert.equal(matin.doneBy, 'Inf. Test');
    assert.equal(await m.Prescription.count({ where: { hospitalisationId: hosp.id } }), 1);
});

test('B14 : un traitement sans nom ou avec une fréquence inconnue est refusé', async () => {
    const { hosp } = await createHospitalisation(m, A, { numero: '103' });
    const doc = client(server.base, A.users.doctor);
    assert.equal((await doc('PUT', `/api/hospitalisations/${hosp.id}/treatment`, { medicaments: [{ timesPerDay: 2 }] })).status, 400);
    assert.equal((await doc('PUT', `/api/hospitalisations/${hosp.id}/treatment`, { medicaments: [{ nom: 'X', timesPerDay: 7 }] })).status, 400);
});

test('B14 : un ancien traitement { med, dose } est repris, une ordonnance du dossier sans RDV jamais', async () => {
    const { hosp } = await createHospitalisation(m, A, { numero: '104' });
    const ancien = await m.Prescription.create({
        numero: 'ORD-ANCIEN-1', clinic_id: A.clinic.id, patientCin: A.patient.cinNumero, medecinId: A.medecin.id,
        medicaments: JSON.stringify([{ id: 1, med: 'Ancien traitement', dose: '1 cp', timesPerDay: 1, moment: 'Matin' }]),
        statut: 'remise', slots: '[]',
    });
    // Ordonnance faite depuis le dossier patient pendant le séjour : sans RDV, même médecin
    const dossier = (await prescrire(A, [{ nom: 'Ordonnance du dossier', frequence: '1 fois/jour' }])).body.ordonnance.id;
    await m.Prescription.update({ statut: 'remise' }, { where: { id: dossier } });

    const doc = client(server.base, A.users.doctor);
    const detail = await doc('GET', `/api/hospitalisations/${hosp.id}`);
    assert.equal(detail.body.activePrescription?.id, ancien.id);
    assert.equal(detail.body.activePrescription.medicaments[0].nom, 'Ancien traitement');

    await doc('PUT', `/api/hospitalisations/${hosp.id}/treatment`, { medicaments: [{ id: 1, nom: 'Nouveau traitement', timesPerDay: 2 }] });
    await ancien.reload();
    assert.equal(ancien.hospitalisationId, hosp.id);
    assert.equal(JSON.parse(ancien.medicaments)[0].nom, 'Nouveau traitement');
    assert.equal(JSON.parse((await m.Prescription.findByPk(dossier)).medicaments)[0].nom, 'Ordonnance du dossier');
});

test('B14 : sans ancien traitement, une ordonnance du dossier sans RDV n’est jamais prise pour le traitement', async () => {
    const { hosp } = await createHospitalisation(m, A, { numero: '105' });
    const dossier = (await prescrire(A, [{ nom: 'Dossier seul', frequence: '2 fois/jour' }])).body.ordonnance.id;
    await m.Prescription.update({ statut: 'remise' }, { where: { id: dossier } });
    const doc = client(server.base, A.users.doctor);
    assert.equal((await doc('GET', `/api/hospitalisations/${hosp.id}`)).body.activePrescription, null);
    await doc('PUT', `/api/hospitalisations/${hosp.id}/treatment`, { medicaments: [{ id: 1, nom: 'Traitement', timesPerDay: 1 }] });
    assert.equal(JSON.parse((await m.Prescription.findByPk(dossier)).medicaments)[0].nom, 'Dossier seul');
});

test('C3 : seul le médecin prescrit, et toujours en son nom', async () => {
    const corps = medecinId => ({ patientCin: A.patient.cinNumero, medicaments: [{ nom: 'Doli', frequence: '1 fois/jour' }], medecinId });

    // Secrétaire, infirmier, admin, pharmacien : refusés, même en désignant un médecin
    for (const role of ['secretary', 'nurse', 'admin', 'pharmacist']) {
        const r = await client(server.base, A.users[role])('POST', '/api/prescriptions', corps(A.medecin.id));
        assert.equal(r.status, 403, `${role} : ${JSON.stringify(r.body)}`);
    }

    // Un médecin qui désigne un autre médecin prescrit quand même en son propre nom
    const autre = await m.Medecin.create({
        clinic_id: A.clinic.id, userId: A.users.admin.id, matricule: 'MED-C3', numeroOrdre: 'ORD-C3',
        specialites: ['Médecine générale'], dateDebut: '2020-01-01',
    });
    const ok = await client(server.base, A.users.doctor)('POST', '/api/prescriptions', corps(autre.id));
    assert.equal(ok.status, 201, JSON.stringify(ok.body));
    assert.equal((await m.Prescription.findByPk(ok.body.ordonnance.id)).medecinId, A.medecin.id);

    const parMedecin = await prescrire(B, [{ nom: 'Doli', frequence: '1 fois/jour' }]);
    assert.equal(parMedecin.status, 201);
    const p = await m.Prescription.findByPk(parMedecin.body.ordonnance.id);
    assert.equal(p.medecinId, B.medecin.id);
    assert.equal(p.clinic_id, B.clinic.id);
});
