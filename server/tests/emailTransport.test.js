import { test } from 'node:test';
import assert from 'node:assert/strict';
import nodemailer from 'nodemailer';
import { createEmailTransport, emailConfiguration } from '../services/emailTransport.js';

const gmail = { GMAIL_USER: 'plateforme@nextclinic.test', GMAIL_APP_PASSWORD: 'integration-password' };

test('E-mails : configuration Gmail historique conservée, STARTTLS sur 587', async () => {
    let options;
    const sent = [];
    const mail = createEmailTransport({ env: gmail, createTransport: config => {
        options = config;
        return { verify: async () => true, sendMail: async message => { sent.push(message); return { messageId: 'test' }; } };
    } });
    assert.equal(mail.configuration().configured, true);
    assert.equal(await mail.verify(), true);
    assert.equal(sent.length, 0, 'la vérification ne doit envoyer aucun message');
    assert.equal(options.host, 'smtp.gmail.com');
    assert.equal(options.port, 587);
    assert.equal(options.secure, false);
    assert.equal(options.requireTLS, true);
});

test('E-mails : SMTP personnalisé prioritaire, expéditeur distinct et TLS sur 465', async () => {
    let options;
    const env = { ...gmail, SMTP_HOST: 'smtp.nextclinic.test', SMTP_PORT: '465', SMTP_USER: 'relay-account',
        SMTP_PASSWORD: 'relay-password', EMAIL_FROM: 'contact@nextclinic.test' };
    const mail = createEmailTransport({ env, createTransport: config => { options = config; return { verify: async () => true }; } });
    await mail.verify();
    assert.equal(options.auth.user, env.SMTP_USER);
    assert.equal(options.auth.pass, env.SMTP_PASSWORD);
    assert.equal(options.secure, true);
    assert.equal(options.requireTLS, false);
    assert.equal(mail.configuration().fromAddress, env.EMAIL_FROM);
});

test('E-mails : valeurs absentes ou exemples refusés avant toute connexion', async () => {
    for (const env of [{}, { GMAIL_USER: 'adresse@example.com', GMAIL_APP_PASSWORD: 'change-me' },
        { SMTP_USER: 'relay-account', SMTP_PASSWORD: 'relay-password' }]) {
        const mail = createEmailTransport({ env, createTransport: () => assert.fail('connexion interdite') });
        assert.equal(mail.configuration().configured, false);
        await assert.rejects(mail.verify(), error => error.code === 'EMAIL_NOT_CONFIGURED');
        await assert.rejects(mail.sendMail({ to: 'test@example.invalid' }), error => error.code === 'EMAIL_NOT_CONFIGURED');
    }
});

test('E-mails : port invalide refusé et erreur SMTP sans divulguer le secret', async () => {
    assert.throws(() => emailConfiguration({ ...gmail, SMTP_PORT: 'invalide' }), error => error.code === 'SERVICE_CONFIGURATION_INVALID');
    const mail = createEmailTransport({ env: gmail, createTransport: () => ({
        sendMail: async () => { throw Object.assign(new Error('secret-provider-detail'), { code: 'EAUTH' }); },
    }) });
    await assert.rejects(mail.sendMail({ to: 'test@example.invalid' }), error => {
        assert.equal(error.code, 'EMAIL_AUTH_FAILED');
        assert.ok(!error.message.includes('secret-provider-detail'));
        return true;
    });
});

test('E-mails : modèles de bienvenue, invitation et rappel utilisent le transport configuré', async t => {
    const keys = ['GMAIL_USER', 'GMAIL_APP_PASSWORD', 'SMTP_USER', 'SMTP_PASSWORD', 'SMTP_HOST', 'SMTP_PORT', 'EMAIL_FROM'];
    const previous = Object.fromEntries(keys.map(key => [key, process.env[key]]));
    Object.assign(process.env, { ...gmail, SMTP_USER: '', SMTP_PASSWORD: '', SMTP_HOST: '', SMTP_PORT: '587', EMAIL_FROM: '' });
    t.after(() => { for (const key of keys) { if (previous[key] === undefined) delete process.env[key]; else process.env[key] = previous[key]; } });
    const sent = [];
    t.mock.method(nodemailer, 'createTransport', () => ({ sendMail: async message => { sent.push(message); return { messageId: 'test' }; } }));
    const email = await import('../services/emailService.js?transport-test');
    const clinic = { name: 'Clinique de test', email: 'accueil@nextclinic.test' };
    await email.sendAdminWelcomeEmail({ email: 'admin@example.invalid', prenom: 'Test', clinicName: clinic.name, setupLink: 'https://nextclinic.test/setup?token=fictif' });
    await email.sendInvitationEmail({ email: 'doctor@example.invalid', prenom: 'Test', role: 'doctor', clinicName: clinic.name, setupLink: 'https://nextclinic.test/setup?token=fictif' });
    await email.sendAppointmentReminder({ email: 'patient@example.invalid', prenom: 'Test', doctorName: 'Dr Test', date: '2026-12-01', heureDebut: '10:00:00', clinic });
    assert.equal(sent.length, 3);
    assert.ok(sent[0].html.includes('https://nextclinic.test/setup?token=fictif'));
    assert.ok(sent[1].html.includes('https://nextclinic.test/setup?token=fictif'));
    assert.ok(sent[2].html.includes('10:00'));
    assert.equal(sent[2].replyTo, clinic.email);
    assert.ok(sent.every(message => message.from.includes(gmail.GMAIL_USER)));
});
