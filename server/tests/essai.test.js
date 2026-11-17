// Essai gratuit : 24 heures à partir de la création de la clinique, prolongeable par le super-admin (config/trial.js)
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { resetDatabase, startServer, loadModels, seedClinic, client } from './helpers.js';
import { TRIAL_DURATION_MS, TRIAL_EXPIRED_MESSAGE, MAX_TRIAL_EXTENSION_HOURS, trialEndFor } from '../config/trial.js';

const HEURE = 60 * 60 * 1000;
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

// Recule la date de création en base (Sequelize impose createdAt à la création)
async function vieillir(clinic, ageMs) {
    const colonne = m.Clinic.rawAttributes.createdAt.field;
    await m.sequelize.query(`UPDATE clinics SET \`${colonne}\` = ? WHERE id = ?`, {
        // Chaîne UTC : une Date passée en replacement serait écrite à l'heure locale (session MySQL en UTC)
        replacements: [new Date(Date.now() - ageMs).toISOString().slice(0, 19).replace('T', ' '), clinic.id],
    });
}

// Clinique en essai créée il y a `ageMs`
async function cliniqueEnEssai(label, ageMs) {
    const { clinic, users } = await seedClinic(m, label);
    await clinic.update({ subscriptionStatus: 'trial' });
    await vieillir(clinic, ageMs);
    await clinic.reload();
    return { clinic, users };
}

test('Essai : la durée vaut exactement 24 heures', () => {
    assert.equal(TRIAL_DURATION_MS, 24 * HEURE);
    const debut = new Date('2026-10-20T08:00:00.000Z');
    assert.equal(trialEndFor({ createdAt: debut }).toISOString(), '2026-10-21T08:00:00.000Z');
    // Une fin fixée par le super-admin l'emporte sur la règle des 24 h
    const prolongee = new Date('2026-11-01T10:00:00.000Z');
    assert.equal(trialEndFor({ createdAt: debut, trialEndsAt: prolongee }).toISOString(), prolongee.toISOString());
});

test('Essai : une clinique créée il y a 23 h garde l’accès, avec 1 h restante', async () => {
    const { users } = await cliniqueEnEssai('Jeune', 23 * HEURE);
    const admin = client(server.base, users.admin);

    const clinique = await admin('GET', '/api/clinic');
    assert.equal(clinique.status, 200, JSON.stringify(clinique.body));

    const statut = await admin('GET', '/api/subscription/status');
    assert.equal(statut.status, 200);
    assert.equal(statut.body.status, 'trial');
    assert.equal(statut.body.hoursLeft, 1);
    assert.equal(statut.body.daysLeft, 1);
    assert.equal(statut.body.isExpired, false);
});

test('Essai : une clinique créée il y a 25 h est bloquée sur les routes protégées', async () => {
    const { clinic, users } = await cliniqueEnEssai('Expiree', 25 * HEURE);
    const admin = client(server.base, users.admin);

    // authenticateJWT : seul contrôle branché (checkSubscription n'est monté sur aucune route)
    const clinique = await admin('GET', '/api/clinic');
    assert.equal(clinique.status, 403);
    assert.equal(clinique.body.code, 'trial_expired');
    assert.equal(clinique.body.error, TRIAL_EXPIRED_MESSAGE);
    assert.equal(clinique.body.trialExpiredAt, trialEndFor(clinic).toISOString());

    // Les autres rôles sont bloqués aussi
    const patients = await client(server.base, users.secretary)('GET', '/api/patients');
    assert.equal(patients.status, 403);
    assert.equal(patients.body.code, 'trial_expired');

    // La page Abonnement reste lisible pour proposer le paiement
    const statut = await admin('GET', '/api/subscription/status');
    assert.equal(statut.status, 200);
    assert.equal(statut.body.hoursLeft, 0);
    assert.equal(statut.body.daysLeft, 0);
    assert.equal(statut.body.isExpired, true);
});

test('Essai : une clinique active n’est jamais limitée par la date de création', async () => {
    const { clinic, users } = await seedClinic(m, 'Active');
    await vieillir(clinic, 30 * 24 * HEURE);
    const admin = client(server.base, users.admin);

    const clinique = await admin('GET', '/api/clinic');
    assert.equal(clinique.status, 200);

    const statut = await admin('GET', '/api/subscription/status');
    assert.equal(statut.body.status, 'active');
    assert.equal(statut.body.hoursLeft, null);
    assert.equal(statut.body.isExpired, false);
});

// ── Prolongation par le super-admin ──

let superAdmin;
async function superAdminClient() {
    superAdmin ??= await m.User.create({
        matricule: 'SUP-ESSAI', nom: 'Super', prenom: 'Admin', email: 'super.essai@test.test',
        passwordHash: 'x', role: 'super_admin', statut: 'actif', clinic_id: null,
    });
    return client(server.base, superAdmin);
}

