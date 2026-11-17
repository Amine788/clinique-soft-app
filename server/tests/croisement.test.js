// Isolation entre cliniques, dans les deux sens : médecins, pharmacie, chambres, ordonnances, rendez-vous.
// Chaque tentative sur la donnée de l'autre clinique est refusée, sans rien afficher ni modifier.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { io } from 'socket.io-client';
import { resetDatabase, startServer, loadModels, seedClinic, createRdv, client, tokenFor } from './helpers.js';

let server, m, A, B;
const sockets = [];

// Données propres à chaque clinique ; même code produit et même CIN patient des deux côtés (cas le plus piégeux)
async function equiper(ctx, label) {
    ctx.produit = await m.ProduitPharmacie.create({
        clinic_id: ctx.clinic.id, codeProduit: 'MED-001', dci: 'paracetamol', nomCommercial: `Doliprane ${label}`,
        forme: 'comprime', categorie: 'medicament', prixVente: 10, stockActuel: 50, stockMinimum: 20,
    });
    ctx.chambre = await m.Chambre.create({ clinic_id: ctx.clinic.id, numero: '301', typeChambre: 'privee', nbLits: 1, statut: 'disponible' });
    ctx.rdv = await createRdv(m, ctx);
    ctx.ordonnance = await m.Prescription.create({
        numero: `ORD-X-${label}`, clinic_id: ctx.clinic.id, patientCin: ctx.patient.cinNumero, medecinId: ctx.medecin.id,
        medicaments: JSON.stringify([{ nom: `Traitement ${label}`, frequence: '1 fois/jour' }]), statut: 'en_attente',
    });
    ctx.absence = await m.Absence.create({
        medecinId: ctx.medecin.id, typeAbsence: 'autre', dateDebut: '2031-01-10', dateFin: '2031-01-12', motif: `Congé ${label}`, statut: 'en_attente',
    });
}

before(async () => {
    await resetDatabase();
    server = await startServer();
    m = await loadModels();
    A = await seedClinic(m, 'A');
    B = await seedClinic(m, 'B');
    await equiper(A, 'A');
    await equiper(B, 'B');
});
after(async () => {
    sockets.forEach(s => s.disconnect());
    await server?.stop();
    await m?.sequelize.close();
});

const sens = () => [[A, B, 'A→B'], [B, A, 'B→A']];
const refuse = (r, quoi) => assert.ok([403, 404].includes(r.status), `${quoi} : ${r.status} ${JSON.stringify(r.body)}`);

test('Médecins : liste, profil et absences limités à la clinique', async () => {
    for (const [moi, autre, s] of sens()) {
        const doc = client(server.base, moi.users.doctor);
        const liste = await doc('GET', '/api/doctors');
        assert.equal(liste.status, 200, s);
        assert.equal(liste.body.length, 1, `${s} : ${JSON.stringify(liste.body)}`);
        assert.ok(!JSON.stringify(liste.body).includes(autre.users.doctor.email), s);

        assert.equal((await doc('GET', `/api/doctors/${moi.medecin.id}`)).status, 200, s);
        assert.equal((await doc('GET', `/api/doctors/${autre.medecin.id}`)).status, 404, s);
        assert.equal((await doc('GET', `/api/doctors/${moi.medecin.id}/absences`)).status, 200, s);
        const abs = await doc('GET', `/api/doctors/${autre.medecin.id}/absences`);
        assert.equal(abs.status, 404, s);
        assert.ok(!JSON.stringify(abs.body).includes('Congé'), s);
        refuse(await doc('GET', `/api/doctors/${autre.medecin.id}/stats`), `${s} stats`);
    }

});

test('Super-admin : gestion de la plateforme oui, données des cliniques non (refus par défaut sans clinique)', async () => {
    const sa = await m.User.create({
        clinic_id: null, matricule: 'T-SUPER', nom: 'PLATEFORME', prenom: 'Super', email: 'super@test.test',
        passwordHash: 'x', role: 'super_admin', statut: 'actif',
    });
    const appel = client(server.base, sa);
    assert.equal((await appel('GET', '/api/super-admin/clinics')).status, 200);

    const urls = [
        '/api/doctors', `/api/doctors/${A.medecin.id}`, `/api/doctors/${A.medecin.id}/absences`,
        '/api/patients', `/api/patients/${A.patient.numeroDossier}`, `/api/patients/${A.patient.numeroDossier}/documents`,
        '/api/appointments', `/api/appointments/${A.rdv.numeroRdv}`,
        '/api/prescriptions', `/api/prescriptions/${A.ordonnance.id}`, '/api/pharmacy/products', '/api/pharmacy/stock',
        '/api/rooms', `/api/rooms/${A.chambre.id}`, '/api/hospitalisations/active', '/api/hospitalisations/admissions',
        '/api/examens', `/api/examens/patient/${A.patient.cinNumero}`, '/api/billing', `/api/billing/patient/${A.patient.cinNumero}`,
        '/api/absences', '/api/dashboard/admin', '/api/dashboard/secretary', '/api/nurse/hospitalized', '/api/nurse/queue',
        '/api/admin/users', '/api/performance/overview', '/api/clinic', '/api/clinic/departements', '/api/patient-access/audit',
    ];
    for (const url of urls) {
        const r = await appel('GET', url);
        assert.equal(r.status, 403, `${url} : ${r.status} ${JSON.stringify(r.body).slice(0, 200)}`);
        const texte = JSON.stringify(r.body);
        for (const secret of [A.patient.numeroDossier, A.users.doctor.email, A.ordonnance.numero, 'Doliprane']) {
            assert.ok(!texte.includes(secret), `${url} révèle ${secret}`);
        }
    }
});

