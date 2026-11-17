// Absences des médecins : demande, validation cloisonnée par clinique, blocage de la prise de RDV
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { resetDatabase, startServer, loadModels, seedClinic, createRdv, client } from './helpers.js';
import { jourClinique, ajouterJours } from '../services/dates.js';

let server, m, A, B;
const dans = n => ajouterJours(jourClinique(), n);

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

test('Absences : demande du médecin, liste et décision limitées à sa clinique', async () => {
    const docA = client(server.base, A.users.doctor);
    await createRdv(m, A, { date: dans(11) }); // RDV déjà pris pendant la future absence

    assert.equal((await docA('POST', '/api/absences', { typeAbsence: 'formation', dateDebut: dans(12), dateFin: dans(10), motif: 'x' })).status, 400);
    const demande = await docA('POST', '/api/absences', { typeAbsence: 'conge_annuel', dateDebut: dans(10), dateFin: dans(14), motif: 'Congé annuel' });
    assert.equal(demande.status, 201, JSON.stringify(demande.body));
    const id = demande.body.absence.id;

    // Liste : la secrétaire de A la voit (avec le RDV impacté), celle de B non ; l'infirmier n'y a pas accès
    const listeA = await client(server.base, A.users.secretary)('GET', '/api/absences?statut=en_attente');
    assert.equal(listeA.status, 200, JSON.stringify(listeA.body));
    assert.deepEqual(listeA.body.map(a => [a.id, a.rdvImpactes]), [[id, 1]]);
    assert.deepEqual((await client(server.base, B.users.secretary)('GET', '/api/absences')).body, []);
    assert.equal((await client(server.base, A.users.nurse)('GET', '/api/absences')).status, 403);

    // Décision : impossible depuis la clinique B ; validée par la secrétaire de A
    assert.equal((await client(server.base, B.users.secretary)('PATCH', `/api/absences/${id}`, { statut: 'validee' })).status, 404);
    assert.equal((await m.Absence.findByPk(id)).statut, 'en_attente');
    const ok = await client(server.base, A.users.secretary)('PATCH', `/api/absences/${id}`, { statut: 'validee' });
    assert.equal(ok.status, 200, JSON.stringify(ok.body));
    assert.equal(ok.body.rdvImpactes, 1);
    assert.equal((await m.Absence.findByPk(id)).statut, 'valide');
});

test('Absences : une absence validée bloque la prise et le déplacement de RDV ; une demande en attente non', async () => {
    const sec = client(server.base, A.users.secretary);
    const rdv = (date, heure = '10:00') => sec('POST', '/api/appointments', {
        patientCin: A.patient.cinNumero, doctorId: A.medecin.id, date, heure, typeConsultation: 'suivi', motif: 'Contrôle',
    });

    // Pendant l'absence validée (test précédent : J+10 à J+14) : refus explicite
    const refus = await rdv(dans(12));
    assert.equal(refus.status, 409, JSON.stringify(refus.body));
    assert.match(refus.body.error, /absent/);

    // Hors période : accepté ; déplacement dans la période : refusé
    const hors = await rdv(dans(20));
    assert.equal(hors.status, 201, JSON.stringify(hors.body));
    assert.equal((await sec('PATCH', `/api/appointments/${hors.body.id}`, { date: dans(13) })).status, 409);

    // Une demande encore en attente ne bloque rien
    await client(server.base, A.users.doctor)('POST', '/api/absences', { typeAbsence: 'formation', dateDebut: dans(30), dateFin: dans(31), motif: 'Congrès' });
    assert.equal((await rdv(dans(30))).status, 201);
});
