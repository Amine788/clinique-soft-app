// Recherche de patient par CIN : un même CIN peut exister dans deux cliniques (A et B ont chacune
// un patient AB123456, celui de A créé en premier). Chaque route doit prendre celui de sa clinique.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { resetDatabase, startServer, loadModels, seedClinic, createHospitalisation, client } from './helpers.js';

let server, m, A, B;

before(async () => {
    await resetDatabase();
    server = await startServer();
    m = await loadModels();
    A = await seedClinic(m, 'A');
    B = await seedClinic(m, 'B');
    assert.equal(A.patient.cinNumero, B.patient.cinNumero);
});
after(async () => {
    await server?.stop();
    await m?.sequelize.close();
});

test('Examens : l’historique par CIN ne montre que les examens de la clinique', async () => {
    const catalogue = await m.ExamenCatalog.create({ code: 'NFS-CL', nom: 'NFS', type: 'laboratoire', prixStandard: 80 });
    await m.ExamenPatient.create({ clinic_id: A.clinic.id, patientId: A.patient.id, medecinId: A.medecin.id, examenId: catalogue.id, resultats: 'secret de A' });

    const r = await client(server.base, B.users.doctor)('GET', `/api/examens/patient/${B.patient.cinNumero}`);
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.deepEqual(r.body, [], 'examens d’une autre clinique visibles');
});

test('Facturation : la facture est rattachée au patient et à la clinique de la secrétaire', async () => {
    const r = await client(server.base, B.users.secretary)('POST', '/api/billing', {
        patientCin: B.patient.cinNumero,
        lignes: [{ sourceType: 'autre', designation: 'Acte', quantite: 1, prixUnitaire: 100 }],
    });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    const facture = await m.Facture.findByPk(r.body.facture.id);
    assert.equal(facture.patientId, B.patient.id);
    assert.equal(facture.clinic_id, B.clinic.id);
});

test('Infirmerie : /nurse/hospitalized affiche le dossier médical du patient de la clinique', async () => {
    // Même CIN créé par l'API dans A puis dans B, avec des allergies différentes
    const creer = (ctx, allergie) => client(server.base, ctx.users.doctor)('POST', '/api/patients', {
        cin: 'OP666666', nom: 'Homonyme', prenom: ctx === A ? 'DeA' : 'DeB', dateNaissance: '1980-01-01', sexe: 'M', telephone: '0600000000', allergies: [allergie],
    });
    assert.equal((await creer(A, 'Pénicilline (A)')).status, 201);
    assert.equal((await creer(B, 'Latex (B)')).status, 201);
    const patientB = await m.Patient.findOne({ where: { clinic_id: B.clinic.id, cinNumero: 'OP666666' } });
    await createHospitalisation(m, { ...B, patient: patientB }, { numero: 'CL-B' });
    await m.Prescription.create({
        numero: 'ORD-CL-B', clinic_id: B.clinic.id, patientCin: 'OP666666', medecinId: B.medecin.id,
        medicaments: '[]', statut: 'remise', slots: '[]',
    });

    const r = await client(server.base, B.users.nurse)('GET', '/api/nurse/hospitalized');
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.deepEqual(r.body.map(p => [p.name, p.allergies]), [['DeB HOMONYME', ['Latex (B)']]]);
});

test('Patients : la création ne rattache que les scans CIN de sa propre clinique', async () => {
    const scanA = await m.CinScan.create({
        clinic_id: A.clinic.id, cinNumero: 'MN555555', face: 'recto', fichierNom: 'a.jpg', fichierPath: '/tmp/a.jpg', uploadeParUserId: A.users.secretary.id,
    });
    const r = await client(server.base, B.users.secretary)('POST', '/api/patients', {
        cin: 'MN555555', nom: 'Scan', prenom: 'Test', dateNaissance: '1990-01-01', sexe: 'F', telephone: '0611111111',
    });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    await scanA.reload();
    assert.equal(scanA.patientId, null, 'scan de A rattaché au patient de B');
    assert.equal(scanA.clinic_id, A.clinic.id);
});

test('Facturation : liste, détail, historique et encaissement limités à la clinique', async () => {
    const facturer = (ctx, lignes = [{ sourceType: 'autre', designation: 'Acte', quantite: 1, prixUnitaire: 100 }]) =>
        client(server.base, ctx.users.secretary)('POST', '/api/billing', { patientCin: ctx.patient.cinNumero, lignes });
    const fA = (await facturer(A)).body.facture;
    const fB = (await facturer(B)).body.facture;
    assert.ok(fA?.id && fB?.id);

    const secB = client(server.base, B.users.secretary);

    // Liste : aucune facture de A
    const liste = await secB('GET', '/api/billing');
    assert.equal(liste.status, 200, JSON.stringify(liste.body));
    assert.ok(liste.body.length > 0);
    assert.ok(liste.body.every(f => f.clinic_id === B.clinic.id), 'liste : facture d’une autre clinique');

    // Détail : 404 pour A, 200 pour la sienne, 403 pour un rôle non facturation
    assert.equal((await secB('GET', `/api/billing/${fA.id}`)).status, 404);
    assert.equal((await secB('GET', `/api/billing/${fB.id}`)).status, 200);
    assert.equal((await client(server.base, B.users.pharmacist)('GET', `/api/billing/${fB.id}`)).status, 403);

    // Historique par CIN (même CIN dans A et B) : seulement B
    const hist = await secB('GET', `/api/billing/patient/${B.patient.cinNumero}`);
    assert.equal(hist.status, 200, JSON.stringify(hist.body));
    assert.ok(hist.body.length > 0);
    assert.ok(hist.body.every(f => f.clinic_id === B.clinic.id), 'historique : facture d’une autre clinique');
    assert.equal((await client(server.base, B.users.nurse)('GET', `/api/billing/patient/${B.patient.cinNumero}`)).status, 403);

    // Encaissement : la facture de A reste impayée
    assert.equal((await secB('PATCH', `/api/billing/${fA.id}/pay`, { modePaiement: 'especes' })).status, 404);
    const factureA = await m.Facture.findByPk(fA.id);
    assert.equal(factureA.statut, 'en_attente');
    assert.equal((await client(server.base, A.users.secretary)('PATCH', `/api/billing/${fA.id}/pay`, { modePaiement: 'carte' })).status, 200);
    await factureA.reload();
    assert.equal(factureA.statut, 'payee');
});

