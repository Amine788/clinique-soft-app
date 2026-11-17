// B18 (accès par id limités à la clinique), B7 (vraie chambre), B16 (constantes d'hospitalisation)
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { resetDatabase, startServer, loadModels, seedClinic, createHospitalisation, createPatient, client } from './helpers.js';

let server, m, A, B, hospA, chambreA;

before(async () => {
    await resetDatabase();
    server = await startServer();
    m = await loadModels();
    A = await seedClinic(m, 'A');
    B = await seedClinic(m, 'B');
    ({ hosp: hospA, chambre: chambreA } = await createHospitalisation(m, A, { numero: '201', lit: 'B' }));
});
after(async () => {
    await server?.stop();
    await m?.sequelize.close();
});

test('B18 : une autre clinique reçoit 404 sur chaque accès par id', async () => {
    const docB = client(server.base, B.users.doctor);
    const nurseB = client(server.base, B.users.nurse);
    const secB = client(server.base, B.users.secretary);
    const id = hospA.id;

    const appels = [
        await docB('GET', `/api/hospitalisations/${id}`),
        await docB('PUT', `/api/hospitalisations/${id}/treatment`, { etat: 'critique' }),
        await docB('PUT', `/api/hospitalisations/${id}/discharge`, {}),
        await nurseB('POST', `/api/hospitalisations/${id}/vitals`, { temperature: '37' }),
        await nurseB('POST', `/api/hospitalisations/${id}/alerts`, { typeAlerte: 'autre', description: 'x' }),
        await nurseB('POST', `/api/hospitalisations/${id}/soins`, { typeSoin: 'pansement' }),
        await secB('PUT', `/api/hospitalisations/${id}/close`, {}),
        await secB('PUT', `/api/hospitalisations/chambres/${chambreA.id}/clean`, {}),
    ];
    appels.forEach((r, i) => assert.equal(r.status, 404, `appel ${i} : ${r.status} ${JSON.stringify(r.body)}`));

    await hospA.reload();
    assert.equal(hospA.etat, 'stable');
    assert.equal(hospA.statut, 'admis');
    assert.equal(await m.HospitalisationVital.count({ where: { hospitalisationId: id } }), 0);
    await chambreA.reload();
    assert.equal(chambreA.statut, 'occupee');
});

test('B18 : la résolution d’alerte vérifie la clinique de l’hospitalisation', async () => {
    const alerte = await m.HospitalisationAlerte.create({
        hospitalisationId: hospA.id, typeAlerte: 'temperature', description: 'Fièvre', urgency: 'urgent', statut: 'active',
    });
    assert.equal((await client(server.base, B.users.doctor)('PUT', `/api/hospitalisations/alertes/${alerte.id}/resolve`)).status, 404);
    await alerte.reload();
    assert.equal(alerte.statut, 'active');

    assert.equal((await client(server.base, A.users.doctor)('PUT', `/api/hospitalisations/alertes/${alerte.id}/resolve`)).status, 200);
    await alerte.reload();
    assert.equal(alerte.statut, 'resolue');
});

test('B18 : la clinique propriétaire garde l’accès ; le détail est fermé aux autres rôles', async () => {
    const r = await client(server.base, A.users.doctor)('GET', `/api/hospitalisations/${hospA.id}`);
    assert.equal(r.status, 200);
    assert.equal(r.body.id, hospA.id);
    assert.equal((await client(server.base, A.users.nurse)('GET', `/api/hospitalisations/${hospA.id}`)).status, 200);
    assert.equal((await client(server.base, A.users.pharmacist)('GET', `/api/hospitalisations/${hospA.id}`)).status, 403);
});

test('B18 : création et admission refusent un patient, une chambre ou un infirmier d’une autre clinique', async () => {
    const creer = await client(server.base, B.users.doctor)('POST', '/api/hospitalisations', { patientId: A.patient.id, diagnostic: 'x' });
    assert.equal(creer.status, 404);

    const autre = await createPatient(m, A.clinic, A.users.secretary, 'EF111111');
    const demande = await m.Hospitalisation.create({
        clinic_id: A.clinic.id, patientId: autre.id, medecinId: A.medecin.id, statut: 'demande',
    });
    const secA = client(server.base, A.users.secretary);
    const chambreB = await m.Chambre.create({ clinic_id: B.clinic.id, numero: '901', typeChambre: 'privee', nbLits: 1 });
    const chambreLibreA = await m.Chambre.create({ clinic_id: A.clinic.id, numero: '202', typeChambre: 'privee', nbLits: 1 });

    assert.equal((await secA('PUT', `/api/hospitalisations/${demande.id}/admit`, { chambreId: chambreB.id, nurseId: A.users.nurse.id })).status, 404);
    assert.equal((await secA('PUT', `/api/hospitalisations/${demande.id}/admit`, { chambreId: chambreLibreA.id, nurseId: B.users.nurse.id })).status, 404);
    await chambreB.reload();
    assert.equal(chambreB.statut, 'disponible');

    const ok = await secA('PUT', `/api/hospitalisations/${demande.id}/admit`, { chambreId: chambreLibreA.id, nurseId: A.users.nurse.id, lit: 'A' });
    assert.equal(ok.status, 200, JSON.stringify(ok.body));
});