test('Socket : un compte désactivé perd sa connexion ouverte et ne reçoit plus les notifications de la clinique', async () => {
    const connecter = (user) => new Promise((resolve, reject) => {
        const s = io(server.base, { auth: { token: tokenFor(user) }, transports: ['websocket'], reconnection: false, forceNew: true });
        sockets.push(s);
        s.once('connect', () => resolve(s));
        s.once('connect_error', reject);
    });
    const pause = (ms) => new Promise(r => setTimeout(r, ms));
    const secA = await connecter(A.users.secretary);
    const secB = await connecter(B.users.secretary);
    const recusA = [], recusB = [];
    secA.on('hosp_demande', d => recusA.push(d));
    secB.on('hosp_demande', d => recusB.push(d));

    // L'admin de B ne peut pas couper le compte de A ; l'admin de A le désactive
    assert.equal((await client(server.base, B.users.admin)('PATCH', `/api/admin/users/${A.users.secretary.id}/toggle`)).status, 404);
    await pause(200);
    assert.equal(secA.connected, true);
    assert.equal((await client(server.base, A.users.admin)('PATCH', `/api/admin/users/${A.users.secretary.id}/toggle`)).status, 200);
    await pause(400);
    assert.equal(secA.connected, false, 'connexion restée ouverte après désactivation');
    assert.equal(secB.connected, true, 'la clinique B ne doit pas être touchée');

    const r = await client(server.base, A.users.doctor)('POST', '/api/hospitalisations', { patientId: A.patient.id, diagnostic: 'Observation', motif: 'x' });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    await pause(400);
    assert.equal(recusA.length, 0, 'notification reçue par un compte désactivé');
    assert.equal(recusB.length, 0, 'notification reçue par une autre clinique');

    await m.User.update({ statut: 'actif' }, { where: { id: A.users.secretary.id } });
});

test('Pharmacie : même code produit dans deux cliniques, chacune ne voit et ne modifie que le sien', async () => {
    for (const [moi, autre, s] of sens()) {
        const ph = client(server.base, moi.users.pharmacist);
        for (const url of ['/api/pharmacy/products', '/api/pharmacy/stock', '/api/pharmacy/alerts']) {
            const r = await ph('GET', url);
            assert.equal(r.status, 200, `${s} ${url}`);
            assert.ok(!JSON.stringify(r.body).includes(autre.produit.nomCommercial), `${s} ${url}`);
        }
        assert.equal((await ph('POST', '/api/pharmacy/stock/MED-001', { quantity: 5 })).status, 200, s);
    }
    await A.produit.reload(); await B.produit.reload();
    assert.equal(A.produit.stockActuel, 55);
    assert.equal(B.produit.stockActuel, 55);

    // Suppression par A : seul le produit de A disparaît
    assert.equal((await client(server.base, A.users.pharmacist)('DELETE', '/api/pharmacy/products/MED-001')).status, 200);
    assert.equal(await m.ProduitPharmacie.count({ where: { clinic_id: A.clinic.id } }), 0);
    assert.equal(await m.ProduitPharmacie.count({ where: { clinic_id: B.clinic.id } }), 1);
    assert.equal((await client(server.base, A.users.pharmacist)('POST', '/api/pharmacy/stock/MED-001', { quantity: 5 })).status, 404);
    await B.produit.reload();
    assert.equal(B.produit.stockActuel, 55);
});

