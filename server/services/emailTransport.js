import nodemailer from 'nodemailer';
import { configuredValue, integerSetting, serviceError } from './externalConfig.js';

export function emailConfiguration(env = process.env) {
    const user = configuredValue(env.SMTP_USER) || configuredValue(env.GMAIL_USER);
    const password = configuredValue(env.SMTP_PASSWORD) || configuredValue(env.GMAIL_APP_PASSWORD);
    const fromAddress = configuredValue(env.EMAIL_FROM) || configuredValue(env.GMAIL_USER) || user;
    const host = configuredValue(env.SMTP_HOST) || 'smtp.gmail.com';
    const configured = Boolean(user && password && /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(fromAddress));
    return { configured, user, password, fromAddress, host,
        port: integerSetting(env.SMTP_PORT, 587, 1, 65535, 'SMTP_PORT'),
    };
}

export function emailFailure(error) {
    if (error.code?.startsWith('EMAIL_') || error.code === 'SERVICE_CONFIGURATION_INVALID') return error;
    if (error.code === 'EAUTH') return serviceError('EMAIL_AUTH_FAILED', "L'authentification SMTP a été refusée.", 503, error);
    if (['ETIMEDOUT', 'ETIMEOUT'].includes(error.code)) return serviceError('EMAIL_TIMEOUT', 'Le serveur SMTP ne répond pas dans le délai prévu.', 504, error);
    if (error.code === 'EENVELOPE') return serviceError('EMAIL_RECIPIENT_REJECTED', "L'expéditeur ou le destinataire a été refusé par le serveur SMTP.", 502, error);
    return serviceError('EMAIL_UNAVAILABLE', "Le service d'envoi d'e-mails est indisponible.", 503, error);
}

// Le transport n'est créé qu'au premier usage avec une configuration complète.
// verify() ne transmet aucun message ni aucune adresse de destinataire.
export function createEmailTransport({ env = process.env, createTransport = nodemailer.createTransport } = {}) {
    let transport;
    function ready() {
        const config = emailConfiguration(env);
        if (!config.configured) throw serviceError('EMAIL_NOT_CONFIGURED', "Le service d'e-mails n'est pas configuré.");
        transport ||= createTransport({
            host: config.host, port: config.port, secure: config.port === 465,
            requireTLS: config.port !== 465,
            auth: { user: config.user, pass: config.password },
            connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 15000,
        });
        return transport;
    }
    return {
        configuration: () => emailConfiguration(env),
        async sendMail(message) {
            try { return await ready().sendMail(message); } catch (error) { throw emailFailure(error); }
        },
        async verify() {
            try { return await ready().verify(); } catch (error) { throw emailFailure(error); }
        },
    };
}
