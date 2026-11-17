import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { aiConfiguration, aiFailure, createAiService } from '../services/aiService.js';

const configured = { ANTHROPIC_API_KEY: 'sk-ant-integration-only', AI_MODEL: 'test-model' };
class Response extends EventEmitter {
    headers = {};
    writes = [];
    headersSent = false;
    writableEnded = false;
    destroyed = false;
    setHeader(name, value) { this.headers[name] = value; }
    status(value) { this.statusCode = value; return this; }
    json(value) { this.body = value; this.headersSent = true; this.writableEnded = true; return this; }
    write(value) { this.writes.push(value); this.headersSent = true; }
    end() { this.writableEnded = true; }
}
const textEvent = text => ({ type: 'content_block_delta', delta: { type: 'text_delta', text } });

test('IA : configuration absente ou clé d’exemple refusée sans appeler le fournisseur', async () => {
    for (const env of [{}, { ANTHROPIC_API_KEY: 'change-me' }, { ANTHROPIC_API_KEY: 'your-api-key' }]) {
        assert.equal(aiConfiguration(env).configured, false);
        const service = createAiService({ env, client: { messages: { stream: () => assert.fail('appel interdit') } } });
        const res = new Response();
        await service.streamIA(res, 'test', []);
        assert.equal(res.statusCode, 503);
        assert.equal(res.body.code, 'AI_NOT_CONFIGURED');
        assert.equal(res.writes.length, 0);
    }
});

test('IA : limites de configuration contrôlées avant utilisation', () => {
    for (const env of [{ ...configured, AI_MAX_TOKENS: '-1' }, { ...configured, AI_TIMEOUT_MS: 'invalide' }]) {
        assert.throws(() => aiConfiguration(env), error => error.code === 'SERVICE_CONFIGURATION_INVALID');
    }
});

test('IA : résumé et chat conservent le streaming, avec un marqueur de fin', async () => {
    let request;
    const service = createAiService({ env: configured, client: { messages: {
        stream: input => {
            request = input;
            return (async function* () { yield textEvent('Réponse '); yield textEvent('de test'); })();
        },
    } } });
    const res = new Response();
    await service.streamIA(res, 'Contexte synthétique', [{ role: 'user', content: 'Test' }]);
    assert.equal(request.model, configured.AI_MODEL);
    assert.equal(request.max_tokens, 1024);
    assert.equal(res.headers['Content-Type'], 'text/event-stream');
    assert.ok(res.writes.join('').includes('Réponse '));
    assert.ok(res.writes.join('').includes('de test'));
    assert.equal(res.writes.filter(chunk => chunk.includes('[DONE]')).length, 1);
    assert.equal(res.writableEnded, true);
    assert.equal(res.listenerCount('close'), 0);
});

test('IA : authentification, modèle absent, limitation et timeout ont des erreurs publiques distinctes', () => {
    for (const [source, code, status] of [
        [{ status: 401 }, 'AI_AUTH_FAILED', 503], [{ status: 404 }, 'AI_MODEL_UNAVAILABLE', 503],
        [{ status: 429 }, 'AI_RATE_LIMITED', 429], [{ name: 'APIConnectionTimeoutError' }, 'AI_TIMEOUT', 504],
    ]) {
        const error = aiFailure(Object.assign(new Error('secret-provider-detail'), source));
        assert.equal(error.code, code); assert.equal(error.status, status);
        assert.ok(!error.message.includes('secret-provider-detail'));
    }
});

test('IA : échec avant le premier texte = erreur HTTP, après le début = erreur SSE sans détail fournisseur', async () => {
    for (const partial of [false, true]) {
        const service = createAiService({ env: configured, client: { messages: {
            stream: () => (async function* () {
                if (partial) yield textEvent('Début');
                throw Object.assign(new Error('secret-provider-detail'), { status: 401 });
            })(),
        } } });
        const res = new Response();
        await service.streamIA(res, 'test', []);
        if (partial) {
            assert.ok(res.writes.join('').includes('AI_AUTH_FAILED'));
            assert.ok(res.writes.join('').includes('[DONE]'));
        } else {
            assert.equal(res.statusCode, 503); assert.equal(res.body.code, 'AI_AUTH_FAILED');
            assert.equal(res.headers['Content-Type'], 'application/json');
        }
        assert.ok(!JSON.stringify({ body: res.body, writes: res.writes }).includes('secret-provider-detail'));
    }
});

test('IA : réponse vide signalée et flux interrompu si le client ferme la connexion', async () => {
    const empty = createAiService({ env: configured, client: { messages: { stream: () => (async function* () {})() } } });
    const response = new Response();
    await empty.streamIA(response, 'test', []);
    assert.equal(response.statusCode, 502);
    assert.equal(response.body.code, 'AI_INVALID_RESPONSE');
    let aborted = false;
    const res = new Response();
    const service = createAiService({ env: configured, client: { messages: {
        stream: () => Object.assign((async function* () {
            yield textEvent('Début'); res.destroyed = true; res.emit('close');
            throw Object.assign(new Error('client fermé'), { name: 'AbortError' });
        })(), { abort: () => { aborted = true; } }),
    } } });
    await service.streamIA(res, 'test', []);
    assert.equal(aborted, true);
    assert.equal(res.listenerCount('close'), 0);
});