test('Prolongation : une clinique expirée retrouve l’accès pour la durée accordée', async () => {
    const { clinic, users } = await cliniqueEnEssai('Prolongee', 30 * HEURE);
    const admin = client(server.base, users.admin);
    assert.equal((await admin('GET', '/api/clinic')).status, 403);

    const sa = await superAdminClient();
    const avant = Date.now();
    const r = await sa('POST', `/api/super-admin/clinics/${clinic.id}/extend-trial`, { hours: 48 });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    // Expirée : la prolongation part de maintenant, pas de l'ancienne fin
    const fin = new Date(r.body.trialEnd).getTime();
    assert.ok(Math.abs(fin - (avant + 48 * HEURE)) < 60 * 1000, r.body.trialEnd);

    const clinique = await admin('GET', '/api/clinic');
    assert.equal(clinique.status, 200);
    assert.equal(clinique.body.trialEnd, r.body.trialEnd);

    const statut = await admin('GET', '/api/subscription/status');
    assert.equal(statut.body.hoursLeft, 48);
    assert.equal(statut.body.trialEndDate, r.body.trialEnd);

    // La liste du super-admin affiche la même fin d'essai
    const liste = await sa('GET', '/api/super-admin/clinics');
    assert.equal(liste.body.find(c => c.id === clinic.id).trialEnd, r.body.trialEnd);
});

test('Prolongation : un essai encore en cours est rallongé à partir de sa fin actuelle', async () => {
    const { clinic } = await cliniqueEnEssai('EnCours', 20 * HEURE); // fin dans 4 h
    const finActuelle = trialEndFor(clinic).getTime();
    const r = await (await superAdminClient())('POST', `/api/super-admin/clinics/${clinic.id}/extend-trial`, { hours: 24 });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.ok(Math.abs(new Date(r.body.trialEnd).getTime() - (finActuelle + 24 * HEURE)) < 2000, r.body.trialEnd);
});

test('Prolongation : une clinique suspendue repasse en essai', async () => {
    const { clinic, users } = await seedClinic(m, 'Suspendue');
    await clinic.update({ subscriptionStatus: 'suspended' });
    const r = await (await superAdminClient())('POST', `/api/super-admin/clinics/${clinic.id}/extend-trial`, { hours: 24 });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    await clinic.reload();
    assert.equal(clinic.subscriptionStatus, 'trial');
    assert.equal((await client(server.base, users.admin)('GET', '/api/clinic')).status, 200);
});

test('Prolongation : refus pour une clinique active, une durée invalide ou une clinique inconnue', async () => {
    const sa = await superAdminClient();
    const { clinic } = await seedClinic(m, 'DejaActive');
    const active = await sa('POST', `/api/super-admin/clinics/${clinic.id}/extend-trial`, { hours: 24 });
    assert.equal(active.status, 409);
    await clinic.reload();
    assert.equal(clinic.subscriptionStatus, 'active');
    assert.equal(clinic.trialEndsAt, null);

    const { clinic: essai } = await cliniqueEnEssai('Invalide', HEURE);
    for (const hours of [0, -5, 1.5, 'abc', undefined, MAX_TRIAL_EXTENSION_HOURS + 1]) {
        const r = await sa('POST', `/api/super-admin/clinics/${essai.id}/extend-trial`, { hours });
        assert.equal(r.status, 400, `hours=${hours}`);
    }
    await essai.reload();
    assert.equal(essai.trialEndsAt, null);

    assert.equal((await sa('POST', '/api/super-admin/clinics/999999/extend-trial', { hours: 24 })).status, 404);
});

test('Prolongation : réservée au super-admin', async () => {
    // Clinique encore valide : le refus vient du rôle, pas de l'essai expiré
    const { clinic, users } = await cliniqueEnEssai('Interdit', HEURE);
    for (const role of ['admin', 'secretary']) {
        const r = await client(server.base, users[role])('POST', `/api/super-admin/clinics/${clinic.id}/extend-trial`, { hours: 24 });
        assert.equal(r.status, 403, role);
        assert.notEqual(r.body.code, 'trial_expired', role);
    }
    await clinic.reload();
    assert.equal(clinic.trialEndsAt, null);
});

test('E1 : l’admin ne peut ni activer ni suspendre lui-même l’abonnement ; le super-admin active', async () => {
    const { clinic, users } = await cliniqueEnEssai('LibreService', 30 * HEURE);
    const admin = client(server.base, users.admin);

    assert.equal((await admin('POST', '/api/subscription/activate')).status, 404);
    assert.equal((await admin('POST', '/api/subscription/suspend')).status, 404);
    await clinic.reload();
    assert.equal(clinic.subscriptionStatus, 'trial');
    assert.equal((await admin('GET', '/api/patients')).status, 403, 'essai expiré : accès toujours bloqué');

    const sa = await superAdminClient();
    assert.equal((await sa('PUT', `/api/super-admin/clinics/${clinic.id}/status`, { status: 'active' })).status, 200);
    await clinic.reload();
    assert.equal(clinic.subscriptionStatus, 'active');
    assert.equal((await admin('GET', '/api/patients')).status, 200);
});
