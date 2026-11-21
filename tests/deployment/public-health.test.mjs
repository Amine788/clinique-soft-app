import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const bash = process.env.BASH_PATH || (process.platform === 'win32' ? 'C:/Program Files/Git/bin/bash.exe' : '/bin/bash');
function run(response) {
    const dir = mkdtempSync(path.join(tmpdir(), 'nextclinic-health-test-'));
    const fixture = path.join(dir, 'test.env');
    writeFileSync(fixture, 'FRONTEND_URL=https://example.test\n', { mode: 0o600 });
    try {
        return spawnSync(bash, ['-c', 'source "$1"; curl() { if [ "$HEALTH_RESPONSE" = unavailable ]; then return 1; fi; printf "%s" "$HEALTH_RESPONSE"; }; sleep() { :; }; controle_public', 'test', path.join(root, 'scripts/_commun.sh').replaceAll('\\', '/')], {
            encoding: 'utf8', timeout: 10000, windowsHide: true,
            env: { ...process.env, ENV_FILE: fixture.replaceAll('\\', '/'), ETAT_DIR: dir, HEALTH_RESPONSE: response },
        });
    } finally { rmSync(dir, { recursive: true, force: true }); }
}
test('Déploiement : valide une API qui confirme son état opérationnel', () => {
    const result = run('{"status":"ok","database":"connected"}');
    assert.ifError(result.error); assert.equal(result.status, 0, result.stderr);
});
for (const response of ['unavailable', '<html>Application React</html>', '{"status":"degraded"}']) {
    test('Déploiement : refuse une adresse indisponible ou une fausse page de santé : ' + response, () => {
        const result = run(response);
        assert.ifError(result.error); assert.notEqual(result.status, 0); assert.match(result.stderr, /ERREUR/);
    });
}
