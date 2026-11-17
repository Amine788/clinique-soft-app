import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';

dotenv.config({ path: fileURLToPath(new URL('../.env', import.meta.url)), quiet: true });
const { createEmailTransport } = await import('../services/emailTransport.js');
const { createAiService, aiConfiguration, aiFailure } = await import('../services/aiService.js');
const flags = new Set(process.argv.slice(2));
if ([...flags].some(flag => !['--smtp', '--ai', '--sample'].includes(flag))) {
    console.error('Usage : npm run check:services -- [--smtp] [--ai] [--sample]');
    process.exitCode = 1;
} else {
    const report = { smtp: {}, ai: {} };
    let failed = false;
    try {
        const mail = createEmailTransport();
        const config = mail.configuration();
        report.smtp = { configured: config.configured, connection: 'not_checked', messageSent: false };
        if (flags.has('--smtp')) {
            await mail.verify();
            report.smtp.connection = 'verified';
        }
    } catch (error) {
        report.smtp.connection = 'failed';
        report.smtp.code = error.code;
        report.smtp.error = error.message;
        failed = true;
    }
    try {
        const config = aiConfiguration();
        report.ai = { configured: config.configured, model: config.model, availability: 'not_checked', sample: 'not_requested' };
        if (flags.has('--ai') || flags.has('--sample')) {
            const ai = createAiService();
            const { sdk } = ai.ready();
            const model = await sdk.models.retrieve(config.model);
            report.ai.availability = 'verified';
            report.ai.resolvedModel = model.id;
            if (flags.has('--sample')) {
                // Texte fixe sans donnée personnelle ni lecture de base applicative.
                const response = await sdk.messages.create({ model: config.model, max_tokens: 128,
                    messages: [{ role: 'user', content: 'Reply with OK only.' }] });
                const text = response.content.filter(block => block.type === 'text').map(block => block.text).join('').trim();
                if (text !== 'OK') throw Object.assign(new Error('Le test de réponse IA est inexploitable.'), { code: 'AI_INVALID_RESPONSE', status: 502 });
                report.ai.sample = 'synthetic_text_test_passed';
            }
        }
    } catch (error) {
        const failure = aiFailure(error);
        report.ai.availability = 'failed';
        report.ai.code = failure.code;
        report.ai.error = failure.message;
        failed = true;
    }
    if (!flags.size && (!report.smtp.configured || !report.ai.configured)) failed = true;
    console.log(JSON.stringify(report, null, 2));
    if (failed) process.exitCode = 1;
}
