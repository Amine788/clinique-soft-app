// L'opérateur a retiré la routine de contrôle sur la seule base jetable.
// Aucun privilège administratif ni secret root n'est fourni à ce test.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startServer } from './helpers.js';

test('Compte applicatif : routine retirée par l’administrateur, démarrage refusé', async () => {
    await assert.rejects(startServer({}, { prepareDatabase: false, runtimeAccount: true }), /Protection du journal indisponible/);
});
