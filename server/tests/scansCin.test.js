import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import { typeReelScan, recevoirScanCin, envoyerScanCin, FACES_CIN } from '../services/scansCin.js';
// Scans de CIN : face, type réel et nom de fichier contrôlés par le serveur. Sans base de données :
// mini-application Express et dossier temporaire (supprimé après les tests), jamais le vrai dossier uploads.








const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00]), Buffer.from('jpeg')]);
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from('png-data')]);
const PDF = Buffer.from('%PDF-1.7\n%contenu\n');
const HEIC = Buffer.concat([Buffer.from([0x00, 0x00, 0x00, 0x18]), Buffer.from('ftypheic'), Buffer.alloc(8)]);
const WEBP = Buffer.concat([Buffer.from('RIFF'), Buffer.from([0x10, 0, 0, 0]), Buffer.from('WEBPVP8 ')]);
const HTML = Buffer.from('<!doctype html><script>alert(document.domain)</script>');
const SVG = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"/>');

let racine, dossier, base, serveur;
const contenu = () => fs.readdirSync(dossier);
const toutLeDossier = () => fs.readdirSync(racine, { recursive: true }).map(String).sort();

before(async () => {
    racine = fs.mkdtempSync(path.join(os.tmpdir(), 'scans-cin-'));
    dossier = path.join(racine, 'cin-scans');
    fs.mkdirSync(dossier);
    const app = express();
    app.post('/scan', recevoirScanCin(dossier), (req, res) => {
        res.json({ face: req.body.face, filename: req.file.filename, mimetype: req.file.mimetype, size: req.file.size, path: req.file.path });
    });
    app.get('/fichier/:nom', (req, res) => envoyerScanCin(res, path.join(dossier, path.basename(req.params.nom))));
    serveur = app.listen(0, '127.0.0.1');
    await new Promise(r => serveur.once('listening', r));
    base = `http://127.0.0.1:${serveur.address().port}`;
});
after(() => {
    serveur?.close();
    fs.rmSync(racine, { recursive: true, force: true });
});

// Envoi multipart ; `avant` / `apres` : champs placés avant ou après le fichier
function envoyer({ octets, type, nom = 'scan.jpg', avant = {}, apres = {}, sansFichier = false }) {
    const form = new FormData();
    for (const [k, v] of Object.entries(avant)) form.append(k, v);
    if (!sansFichier) form.append('scan', new Blob([octets], { type }), nom);
    for (const [k, v] of Object.entries(apres)) form.append(k, v);
    return fetch(`${base}/scan`, { method: 'POST', body: form });
}

test('Signature : seuls JPEG, PNG, PDF et HEIC sont reconnus, d’après le contenu', () => {
    assert.equal(typeReelScan(JPEG), 'jpeg');
    assert.equal(typeReelScan(PNG), 'png');
    assert.equal(typeReelScan(PDF), 'pdf');
    assert.equal(typeReelScan(HEIC), 'heic');
    for (const octets of [HTML, SVG, WEBP, Buffer.alloc(0), Buffer.from([0xff, 0xd8, 0xff]), Buffer.alloc(64)]) {
        assert.equal(typeReelScan(octets), null);
    }
    assert.equal(typeReelScan('ÿØÿ texte'), null);
    assert.deepEqual(FACES_CIN, ['recto', 'verso']);
});