test('Facturation : l’encaissement ne marque « facturé » que les examens de la clinique', async () => {
    const catalogue = await m.ExamenCatalog.create({ code: 'GLY-CL', nom: 'Glycémie', type: 'laboratoire', prixStandard: 50 });
    const examenA = await m.ExamenPatient.create({ clinic_id: A.clinic.id, patientId: A.patient.id, medecinId: A.medecin.id, examenId: catalogue.id });
    const examenB = await m.ExamenPatient.create({ clinic_id: B.clinic.id, patientId: B.patient.id, medecinId: B.medecin.id, examenId: catalogue.id });

    // Une référence forgée vers l'examen de A refuse toute la facture.
    const secB = client(server.base, B.users.secretary);
    const facturesAvant = await m.Facture.count();
    const lignesAvant = await m.LigneFacture.count();
    const refusee = await secB('POST', '/api/billing', {
        patientCin: B.patient.cinNumero,
        lignes: [
            { sourceType: 'examen', sourceId: examenA.id, designation: 'Examen', quantite: 1, prixUnitaire: 50 },
            { sourceType: 'examen', sourceId: examenB.id, designation: 'Examen', quantite: 1, prixUnitaire: 50 },
        ],
    });
    assert.equal(refusee.status, 404, JSON.stringify(refusee.body));
    assert.equal(await m.Facture.count(), facturesAvant);
    assert.equal(await m.LigneFacture.count(), lignesAvant);
    assert.equal((await examenA.reload()).estFacture, false);
    assert.equal((await examenB.reload()).estFacture, false);

    // Le parcours financier reste possible avec une référence de sa clinique.
    const r = await secB('POST', '/api/billing', {
        patientCin: B.patient.cinNumero,
        lignes: [{ sourceType: 'examen', sourceId: examenB.id, designation: 'Acte technique', quantite: 1, prixUnitaire: 50 }],
    });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    assert.equal((await secB('PATCH', `/api/billing/${r.body.facture.id}/pay`, {})).status, 200);

    await examenA.reload();
    await examenB.reload();
    assert.equal(examenA.estFacture, false, 'examen d’une autre clinique marqué facturé');
    assert.equal(examenB.estFacture, true);
});

test('Examens : la liste et la mise à jour du statut sont limitées à la clinique', async () => {
    const catalogue = await m.ExamenCatalog.create({ code: 'CRP-CL', nom: 'CRP', type: 'laboratoire', prixStandard: 60 });
    // Créés par l'API (médecin de chaque clinique) : clinic_id doit être posé à la création
    const prescrire = ctx => client(server.base, ctx.users.doctor)('POST', '/api/examens', {
        patientCin: ctx.patient.cinNumero, examensIds: [catalogue.id],
    });
    const rA = await prescrire(A);
    const rB = await prescrire(B);
    assert.equal(rA.status, 201, JSON.stringify(rA.body));
    assert.equal(rB.status, 201, JSON.stringify(rB.body));
    const examenA = await m.ExamenPatient.findOne({ where: { examenId: catalogue.id, patientId: A.patient.id } });
    const examenB = await m.ExamenPatient.findOne({ where: { examenId: catalogue.id, patientId: B.patient.id } });
    assert.equal(examenA.clinic_id, A.clinic.id);
    assert.equal(examenB.clinic_id, B.clinic.id);

    // Liste : le labo de B ne voit que ses examens, et voit bien celui créé par l'API
    const liste = await client(server.base, B.users.lab_technician)('GET', '/api/examens');
    assert.equal(liste.status, 200, JSON.stringify(liste.body));
    assert.ok(liste.body.some(e => e.id === examenB.id), 'examen de la clinique absent de la liste');
    assert.ok(liste.body.every(e => e.clinic_id === B.clinic.id), 'liste : examen d’une autre clinique');

    // Statut : l'infirmier et le labo de B ne touchent pas l'examen de A
    const nurseB = client(server.base, B.users.nurse);
    assert.equal((await nurseB('PATCH', `/api/examens/${examenA.id}/statut`, { statut: 'preleve' })).status, 404);
    const labB = client(server.base, B.users.lab_technician);
    assert.equal((await labB('PATCH', `/api/examens/${examenA.id}/statut`, { statut: 'termine', resultats: 'faux résultat' })).status, 404);
    await examenA.reload();
    assert.equal(examenA.statut, 'en_attente');
    assert.equal(examenA.resultats ?? null, null);

    // Le patient est hospitalisé et affecté à l'infirmier avant le prélèvement.
    await createHospitalisation(m, B, { numero: 'CL-EXAM' });
    // Le circuit normal de B fonctionne toujours : prélèvement puis résultat
    assert.equal((await nurseB('PATCH', `/api/examens/${examenB.id}/statut`, { statut: 'preleve' })).status, 200);
    assert.equal((await labB('PATCH', `/api/examens/${examenB.id}/statut`, { statut: 'termine', resultats: 'normal' })).status, 200);
    await examenB.reload();
    assert.equal(examenB.statut, 'termine');
    assert.equal(examenB.resultats, 'normal');
});
