// Circuit du médicament (C2) : chaque rôle ne fait que son étape, et les constantes restent dans la clinique
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { resetDatabase, startServer, loadModels, seedClinic, createRdv, createHospitalisation, client } from './helpers.js';

let server, m, A, B;

before(async () => {
    await resetDatabase();
    server = await startServer();
    m = await loadModels();
    A = await seedClinic(m, 'A');
    B = await seedClinic(m, 'B'); // même CIN de patient que A
    await createHospitalisation(m, A);
});
after(async () => {
    await server?.stop();
    await m?.sequelize.close();
});

const prescrire = ctx => client(server.base, ctx.users.doctor)('POST', '/api/prescriptions', {
    patientCin: ctx.patient.cinNumero,
    medicaments: [{ nom: 'Paracétamol', posologie: '1 g', frequence: '2 fois/jour' }],
});

test('Circuit : pharmacien prépare, soins livrent et administrent ; aucun rôle ne saute une étape', async () => {
    const r = await prescrire(A);
    assert.equal(r.status, 201, JSON.stringify(r.body));
    const id = r.body.ordonnance.id;
    const statut = async () => (await m.Prescription.findByPk(id)).statut;

    const pharma = client(server.base, A.users.pharmacist);
    const nurse = client(server.base, A.users.nurse);
    const lab = client(server.base, A.users.lab_technician);
    const secretary = client(server.base, A.users.secretary);

    // Rôles hors circuit : ni lecture du circuit ni action
    assert.equal((await lab('GET', '/api/nurse/medications')).status, 403);
    assert.equal((await secretary('POST', `/api/nurse/prescriptions/${id}/advance`, { nextStatus: 'prepared' })).status, 403);

    // L'infirmier ne prépare pas à la place du pharmacien, ni ne livre une ordonnance non préparée
    assert.equal((await nurse('POST', `/api/nurse/prescriptions/${id}/advance`, { nextStatus: 'prepared' })).status, 403);
    assert.equal((await nurse('POST', `/api/nurse/prescriptions/${id}/advance`, { nextStatus: 'delivered' })).status, 400);
    assert.equal((await nurse('POST', `/api/nurse/prescriptions/${id}/deliver`)).status, 400);
    // Personne ne pose « administrée » à la main
    assert.equal((await pharma('POST', `/api/nurse/prescriptions/${id}/advance`, { nextStatus: 'administered' })).status, 400);
    assert.equal((await pharma('PATCH', `/api/prescriptions/${id}/status`, { statut: 'administree' })).status, 400);
    assert.equal(await statut(), 'en_attente');

    // Pharmacien : préparée
    assert.equal((await pharma('POST', `/api/nurse/prescriptions/${id}/advance`, { nextStatus: 'prepared' })).status, 200);
    assert.equal(await statut(), 'preparee');

    // Le pharmacien n'administre pas
    assert.equal((await pharma('POST', `/api/nurse/prescriptions/${id}/administer`, { itemId: 1, slotIndex: 0, done: true })).status, 403);

    // Soins : livraison (création des créneaux) puis administration des 2 prises
    assert.equal((await nurse('POST', `/api/nurse/prescriptions/${id}/advance`, { nextStatus: 'delivered' })).status, 200);
    assert.equal(await statut(), 'remise');
    // Retour en arrière refusé
    assert.equal((await pharma('PATCH', `/api/prescriptions/${id}/status`, { statut: 'en_preparation' })).status, 400);
    for (const slotIndex of [0, 1]) {
        const a = await nurse('POST', `/api/nurse/prescriptions/${id}/administer`, { itemId: 1, slotIndex, done: true });
        assert.equal(a.status, 200, JSON.stringify(a.body));
    }
    assert.equal(await statut(), 'administree');
});

test('Pharmacie : le parcours de la page Dispensation reste possible', async () => {
    const r = await prescrire(A);
    const id = r.body.ordonnance.id;
    const pharma = client(server.base, A.users.pharmacist);
    for (const s of ['en_preparation', 'preparee', 'remise']) {
        const p = await pharma('PATCH', `/api/prescriptions/${id}/status`, { statut: s });
        assert.equal(p.status, 200, `${s} : ${JSON.stringify(p.body)}`);
    }
    assert.ok(JSON.parse((await m.Prescription.findByPk(id)).slots).length === 2);
});

test('Constantes : historique et saisie limités à la clinique', async () => {
    const rdvA = await createRdv(m, A, { statut: 'arrive' });
    await rdvA.update({ vitals: { ta: '12/8', pouls: 70 } });

    // Même CIN dans B : l'historique de B ne montre pas les constantes de A
    const hist = await client(server.base, B.users.nurse)('GET', `/api/nurse/vitals-history/${B.patient.cinNumero}`);
    assert.equal(hist.status, 200, JSON.stringify(hist.body));
    assert.deepEqual(hist.body, []);
    assert.equal((await client(server.base, A.users.nurse)('GET', `/api/nurse/vitals-history/${A.patient.cinNumero}`)).body.length, 1);

    // L'infirmier de B ne peut pas saisir les constantes d'un RDV de A
    const saisie = await client(server.base, B.users.nurse)('POST', '/api/nurse/vitals', { rdvId: rdvA.numeroRdv, vitals: { ta: '20/10' } });
    assert.equal(saisie.status, 404);
    await rdvA.reload();
    assert.equal(rdvA.statut, 'arrive');

    // Un pharmacien ne saisit pas de constantes ; l'infirmier de A, oui
    assert.equal((await client(server.base, A.users.pharmacist)('POST', '/api/nurse/vitals', { rdvId: rdvA.numeroRdv, vitals: { ta: '13/8' } })).status, 403);
    assert.equal((await client(server.base, A.users.nurse)('POST', '/api/nurse/vitals', { rdvId: rdvA.numeroRdv, vitals: { ta: '13/8' } })).status, 200);
    await rdvA.reload();
    assert.equal(rdvA.statut, 'pret');
});
