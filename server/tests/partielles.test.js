// P6, P10, P11, P13, P14, P16, P17, V2, V3, V4 (incompatibilités partielles côté serveur) et stock de pharmacie par clinique
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import { jourClinique, premierDuMois } from '../services/dates.js';
import { resetDatabase, startServer, loadModels, seedClinic, client, createRdv, createHospitalisation } from './helpers.js';

let server, m, A, B;

before(async () => {
    await resetDatabase();
    server = await startServer();
    m = await loadModels();
    A = await seedClinic(m, 'A');
    B = await seedClinic(m, 'B');
    const produit = (ctx, code, nom, dci, stock) => m.ProduitPharmacie.create({
        clinic_id: ctx.clinic.id, codeProduit: code, nomCommercial: nom, dci, forme: 'comprime', dosage: '500 mg',
        categorie: 'antalgique', prixAchat: 1, prixVente: 2, stockMinimum: 20, stockActuel: stock, actif: true,
    });
    await produit(A, 'P-001', 'Doliprane 500', 'Paracétamol', 50);
    await produit(A, 'P-002', 'Augmentin 1g', 'Amoxicilline', 5);
    await produit(B, 'P-001', 'Produit de B', 'Ibuprofène', 3);
});
after(async () => {
    await server?.stop();
    await m?.sequelize.close();
});

test('P16 : /pharmacy/stock?search filtre par nom commercial ou DCI', async () => {
    const doc = client(server.base, A.users.doctor);
    const parNom = await doc('GET', '/api/pharmacy/stock?search=Augmentin');
    assert.equal(parNom.status, 200, JSON.stringify(parNom.body));
    assert.deepEqual(parNom.body.map(p => p.name), ['Augmentin 1g']);
    const parDci = await doc('GET', '/api/pharmacy/stock?search=parac');
    assert.deepEqual(parDci.body.map(p => p.name), ['Doliprane 500']);
    assert.equal((await doc('GET', '/api/pharmacy/stock?search=inexistant')).body.length, 0);
});

test('Pharmacie : chaque clinique ne voit et ne modifie que son stock', async () => {
    const phA = client(server.base, A.users.pharmacist);
    const phB = client(server.base, B.users.pharmacist);
    assert.deepEqual((await phA('GET', '/api/pharmacy/products')).body.map(p => p.name).sort(), ['Augmentin 1g', 'Doliprane 500']);
    assert.deepEqual((await phB('GET', '/api/pharmacy/stock')).body.map(p => p.name), ['Produit de B']);

    // Même code produit dans deux cliniques : l'ajustement de B ne touche que son produit
    await phB('POST', '/api/pharmacy/stock/P-001', { quantity: 10 });
    const doliA = await m.ProduitPharmacie.findOne({ where: { clinic_id: A.clinic.id, codeProduit: 'P-001' } });
    assert.equal(doliA.stockActuel, 50);

    const creation = await phB('POST', '/api/pharmacy/products', { codeProduit: 'P-002', nomCommercial: 'Autre', forme: 'sirop', categorie: 'x' });
    assert.equal(creation.status, 201, 'le code P-002 de A ne doit pas bloquer B');
    assert.equal((await m.ProduitPharmacie.findOne({ where: { nomCommercial: 'Autre' } })).clinic_id, B.clinic.id);

    assert.equal((await phB('DELETE', '/api/pharmacy/products/P-002')).status, 200);
    assert.ok(await m.ProduitPharmacie.findOne({ where: { clinic_id: A.clinic.id, codeProduit: 'P-002' } }), 'produit de A supprimé par B');
});

test('P10 : les alertes de stock incluent la DCI et seulement la clinique', async () => {
    const r = await client(server.base, A.users.pharmacist)('GET', '/api/pharmacy/alerts');
    assert.equal(r.status, 200);
    assert.deepEqual(r.body.lowStockItems.map(i => [i.name, i.dci]), [['Augmentin 1g', 'Amoxicilline']]);
});

test('P6 : la liste des patients expose createdAt', async () => {
    const r = await client(server.base, A.users.secretary)('GET', '/api/patients');
    assert.equal(r.status, 200);
    const p = r.body.find(x => x.numeroDossier === A.patient.numeroDossier);
    assert.ok(p.createdAt, JSON.stringify(p));
    assert.ok(Math.abs(new Date(p.createdAt) - A.patient.createdAt) < 2000);
});