test('Chambres : liste, détail, statut et suppression limités à la clinique', async () => {
    for (const [moi, autre, s] of sens()) {
        const sec = client(server.base, moi.users.secretary);
        const liste = await sec('GET', '/api/rooms');
        assert.equal(liste.status, 200, s);
        assert.equal(liste.body.length, 1, s);

        assert.equal((await sec('GET', `/api/rooms/${autre.chambre.id}`)).status, 404, s);
        assert.equal((await sec('PUT', `/api/rooms/${autre.chambre.id}/status`, { statut: 'hors_service' })).status, 404, s);
        assert.equal((await sec('DELETE', `/api/rooms/${autre.chambre.id}`)).status, 404, s);
        assert.equal((await sec('GET', `/api/rooms/${moi.chambre.id}`)).status, 200, s);
    }
    await A.chambre.reload(); await B.chambre.reload();
    assert.equal(A.chambre.statut, 'disponible');
    assert.equal(B.chambre.statut, 'disponible');
});

test('Ordonnances : même CIN patient dans deux cliniques, liste, détail et statut limités à la clinique', async () => {
    for (const [moi, autre, s] of sens()) {
        const ph = client(server.base, moi.users.pharmacist);
        const liste = await ph('GET', '/api/prescriptions');
        assert.equal(liste.status, 200, s);
        assert.ok(JSON.stringify(liste.body).includes(moi.ordonnance.numero), s);
        assert.ok(!JSON.stringify(liste.body).includes(autre.ordonnance.numero), s);

        assert.equal((await ph('GET', `/api/prescriptions/${autre.ordonnance.id}`)).status, 404, s);
        assert.equal((await ph('PATCH', `/api/prescriptions/${autre.ordonnance.id}/status`, { statut: 'en_preparation' })).status, 404, s);
        assert.equal((await client(server.base, moi.users.doctor)('GET', `/api/prescriptions/${autre.ordonnance.id}`)).status, 404, s);
        assert.equal((await ph('GET', `/api/prescriptions/${moi.ordonnance.id}`)).status, 200, s);
    }
    await A.ordonnance.reload(); await B.ordonnance.reload();
    assert.equal(A.ordonnance.statut, 'en_attente');
    assert.equal(B.ordonnance.statut, 'en_attente');
});

test('Rendez-vous : liste, détail, statut et modification limités à la clinique', async () => {
    for (const [moi, autre, s] of sens()) {
        const sec = client(server.base, moi.users.secretary);
        const liste = await sec('GET', '/api/appointments');
        assert.equal(liste.status, 200, s);
        assert.ok(!JSON.stringify(liste.body).includes(autre.rdv.numeroRdv), s);

        assert.equal((await sec('GET', `/api/appointments/${autre.rdv.numeroRdv}`)).status, 404, s);
        assert.equal((await sec('PUT', `/api/appointments/${autre.rdv.numeroRdv}/status`, { status: 'annule' })).status, 404, s);
        assert.equal((await sec('PATCH', `/api/appointments/${autre.rdv.numeroRdv}`, { motif: 'Piraté' })).status, 404, s);
        assert.equal((await sec('GET', `/api/appointments/${moi.rdv.numeroRdv}`)).status, 200, s);

        // Création chez soi avec le médecin de l'autre clinique : refusée
        const r = await sec('POST', '/api/appointments', {
            patientCin: moi.patient.cinNumero, doctorId: autre.medecin.id, medecinId: autre.medecin.id,
            date: '2031-02-03', time: '10:00', heure: '10:00', typeConsultation: 'premiere', motif: 'Croisé',
        });
        assert.ok(r.status >= 400, `${s} création croisée : ${r.status} ${JSON.stringify(r.body)}`);
    }
    await A.rdv.reload(); await B.rdv.reload();
    for (const rdv of [A.rdv, B.rdv]) {
        assert.equal(rdv.statut, 'confirme');
        assert.equal(rdv.motif, 'Test');
    }
    assert.equal(await m.RendezVous.count({ where: { motif: 'Croisé' } }), 0);
});

test('Tableaux de bord : aucun rôle ne voit une donnée de l’autre clinique', async () => {
    for (const [moi, autre, s] of sens()) {
        for (const role of ['secretary', 'doctor', 'pharmacist', 'lab_technician', 'admin']) {
            const r = await client(server.base, moi.users[role])('GET', `/api/dashboard/${role}`);
            assert.equal(r.status, 200, `${s} ${role} : ${JSON.stringify(r.body).slice(0, 200)}`);
            const texte = JSON.stringify(r.body);
            for (const secret of [autre.patient.numeroDossier, autre.rdv.numeroRdv, autre.ordonnance.numero, autre.clinic.name, autre.users.doctor.email]) {
                assert.ok(!texte.includes(secret), `${s} ${role} révèle ${secret}`);
            }
        }
    }
});

