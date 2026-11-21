import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { resetDatabase, startServer, loadModels, seedClinic, createPatient, createHospitalisation, createRdv, client } from './helpers.js';

let server, m, A, B, stay, outside, service, colleague, accessModels;
const request = (user, method, path, body) => client(server.base, user)(method, path, body);
const patientPath = patient => `/api/patients/${patient.numeroDossier}`;

before(async () => {
    await resetDatabase();
    server = await startServer();
    m = await loadModels();
    accessModels = await import('../models/access.js');
    A = await seedClinic(m, 'NurseA');
    B = await seedClinic(m, 'NurseB');
    ({ hosp: stay } = await createHospitalisation(m, A));
    await createHospitalisation(m, B);
    colleague = await m.User.create({ clinic_id: A.clinic.id, matricule: 'NURSE-COLLEAGUE', nom: 'Collegue', prenom: 'Test', email: 'nurse-colleague@test.test', passwordHash: 'x', role: 'nurse', statut: 'actif' });
    const catalog = await m.ExamenCatalog.create({ code: 'NURSE-ACCESS', nom: 'Examen test', type: 'laboratoire', prixStandard: 10 });
    const resources = async (patient, label) => ({
        patient,
        rdv: await createRdv(m, { ...A, patient }, { statut: 'arrive' }),
        exam: await m.ExamenPatient.create({ clinic_id: A.clinic.id, patientId: patient.id, medecinId: A.medecin.id, examenId: catalog.id }),
        prescription: await m.Prescription.create({ clinic_id: A.clinic.id, patientCin: patient.cinNumero, medecinId: A.medecin.id, numero: `NURSE-${label}`, medicaments: '[{"id":1,"nom":"Test","timesPerDay":1}]', statut: 'remise', slots: '[]' }),
    });
    outside = await resources(await createPatient(m, A.clinic, A.users.secretary, 'NA123456'), 'OUTSIDE');
    service = await resources(await createPatient(m, A.clinic, A.users.secretary, 'NS123456'), 'SERVICE');
    await resources(A.patient, 'STAY');
});
after(async () => { await server?.stop(); await m?.sequelize.close(); });

test('Infirmier : aucun accès ambulatoire sans hospitalisation', async () => {
    for (const path of [patientPath(outside.patient), `/api/nurse/patient-by-dossier/${outside.patient.numeroDossier}`, `/api/nurse/scan/${outside.rdv.numeroRdv}`]) {
        assert.equal((await request(A.users.nurse, 'GET', path)).status, 404, path);
    }
    const history = await request(A.users.nurse, 'GET', `/api/nurse/vitals-history/${outside.patient.cinNumero}`);
    assert.equal(history.status, 200);
    assert.deepEqual(history.body, []);
    for (const path of ['/api/nurse/queue', '/api/nurse/medications', '/api/nurse/hospitalized', '/api/examens']) {
        const response = await request(A.users.nurse, 'GET', path);
        assert.equal(response.status, 200, JSON.stringify(response.body));
        assert.ok(!JSON.stringify(response.body).includes(outside.patient.cinNumero), path);
        assert.ok(!response.body.some(row => row.patientId === outside.patient.id), path);
    }
});

test('Infirmier : constantes, prélèvement, médicaments et alerte refusés hors périmètre, sans mutation', async () => {
    const calls = [
        ['POST', '/api/nurse/vitals', { rdvId: outside.rdv.numeroRdv, vitals: { pouls: 150 } }],
        ['POST', '/api/nurse/alert', { patientId: outside.patient.id, message: 'Observation test' }],
        ['PATCH', `/api/examens/${outside.exam.id}/statut`, { statut: 'preleve' }],
        ['POST', `/api/nurse/prescriptions/${outside.prescription.id}/deliver`, {}],
        ['POST', `/api/nurse/prescriptions/${outside.prescription.id}/advance`, { nextStatus: 'delivered' }],
        ['POST', `/api/nurse/prescriptions/${outside.prescription.id}/administer`, { itemId: 1, slotIndex: 0, done: true }],
    ];
    for (const [method, path, body] of calls) assert.equal((await request(A.users.nurse, method, path, body)).status, 404, path);
    await outside.rdv.reload(); await outside.exam.reload(); await outside.prescription.reload();
    assert.equal(outside.rdv.statut, 'arrive');
    assert.equal(outside.rdv.vitals, null);
    assert.equal(outside.exam.statut, 'en_attente');
    assert.equal(outside.prescription.statut, 'remise');
    assert.equal(outside.prescription.slots, '[]');
});

