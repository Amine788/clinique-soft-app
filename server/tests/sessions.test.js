// Déconnexion côté serveur (session fermée sur ce poste seulement) et nettoyages périodiques
// (sessions révoquées expirées, scans de CIN sans dossier patient depuis plus de 24 h).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { io } from 'socket.io-client';
import { resetDatabase, startServer, loadModels, seedClinic, client } from './helpers.js';

let server, m, A, purges, sessions;
const MOT_DE_PASSE = 'Session-Test-2026!';

before(async () => {
    await resetDatabase();
    server = await startServer();
    m = await loadModels();
    A = await seedClinic(m, 'A');
    await A.users.admin.update({ passwordHash: await bcrypt.hash(MOT_DE_PASSE, 4) });
    purges = await import('../services/purges.js');
    sessions = await import('../services/sessions.js');
});
after(async () => {
    await server?.stop();
    await m?.sequelize.close();
});

async function connexion() {
    const r = await client(server.base)('POST', '/api/auth/login', { email: A.users.admin.email, password: MOT_DE_PASSE });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    return r.body.token;
}
const avecJeton = (token) => async (method, url) => {
    const r = await fetch(server.base + url, { method, headers: { Authorization: `Bearer ${token}` } });
    return { status: r.status, body: await r.json().catch(() => null) };
};
function socket(token) {
    return new Promise((resolve) => {
        const s = io(server.base, { auth: { token }, transports: ['websocket'], reconnection: false, forceNew: true });
        s.once('connect', () => resolve({ s, ok: true }));
        s.once('connect_error', () => { s.close(); resolve({ ok: false }); });
    });
}

test('Déconnexion : le jeton de ce poste est refusé ensuite, celui d’un autre poste reste valide', async () => {
    const poste1 = await connexion();
    const poste2 = await connexion();
    const { jti, exp } = jwt.decode(poste1);
    assert.ok(jti, 'le jeton de session porte un identifiant unique');
    assert.notEqual(jti, jwt.decode(poste2).jti);

    assert.equal((await avecJeton(poste1)('GET', '/api/auth/me')).status, 200);
    const r = await avecJeton(poste1)('POST', '/api/auth/logout');
    assert.equal(r.status, 200, JSON.stringify(r.body));

    const apres = await avecJeton(poste1)('GET', '/api/auth/me');
    assert.equal(apres.status, 401);
    assert.equal(apres.body.code, 'token_invalid');
    assert.equal((await avecJeton(poste1)('GET', '/api/patients')).status, 401);
    assert.equal((await avecJeton(poste1)('POST', '/api/auth/logout')).status, 401, 'deuxième déconnexion : session déjà fermée');
    assert.equal((await avecJeton(poste2)('GET', '/api/auth/me')).status, 200, 'les autres postes ne sont pas déconnectés');

    const ligne = await m.SessionRevoquee.findByPk(jti);
    assert.ok(ligne);
    assert.ok(Math.abs(new Date(ligne.expireLe).getTime() - exp * 1000) < 2000, 'conservée jusqu’à l’expiration du jeton');
});

test('Déconnexion : sans jeton 401 ; le temps réel de ce poste est fermé et refusé ensuite', async () => {
    assert.equal((await client(server.base)('POST', '/api/auth/logout')).status, 401);

    const token = await connexion();
    const autre = await connexion();
    const ouvert = await socket(token);
    const ouvertAutre = await socket(autre);
    assert.ok(ouvert.ok && ouvertAutre.ok);
    const ferme = new Promise(resolve => ouvert.s.once('disconnect', resolve));

    assert.equal((await avecJeton(token)('POST', '/api/auth/logout')).status, 200);
    await ferme;
    assert.equal((await socket(token)).ok, false, 'reconnexion refusée avec la session fermée');
    assert.ok(ouvertAutre.s.connected, 'le temps réel de l’autre poste reste ouvert');
    ouvertAutre.s.close();
});

test('Purge : les sessions révoquées expirées sont supprimées, les autres gardées', async () => {
    await m.SessionRevoquee.bulkCreate([
        { jti: 'purge-expiree', expireLe: new Date(Date.now() - 60 * 1000) },
        { jti: 'purge-active', expireLe: new Date(Date.now() + 60 * 60 * 1000) },
    ]);
    await sessions.purgerSessionsExpirees();
    assert.equal(await m.SessionRevoquee.findByPk('purge-expiree'), null);
    assert.ok(await m.SessionRevoquee.findByPk('purge-active'));
});

test('Purge : un scan de CIN sans dossier depuis plus de 24 h est supprimé (ligne et fichier), les autres gardés', async (t) => {
    const dossier = fs.mkdtempSync(path.join(os.tmpdir(), 'purge-cin-'));
    t.after(() => fs.rmSync(dossier, { recursive: true, force: true }));
    const scan = async (nom, patientId) => {
        fs.writeFileSync(path.join(dossier, nom), 'scan de test');
        return m.CinScan.create({
            clinic_id: A.clinic.id, patientId, cinNumero: 'ZZ999999', face: 'recto',
            fichierNom: nom, fichierPath: path.join(dossier, nom), uploadeParUserId: A.users.secretary.id,
        });
    };
    const ancienOrphelin = await scan('recto_ancien.png', null);
    const recentOrphelin = await scan('recto_recent.png', null);
    const ancienRattache = await scan('recto_rattache.png', A.patient.id);
    // 48 h : marge sur tout décalage de fuseau entre MySQL et Node
    await m.sequelize.query('UPDATE cin_scans SET uploaded_at = DATE_SUB(NOW(), INTERVAL 48 HOUR) WHERE id IN (?, ?)',
        { replacements: [ancienOrphelin.id, ancienRattache.id] });

    const n = await purges.purgerScansOrphelins({ dossier });
    assert.equal(n, 1);
    assert.equal(await m.CinScan.findByPk(ancienOrphelin.id), null);
    assert.equal(fs.existsSync(path.join(dossier, 'recto_ancien.png')), false);
    for (const [ligne, nom] of [[recentOrphelin, 'recto_recent.png'], [ancienRattache, 'recto_rattache.png']]) {
        assert.ok(await m.CinScan.findByPk(ligne.id), `${nom} gardé`);
        assert.ok(fs.existsSync(path.join(dossier, nom)), `fichier ${nom} gardé`);
    }
});