test('Scans valides : JPEG, PNG, PDF et HEIC acceptés, nom généré par le serveur', async () => {
    const cas = [
        { octets: JPEG, type: 'image/jpeg', face: 'recto', ext: 'jpg' },
        { octets: JPEG, type: 'image/jpg', face: 'verso', ext: 'jpg' },
        { octets: PNG, type: 'image/png', face: 'verso', ext: 'png' },
        { octets: PDF, type: 'application/pdf', face: 'recto', ext: 'pdf' },
        { octets: HEIC, type: 'image/heic', face: 'recto', ext: 'heic' },
    ];
    for (const c of cas) {
        const r = await envoyer({ octets: c.octets, type: c.type, avant: { face: c.face } });
        assert.equal(r.status, 200, `${c.type} : ${await r.clone().text()}`);
        const corps = await r.json();
        assert.match(corps.filename, new RegExp(`^${c.face}_\\d+_[0-9a-f]{12}\\.${c.ext}$`));
        assert.equal(corps.face, c.face);
        assert.equal(corps.mimetype, c.type === 'image/jpg' ? 'image/jpeg' : c.type);
        assert.equal(corps.size, c.octets.length);
        assert.equal(path.dirname(corps.path), dossier);
        assert.deepEqual(fs.readFileSync(path.join(dossier, corps.filename)), c.octets);
    }
    // Sans face : « recto » par défaut, comme avant
    const r = await envoyer({ octets: JPEG, type: 'image/jpeg' });
    assert.equal(r.status, 200);
    assert.match((await r.json()).filename, /^recto_/);
});

test('Face invalide ou traversée de chemin : refusé, aucun fichier écrit', async () => {
    const avant = toutLeDossier();
    for (const face of ['../profiles/x', '../../x', 'recto/../../x', '..', 'front', 'back', 'RECTO', 'recto ', 'recto\0', '%2e%2e%2fx']) {
        for (const position of ['avant', 'apres']) {
            const r = await envoyer({ octets: JPEG, type: 'image/jpeg', [position]: { face } });
            assert.equal(r.status, 400, `face ${JSON.stringify(face)} (${position} le fichier)`);
            assert.match((await r.json()).error, /recto ou verso/);
        }
    }
    assert.deepEqual(toutLeDossier(), avant);
});

test('Type déclaré mensonger, contenu non reconnu ou incohérent : refusé, aucun fichier écrit', async () => {
    const avant = toutLeDossier();
    const cas = [
        { octets: HTML, type: 'image/jpeg', nom: 'recto.jpg' },          // page HTML déguisée en photo
        { octets: HTML, type: 'image/png', nom: 'piege.html' },
        { octets: SVG, type: 'image/png', nom: 'scan.png' },             // SVG scriptable
        { octets: HTML, type: 'text/html', nom: 'piege.html' },
        { octets: SVG, type: 'image/svg+xml', nom: 'piege.svg' },
        { octets: WEBP, type: 'image/webp', nom: 'scan.webp' },          // format non accepté par la fonctionnalité
        { octets: JPEG, type: 'image/png', nom: 'scan.png' },            // contenu et type déclaré différents
        { octets: PNG, type: 'application/pdf', nom: 'scan.pdf' },
        { octets: PDF, type: 'image/jpeg', nom: 'scan.jpg' },
        { octets: Buffer.alloc(0), type: 'image/jpeg', nom: 'vide.jpg' },  // vide
        { octets: Buffer.from([0xff, 0xd8, 0xff]), type: 'image/jpeg', nom: 'tronque.jpg' }, // tronqué
        { octets: Buffer.from('MZ\x90\x00binaire'), type: 'application/pdf', nom: 'x.pdf' },
    ];
    for (const c of cas) {
        const r = await envoyer({ ...c, avant: { face: 'recto' } });
        assert.equal(r.status, 400, `${c.nom} (${c.type})`);
        assert.match((await r.json()).error, /non supporté/);
    }
    // Fichier absent
    const r = await envoyer({ sansFichier: true, avant: { face: 'recto' } });
    assert.equal(r.status, 400);
    assert.deepEqual(toutLeDossier(), avant);
});