test('Infirmier : hospitalisé lisible dans sa clinique, écritures réservées au responsable', async () => {
    assert.equal((await request(A.users.nurse, 'GET', patientPath(A.patient))).status, 200);
    assert.equal((await request(colleague, 'GET', patientPath(A.patient))).status, 200);
    assert.equal((await request(B.users.nurse, 'GET', patientPath(A.patient))).status, 404);
    const count = await m.HospitalisationVital.count({ where: { hospitalisationId: stay.id } });
    assert.equal((await request(colleague, 'POST', `/api/hospitalisations/${stay.id}/vitals`, { temperature: '37' })).status, 404);
    assert.equal((await request(B.users.nurse, 'POST', `/api/hospitalisations/${stay.id}/vitals`, { temperature: '37' })).status, 404);
    assert.equal(await m.HospitalisationVital.count({ where: { hospitalisationId: stay.id } }), count);
    assert.equal((await request(A.users.nurse, 'POST', `/api/hospitalisations/${stay.id}/vitals`, { temperature: '37' })).status, 201);
    assert.equal(await m.HospitalisationVital.count({ where: { hospitalisationId: stay.id } }), count + 1);
    const rdv = await m.RendezVous.findOne({ where: { patientId: A.patient.id } });
    const exam = await m.ExamenPatient.findOne({ where: { patientId: A.patient.id } });
    const prescription = await m.Prescription.findOne({ where: { patientCin: A.patient.cinNumero, clinic_id: A.clinic.id } });
    for (const user of [colleague, B.users.nurse]) {
        for (const [method, path, body] of [
            ['POST', '/api/nurse/vitals', { rdvId: rdv.numeroRdv, vitals: { pouls: 150 } }],
            ['PATCH', `/api/examens/${exam.id}/statut`, { statut: 'preleve' }],
            ['POST', `/api/nurse/prescriptions/${prescription.id}/deliver`, {}],
            ['POST', `/api/nurse/prescriptions/${prescription.id}/administer`, { itemId: 1, slotIndex: 0, done: true }],
            ['POST', '/api/nurse/alert', { patientId: A.patient.id, message: 'Observation test' }],
            ['POST', `/api/hospitalisations/${stay.id}/alerts`, { typeAlerte: 'autre', description: 'Observation test' }],
            ['POST', `/api/hospitalisations/${stay.id}/soins`, { typeSoin: 'pansement' }],
        ]) assert.equal((await request(user, method, path, body)).status, 404, path);
    }
    assert.equal((await rdv.reload()).vitals, null);
    assert.equal((await exam.reload()).statut, 'en_attente');
    assert.equal((await prescription.reload()).slots, '[]');
    assert.equal(await m.HospitalisationAlerte.count({ where: { hospitalisationId: stay.id } }), 0);
    assert.equal(await m.HospitalisationSoin.count({ where: { hospitalisationId: stay.id } }), 0);
});

test('Infirmier : aucun accès par département ou service, même avec une ancienne affectation conservée', async () => {
    const base = '/api/patient-access';
    assert.equal((await request(A.users.nurse, 'GET', patientPath(service.patient))).status, 404);
    // Les routes d'affectation aux services n'existent plus
    assert.equal((await request(A.users.admin, 'POST', `${base}/nurse-services`, { userId: A.users.nurse.id, departmentId: 1 })).status, 404);
    const refused = await request(A.users.admin, 'POST', `${base}/assignments`, {
        patientId: service.patient.id, departmentId: 1, kind: 'service', startsAt: new Date(Date.now() - 60000), endsAt: new Date(Date.now() + 3600000), reason: 'Prise en charge du patient par le service de soins',
    });
    assert.equal(refused.status, 403, JSON.stringify(refused.body));
    // Une affectation « service » d'une ancienne base reste en base mais n'ouvre aucun accès
    const legacy = await accessModels.PatientAssignment.create({ clinic_id: A.clinic.id, patientId: service.patient.id, kind: 'service',
        startsAt: new Date(Date.now() - 60000), endsAt: new Date(Date.now() + 3600000), reason: 'Ancienne affectation de service', createdBy: A.users.admin.id });
    assert.equal((await request(A.users.nurse, 'GET', patientPath(service.patient))).status, 404);
    assert.equal((await request(A.users.nurse, 'POST', '/api/nurse/alert', { patientId: service.patient.id, message: 'Observation test' })).status, 404);
    assert.ok(await accessModels.PatientAssignment.findByPk(legacy.id));
});

test('Infirmier : sortie demandée reste accessible, séjour terminé devient inaccessible', async () => {
    await stay.update({ statut: 'sortie_demandee' });
    assert.equal((await request(A.users.nurse, 'GET', patientPath(A.patient))).status, 200);
    await stay.update({ statut: 'termine', dateSortie: new Date() });
    assert.equal((await request(A.users.nurse, 'GET', patientPath(A.patient))).status, 404);
    assert.equal((await request(A.users.nurse, 'POST', `/api/hospitalisations/${stay.id}/vitals`, { temperature: '37' })).status, 404);
    const meds = await request(A.users.nurse, 'GET', '/api/nurse/medications');
    assert.equal(meds.status, 200);
    assert.ok(!meds.body.some(row => row.patientId === A.patient.id));
});
