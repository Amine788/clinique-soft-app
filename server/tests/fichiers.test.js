import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resetDatabase, startServer, loadModels, seedClinic, client, tokenFor } from './helpers.js';
// Fichiers médicaux : résultats d'examens et scans de CIN jamais servis sans authentification







const UPLOADS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'uploads');
let server, m, A, B;
const aSupprimer = [];

before(async () => {
    await resetDatabase();
    server = await startServer();
    m = await loadModels();
    A = await seedClinic(m, 'A');
    B = await seedClinic(m, 'B');
});
after(async () => {
    for (const f of aSupprimer) fs.rmSync(f, { force: true });
    await server?.stop();
    await m?.sequelize.close();
});

// Fichier déposé directement dans un sous-dossier de uploads (nettoyé après les tests)
function deposer(dossier, nom, contenu) {
    fs.mkdirSync(path.join(UPLOADS, dossier), { recursive: true });
    const chemin = path.join(UPLOADS, dossier, nom);
    fs.writeFileSync(chemin, contenu);
    aSupprimer.push(chemin);
}

test('Résultat d’examen : déposé par le labo, lisible seulement via l’API par les rôles de la clinique', async () => {
    const catalogue = await m.ExamenCatalog.create({ code: 'RX-F', nom: 'Radio thorax', type: 'laboratoire', prixStandard: 200 });
    const examen = await m.ExamenPatient.create({ clinic_id: A.clinic.id, patientId: A.patient.id, medecinId: A.medecin.id, examenId: catalogue.id, statut: 'preleve' });

    // Dépôt réel par le technicien (multipart, champ « fichier »)
    const form = new FormData();
    form.append('statut', 'termine');
    form.append('fichier', new Blob(['%PDF-1.4 resultat confidentiel'], { type: 'application/pdf' }), 'resultat.pdf');
    const depot = await fetch(`${server.base}/api/examens/${examen.id}/statut`, {
        method: 'PATCH', headers: { Authorization: `Bearer ${tokenFor(A.users.lab_technician)}` }, body: form,
    });
    assert.equal(depot.status, 200, await depot.text());
    await examen.reload();
    assert.match(examen.fichierResultat, /^\/uploads\/examens\/EXAM-/);
    aSupprimer.push(path.join(UPLOADS, 'examens', path.basename(examen.fichierResultat)));

    // L'ancienne adresse publique ne sert plus rien
    assert.equal((await fetch(server.base + examen.fichierResultat)).status, 404);

    const url = `/api/examens/${examen.id}/fichier`;
    assert.equal((await fetch(server.base + url)).status, 401, 'sans connexion');
    assert.equal((await client(server.base, B.users.doctor)('GET', url)).status, 404, 'autre clinique');
    assert.equal((await client(server.base, A.users.pharmacist)('GET', url)).status, 403, 'rôle non concerné');

    const lu = await client(server.base, A.users.doctor)('GET', url);
    assert.equal(lu.status, 200);
    assert.equal(lu.body, '%PDF-1.4 resultat confidentiel');
});

test('Scans de CIN : jamais servis sous /uploads ; les photos de profil restent publiques', async () => {
    deposer('cin-scans', 'recto_1700000000000.jpg', 'scan cin');
    deposer('profiles', 'test-profil.png', 'photo');

    assert.equal((await fetch(`${server.base}/uploads/cin-scans/recto_1700000000000.jpg`)).status, 404);
    const photo = await fetch(`${server.base}/uploads/profiles/test-profil.png`);
    assert.equal(photo.status, 200);
    assert.equal(await photo.text(), 'photo');
});

test('Photo de profil : seules PNG, JPEG et WebP, extension déduite du type (jamais .html ni .svg servis en public)', async () => {
    const envoyer = (contenu, type, nom) => {
        const form = new FormData();
        form.append('photo', new Blob([contenu], { type }), nom);
        return fetch(`${server.base}/api/auth/profile-photo`, { method: 'POST', headers: { Authorization: `Bearer ${tokenFor(A.users.doctor)}` }, body: form });
    };

    // Page HTML ou SVG (scriptable) : refusés
    assert.equal((await envoyer('<script>alert(1)</script>', 'text/html', 'piege.html')).status, 400);
    assert.equal((await envoyer('<svg xmlns="http://www.w3.org/2000/svg"/>', 'image/svg+xml', 'piege.svg')).status, 400);

    // Type image déclaré mais nom en .html : enregistré en .png, donc jamais servi comme une page
    const r = await envoyer('contenu quelconque', 'image/png', 'piege.html');
    assert.equal(r.status, 200);
    const { photoUrl } = await r.json();
    aSupprimer.push(path.join(UPLOADS, 'profiles', path.basename(photoUrl)));
    assert.match(photoUrl, /^\/uploads\/profiles\/profile-[\d-]+\.png$/);
    assert.match((await fetch(server.base + photoUrl)).headers.get('content-type'), /^image\/png/);

    // Création de compte par l'admin avec une photo SVG : refusée, aucun compte créé
    const form = new FormData();
    for (const [k, v] of Object.entries({ nom: 'Test', prenom: 'Svg', email: 'svg@clinique-a.test', password: 'Mot-de-passe-2026', role: 'secretary' })) form.append(k, v);
    form.append('photo', new Blob(['<svg/>'], { type: 'image/svg+xml' }), 'photo.svg');
    const creation = await fetch(`${server.base}/api/admin/users`, { method: 'POST', headers: { Authorization: `Bearer ${tokenFor(A.users.admin)}` }, body: form });
    assert.equal(creation.status, 400);
    assert.equal(await m.User.count({ where: { email: 'svg@clinique-a.test' } }), 0);
});