test('P11 : l’activation du compte renvoie le même utilisateur que la connexion (doctorId)', async () => {
    // Compte en attente d'activation, comme après une invitation (mot de passe pas encore défini)
    await A.users.doctor.update({ statut: 'inactif', passwordHash: 'PENDING_INVITE' });
    const token = jwt.sign({ userId: A.users.doctor.id }, 'clinicsoft-tests-secret', { expiresIn: '1h' });
    const r = await client(server.base)('POST', '/api/auth/setup-password', { token, password: 'secret123' });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(r.body.user.doctorId, A.medecin.id);

    const login = await client(server.base)('POST', '/api/auth/login', { email: A.users.doctor.email, password: 'secret123' });
    assert.equal(login.status, 200, JSON.stringify(login.body));
    assert.deepEqual(Object.keys(r.body.user).sort(), Object.keys(login.body.user).sort());
    assert.equal(login.body.user.doctorId, A.medecin.id);
});

test('P13 : les indicateurs non mesurés ne sont plus inventés, la spécialité est lue', async () => {
    await A.medecin.update({ specialites: JSON.stringify(['Cardiologie']) });
    const rdv = await m.RendezVous.create({
        clinic_id: A.clinic.id, numeroRdv: 'RDV-P13', patientId: A.patient.id, patientCin: A.patient.cinNumero,
        medecinId: A.medecin.id, dateRdv: jourClinique(), heureDebut: '09:00', heureFin: '09:30',
        typeConsultation: 'premiere', motif: 'x', statut: 'termine', creePar: A.users.secretary.id,
    });
    await m.Facture.create({ clinic_id: A.clinic.id, numero: 'FAC-P13', patientCin: A.patient.cinNumero, rdvId: rdv.id, total: 200, statut: 'payee' });

    const admin = client(server.base, A.users.admin);
    assert.equal((await admin('GET', '/api/performance/overview')).body.satisfaction, null);

    const indicateurs = (await admin('GET', '/api/performance/indicators')).body;
    for (const label of ['Délai attente moy.', 'Satisfaction']) {
        const ind = indicateurs.find(i => i.label === label);
        assert.equal(ind.pct, null, label);
        assert.equal(ind.val, 'Non mesuré', label);
    }

    const finance = (await admin('GET', '/api/performance/finance')).body;
    assert.equal(finance.medecins[0].specialite, 'Cardiologie');
});

test('P13 : la spécialité est lue quel que soit l’encodage de specialites', async () => {
    const admin = client(server.base, A.users.admin);
    for (const valeur of [['Pédiatrie'], JSON.stringify(['Pédiatrie']), 'Pédiatrie']) {
        await A.medecin.update({ specialites: valeur });
        const finance = (await admin('GET', '/api/performance/finance')).body;
        assert.equal(finance.medecins[0].specialite, 'Pédiatrie', JSON.stringify(valeur));
    }
});

// Contrats d'API sur lesquels s'appuient les corrections front P1, P2 et P18
test('P1 (contrat) : GET /appointments renvoie l’heure « HH:MM » et le statut de chaque RDV', async () => {
    const sec = client(server.base, A.users.secretary);
    const date = new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10);
    const cree = await sec('POST', '/api/appointments', {
        patientCin: A.patient.cinNumero, doctorId: A.medecin.id, date, heure: '10:30', typeConsultation: 'suivi', motif: 'x',
    });
    assert.equal(cree.status, 201, JSON.stringify(cree.body));
    const liste = await sec('GET', `/api/appointments?doctorId=${A.medecin.id}&date=${date}`);
    assert.deepEqual(liste.body.map(a => [a.time, a.status]), [['10:30', 'planifie']]);
});

test('P2 (contrat) : la facture renvoie assuranceTaux en pourcentage', async () => {
    const r = await client(server.base, A.users.secretary)('POST', '/api/billing', {
        patientCin: A.patient.cinNumero, assuranceTaux: 30,
        lignes: [{ sourceType: 'autre', designation: 'Acte', quantite: 1, prixUnitaire: 100 }],
    });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    assert.equal(Number(r.body.facture.assuranceTaux), 30);
});

test('P18 (contrat) : check-cin signale un format invalide par valid: false', async () => {
    const r = await client(server.base, A.users.secretary)('GET', '/api/patients/check-cin/ABC');
    assert.equal(r.status, 200);
    assert.equal(r.body.valid, false);
    assert.equal(r.body.exists, false);
});

