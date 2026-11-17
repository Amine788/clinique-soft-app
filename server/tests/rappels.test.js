// Bascule « E-mails aux patients » : rappel de RDV la veille, une seule fois, au nom de la clinique
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { resetDatabase, startServer, loadModels, seedClinic, createRdv } from './helpers.js';
import { jourClinique, ajouterJours, minuitClinique } from '../services/dates.js';
import { moduleActif } from '../services/modulesClinique.js';

let server, m, rappels;

before(async () => {
    await resetDatabase();
    server = await startServer();
    m = await loadModels();
    rappels = await import('../services/rappels.js');
});
after(async () => {
    await server?.stop();
    await m?.sequelize.close();
});

// Journées historiques sans transition : heure locale calculée depuis minuit,
// avec le décalage de Casablanca de ce jour, sans hypothèse UTC+1.
const instantA = (jour, heure) => new Date(minuitClinique(jour).getTime() + (heure * 60 + 30) * 60000);

test('Bascules : absentes ou ancien format = activées ; false = désactivée', () => {
    assert.equal(moduleActif({ activeModules: null }, 'email_reminders'), true);
    assert.equal(moduleActif({ activeModules: ['patients', 'appointments'] }, 'email_reminders'), true);
    assert.equal(moduleActif({ activeModules: { realtime_notifications: false } }, 'email_reminders'), true);
    assert.equal(moduleActif({ activeModules: { email_reminders: false } }, 'email_reminders'), false);
    assert.equal(moduleActif({ activeModules: '{"email_reminders":false}' }, 'email_reminders'), false);
});

for (const jour of ['2024-03-20', '2024-04-20']) {
test(`Rappels : la veille dès 9 h, une seule fois, selon les bascules (${jour})`, async () => {
    const aujourdhuiA = heure => instantA(jour, heure);
    const A = await seedClinic(m, 'RappelA');
    const B = await seedClinic(m, 'RappelB');
    await A.clinic.update({ phone: '0537111111', email: 'contact@a.test' });
    for (const ctx of [A, B]) await ctx.patient.update({ email: `patient.${ctx.clinic.id}@test.test` });
    await B.clinic.update({ activeModules: { email_reminders: false } });

    const demain = ajouterJours(jourClinique(aujourdhuiA(10)), 1);
    const rdvA = await createRdv(m, A, { date: demain });
    await createRdv(m, B, { date: demain });
    await createRdv(m, A, { date: demain, statut: 'annule' });
    await createRdv(m, A, { date: ajouterJours(demain, 1) }); // après-demain : pas encore

    const envois = [];
    const envoyer = async (mail) => { envois.push(mail); };

    // Avant 9 h : rien
    assert.equal(await rappels.envoyerRappelsDuLendemain({ envoyer, maintenant: aujourdhuiA(8) }), 0);

    // À 9 h 30 : un seul rappel (clinique A, RDV actif de demain), au nom de la clinique
    assert.equal(await rappels.envoyerRappelsDuLendemain({ envoyer, maintenant: aujourdhuiA(9) }), 1);
    assert.equal(envois[0].email, A.patient.email);
    assert.equal(envois[0].clinic.name, A.clinic.name);
    assert.equal(envois[0].date, demain);
    await rdvA.reload();
    assert.equal(rdvA.rappel24hEnvoye, true);

    // Vérification suivante : pas de doublon
    assert.equal(await rappels.envoyerRappelsDuLendemain({ envoyer, maintenant: aujourdhuiA(11) }), 0);

    // Échec d'envoi : non marqué, réessayé plus tard
    await B.clinic.update({ activeModules: { email_reminders: true } });
    const echec = async () => { throw new Error('SMTP indisponible'); };
    assert.equal(await rappels.envoyerRappelsDuLendemain({ envoyer: echec, maintenant: aujourdhuiA(12) }), 0);
    assert.equal(await rappels.envoyerRappelsDuLendemain({ envoyer, maintenant: aujourdhuiA(13) }), 1);
    assert.equal(envois.at(-1).email, B.patient.email);
});
}