test('IA : le patient d’une autre clinique n’entre jamais dans un contexte envoyé à l’IA', async () => {
    for (const [moi, autre, s] of sens()) {
        const doc = client(server.base, moi.users.doctor);
        for (const id of [autre.patient.id, autre.patient.numeroDossier]) {
            const resume = await doc('POST', '/api/ai/patient-summary', { patientId: id });
            assert.ok([403, 404].includes(resume.status), `${s} résumé ${id} : ${resume.status} ${JSON.stringify(resume.body).slice(0, 200)}`);
            const chat = await doc('POST', '/api/ai/chat', { message: 'Résumé ?', context: { patientId: id } });
            assert.ok([403, 404].includes(chat.status), `${s} chat ${id} : ${chat.status} ${JSON.stringify(chat.body).slice(0, 200)}`);
        }
    }
});

test('Socket : une clinique suspendue perd ses connexions ouvertes et ne peut pas se reconnecter ; l’autre n’est pas touchée', async () => {
    const connecter = (user) => new Promise((resolve) => {
        const s = io(server.base, { auth: { token: tokenFor(user) }, transports: ['websocket'], reconnection: false, forceNew: true });
        sockets.push(s);
        s.once('connect', () => resolve(s));
        s.once('connect_error', (err) => resolve({ error: err.message }));
    });
    const pause = (ms) => new Promise(r => setTimeout(r, ms));
    const sa = await m.User.findOne({ where: { role: 'super_admin' } });
    const docA = await connecter(A.users.doctor);
    const docB = await connecter(B.users.doctor);
    assert.equal(docA.connected, true);

    const r = await client(server.base, sa)('PUT', `/api/super-admin/clinics/${A.clinic.id}/status`, { status: 'suspended' });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    await pause(400);
    assert.equal(docA.connected, false, 'connexion restée ouverte après suspension');
    assert.equal(docB.connected, true, 'la clinique B ne doit pas être touchée');
    assert.equal((await connecter(A.users.doctor)).error, 'unauthorized');

    assert.equal((await client(server.base, sa)('PUT', `/api/super-admin/clinics/${A.clinic.id}/status`, { status: 'active' })).status, 200);
    assert.equal((await connecter(A.users.doctor)).connected, true);
});

test('Filet automatique : une requête sans filtre (route qui l’aurait oublié) reste limitée à la clinique', async () => {
    const cls = (await import('cls-hooked')).default;
    const ns = cls.getNamespace('clinicsoft-tenant');
    const total = await m.Chambre.count();
    assert.equal(total, 2, 'hors requête (tâche automatique) : aucune limite');

    await ns.runPromise(async () => {
        ns.set('clinicId', A.clinic.id);

        // Lectures et comptages sans aucun filtre
        assert.deepEqual((await m.Chambre.findAll()).map(c => c.clinic_id), [A.clinic.id]);
        assert.equal(await m.Chambre.count(), 1);
        assert.deepEqual((await m.Prescription.findAll()).map(p => p.numero), [A.ordonnance.numero]);
        assert.equal(await m.Chambre.findByPk(B.chambre.id), null);
        assert.equal(await m.RendezVous.findOne({ where: { numeroRdv: B.rdv.numeroRdv } }), null);
        assert.equal((await m.Patient.findAndCountAll()).count, await m.Patient.count({ where: { clinic_id: A.clinic.id }, toutesCliniques: true }));

        // Un filtre demandant l'autre clinique ne passe pas : la limite s'ajoute, elle ne remplace rien
        assert.deepEqual(await m.Chambre.findAll({ where: { clinic_id: B.clinic.id } }), []);

        // Écritures en masse par identifiant de l'autre clinique : aucune ligne touchée
        assert.deepEqual(await m.Chambre.update({ statut: 'hors_service' }, { where: { id: B.chambre.id } }), [0]);
        assert.equal(await m.Chambre.destroy({ where: { id: B.chambre.id } }), 0);
        assert.equal(await m.Prescription.destroy({ where: {} }), 1, 'seule l’ordonnance de A est concernée');

        // Exception explicite, réservée aux contrôles d'unicité globale
        assert.equal(await m.User.findOne({ where: { email: B.users.doctor.email } }), null);
        assert.ok(await m.User.findOne({ where: { email: B.users.doctor.email }, toutesCliniques: true }));
    });

    // Relecture sans limite de clinique (la suite de ce test hérite du contexte ouvert ci-dessus)
    const chambreB = await m.Chambre.findOne({ where: { id: B.chambre.id }, toutesCliniques: true });
    assert.equal(chambreB?.statut, 'disponible');
    assert.equal(await m.Prescription.count({ where: { id: B.ordonnance.id }, toutesCliniques: true }), 1);
    assert.equal(await m.Prescription.count({ where: { id: A.ordonnance.id }, toutesCliniques: true }), 0);
});