test('P14 : les statistiques du médecin sont calculées sur ses RDV et réservées au médecin', async () => {
    const C = await seedClinic(m, 'C'); // clinique dédiée : aucun RDV laissé par les autres tests
    const aujourdhui = jourClinique();
    const moisPrec = `${premierDuMois(aujourdhui, -1).slice(0, 8)}15`;

    const r1 = await createRdv(m, C, { date: aujourdhui, statut: 'termine' });
    const r2 = await createRdv(m, C, { date: aujourdhui, statut: 'termine' });
    await r2.update({ typeConsultation: 'suivi', motif: 'test' }); // même motif que r1, casse différente
    await createRdv(m, C, { date: aujourdhui, statut: 'non_presente' });
    await createRdv(m, C, { date: moisPrec, statut: 'termine' });
    await createRdv(m, B, { date: aujourdhui, statut: 'termine' }); // autre clinique, autre médecin

    const facture = (statut, rdv, montant) => m.Facture.create({
        clinic_id: C.clinic.id, numero: `F-${statut}-${rdv.id}`, patientCin: C.patient.cinNumero, total: montant, statut,
    }).then(f => m.LigneFacture.create({
        factureId: f.id, sourceType: 'consultation', sourceId: rdv.id, designation: 'Consultation',
        quantite: 1, prixUnitaire: montant, montantTotal: montant,
    }));
    await facture('payee', r1, 300);
    await facture('annulee', r2, 999);

    const r = await client(server.base, C.users.doctor)('GET', `/api/doctors/${C.medecin.id}/stats`);
    assert.equal(r.status, 200, JSON.stringify(r.body));
    const s = r.body;
    assert.equal(s.totalConsultations, 2);
    assert.equal(s.avgPerDay, 2);
    assert.equal(s.noShows, 1);
    assert.equal(s.prevNoShows, 0);
    assert.equal(s.presenceRate, 67);
    assert.equal(s.monthlyRevenue, 300, 'facture annulée exclue');
    assert.equal(s.prevMonthRevenue, 0);
    assert.equal(s.consultationsPerDay[Number(aujourdhui.slice(8, 10)) - 1], 2);
    assert.equal(s.consultationsPerDay.reduce((a, b) => a + b, 0), 2);
    assert.deepEqual(s.byType.map(t => [t.name, t.value]).sort(), [['1ère Consult', 1], ['Suivi', 1]]);
    assert.deepEqual(s.topDiagnoses, [{ rank: 1, name: 'Test', count: 2, percent: 100 }]);
    assert.equal(s.byAge.reduce((a, t) => a + t.value, 0), 1, 'un seul patient distinct');
    assert.equal(s.monthlyTrend.length, 7);
    assert.deepEqual(s.monthlyTrend.slice(-2).map(t => t.consultations), [1, 2]);
    assert.ok(s.periode);

    // Ni un autre médecin, ni un autre rôle
    assert.equal((await client(server.base, B.users.doctor)('GET', `/api/doctors/${C.medecin.id}/stats`)).status, 403);
    assert.equal((await client(server.base, C.users.secretary)('GET', `/api/doctors/${C.medecin.id}/stats`)).status, 403);
});

