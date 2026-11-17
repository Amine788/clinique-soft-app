// V7 : en production, seules les origines déclarées exactement sont acceptées
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { resetDatabase, startServer } from './helpers.js';

let server;
before(async () => {
    await resetDatabase();
    server = await startServer({ NODE_ENV: 'production', FRONTEND_URL: 'https://app.example.com', PORT: '3998' });
});
after(async () => { await server?.stop(); });

const preflight = (origin) => fetch(`${server.base}/api/health`, {
    method: 'OPTIONS',
    headers: { Origin: origin, 'Access-Control-Request-Method': 'GET' },
});

test('V7 : l’origine déclarée est acceptée, une origine qui la prolonge est refusée', async () => {
    assert.equal((await preflight('https://app.example.com')).headers.get('access-control-allow-origin'), 'https://app.example.com');
    for (const origine of ['https://app.example.com.evil.com', 'https://app.example.comevil.com', 'http://localhost:51739']) {
        assert.equal((await preflight(origine)).headers.get('access-control-allow-origin'), null, origine);
    }
});
