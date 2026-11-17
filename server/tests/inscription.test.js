// Inscription d'une clinique (e-mail de configuration) et compte super-admin initial
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import { resetDatabase, startServer, loadModels, client } from './helpers.js';

// Mot de passe choisi par l'admin dans les tests du lien de configuration (valeur de test)
const NOUVEAU_MDP = 'Nouveau-Mdp-2026';

let server, m;

// Base neuve sans aucun super-admin ; le serveur de test n'a pas d'envoi d'e-mails configuré
before(async () => {
    await resetDatabase();
    server = await startServer();
    m = await loadModels();
});
after(async () => {
    await server?.stop();
    await m?.sequelize.close();
});

test('Super-admin : aucun compte par défaut ni mot de passe dans les journaux sans configuration', async () => {
    assert.equal(await m.User.count({ where: { role: 'super_admin' } }), 0);
    assert.equal((await client(server.base)('POST', '/api/auth/login', { email: 'superadmin@clinicsoft.test', password: 'superadmin123' })).status, 401);
    assert.ok(!server.logs().includes('superadmin123'));
    assert.match(server.logs(), /SUPER_ADMIN_EMAIL/);
});

test('Super-admin : créé depuis l’environnement au démarrage, mot de passe jamais affiché', async () => {
    const motDePasse = 'Un-Secret-Tres-Long-2026';
    const second = await startServer({ PORT: '3997', SUPER_ADMIN_EMAIL: 'sa@nextclinic.test', SUPER_ADMIN_PASSWORD: motDePasse });
    try {
        const sa = await m.User.findOne({ where: { role: 'super_admin' } });
        assert.equal(sa?.email, 'sa@nextclinic.test');
        assert.ok(!second.logs().includes(motDePasse));
        const login = await client(second.base)('POST', '/api/auth/login', { email: 'sa@nextclinic.test', password: motDePasse });
        assert.equal(login.status, 200, JSON.stringify(login.body));
        assert.equal(login.body.user.role, 'super_admin');
    } finally {
        await second.stop();
    }
});

test('Inscription : la clinique est créée et la page sait que l’e-mail de configuration n’est pas parti', async () => {
    const landing = await client(server.base)('POST', '/api/auth/register', {
        clinicName: 'Clinique Sans Mail', ownerName: 'Sara Test', email: 'sara.sansmail@test.test', phone: '0600000000',
    });
    assert.equal(landing.status, 201, JSON.stringify(landing.body));
    assert.equal(landing.body.emailEnvoye, false);
    assert.match(landing.body.message, /n'a pas pu être envoyé/);
    assert.ok(await m.Clinic.findByPk(landing.body.clinicId));

    const page = await client(server.base)('POST', '/api/auth/register-clinic', {
        clinicName: 'Clinique Sans Mail 2', clinicType: 'pediatrie', ownerName: 'Karim Test', email: 'karim.sansmail@test.test',
    });
    assert.equal(page.status, 201, JSON.stringify(page.body));
    assert.equal(page.body.emailEnvoye, false);
    assert.ok(page.body.rawKey, 'la clé de licence reste affichée une fois');
});

// Lien de l'e-mail de bienvenue, signé comme par le serveur (secret des tests, helpers.js)
const lienBienvenue = (payload) => jwt.sign(payload, 'clinicsoft-tests-secret', { expiresIn: '24h' });

for (const [route, corps, jeton] of [
    ['/api/auth/register-clinic', { clinicName: 'Clinique Parcours 1', clinicType: 'generale', ownerName: 'Amal Parcours', email: 'amal.parcours@test.test' },
        (user, clinicId) => lienBienvenue({ email: user.email, clinicId })],
    ['/api/auth/register', { clinicName: 'Clinique Parcours 2', ownerName: 'Omar Parcours', email: 'omar.parcours@test.test', phone: '0600000002' },
        (user, clinicId) => lienBienvenue({ userId: user.id, clinicId, type: 'SETUP_PASSWORD', source: 'register' })],
]) {
    test(`Parcours ${route} : inscription → lien de l’e-mail → mot de passe → accès direct en essai 24 h`, async () => {
        const api = client(server.base);
        const r = await api('POST', route, corps);
        assert.equal(r.status, 201, JSON.stringify(r.body));
        const clinic = await m.Clinic.findOne({ where: { name: corps.clinicName } });
        const admin = await m.User.findOne({ where: { email: corps.email } });
        assert.equal(admin.role, 'admin');
        assert.equal(admin.clinic_id, clinic.id, 'admin non rattaché à sa clinique');
        assert.equal(clinic.subscriptionStatus, 'trial');

        // Avant le lien : pas de connexion possible
        assert.equal((await api('POST', '/api/auth/login', { email: corps.email, password: NOUVEAU_MDP })).status, 401);

        // Le lien de l'e-mail : création du mot de passe, session ouverte directement
        const lien = jeton(admin, clinic.id);
        const setup = await api('POST', '/api/auth/setup-password', { token: lien, password: NOUVEAU_MDP });
        assert.equal(setup.status, 200, JSON.stringify(setup.body));
        assert.equal(setup.body.user.clinic_id, clinic.id);

        // Accès direct à sa clinique, en essai jusqu'à création + 24 h
        const session = { Authorization: `Bearer ${setup.body.token}` };
        const fiche = await (await fetch(`${server.base}/api/clinic`, { headers: session })).json();
        assert.equal(fiche.name, corps.clinicName);
        const finEssai = new Date(fiche.trialEnd).getTime() - new Date(clinic.createdAt).getTime();
        assert.ok(Math.abs(finEssai - 24 * 3600 * 1000) < 2000, `essai de ${finEssai} ms`);
        assert.equal((await fetch(`${server.base}/api/patients`, { headers: session })).status, 200);

        // Connexion normale ensuite ; le lien déjà utilisé ne redéfinit plus le mot de passe
        assert.equal((await api('POST', '/api/auth/login', { email: corps.email, password: NOUVEAU_MDP })).status, 200);
        assert.equal((await api('POST', '/api/auth/setup-password', { token: lien, password: 'Pirate-2026' })).status, 409);
        assert.equal((await api('POST', '/api/auth/login', { email: corps.email, password: NOUVEAU_MDP })).status, 200);
    });
}

test('Inscription : un e-mail déjà utilisé est refusé clairement (409) sur les deux formulaires', async () => {
    const api = client(server.base);
    for (const route of ['/api/auth/register-clinic', '/api/auth/register']) {
        const r = await api('POST', route, { clinicName: 'Doublon', ownerName: 'Amal Parcours', email: 'amal.parcours@test.test' });
        assert.equal(r.status, 409, `${route} : ${JSON.stringify(r.body)}`);
    }
});
