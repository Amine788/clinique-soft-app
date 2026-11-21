import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { resetDatabase, startServer, loadModels, seedClinic, client } from './helpers.js';

let server, withoutKey, provider, m, A, B;
let mode = 'normal';
let calls = 0;
before(async () => {
    await resetDatabase();
    provider = createServer(async (req, res) => {
        calls++;
        let raw = '';
        for await (const chunk of req) raw += chunk;
        const request = JSON.parse(raw);
        if (['auth', 'model', 'limited'].includes(mode)) {
            const status = mode === 'auth' ? 401 : mode === 'model' ? 404 : 429;
            res.writeHead(status, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ type: 'error', error: { type: 'api_error', message: 'secret-provider-detail' } }));
            return;
        }
        if (request.stream) {
            const events = [
                { type: 'message_start', message: { id: 'msg_test', type: 'message', role: 'assistant', content: [], model: 'test-model', stop_reason: null, stop_sequence: null, usage: { input_tokens: 1, output_tokens: 0 } } },
                { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
                { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'Réponse IA de test' } },
                { type: 'content_block_stop', index: 0 },
                { type: 'message_delta', delta: { stop_reason: 'end_turn', stop_sequence: null }, usage: { output_tokens: 5 } },
                { type: 'message_stop' },
            ];
            res.writeHead(200, { 'Content-Type': 'text/event-stream' });
            res.end(events.map(event => `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`).join(''));
        } else {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ id: 'msg_test', type: 'message', role: 'assistant', model: 'test-model',
                content: [{ type: 'thinking', thinking: 'Test fictif', signature: 'test' }, { type: 'text', text: JSON.stringify({ cin: 'TEST123456', nom: 'FICTIF', prenom: 'TEST', confiance: 0.9 }) }],
                stop_reason: mode === 'truncated' ? 'max_tokens' : 'end_turn', stop_sequence: null, usage: { input_tokens: 1, output_tokens: 5 },
            }));
        }
    });
    await new Promise(resolve => provider.listen(0, '127.0.0.1', resolve));
    server = await startServer({ ANTHROPIC_API_KEY: 'sk-ant-integration-only', AI_MODEL: 'test-model',
        ANTHROPIC_BASE_URL: `http://127.0.0.1:${provider.address().port}` });
    withoutKey = await startServer({ PORT: '3998' });
    m = await loadModels();
    A = await seedClinic(m, 'AI-A'); B = await seedClinic(m, 'AI-B');
});
after(async () => {
    await server?.stop(); await withoutKey?.stop(); await m?.sequelize.close();
    provider?.closeAllConnections();
    if (provider) await new Promise(resolve => provider.close(resolve));
});

test('Prédiction d’absence supprimée : ancienne route inexistante et nouvelles tables sans score prédictif', async () => {
    const before = calls;
    for (const role of ['doctor', 'secretary', 'admin', 'nurse', 'pharmacist']) {
        const response = await client(server.base, A.users[role])('POST', '/api/ai/noshowrisk', { appointmentId: 'ancien' });
        assert.equal(response.status, 404);
    }
    assert.equal(calls, before);
    const table = await m.sequelize.getQueryInterface().describeTable('rendez_vous');
    assert.equal(table.noshowrisk_score, undefined);
    assert.equal(table.noshowrisk_niveau, undefined);
});

test('IA existante : résumé patient et chat conservent leur réponse SSE', async () => {
    for (const [user, path, body] of [
        [A.users.doctor, '/patient-summary', { patientId: A.patient.id }],
        [A.users.doctor, '/chat', { message: 'Test fictif', context: { patientId: A.patient.id } }],
        [A.users.secretary, '/chat', { message: 'Test fictif' }],
        [A.users.pharmacist, '/chat', { message: 'Test fictif' }],
    ]) {
        const response = await client(server.base, user)('POST', `/api/ai${path}`, body);
        assert.equal(response.status, 200, JSON.stringify(response.body));
        assert.ok(response.body.includes('Réponse IA de test'));
        assert.ok(response.body.includes('[DONE]'));
    }
});

test('OCR CIN : ancienne API retirée, aucun appel Anthropic avec ou sans clé', async () => {
    const before = calls;
    for (const base of [server.base, withoutKey.base]) {
        const response = await client(base, A.users.secretary)('POST', '/api/ai/ocr-cin', { imageBase64: 'AAAA', mimeType: 'image/png' });
        assert.equal(response.status, 410, JSON.stringify(response.body));
        assert.equal(response.body.code, 'OCR_LOCAL');
    }
    assert.equal(calls, before);
    assert.equal((await client(server.base, A.users.doctor)('POST', '/api/ai/ocr-cin', { imageBase64: 'AAAA' })).status, 403);
});

test('IA existante : absence de clé = message explicite, sans appel au fournisseur', async () => {
    const before = calls;
    for (const [user, path, body] of [
        [A.users.doctor, '/patient-summary', { patientId: A.patient.id }],
        [A.users.secretary, '/chat', { message: 'Test fictif' }],
    ]) {
        const response = await client(withoutKey.base, user)('POST', `/api/ai${path}`, body);
        assert.equal(response.status, 503, JSON.stringify(response.body));
        assert.equal(response.body.code, 'AI_NOT_CONFIGURED');
    }
    assert.equal(calls, before);
});

test('IA existante : refus des identifiants, du modèle et de la limitation sans détail fournisseur', async () => {
    try {
        for (const [state, status, code] of [['auth', 503, 'AI_AUTH_FAILED'], ['model', 503, 'AI_MODEL_UNAVAILABLE'], ['limited', 429, 'AI_RATE_LIMITED']]) {
            mode = state;
            const before = calls;
            const response = await client(server.base, A.users.doctor)('POST', '/api/ai/patient-summary', { patientId: A.patient.id });
            assert.equal(response.status, status, JSON.stringify(response.body));
            assert.equal(response.body.code, code);
            assert.equal(calls, before + 1, 'aucune répétition automatique de la requête');
            assert.ok(!JSON.stringify(response.body).includes('secret-provider-detail'));
        }
    } finally { mode = 'normal'; }
});

test('IA existante : aucune donnée médicale d’une autre clinique et pas de contexte patient pour le secrétariat', async () => {
    const before = calls;
    assert.equal((await client(server.base, A.users.doctor)('POST', '/api/ai/patient-summary', { patientId: B.patient.id })).status, 404);
    assert.equal((await client(server.base, A.users.secretary)('POST', '/api/ai/patient-summary', { patientId: A.patient.id })).status, 403);
    assert.equal((await client(server.base, A.users.secretary)('POST', '/api/ai/chat', { message: 'Test', context: { patientId: A.patient.id } })).status, 403);
    assert.equal(calls, before);
});