test('P17 : une hospitalisation prévue au RDV crée une demande d’admission, la chambre reste libre jusqu’à l’admission', async () => {
    const D = await seedClinic(m, 'D');
    const sec = client(server.base, D.users.secretary);
    const chambre = await m.Chambre.create({ clinic_id: D.clinic.id, numero: '201', typeChambre: 'privee', nbLits: 1, statut: 'disponible' });
    const jour = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
    const rdv = (heure, extra) => sec('POST', '/api/appointments', {
        patientCin: D.patient.cinNumero, doctorId: D.medecin.id, date: jour(3), heure, typeConsultation: 'bilan', motif: 'Bilan pré-op', ...extra,
    });

    // Sans hospitalisation, une chambre envoyée par erreur est ignorée
    const simple = await rdv('09:00', { hospitalisation: false, chambreId: chambre.id });
    assert.equal(simple.status, 201, JSON.stringify(simple.body));
    assert.equal(simple.body.hospitalisationId, null);

    assert.equal((await rdv('09:30', { hospitalisation: true, chambreId: chambre.id, dateAdmission: jour(5), dateSortieEstimee: jour(4) })).status, 400);

    const r = await rdv('10:00', { hospitalisation: true, chambreId: chambre.id, dateAdmission: jour(3), dateSortieEstimee: jour(6) });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    const hosp = await m.Hospitalisation.findByPk(r.body.hospitalisationId);
    assert.equal(hosp.statut, 'demande');
    assert.equal(hosp.clinic_id, D.clinic.id);
    assert.equal(hosp.patientId, D.patient.id);
    assert.equal(hosp.medecinId, D.medecin.id);
    assert.equal(hosp.chambreId, chambre.id);
    assert.equal(hosp.motif, 'Bilan pré-op');
    assert.equal(hosp.dateSortieEstimee, jour(6));
    assert.equal((await chambre.reload()).statut, 'disponible', 'chambre occupée avant l’admission');

    const admissions = await sec('GET', '/api/hospitalisations/admissions');
    assert.deepEqual(admissions.body.map(a => a.id), [hosp.id]);

    // Pas de seconde demande pour le même patient, et le RDV n'est pas créé
    const avant = await m.RendezVous.count({ where: { clinic_id: D.clinic.id } });
    assert.equal((await rdv('11:00', { hospitalisation: true })).status, 409);
    assert.equal(await m.RendezVous.count({ where: { clinic_id: D.clinic.id } }), avant);

    // L'admission par le flux existant occupe la chambre proposée
    const admis = await sec('PUT', `/api/hospitalisations/${hosp.id}/admit`, { chambreId: chambre.id, lit: 'A', nurseId: D.users.nurse.id });
    assert.equal(admis.status, 200, JSON.stringify(admis.body));
    assert.equal((await chambre.reload()).statut, 'occupee');
    assert.equal((await hosp.reload()).statut, 'admis');
});

test('V2 : la liste des ordonnances affiche le patient de la clinique, en un nombre fixe de requêtes', async () => {
    // A et B ont chacune un patient au même CIN ; celui de A a été créé en premier
    await B.patient.update({ nom: 'DE B', prenom: 'Patient' });
    for (let i = 0; i < 3; i++) {
        await m.Prescription.create({
            numero: `ORD-V2-${i}`, clinic_id: B.clinic.id, patientCin: B.patient.cinNumero, medecinId: B.medecin.id,
            medicaments: '[]', statut: 'en_attente', slots: '[]',
        });
    }
    const r = await client(server.base, B.users.pharmacist)('GET', '/api/prescriptions');
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(r.body.length, 3);
    assert.deepEqual([...new Set(r.body.map(p => p.patientNom))], ['Patient DE B']);
    assert.deepEqual([...new Set(r.body.map(p => p.medecinNom))], [`Dr. ${B.users.doctor.prenom} ${B.users.doctor.nom}`]);
});

test('V3 : une image OCR au-delà de 10 Mo donne un 413 explicite en JSON', async () => {
    const r = await client(server.base, A.users.secretary)('POST', '/api/ai/ocr-cin', {
        imageBase64: 'A'.repeat(11 * 1024 * 1024), mimeType: 'image/jpeg',
    });
    assert.equal(r.status, 413);
    assert.equal(r.body.code, 'payload_too_large');
    assert.match(r.body.error, /10 Mo/);
});

test('V4 (contrat) : /nurse/medications et /nurse/queue donnent le même CIN pour le rapprochement', async () => {
    const E = await seedClinic(m, 'E');
    await createHospitalisation(m, E);
    await createRdv(m, E, { statut: 'arrive' }); // aujourd'hui, calendrier de la clinique
    await m.Prescription.create({
        numero: 'ORD-V4', clinic_id: E.clinic.id, patientCin: E.patient.cinNumero, medecinId: E.medecin.id,
        medicaments: '[]', statut: 'remise', slots: '[]',
    });
    const inf = client(server.base, E.users.nurse);
    const meds = await inf('GET', '/api/nurse/medications');
    const file = await inf('GET', '/api/nurse/queue');
    assert.equal(meds.status, 200, JSON.stringify(meds.body));
    assert.deepEqual(meds.body.map(p => p.patientCin), [E.patient.cinNumero]);
    assert.deepEqual(file.body.map(r => r.patientCin), [E.patient.cinNumero]);
});
