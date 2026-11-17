// B2, B3, B4, B9 (corrections précédentes), B5 (examens ↔ consultation), B12 (performance), B15 (assurance)
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import { jourClinique } from '../services/dates.js';
import { resetDatabase, startServer, loadModels, seedClinic, createRdv, client } from './helpers.js';

let server, m, A, B;

before(async () => {
    await resetDatabase();
    server = await startServer();
    m = await loadModels();
    A = await seedClinic(m, 'A');
    B = await seedClinic(m, 'B');
});
after(async () => {
    await server?.stop();
    await m?.sequelize.close();
});

const demain = () => new Date(Date.now() + 86400000).toISOString().slice(0, 10);

test('B4 : une deuxième clinique peut prendre son premier RDV', async () => {
    for (const [ctx, heure] of [[A, '10:00'], [B, '10:00']]) {
        const r = await client(server.base, ctx.users.secretary)('POST', '/api/appointments', {
            patientCin: ctx.patient.cinNumero, doctorId: ctx.medecin.id, date: demain(), heure, typeConsultation: 'premiere', motif: 'Test',
        });
        assert.equal(r.status, 201, JSON.stringify(r.body));
        assert.match(r.body.id, new RegExp(`^RDV-${ctx.clinic.id}-`));
    }
});

test('B3 : le type de consultation envoyé est enregistré', async () => {
    for (const [type, attendu, heure] of [['suivi', 'suivi', '11:00'], ['urgente', 'urgente', '11:30'], ['preoperation', 'bilan', '12:00']]) {
        const r = await client(server.base, A.users.secretary)('POST', '/api/appointments', {
            patientCin: A.patient.cinNumero, doctorId: A.medecin.id, date: demain(), heure, typeConsultation: type, motif: 'Test',
        });
        assert.equal(r.status, 201, JSON.stringify(r.body));
        assert.equal(r.body.type, attendu, type);
    }
});

test('B2 : check-cin renvoie allergies et groupe sanguin', async () => {
    const dossier = await m.DossierMedical.findOne({ where: { patientId: A.patient.id } });
    await dossier.update({ allergies: JSON.stringify(['Pénicilline']), groupeSanguin: 'O+' });
    const r = await client(server.base, A.users.doctor)('GET', `/api/patients/check-cin/${A.patient.cinNumero}`);
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.deepEqual(r.body.patient.allergies, ['Pénicilline']);
    assert.equal(r.body.patient.bloodType, 'O+');
});

test('B9 : un jeton expiré ou invalide donne 401', async () => {
    const expire = jwt.sign({ id: A.users.admin.id, role: 'admin', clinic_id: A.clinic.id }, 'clinicsoft-tests-secret', { expiresIn: -10 });
    for (const token of [expire, 'pas-un-jeton']) {
        const r = await fetch(`${server.base}/api/patients`, { headers: { Authorization: `Bearer ${token}` } });
        assert.equal(r.status, 401);
    }
});

test('B5 : les examens prescrits sont liés au RDV de la consultation', async () => {
    const examen = await m.ExamenCatalog.create({ code: 'NFS', nom: 'Numération', type: 'laboratoire', prixStandard: 80 });
    const rdv = await createRdv(m, A);
    const doc = client(server.base, A.users.doctor);

    const r = await doc('POST', '/api/examens', { patientCin: A.patient.cinNumero, rdvId: rdv.numeroRdv, examensIds: [examen.id] });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    const cree = await m.ExamenPatient.findByPk(r.body.examens[0].id);
    assert.equal(cree.consultationId, rdv.id);

    // RDV inconnu, ou RDV d'une autre clinique : refusé au lieu d'un examen sans lien
    const rdvB = await createRdv(m, B);
    assert.equal((await doc('POST', '/api/examens', { patientCin: A.patient.cinNumero, rdvId: 'RDV-INCONNU', examensIds: [examen.id] })).status, 404);
    assert.equal((await doc('POST', '/api/examens', { patientCin: A.patient.cinNumero, rdvId: rdvB.numeroRdv, examensIds: [examen.id] })).status, 404);

    // Sans RDV (hospitalisation) : accepté, sans lien
    const sans = await doc('POST', '/api/examens', { patientCin: A.patient.cinNumero, examensIds: [examen.id] });
    assert.equal(sans.status, 201);
    assert.equal((await m.ExamenPatient.findByPk(sans.body.examens[0].id)).consultationId, null);
});

test('B12 : la page Performance ne compte que la clinique de l’admin', async () => {
    const aujourdHui = jourClinique();
    await createRdv(m, A, { date: aujourdHui });
    await createRdv(m, B, { date: aujourdHui });
    await createRdv(m, B, { date: aujourdHui });
    await m.Chambre.create({ clinic_id: A.clinic.id, numero: 'A1', typeChambre: 'double', nbLits: 2, statut: 'occupee' });
    await m.Chambre.create({ clinic_id: B.clinic.id, numero: 'B1', typeChambre: 'commune', nbLits: 6, statut: 'occupee' });
    await m.Facture.create({ clinic_id: B.clinic.id, numero: 'FAC-B-1', patientCin: B.patient.cinNumero, patientId: B.patient.id, total: 5000, statut: 'payee' });
    await m.Facture.create({ clinic_id: A.clinic.id, numero: 'FAC-A-1', patientCin: A.patient.cinNumero, patientId: A.patient.id, total: 300, statut: 'payee' });

    const attenduRdvA = await m.RendezVous.count({ where: { clinic_id: A.clinic.id, dateRdv: aujourdHui } });
    const r = await client(server.base, A.users.admin)('GET', '/api/performance/overview');
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(r.body.consultationsJour, attenduRdvA);
    assert.equal(r.body.totalLits, 2);
    assert.equal(r.body.litsOccupes, 2);
    assert.equal(r.body.caTotal, 300);

    const occ = await client(server.base, A.users.admin)('GET', '/api/performance/occupancy');
    assert.equal(occ.body.total, 2);

    const lab = await client(server.base, A.users.lab_technician)('GET', '/api/dashboard/lab_technician');
    const examensA = await m.ExamenPatient.count({ where: { clinic_id: A.clinic.id, statut: 'en_attente' } });
    assert.equal(lab.body.enAttente, examensA);
});