test('Nom et extension envoyés ignorés : une vraie photo nommée .html est enregistrée en .jpg', async () => {
    for (const nom of ['piege.html', '../../evil.jpg', 'scan.jpg.svg', 'sans-extension']) {
        const r = await envoyer({ octets: JPEG, type: 'image/jpeg', nom, avant: { face: 'verso' } });
        assert.equal(r.status, 200, nom);
        assert.match((await r.json()).filename, /^verso_\d+_[0-9a-f]{12}\.jpg$/);
    }
    assert.ok(contenu().every(f => /^(recto|verso)_\d+_[0-9a-f]{12}\.(jpg|png|pdf|heic)$/.test(f)), contenu().join(', '));
});

test('Fichier de plus de 5 Mo : refusé (413), aucun fichier écrit', async () => {
    const avant = toutLeDossier();
    const gros = Buffer.concat([JPEG, Buffer.alloc(5 * 1024 * 1024)]);
    const r = await envoyer({ octets: gros, type: 'image/jpeg', avant: { face: 'recto' } });
    assert.equal(r.status, 413);
    assert.deepEqual(toutLeDossier(), avant);
});

test('Lecture : type déduit du contenu, en-têtes de sécurité ; un ancien fichier HTML part en téléchargement binaire', async () => {
    // Fichiers déposés directement, comme d'anciens scans enregistrés avant la correction
    fs.writeFileSync(path.join(dossier, 'recto_1.png'), PNG);
    fs.writeFileSync(path.join(dossier, 'recto_2.html'), HTML);   // ancien fichier piégé
    fs.writeFileSync(path.join(dossier, 'recto_3.html'), JPEG);   // vraie photo mal nommée
    fs.writeFileSync(path.join(dossier, 'verso_4.pdf'), PDF);

    const lire = async (nom) => {
        const r = await fetch(`${base}/fichier/${nom}`);
        return { status: r.status, h: r.headers, octets: Buffer.from(await r.arrayBuffer()) };
    };
    const attendus = [
        ['recto_1.png', 'image/png', 'inline', PNG],
        ['recto_2.html', 'application/octet-stream', 'attachment; filename="scan-cin.bin"', HTML],
        ['recto_3.html', 'image/jpeg', 'inline', JPEG],
        ['verso_4.pdf', 'application/pdf', 'inline', PDF],
    ];
    for (const [nom, type, disposition, octets] of attendus) {
        const r = await lire(nom);
        assert.equal(r.status, 200, nom);
        assert.equal(r.h.get('content-type'), type, nom);
        assert.equal(r.h.get('content-disposition'), disposition, nom);
        assert.equal(r.h.get('x-content-type-options'), 'nosniff', nom);
        assert.equal(r.h.get('content-security-policy'), "default-src 'none'", nom);
        assert.equal(r.h.get('cache-control'), 'private, no-store', nom);
        assert.deepEqual(r.octets, octets, nom);
    }
});

test('Route réelle : sans session, refus (401) avant toute réception de fichier', async () => {
    // Dossier de travail temporaire : le routeur y crée uploads/cin-scans ; base injoignable, jamais appelée
    const cwd = process.cwd();
    process.env.JWT_SECRET = 'scans-cin-tests-secret';
    process.env.DATABASE_URL = '';
    process.env.DB_HOST = '127.0.0.1';
    process.env.DB_PORT = '1';
    process.chdir(racine);
    try {
        const { default: routeur } = await import('../routes/patients.js');
        const app = express();
        app.use('/api/patients', routeur);
        const srv = app.listen(0, '127.0.0.1');
        await new Promise(r => srv.once('listening', r));
        try {
            const scans = path.join(racine, 'uploads', 'cin-scans');
            const form = new FormData();
            form.append('face', '../../x');
            form.append('scan', new Blob([HTML], { type: 'image/jpeg' }), 'piege.html');
            const r = await fetch(`http://127.0.0.1:${srv.address().port}/api/patients/AB123456/upload-scan`, { method: 'POST', body: form });
            assert.equal(r.status, 401);
            assert.deepEqual(fs.readdirSync(scans), []);
        } finally {
            srv.close();
        }
    } finally {
        process.chdir(cwd);
    }
});
