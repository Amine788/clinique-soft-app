// Espaces admin et super-admin : rôles attribuables, suppression sans perte de dossiers médicaux
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { resetDatabase, startServer, loadModels, seedClinic, createHospitalisation, createRdv, client } from './helpers.js';

let server, m, A, B, superAdmin;

before(async () => {
    await resetDatabase();
    server = await startServer();
    m = await loadModels();
    A = await seedClinic(m, 'A');
    B = await seedClinic(m, 'B');
    superAdmin = await m.User.create({
        matricule: 'SUP-ADM', nom: 'Super', prenom: 'Admin', email: 'super.admin@test.test',
        passwordHash: 'x', role: 'super_admin', statut: 'actif', clinic_id: null,
    });
});
after(async () => {
    await server?.stop();
    await m?.sequelize.close();
});

const nouveauCompte = (role, extra = {}) => ({ nom: 'Test', prenom: role, email: `${role}.${Date.now()}@test.test`, password: 'secret123', role, ...extra });

test('A1 : un admin ne crée que des rôles de clinique, jamais super_admin', async () => {
    const adm = client(server.base, A.users.admin);
    for (const role of ['super_admin', 'n_importe_quoi']) {
        const r = await adm('POST', '/api/admin/users', nouveauCompte(role));
        assert.equal(r.status, 400, `${role} : ${JSON.stringify(r.body)}`);
    }
    assert.equal(await m.User.count({ where: { role: 'super_admin', clinic_id: A.clinic.id } }), 0);
    assert.equal((await adm('POST', '/api/admin/users', nouveauCompte('pharmacist'))).status, 201);
});

test('A4 : le médecin référent d’un infirmier est de la même clinique', async () => {
    const adm = client(server.base, A.users.admin);
    assert.equal((await adm('POST', '/api/admin/users', nouveauCompte('nurse', { doctorId: B.medecin.id }))).status, 400);
    assert.equal((await adm('PUT', `/api/admin/users/${A.users.nurse.id}`, { doctorId: B.medecin.id })).status, 400);
    assert.equal((await adm('POST', '/api/admin/users', nouveauCompte('nurse', { doctorId: A.medecin.id }))).status, 201);
});

test('A3 + A5 : pas d’auto-désactivation ; e-mail déjà pris → 409', async () => {
    const adm = client(server.base, A.users.admin);
    assert.equal((await adm('PATCH', `/api/admin/users/${A.users.admin.id}/toggle`)).status, 400);
    assert.equal((await adm('PUT', `/api/admin/users/${A.users.admin.id}`, { statut: 'inactif' })).status, 400);
    assert.equal((await m.User.findByPk(A.users.admin.id)).statut, 'actif');

    const dup = await adm('PUT', `/api/admin/users/${A.users.secretary.id}`, { email: B.users.secretary.email });
    assert.equal(dup.status, 409, JSON.stringify(dup.body));
});

test('A2 : un compte avec historique ne se supprime pas (dossiers conservés) ; sans historique, oui', async () => {
    const adm = client(server.base, A.users.admin);
    const { hosp } = await createHospitalisation(m, A);
    await createRdv(m, A);

    for (const role of ['doctor', 'nurse']) {
        const r = await adm('DELETE', `/api/admin/users/${A.users[role].id}`);
        assert.equal(r.status, 409, `${role} : ${JSON.stringify(r.body)}`);
    }
    assert.ok(await m.Hospitalisation.findByPk(hosp.id), 'hospitalisation effacée');
    assert.ok(await m.Medecin.findByPk(A.medecin.id));
    // La désactivation reste possible
    assert.equal((await adm('PATCH', `/api/admin/users/${A.users.doctor.id}/toggle`)).status, 200);

    const neuf = await adm('POST', '/api/admin/users', nouveauCompte('doctor'));
    assert.equal(neuf.status, 201);
    assert.equal((await adm('DELETE', `/api/admin/users/${neuf.body.userId}`)).status, 200);
    assert.equal(await m.Medecin.count({ where: { userId: neuf.body.userId } }), 0);
});

test('SA1 + SA2 : clé de licence jamais renvoyée ; une clinique avec patients se suspend, une clinique vide se supprime', async () => {
    const sa = client(server.base, superAdmin);
    await A.clinic.update({ keyHash: 'f'.repeat(64), keyPrefix: 'NC-TEST' });
    const liste = await sa('GET', '/api/super-admin/clinics');
    assert.equal(liste.status, 200);
    assert.ok(liste.body.every(c => !('keyHash' in c)), 'keyHash renvoyé');

    // B a un patient : suppression refusée, rien n'est effacé
    const refus = await sa('DELETE', `/api/super-admin/clinics/${B.clinic.id}`);
    assert.equal(refus.status, 409, JSON.stringify(refus.body));
    assert.ok(await m.Clinic.findByPk(B.clinic.id));
    assert.ok(await m.Patient.findByPk(B.patient.id));
    assert.ok(await m.User.findByPk(B.users.doctor.id));

    // Clinique vide (comptes, médecin, chambre) : suppression complète, sans orphelin
    const vide = await m.Clinic.create({ name: 'Vide', subscriptionStatus: 'trial', type: 'Starter' });
    const doc = await m.User.create({ clinic_id: vide.id, matricule: 'V-1', nom: 'D', prenom: 'V', email: 'doc.vide@test.test', passwordHash: 'x', role: 'doctor', statut: 'actif' });
    await m.Medecin.create({ clinic_id: vide.id, userId: doc.id, matricule: 'MED-V', numeroOrdre: 'ORD-V', specialites: ['MG'], dateDebut: '2020-01-01' });
    await m.Chambre.create({ clinic_id: vide.id, numero: 'V1', typeChambre: 'privee', nbLits: 1 });
    const ok = await sa('DELETE', `/api/super-admin/clinics/${vide.id}`);
    assert.equal(ok.status, 200, JSON.stringify(ok.body));
    for (const Modele of [m.Clinic, m.User, m.Medecin, m.Chambre]) {
        const where = Modele === m.Clinic ? { id: vide.id } : { clinic_id: vide.id };
        assert.equal(await Modele.count({ where }), 0, `${Modele.name} restant`);
    }

    // Répartition : les 6 rôles, total sans les super-admins
    const stats = await sa('GET', '/api/super-admin/stats');
    assert.deepEqual(Object.keys(stats.body.rolesBreakdown).sort(), ['admin', 'doctor', 'lab_technician', 'nurse', 'pharmacist', 'secretary']);
    assert.equal(stats.body.totalUsers, await m.User.count() - await m.User.count({ where: { role: 'super_admin' } }));
});
