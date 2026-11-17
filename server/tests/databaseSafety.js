// Ce garde ne se connecte à rien : refus avant toute connexion destructive.
export function authorizedTestDatabase(env) {
    const target = 'mysql-test:3306/nextclinic_security_test';
    if (env.TEST_DB_AUTHORIZED_TARGET !== target
        || env.TEST_DB_HOST !== 'mysql-test'
        || env.TEST_DB_PORT !== '3306'
        || env.TEST_DB_NAME !== 'nextclinic_security_test'
        || !/^[a-z][a-z0-9_]{0,63}$/.test(env.TEST_DB_NAME)
        || env.TEST_DB_USER !== 'security_test_runner'
        || !env.TEST_DB_PASSWORD) {
        throw new Error(`I17 : cible non autorisée. Utiliser exclusivement le Compose de test et autoriser ${target}.`);
    }
    return Object.freeze({
        host: env.TEST_DB_HOST,
        port: 3306,
        name: env.TEST_DB_NAME,
        user: env.TEST_DB_USER,
        password: env.TEST_DB_PASSWORD,
    });
}

export async function verifyTestServer(conn) {
    const [[identity]] = await conn.query('SELECT @@hostname AS hostname, CURRENT_USER() AS account');
    if (identity.hostname !== 'nextclinic-security-test-db'
        || identity.account !== 'security_test_runner@%') {
        throw new Error('I17 : identité MySQL inattendue, destruction refusée.');
    }
}
