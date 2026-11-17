import Anthropic from '@anthropic-ai/sdk';
import dotenv from 'dotenv';
import { configuredValue, integerSetting, serviceError } from './externalConfig.js';

dotenv.config({ quiet: true });

export function aiConfiguration(env = process.env) {
    const apiKey = configuredValue(env.ANTHROPIC_API_KEY);
    return { configured: Boolean(apiKey), apiKey,
        model: configuredValue(env.AI_MODEL) || 'claude-sonnet-5-5',
        maxTokens: integerSetting(env.AI_MAX_TOKENS, 1024, 128, 8192, 'AI_MAX_TOKENS'),
        timeout: integerSetting(env.AI_TIMEOUT_MS, 20000, 1000, 60000, 'AI_TIMEOUT_MS'),
    };
}

export function aiFailure(error) {
    if (error.code?.startsWith('AI_') || error.code === 'SERVICE_CONFIGURATION_INVALID') return error;
    if ([401, 403].includes(error.status)) return serviceError('AI_AUTH_FAILED', "Le service IA refuse les identifiants configurés.", 503, error);
    if (error.status === 404) return serviceError('AI_MODEL_UNAVAILABLE', "Le modèle IA configuré n'est pas disponible pour ce compte.", 503, error);
    if (error.status === 429) return serviceError('AI_RATE_LIMITED', "Le service IA est temporairement limité. Réessayez plus tard.", 429, error);
    if (/Timeout|Abort/.test(error.name)) return serviceError('AI_TIMEOUT', 'Le service IA ne répond pas dans le délai prévu.', 504, error);
    return serviceError('AI_UNAVAILABLE', 'Le service IA est momentanément indisponible.', 503, error);
}

export function createAiService({ env = process.env, client } = {}) {
    let sdk = client;
    function ready() {
        const config = aiConfiguration(env);
        if (!config.configured) throw serviceError('AI_NOT_CONFIGURED', "Le service IA n'est pas configuré. Renseignez sa clé API dans l'environnement du serveur.");
        sdk ||= new Anthropic({ apiKey: config.apiKey, timeout: config.timeout, maxRetries: 0 });
        return { sdk, config };
    }
    return {
        ready,
        async streamIA(res, systemPrompt, messages) {
            let stream;
            let receivedText = false;
            const abort = () => stream?.abort?.();
            try {
                const { sdk, config } = ready();
                stream = sdk.messages.stream({ model: config.model, max_tokens: config.maxTokens, system: systemPrompt, messages });
                res.on('close', abort);
                res.setHeader('Content-Type', 'text/event-stream');
                res.setHeader('Cache-Control', 'no-cache');
                res.setHeader('Connection', 'keep-alive');
                for await (const event of stream) {
                    if (event.type === 'content_block_delta' && event.delta?.text && !res.writableEnded) {
                        receivedText = true;
                        res.write(`data: ${JSON.stringify({ text: event.delta.text })}\n\n`);
                    }
                }
                if (!receivedText) throw serviceError('AI_INVALID_RESPONSE', 'Le service IA a retourné une réponse vide.', 502);
                if (!res.writableEnded) { res.write('data: [DONE]\n\n'); res.end(); }
            } catch (error) {
                const failure = aiFailure(error);
                if (res.writableEnded || res.destroyed) return;
                if (!res.headersSent) {
                    res.setHeader('Content-Type', 'application/json');
                    return res.status(failure.status).json({ error: failure.message, code: failure.code });
                }
                res.write(`data: ${JSON.stringify({ error: failure.message, code: failure.code })}\n\n`);
                res.write('data: [DONE]\n\n');
                res.end();
            } finally { res.removeListener('close', abort); }
        },
    };
}

const service = createAiService();
// L'export est conservé pour la route OCR existante, avec contrôle avant usage.
export const getAiClient = () => service.ready().sdk;
const MODEL = configuredValue(process.env.AI_MODEL) || 'claude-sonnet-5-5';

// Appel streaming SSE (pour résumé patient et chatbot)
export async function streamIA(res, systemPrompt, messages) {
    return service.streamIA(res, systemPrompt, messages);
}

export { MODEL };
