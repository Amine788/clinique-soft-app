import { test } from 'node:test';
import assert from 'node:assert/strict';
import { authorizedTestDatabase, verifyTestServer } from './databaseSafety.js';

const approved = {
    TEST_DB_AUTHORIZED_TARGET: 'mysql-test:3306/nextclinic_security_test',
    TEST_DB_HOST: 'mysql-test', TEST_DB_PORT: '3306',
    TEST_DB_NAME: 'nextclinic_security_test', TEST_DB_USER: 'security_test_runner',
    TEST_DB_PASSWORD: 'disposable-test-password',
};

test('I17 : refus sans autorisation ou avec un autre hôte, port, compte ou nom de base', () => {
    assert.equal(authorizedTestDatabase(approved).name, 'nextclinic_security_test');
    for (const key of Object.keys(approved)) {
        const missing = { ...approved };
        delete missing[key];
        assert.throws(() => authorizedTestDatabase(missing), /I17/);
    }
    for (const [key, value] of [
        ['TEST_DB_HOST', '127.0.0.1'], ['TEST_DB_PORT', '3307'],
        ['TEST_DB_USER', 'root'], ['TEST_DB_NAME', 'production_test'],
        ['TEST_DB_NAME', 'evil`_test'], ['TEST_DB_NAME', 'nextclinic_security_test;DROP DATABASE prod'],
    ]) assert.throws(() => authorizedTestDatabase({ ...approved, [key]: value }), /I17/);
});

test('I17 : vérification de l’identité du serveur avant destruction', async () => {
    const connection = (hostname, account) => ({ query: async () => [[{ hostname, account }]] });
    await verifyTestServer(connection('nextclinic-security-test-db', 'security_test_runner@%'));
    await assert.rejects(verifyTestServer(connection('production-db', 'security_test_runner@%')), /I17/);
    await assert.rejects(verifyTestServer(connection('nextclinic-security-test-db', 'root@%')), /I17/);
});