test('B15 : l’assurance saisie à la création est enregistrée', async () => {
    const sec = client(server.base, A.users.secretary);
    const r = await sec('POST', '/api/patients', {
        cin: 'GH222222', nom: 'Assure', prenom: 'Test', dateNaissance: '1990-01-01', sexe: 'F', telephone: '0611111111', insurance: 'CNOPS (80%)',
    });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    const p = await m.Patient.findOne({ where: { cinNumero: 'GH222222' } });
    assert.equal(p.assuranceOrganisme, 'CNOPS');
    assert.equal(Number(p.assuranceTaux), 80);

    const dossier = await sec('GET', `/api/patients/${p.numeroDossier}`);
    assert.equal(dossier.body.insurance, 'CNOPS (80%)');

    await sec('PUT', `/api/patients/${p.numeroDossier}`, { insurance: 'Saham' });
    await p.reload();
    assert.equal(p.assuranceOrganisme, 'Saham');
    assert.equal(p.assuranceTaux, null);
});

test('E4 : le serveur refuse de démarrer sans JWT_SECRET ou avec « change-me »', async () => {
    for (const secret of ['', 'change-me']) {
        await assert.rejects(
            startServer({ JWT_SECRET: secret, PORT: '3998' }),
            err => /s'est arrêté/.test(err.message) && /JWT_SECRET manquant/.test(err.message),
            `secret « ${secret} » accepté`,
        );
    }
});

test('Patients : la secrétaire modifie l’administratif, le médecin le médical ; valeurs contrôlées, limitée à la clinique', async () => {
    const sec = client(server.base, A.users.secretary);
    const doc = client(server.base, A.users.doctor);
    const id = A.patient.numeroDossier;

    // Secrétaire : fiche administrative
    const r = await sec('PUT', `/api/patients/${id}`, {
        prenom: 'Aicha', telephonePrincipal: '0661000000', email: 'aicha@test.test', adresseRue: '12 rue Atlas', adresseVille: 'Rabat',
        insurance: 'CNOPS (80%)',
    });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    let fiche = (await sec('GET', `/api/patients/${id}`)).body;
    assert.equal(fiche.prenom, 'Aicha');
    assert.equal(fiche.adresseRue, '12 rue Atlas');
    assert.equal(fiche.insurance, 'CNOPS (80%)');

    // Secrétaire : toute donnée médicale est refusée, et rien du reste de la demande n'est enregistré
    const avant = (await doc('GET', `/api/patients/${id}`)).body;
    for (const corps of [{ bloodType: 'B+' }, { allergies: ['Latex'] }, { chronic: ['Asthme'] }, { prenom: 'Refus', allergies: ['Latex'] }]) {
        assert.equal((await sec('PUT', `/api/patients/${id}`, corps)).status, 403, JSON.stringify(corps));
    }
    fiche = (await doc('GET', `/api/patients/${id}`)).body;
    assert.equal(fiche.prenom, 'Aicha');
    assert.deepEqual(fiche.allergies, avant.allergies);
    assert.deepEqual(fiche.chronic, avant.chronic);
    assert.equal(fiche.bloodType, avant.bloodType);

    // Médecin : données médicales
    const rm = await doc('PUT', `/api/patients/${id}`, { bloodType: 'B+', allergies: ['Pénicilline', 'Latex'], chronic: ['Asthme'] });
    assert.equal(rm.status, 200, JSON.stringify(rm.body));
    fiche = (await doc('GET', `/api/patients/${id}`)).body;
    assert.equal(fiche.bloodType, 'B+');
    assert.deepEqual(fiche.allergies, ['Pénicilline', 'Latex']);
    assert.deepEqual(fiche.chronic, ['Asthme']);

    // Effacement : e-mail et adresse par la secrétaire, allergies et groupe sanguin par le médecin
    assert.equal((await sec('PUT', `/api/patients/${id}`, { email: '', adresseRue: '' })).status, 200);
    assert.equal((await doc('PUT', `/api/patients/${id}`, { allergies: [], bloodType: '' })).status, 200);
    fiche = (await doc('GET', `/api/patients/${id}`)).body;
    assert.equal(fiche.email, null);
    assert.equal(fiche.adresseRue, null);
    assert.deepEqual(fiche.allergies, []);
    assert.equal(fiche.bloodType, null);
    assert.equal(fiche.adresseVille, 'Rabat', 'champ non envoyé conservé');

    // Valeurs invalides : 400 (et plus 500) ; autre clinique : 404
    assert.equal((await sec('PUT', `/api/patients/${id}`, { sexe: 'X' })).status, 400);
    assert.equal((await doc('PUT', `/api/patients/${id}`, { bloodType: 'Z+' })).status, 400);
    assert.equal((await client(server.base, B.users.secretary)('PUT', `/api/patients/${id}`, { prenom: 'Pirate' })).status, 404);
    assert.equal((await client(server.base, B.users.doctor)('PUT', `/api/patients/${id}`, { allergies: ['Pirate'] })).status, 404);
    assert.equal((await sec('GET', `/api/patients/${id}`)).body.prenom, 'Aicha');
});