test('B7 : médicaments infirmiers limités aux hospitalisés ; ambulatoires visibles en pharmacie', async () => {
    const doc = client(server.base, A.users.doctor);
    await doc('PUT', `/api/hospitalisations/${hospA.id}/treatment`, { medicaments: [{ id: 1, nom: 'Para', timesPerDay: 1 }] });

    const ambulatoire = await createPatient(m, A.clinic, A.users.secretary, 'CD654321');
    await ambulatoire.update({ medecinTraitantId: A.users.doctor.id });
    assert.equal((await doc('POST', '/api/prescriptions', { patientCin: ambulatoire.cinNumero, medicaments: [{ nom: 'Ibu', frequence: '1 fois/jour' }] })).status, 201);

    const r = await client(server.base, A.users.nurse)('GET', '/api/nurse/medications');
    assert.equal(r.status, 200, JSON.stringify(r.body));
    const hospitalise = r.body.find(p => p.patientId === A.patient.id);
    const externe = r.body.find(p => p.patientId === ambulatoire.id);
    assert.equal(hospitalise.room, 'Chambre 201 · lit B');
    assert.equal(hospitalise.hospitalisationId, hospA.id);
    assert.equal(externe, undefined, 'patient ambulatoire exposé à l’infirmier sans affectation');
    const pharmacy = await client(server.base, A.users.pharmacist)('GET', '/api/nurse/medications');
    assert.equal(pharmacy.status, 200);
    const externePharmacie = pharmacy.body.find(p => p.patientId === ambulatoire.id);
    assert.ok(externePharmacie);
    assert.equal(externePharmacie.room, null);
    assert.equal(externePharmacie.hospitalisationId, null);
    assert.equal(hospitalise.age, new Date().getFullYear() - 1980);
});

test('B16 : les constantes d’un patient hospitalisé sont enregistrées et analysées', async () => {
    const r = await client(server.base, A.users.nurse)('POST', `/api/hospitalisations/${hospA.id}/vitals`, {
        tension: '12/8', pouls: '130', temperature: '39.2', saturation: '97',
    });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    assert.equal(r.body.alertsGenerated, 2, JSON.stringify(r.body)); // pouls et température ; 12/8 est normal
    const vital = await m.HospitalisationVital.findOne({ where: { hospitalisationId: hospA.id } });
    assert.equal(vital.temperature, '39.2');
});

test('P15 : chaque anomalie a son propre type d’alerte ; une tension en cmHg normale n’alerte pas', async () => {
    const { hosp } = await createHospitalisation(m, A, { numero: '301', patient: await createPatient(m, A.clinic, A.users.secretary, 'IJ333333') });
    const nurse = client(server.base, A.users.nurse);
    const types = async corps => {
        const r = await nurse('POST', `/api/hospitalisations/${hosp.id}/vitals`, corps);
        assert.equal(r.status, 201, JSON.stringify(r.body));
        const alertes = await m.HospitalisationAlerte.findAll({ where: { hospitalisationId: hosp.id } });
        await m.HospitalisationAlerte.destroy({ where: { hospitalisationId: hosp.id } });
        return alertes.map(a => a.typeAlerte).sort();
    };
    assert.deepEqual(await types({ pouls: '135' }), ['pouls']);
    assert.deepEqual(await types({ glycemie: '2.1' }), ['glycemie']);
    assert.deepEqual(await types({ tension: '12/8', pouls: '72', temperature: '37', saturation: '98', glycemie: '1.0' }), []);
    assert.deepEqual(await types({ tension: '120/80' }), []);
    assert.deepEqual(await types({ tension: '16/9' }), ['tension']);
    assert.deepEqual(await types({ tension: '85/50' }), ['tension']);
});

test('Hospitalisation : un patient n’a qu’un séjour à la fois, une chambre occupée et une demande déjà traitée sont refusées', async () => {
    const patient = await createPatient(m, A.clinic, A.users.secretary, 'KL444444');
    await patient.update({ medecinTraitantId: A.users.doctor.id });
    const doc = client(server.base, A.users.doctor);
    const secA = client(server.base, A.users.secretary);
    const chambre = (n) => m.Chambre.create({ clinic_id: A.clinic.id, numero: n, typeChambre: 'privee', nbLits: 1 });
    const libre1 = await chambre('401');
    const libre2 = await chambre('402');
    const occupee = await m.Chambre.create({ clinic_id: A.clinic.id, numero: '403', typeChambre: 'privee', nbLits: 1, statut: 'occupee' });

    const d1 = await doc('POST', '/api/hospitalisations', { patientId: patient.id, diagnostic: 'x' });
    assert.equal(d1.status, 201, JSON.stringify(d1.body));
    // Seconde demande pendant que la première attend
    assert.equal((await doc('POST', '/api/hospitalisations', { patientId: patient.id, diagnostic: 'y' })).status, 409);

    const admettre = (id, ch) => secA('PUT', `/api/hospitalisations/${id}/admit`, { chambreId: ch.id, nurseId: A.users.nurse.id, lit: 'A' });
    assert.equal((await admettre(d1.body.id, occupee)).status, 409, 'chambre occupée acceptée');
    assert.equal((await admettre(d1.body.id, libre1)).status, 200);

    // Ré-admettre la même demande ailleurs : refusé, la seconde chambre reste libre
    assert.equal((await admettre(d1.body.id, libre2)).status, 409);
    assert.equal((await libre2.reload()).statut, 'disponible');
    assert.equal((await m.Hospitalisation.findByPk(d1.body.id)).chambreId, libre1.id);

    // Patient admis : nouvelle demande refusée ; une demande ancienne déjà en base ne peut pas être admise
    assert.equal((await doc('POST', '/api/hospitalisations', { patientId: patient.id, diagnostic: 'z' })).status, 409);
    const ancienne = await m.Hospitalisation.create({ clinic_id: A.clinic.id, patientId: patient.id, medecinId: A.medecin.id, statut: 'demande' });
    assert.equal((await admettre(ancienne.id, libre2)).status, 409);
    assert.equal((await libre2.reload()).statut, 'disponible');
});
