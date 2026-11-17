import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { resetDatabase, startServer, loadModels, seedClinic, client } from './helpers.js';

let server, m;

before(async () => {
    await resetDatabase();
    server = await startServer();
    m = await loadModels();
});
after(async () => {
    await server?.stop();
    await m?.sequelize.close();
});

test('le banc de test démarre le serveur et authentifie un JWT', async () => {
    const { users } = await seedClinic(m, 'Banc');
    const r = await client(server.base, users.admin)('GET', '/api/patients');
    assert.equal(r.status, 200, JSON.stringify(r.body));
});
