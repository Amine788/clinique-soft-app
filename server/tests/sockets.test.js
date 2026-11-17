// Sockets : identité tirée du JWT et notifications limitées à la clinique de l'émetteur
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { io } from 'socket.io-client';
import { resetDatabase, startServer, loadModels, seedClinic, createHospitalisation, client, tokenFor } from './helpers.js';

let server, m, A, B;
const sockets = [];

before(async () => {
    await resetDatabase();
    server = await startServer();
    m = await loadModels();
    A = await seedClinic(m, 'A');
    B = await seedClinic(m, 'B');
});
after(async () => {
    sockets.forEach(s => s.disconnect());
    await server?.stop();
    await m?.sequelize.close();
});

// Connexion : résout le socket connecté, ou l'erreur de connexion
function connect(auth) {
    const s = io(server.base, { auth, transports: ['websocket'], reconnection: false, forceNew: true });
    sockets.push(s);
    return new Promise(resolve => {
        s.once('connect', () => resolve({ socket: s }));
        s.once('connect_error', (err) => resolve({ error: err.message }));
    });
}

// Événements reçus par un socket pendant l'action
function collect(socket, event) {
    const recus = [];
    socket.on(event, data => recus.push(data));
    return recus;
}
const pause = (ms) => new Promise(r => setTimeout(r, ms));

test('Socket : connexion refusée sans jeton valide, identité déclarée par le client ignorée', async () => {
    assert.equal((await connect({})).error, 'unauthorized');
    assert.equal((await connect({ userId: A.users.doctor.id, role: 'doctor' })).error, 'unauthorized');
    assert.equal((await connect({ token: 'faux' })).error, 'unauthorized');

    await A.users.nurse.update({ statut: 'inactif' });
    assert.equal((await connect({ token: tokenFor(A.users.nurse) })).error, 'unauthorized');
    await A.users.nurse.update({ statut: 'actif' });
});

test('Socket : une alerte infirmière ne part qu’aux médecins de sa clinique', async () => {
    const { hosp } = await createHospitalisation(m, A);
    const docA = (await connect({ token: tokenFor(A.users.doctor) })).socket;
    const docB = (await connect({ token: tokenFor(B.users.doctor) })).socket;
    const recusA = collect(docA, 'nurse_alert');
    const recusB = collect(docB, 'nurse_alert');

    const r = await client(server.base, A.users.nurse)('POST', '/api/nurse/alert', {
        patientId: A.patient.id, patientName: 'Patient A', message: 'Douleur', urgency: 'haute',
    });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    await pause(400);
    assert.deepEqual(recusA.map(a => a.patientNom), ['Patient A']);
    assert.equal(recusB.length, 0, 'alerte reçue par une autre clinique');
    await hosp.update({ statut: 'termine', dateSortie: new Date() });
});

test('Socket : une demande d’hospitalisation ne part qu’aux secrétaires de sa clinique', async () => {
    const secA = (await connect({ token: tokenFor(A.users.secretary) })).socket;
    const secB = (await connect({ token: tokenFor(B.users.secretary) })).socket;
    const recusA = collect(secA, 'hosp_demande');
    const recusB = collect(secB, 'hosp_demande');

    const r = await client(server.base, A.users.doctor)('POST', '/api/hospitalisations', {
        patientId: A.patient.id, diagnostic: 'Observation', motif: 'x',
    });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    await pause(400);
    assert.equal(recusA.length, 1);
    assert.equal(recusB.length, 0, 'demande reçue par une autre clinique');
});

test('Réglages : « Notifications temps réel » désactivé coupe les alertes de la clinique, sauf les alertes critiques', async () => {
    const C = await seedClinic(m, 'TempsReel');
    await createHospitalisation(m, C);
    const admin = client(server.base, C.users.admin);
    const pharma = (await connect({ token: tokenFor(C.users.pharmacist) })).socket;
    const doc = (await connect({ token: tokenFor(C.users.doctor) })).socket;
    const ordonnances = collect(pharma, 'new_prescription');
    const alertes = collect(doc, 'nurse_alert');
    const prescrire = () => client(server.base, C.users.doctor)('POST', '/api/prescriptions', {
        patientCin: C.patient.cinNumero, medicaments: [{ nom: 'Doli', frequence: '1 fois/jour' }],
    });

    assert.equal((await admin('PUT', '/api/clinic', { activeModules: { realtime_notifications: false } })).status, 200);
    assert.equal((await prescrire()).status, 201);
    assert.equal((await client(server.base, C.users.nurse)('POST', '/api/nurse/alert', {
        patientId: C.patient.id, patientName: 'Patient C', message: 'Détresse', urgency: 'haute',
    })).status, 200);
    await pause(400);
    assert.equal(ordonnances.length, 0, 'notification reçue alors que la bascule est désactivée');
    assert.equal(alertes.length, 1, 'alerte critique bloquée');

    // Réactivation : effet immédiat, sans redémarrer le serveur
    assert.equal((await admin('PUT', '/api/clinic', { activeModules: { realtime_notifications: true } })).status, 200);
    assert.equal((await prescrire()).status, 201);
    await pause(400);
    assert.equal(ordonnances.length, 1);
});
