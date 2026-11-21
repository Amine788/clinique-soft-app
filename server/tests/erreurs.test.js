// Gestionnaire d'erreurs global : jamais de détail interne dans une erreur imprévue, statuts justes pour les refus attendus
import { test } from 'node:test';
import assert from 'node:assert/strict';
import multer from 'multer';
import { cheminJournal, gestionnaireErreurs, masquerErreursInternes } from '../middleware/erreurs.js';

function repondre(err, t) {
    t.mock.method(console, 'error', () => {});
    t.mock.method(console, 'warn', () => {});
    const res = {
        statusCode: null, body: null,
        status(code) { this.statusCode = code; return this; },
        json(body) { this.body = body; return this; },
    };
    gestionnaireErreurs(err, { method: 'POST', originalUrl: '/api/patients/AB123456?x=1' }, res, () => {});
    return res;
}

test('Erreur imprévue (sans statut) : 500 générique, ni message ni code internes renvoyés', (t) => {
    const err = Object.assign(new Error("Table 'nextclinic_db.factures' doesn't exist"), { code: 'ER_NO_SUCH_TABLE' });
    const res = repondre(err, t);
    assert.equal(res.statusCode, 500);
    assert.deepEqual(res.body, { error: 'Erreur interne du serveur' });
    assert.equal(console.error.mock.callCount(), 1); // le détail reste dans le journal
});

test('Statut posé par l’application : message et code conservés (4xx comme 5xx voulus)', (t) => {
    let res = repondre(Object.assign(new Error('Origine non autorisée (CORS)'), { status: 403, code: 'CORS_FORBIDDEN' }), t);
    assert.equal(res.statusCode, 403);
    assert.deepEqual(res.body, { error: 'Origine non autorisée (CORS)', code: 'CORS_FORBIDDEN' });

    res = repondre(Object.assign(new Error('Lecture automatique indisponible'), { status: 503, code: 'AI_NOT_CONFIGURED' }), t);
    assert.equal(res.statusCode, 503);
    assert.deepEqual(res.body, { error: 'Lecture automatique indisponible', code: 'AI_NOT_CONFIGURED' });

    // JSON mal formé (body-parser : status et statusCode à 400)
    res = repondre(Object.assign(new SyntaxError('Unexpected end of JSON input'), { status: 400, statusCode: 400, type: 'entity.parse.failed' }), t);
    assert.equal(res.statusCode, 400);
});

test('Fichiers : multer et body-parser donnent 413 ou 400, plus jamais 500', (t) => {
    let res = repondre(new multer.MulterError('LIMIT_FILE_SIZE', 'photo'), t);
    assert.equal(res.statusCode, 413);
    assert.equal(res.body.code, 'payload_too_large');

    res = repondre(new multer.MulterError('LIMIT_UNEXPECTED_FILE', 'autre'), t);
    assert.equal(res.statusCode, 400);
    assert.equal(res.body.code, 'LIMIT_UNEXPECTED_FILE');

    res = repondre(Object.assign(new Error('request entity too large'), { status: 413, statusCode: 413, type: 'entity.too.large' }), t);
    assert.equal(res.statusCode, 413);
    assert.equal(res.body.code, 'payload_too_large');
});

test('Réponse déjà commencée (flux SSE) : rien n’est renvoyé une seconde fois, l’erreur passe à Express', (t) => {
    t.mock.method(console, 'error', () => {});
    const res = { headersSent: true, status() { throw new Error('status() ne doit pas être appelé'); }, json() { throw new Error('json() ne doit pas être appelé'); } };
    const err = new Error('coupure pendant le flux');
    let transmise = null;
    gestionnaireErreurs(err, { method: 'POST', originalUrl: '/api/ai/chat' }, res, (e) => { transmise = e; });
    assert.equal(transmise, err);
});

test('Journal : CIN masqué et paramètres de requête retirés', () => {
    assert.equal(cheminJournal('/api/patients/AB123456/dossier?token=x'), '/api/patients/***/dossier');
});

test('Filet des routes : une réponse 500 ne renvoie jamais le message interne, les autres statuts sont intacts', () => {
    const reponse = () => {
        const res = { statusCode: 200, envoye: null, status(c) { this.statusCode = c; return this; }, json(b) { this.envoye = b; return this; } };
        masquerErreursInternes({}, res, () => {});
        return res;
    };
    let res = reponse();
    res.status(500).json({ error: "Unknown column 'x' in 'field list'", details: 'SELECT * FROM patients' });
    assert.deepEqual(res.envoye, { error: 'Erreur interne du serveur' });
    for (const [statut, corps] of [[200, { ok: true }], [400, { error: 'Champs manquants' }], [503, { error: 'IA non configurée', code: 'ai_unavailable' }]]) {
        res = reponse();
        res.status(statut).json(corps);
        assert.deepEqual(res.envoye, corps, String(statut));
    }
});