test('Logo de clinique : envoyé par l’admin, public, remplacé proprement ; l’ancienne route commune n’existe plus', async () => {
    const envoyer = (user, contenu, type = 'image/png', nom = 'logo.png') => {
        const form = new FormData();
        form.append('logo', new Blob([contenu], { type }), nom);
        return fetch(`${server.base}/api/clinic/logo`, { method: 'POST', headers: { Authorization: `Bearer ${tokenFor(user)}` }, body: form });
    };

    // Rôle non admin, format refusé
    assert.equal((await envoyer(A.users.secretary, 'png')).status, 403);
    assert.equal((await envoyer(A.users.admin, 'pas une image', 'text/plain', 'logo.txt')).status, 400);

    const r1 = await envoyer(A.users.admin, 'logo-v1');
    assert.equal(r1.status, 200);
    const { logoUrl: url1 } = await r1.json();
    aSupprimer.push(path.join(UPLOADS, 'logos', path.basename(url1)));
    assert.ok(url1 === `/uploads/logos/${path.basename(url1)}` && /^clinic-\d+-\d+\.png$/.test(path.basename(url1)), url1);
    assert.ok(path.basename(url1).startsWith(`clinic-${A.clinic.id}-`), url1);
    assert.equal((await client(server.base, A.users.doctor)('GET', '/api/clinic')).body.logoUrl, url1);
    assert.equal(await (await fetch(server.base + url1)).text(), 'logo-v1');

    // Remplacement : le nouveau est servi, l'ancien fichier est effacé ; la clinique B n'est pas touchée
    const r2 = await envoyer(A.users.admin, 'logo-v2', 'image/jpeg', 'logo.jpg');
    const { logoUrl: url2 } = await r2.json();
    aSupprimer.push(path.join(UPLOADS, 'logos', path.basename(url2)));
    assert.match(url2, /\.jpg$/);
    assert.equal(await (await fetch(server.base + url2)).text(), 'logo-v2');
    await new Promise(r => setTimeout(r, 200)); // suppression asynchrone de l'ancien fichier
    assert.equal(fs.existsSync(path.join(UPLOADS, 'logos', path.basename(url1))), false);
    assert.equal((await m.Clinic.findByPk(B.clinic.id)).logoUrl ?? null, null);

    assert.equal((await client(server.base, A.users.admin)('POST', '/api/admin/logo')).status, 404);
});

test('Documents du patient : scans de CIN et résultats listés et ouverts avec la session, limités à la clinique', async () => {
    const envoyer = async (user, url, champ, contenu, type, nom, extra = {}) => {
        const form = new FormData();
        for (const [k, v] of Object.entries(extra)) form.append(k, v);
        form.append(champ, new Blob([contenu], { type }), nom);
        return fetch(server.base + url, { method: 'POST', headers: { Authorization: `Bearer ${tokenFor(user)}` }, body: form });
    };
    // Scan de CIN par la secrétaire (route réelle de création de dossier) : contenu contrôlé, d'où une vraie signature PNG
    const scanPng = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from('image-cin-recto')]);
    const scan = await envoyer(A.users.secretary, `/api/patients/${A.patient.cinNumero}/upload-scan`, 'scan', scanPng, 'image/png', 'recto.png', { face: 'recto' });
    const enregistre = await m.CinScan.findOne({ where: { patientId: A.patient.id } });
    if (enregistre) aSupprimer.push(path.join(UPLOADS, 'cin-scans', path.basename(enregistre.fichierNom)));
    assert.equal(scan.status, 200, await scan.text());

    const url = `/api/patients/${A.patient.numeroDossier}/documents`;
    const liste = await client(server.base, A.users.doctor)('GET', url);
    assert.equal(liste.status, 200, JSON.stringify(liste.body));
    const cin = liste.body.find(d => d.type === 'cin');
    assert.ok(cin && cin.titre.includes('recto'), JSON.stringify(liste.body));
    assert.ok(liste.body.some(d => d.type === 'examen'), 'résultat d’examen (test précédent) absent');

    // Ouverture du scan : médecin oui ; pharmacien 403 ; autre clinique 404 ; sans session 401
    const ouvert = await client(server.base, A.users.doctor)('GET', `/api${cin.url}`);
    assert.equal(ouvert.status, 200);
    assert.ok(ouvert.body.endsWith('image-cin-recto'));
    assert.equal((await client(server.base, A.users.pharmacist)('GET', `/api${cin.url}`)).status, 403);
    assert.equal((await client(server.base, B.users.doctor)('GET', `/api${cin.url}`)).status, 404);
    assert.equal((await client(server.base, B.users.doctor)('GET', url)).status, 404);
    assert.equal((await fetch(`${server.base}/api${cin.url}`)).status, 401);
});
