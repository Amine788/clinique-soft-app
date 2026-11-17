// Tableau de bord : occupation réelle des chambres, revenus sur 7 jours, salle d'attente, planning du médecin
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { jourClinique, ajouterJours } from '../services/dates.js';
import { resetDatabase, startServer, loadModels, seedClinic, createRdv, client } from './helpers.js';

let server, m, A, B, V;

before(async () => {
    await resetDatabase();
    server = await startServer();
    m = await loadModels();
    A = await seedClinic(m, 'A');
    B = await seedClinic(m, 'B');
    V = await seedClinic(m, 'Vide');
});
after(async () => {
    await server?.stop();
    await m?.sequelize.close();
});

let numero = 0;
const chambre = (ctx, statut) => m.Chambre.create({
    clinic_id: ctx.clinic.id, numero: `C-${++numero}`, typeChambre: 'privee', nbLits: 1, statut,
});
const facturePayee = (ctx, total) => m.Facture.create({
    clinic_id: ctx.clinic.id, numero: `FAC-T-${++numero}`, patientCin: ctx.patient.cinNumero,
    patientId: ctx.patient.id, total, statut: 'payee',
});

test('Dashboard secrétaire : taux d’occupation = chambres occupées / chambres utilisables', async () => {
    await chambre(A, 'occupee');
    await chambre(A, 'disponible');
    await chambre(A, 'occupee');
    await chambre(A, 'nettoyage');
    await chambre(A, 'hors_service'); // exclue du total
    await chambre(B, 'occupee');      // autre clinique : ignorée

    const r = await client(server.base, A.users.secretary)('GET', '/api/dashboard/secretary');
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(r.body.chambresTotal, 4);
    assert.equal(r.body.chambresOccupees, 2);
    assert.equal(r.body.tauxOccupation, 50);
});

test('Dashboard secrétaire : sans chambre, le taux vaut null (pas de chiffre inventé)', async () => {
    const r = await client(server.base, V.users.secretary)('GET', '/api/dashboard/secretary');
    assert.equal(r.status, 200);
    assert.equal(r.body.tauxOccupation, null);
    assert.equal(r.body.chambresTotal, 0);
});

test('Dashboard secrétaire : revenus des 7 derniers jours, aujourd’hui en dernier', async () => {
    await facturePayee(A, 300);
    await facturePayee(A, 200.5);
    await facturePayee(B, 999); // autre clinique
    await m.Facture.create({ clinic_id: A.clinic.id, numero: `FAC-T-${++numero}`, patientCin: A.patient.cinNumero, total: 700, statut: 'en_attente' });

    const r = await client(server.base, A.users.secretary)('GET', '/api/dashboard/secretary');
    const jours = r.body.revenus7j;
    assert.equal(jours.length, 7);
    const aujourdhui = jourClinique();
    assert.deepEqual(jours.map(j => j.date), Array.from({ length: 7 }, (_, i) => ajouterJours(aujourdhui, i - 6)));
    assert.equal(jours[6].total, 500.5);
    assert.equal(jours.slice(0, 6).reduce((s, j) => s + j.total, 0), 0);
    assert.equal(r.body.caJour, 500.5);
});

test('Dashboard secrétaire : la salle d’attente liste les patients présents aujourd’hui', async () => {
    const arrive = await createRdv(m, A, { statut: 'arrive' });
    const pret = await createRdv(m, A, { statut: 'pret' });
    await createRdv(m, A, { statut: 'confirme' });                                   // pas encore arrivé
    await createRdv(m, A, { statut: 'arrive', date: ajouterJours(jourClinique(), 1) }); // demain
    await createRdv(m, B, { statut: 'arrive' });                                     // autre clinique

    const r = await client(server.base, A.users.secretary)('GET', '/api/dashboard/secretary');
    const ids = r.body.salleAttente.map(p => p.id).sort((a, b) => a - b);
    assert.deepEqual(ids, [arrive.id, pret.id].sort((a, b) => a - b));
    const p = r.body.salleAttente[0];
    assert.equal(p.time, '09:00');
    assert.match(p.patient, /PATIENT/);
    assert.match(p.doctor, /^Dr\. /);
});

test('Dashboard médecin : planning du jour sans les RDV annulés ou reportés, limité à ses patients', async () => {
    const confirme = await createRdv(m, B, { statut: 'confirme' });
    const enCours = await createRdv(m, B, { statut: 'en_cours' });
    await createRdv(m, B, { statut: 'annule' });
    await createRdv(m, B, { statut: 'reporte' });
    await createRdv(m, B, { statut: 'confirme', date: ajouterJours(jourClinique(), -1) }); // hier

    const r = await client(server.base, B.users.doctor)('GET', '/api/dashboard/doctor');
    assert.equal(r.status, 200, JSON.stringify(r.body));
    const ids = r.body.planningJour.map(p => p.id);
    assert.ok(ids.includes(confirme.id) && ids.includes(enCours.id), JSON.stringify(ids));
    assert.equal(r.body.planningJour.filter(p => ['annule', 'reporte'].includes(p.status)).length, 0);
    // Le RDV « arrive » de la clinique B créé au test précédent appartient au même médecin et reste listé
    for (const p of r.body.planningJour) assert.ok(p.time && p.patient && p.status);
});
