// B17 : plan SaaS (clinics.type) et spécialité (clinics.specialite) séparés
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

test('B17 : enregistrer la fiche clinique ne remplace plus le plan', async () => {
    const { clinic, users } = await seedClinic(m, 'Fiche');
    await clinic.update({ type: 'Pro' });
    const admin = client(server.base, users.admin);

    const put = await admin('PUT', '/api/clinic', { name: 'Clinique Fiche', specialty: 'cardio' });
    assert.equal(put.status, 200, JSON.stringify(put.body));

    await clinic.reload();
    assert.equal(clinic.type, 'Pro');
    assert.equal(clinic.specialite, 'cardio');

    const get = await admin('GET', '/api/clinic');
    assert.equal(get.body.specialite, 'cardio');

    const status = await admin('GET', '/api/subscription/status');
    assert.equal(status.body.plan, 'Pro');
});

test('B17 : sans specialty dans le corps, la spécialité est conservée', async () => {
    const { clinic, users } = await seedClinic(m, 'Garde');
    await clinic.update({ specialite: 'pediatrie' });
    const put = await client(server.base, users.admin)('PUT', '/api/clinic', { name: 'Clinique Garde' });
    assert.equal(put.status, 200);
    await clinic.reload();
    assert.equal(clinic.specialite, 'pediatrie');
    assert.equal(clinic.type, 'Starter');
});

test('B17 : le revenu mensuel du super-admin compte le plan, pas la spécialité', async () => {
    const { clinic, users } = await seedClinic(m, 'MRR');
    await clinic.update({ type: 'Pro' });
    await client(server.base, users.admin)('PUT', '/api/clinic', { specialty: 'chirurgie' });

    const superAdmin = await m.User.create({
        matricule: 'SUP-TEST', nom: 'Super', prenom: 'Admin', email: 'super@test.test',
        passwordHash: 'x', role: 'super_admin', statut: 'actif', clinic_id: null,
    });
    const stats = await client(server.base, superAdmin)('GET', '/api/super-admin/stats');
    assert.equal(stats.status, 200, JSON.stringify(stats.body));
    const actives = await m.Clinic.findAll({ where: { subscriptionStatus: 'active' } });
    const attendu = actives.reduce((s, c) => s + (c.type === 'Pro' ? 2499 : c.type === 'Starter' ? 999 : 0), 0);
    assert.equal(stats.body.estimatedMRR, attendu);
    assert.ok(actives.some(c => c.id === clinic.id && c.type === 'Pro'));
});

test("B17 : l'inscription enregistre la spécialité à part et le plan Starter", async () => {
    const r = await client(server.base)('POST', '/api/auth/register-clinic', {
        clinicName: 'Clinique Inscrite', clinicType: 'ophtalmologie', ownerName: 'Sara Test', email: 'inscrite@test.test',
    });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    const clinic = await m.Clinic.findOne({ where: { name: 'Clinique Inscrite' } });
    assert.equal(clinic.type, 'Starter');
    assert.equal(clinic.specialite, 'ophtalmologie');
});

test('Fiche légale : chaque clinique enregistre et relit ses propres raison sociale, ICE, IF, RC, TP, RIB', async () => {
    const A = await seedClinic(m, 'LegaleA');
    const B = await seedClinic(m, 'LegaleB');
    const fiche = {
        name: 'Clinique Al Amal', raisonSociale: 'STE CLINIQUE AL AMAL SARL', address: 'Rabat', phone: '0537000000', email: 'contact@alamal.test',
        ice: '001234567000089', ifNum: '11223344', rc: '9876', tp: '55667788', rib: '011 780 0000123456789012 34',
    };
    const put = await client(server.base, A.users.admin)('PUT', '/api/clinic', fiche);
    assert.equal(put.status, 200, JSON.stringify(put.body));

    // Relu par n'importe quel rôle de la clinique (les pages qui impriment factures et ordonnances)
    const lu = (await client(server.base, A.users.secretary)('GET', '/api/clinic')).body;
    for (const [champ, valeur] of Object.entries(fiche)) assert.equal(lu[champ], valeur, champ);

    // La clinique B garde ses propres informations (vides ici)
    const autre = (await client(server.base, B.users.secretary)('GET', '/api/clinic')).body;
    assert.equal(autre.raisonSociale ?? null, null);
    assert.equal(autre.ice ?? null, null);
    assert.equal(autre.name, B.clinic.name);
});

test('Réglages : enregistrer les modules ne touche pas la fiche ; seul l’admin modifie ; nom obligatoire', async () => {
    const A = await seedClinic(m, 'Reglages');
    const adm = client(server.base, A.users.admin);
    const fiche = { name: 'Clinique Reglages', raisonSociale: 'STE REGLAGES SARL', ice: '009999999000011', rib: '011 000 0000000000000000 00', specialty: 'Pédiatrie' };
    assert.equal((await adm('PUT', '/api/clinic', fiche)).status, 200);

    // Page Réglages : n'envoie que les modules
    const r = await adm('PUT', '/api/clinic', { activeModules: { email_reminders: false, realtime_notifications: true } });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.ok(!('keyHash' in r.body.clinic), 'keyHash renvoyé');
    const lu = (await adm('GET', '/api/clinic')).body;
    assert.equal(lu.name, fiche.name);
    assert.equal(lu.raisonSociale, fiche.raisonSociale);
    assert.equal(lu.ice, fiche.ice);
    assert.equal(lu.rib, fiche.rib);
    assert.equal(lu.specialite, 'Pédiatrie');
    assert.deepEqual(lu.activeModules, { email_reminders: false, realtime_notifications: true });

    // Nom vidé refusé ; les autres rôles ne modifient pas la fiche
    assert.equal((await adm('PUT', '/api/clinic', { name: '  ' })).status, 400);
    for (const role of ['secretary', 'doctor']) {
        assert.equal((await client(server.base, A.users[role])('PUT', '/api/clinic', { ice: '000' })).status, 403, role);
    }
    assert.equal((await adm('GET', '/api/clinic')).body.ice, fiche.ice);
});
