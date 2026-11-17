#!/usr/bin/env node
// Test de fumée de l'API NextClinic : parcourt toutes les routes Express avec des données de TEST.
// Pour chaque fonctionnalité : cas normal, cas d'erreur (données invalides, ressource inexistante)
// et accès refusé (sans jeton, mauvais rôle). Aucun e-mail réel : Mailpit capture les envois.
//
// Usage : node tests/smoke/api.mjs [--check-persistence]
// Variables : SMOKE_BASE_URL (ex. http://127.0.0.1:3001), SMOKE_MAILPIT_URL (ex. http://127.0.0.1:8026),
//             SUPER_ADMIN_EMAIL, SUPER_ADMIN_PASSWORD, SMOKE_STATE (fichier d'état), SMOKE_REPORT (rapport .md)
// N'utiliser QUE contre une base jetable : le script crée cliniques, comptes et patients.
import { writeFileSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const BASE = (process.env.SMOKE_BASE_URL || 'http://127.0.0.1:3001').replace(/\/+$/, '');
const API = `${BASE}/api`;
const MAILPIT = (process.env.SMOKE_MAILPIT_URL || 'http://127.0.0.1:8026').replace(/\/+$/, '');
const SA_EMAIL = process.env.SUPER_ADMIN_EMAIL;
const SA_PASSWORD = process.env.SUPER_ADMIN_PASSWORD;
const STATE_FILE = process.env.SMOKE_STATE || 'smoke-state.json';
const REPORT_FILE = process.env.SMOKE_REPORT || '';
const ALLOWED_ORIGIN = process.env.SMOKE_ALLOWED_ORIGIN || '';
const PASSWORD = 'SmokeTest2026!';

if (!SA_EMAIL || !SA_PASSWORD) {
    console.error('SUPER_ADMIN_EMAIL et SUPER_ADMIN_PASSWORD (valeurs de test) sont requis.');
    process.exit(2);
}

const rows = [];
const RUN = Date.now().toString(36);
const rnd = (n) => String(Math.floor(Math.random() * 10 ** n)).padStart(n, '0');
const newCin = () => `SM${rnd(6)}`;
const email = (who) => `${who}.${RUN}@smoke.test`;
const dateIn = (days) => {
    const d = new Date(Date.now() + days * 86400000);
    return d.toISOString().slice(0, 10);
};

// PNG 1×1 valide (signature réelle) pour les téléversements
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

function record(feature, method, path, scenario, ok, status, detail = '') {
    rows.push({ feature, route: `${method} ${path}`, scenario, ok, status, detail });
    const mark = ok ? 'OK' : 'KO';
    console.log(`${mark.padEnd(3)} ${feature} | ${method} ${path} | ${scenario} | ${status}${detail ? ' | ' + detail : ''}`);
}

// Appel HTTP + vérification du statut attendu. expect : nombre ou liste de nombres.
async function call(feature, method, path, { token, json, form, raw, headers = {}, expect = 200, scenario = 'cas normal', check } = {}) {
    const h = { ...headers };
    if (token) h.Authorization = `Bearer ${token}`;
    let body;
    if (json !== undefined) { h['Content-Type'] = 'application/json'; body = JSON.stringify(json); }
    if (form) body = form;
    if (raw !== undefined) body = raw;
    let res, data, text = '';
    try {
        res = await fetch(`${API}${path}`, { method, headers: h, body });
        const type = res.headers.get('content-type') || '';
        if (type.includes('application/json')) { text = await res.text(); try { data = JSON.parse(text); } catch { data = text; } }
        else { data = Buffer.from(await res.arrayBuffer()); }
    } catch (err) {
        record(feature, method, path, scenario, false, 'ERR', err.message);
        return { status: 0, data: null };
    }
    const expected = Array.isArray(expect) ? expect : [expect];
    let ok = expected.includes(res.status);
    let detail = '';
    if (!ok) detail = `attendu ${expected.join('/')}${data?.error ? ' — ' + String(data.error).slice(0, 120) : ''}`;
    // Jamais de pile d'appels renvoyée au client
    if (typeof text === 'string' && /\n\s+at\s.+\(.+:\d+:\d+\)/.test(text)) { ok = false; detail += ' pile d\'appels exposée'; }
    if (ok && check) {
        try { const c = check(data, res); if (c !== true) { ok = false; detail = c || 'contrôle du contenu échoué'; } }
        catch (err) { ok = false; detail = `contrôle : ${err.message}`; }
    }
    record(feature, method, path, scenario, ok, res.status, detail);
    return { status: res.status, data, res };
}

// Refus attendus : sans jeton (401) et avec un rôle non autorisé (403)
async function denied(feature, method, path, wrongToken, opts = {}) {
    await call(feature, method, path, { ...opts, expect: 401, scenario: 'sans jeton' });
    if (wrongToken) await call(feature, method, path, { ...opts, token: wrongToken, expect: 403, scenario: 'mauvais rôle' });
}

function multipart(fields = {}, file) {
    const fd = new FormData();
    for (const [k, v] of Object.entries(fields)) fd.append(k, v);
    if (file) fd.append(file.field, new Blob([file.data], { type: file.type }), file.name);
    return fd;
}

// ── Mailpit : vérifie qu'un e-mail a été produit (jamais délivré) ──
async function mailsTo(address) {
    const r = await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:"${address}"`)}`);
    const j = await r.json();
    return j.messages || [];
}
async function waitMail(address, tries = 20, subject = null) {
    for (let i = 0; i < tries; i++) {
        const m = (await mailsTo(address)).filter(x => !subject || subject.test(x.Subject));
        if (m.length) return m;
        await new Promise(r => setTimeout(r, 500));
    }
    return [];
}
async function linkFromMail(id) {
    const r = await fetch(`${MAILPIT}/api/v1/message/${id}`);
    const m = await r.json();
    const html = `${m.HTML || ''}\n${m.Text || ''}`.replace(/&amp;/g, '&');
    return html.match(/setup-password\?token=([A-Za-z0-9._-]+)/)?.[1] || null;
}
async function checkMail(feature, route, address, scenario, subject = null) {
    const m = await waitMail(address, 20, subject);
    record(feature, 'SMTP', route, scenario, m.length > 0, m.length ? 'capturé' : 'absent',
        m.length ? `« ${m[0].Subject} » → ${address}` : `aucun e-mail vers ${address}`);
    return m;
}

async function login(who, emailAddr, password = PASSWORD) {
    const r = await call('Authentification', 'POST', '/auth/login', { json: { email: emailAddr, password }, scenario: `connexion ${who}`,
        check: d => (d?.token && d?.user?.role) ? true : 'jeton absent' });
    return r.data?.token;
}

// Jeton signé localement avec un autre secret / expiré, sans dépendance : HS256 à la main
function forgeToken(payload, secret) {
    const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
    const head = b64({ alg: 'HS256', typ: 'JWT' });
    const body = b64(payload);
    const { createHmac } = awaitCrypto;
    const sig = createHmac('sha256', secret).update(`${head}.${body}`).digest('base64url');
    return `${head}.${body}.${sig}`;
}
const awaitCrypto = await import('node:crypto');

// ═════════════════════════════════════════════════════════════════════════════
async function persistenceCheck() {
    const state = JSON.parse(readFileSync(STATE_FILE, 'utf8'));
    const tok = await login('secrétaire (après redémarrage)', state.secretaryEmail);
    await call('Persistance', 'GET', `/patients/${state.patientId}`, { token: tok, scenario: 'patient toujours en base',
        check: d => d?.cin?.numero === state.patientCin ? true : 'patient différent' });
    const r = await call('Persistance', 'GET', `/patients/${state.patientId}/documents/cin/${state.scanId}`, { token: tok, scenario: 'scan CIN toujours lisible' });
    const sha = r.data && Buffer.isBuffer(r.data) ? createHash('sha256').update(r.data).digest('hex') : '';
    record('Persistance', 'GET', '/patients/:id/documents/cin/:scanId', 'contenu identique (sha256)', sha === state.scanSha256, sha ? 'compare' : 'vide', sha === state.scanSha256 ? '' : 'contenu différent');
    const logo = await fetch(`${BASE}${state.logoUrl}`).catch(() => null);
    record('Persistance', 'GET', state.logoUrl || '/uploads/logos/…', 'logo téléversé toujours servi', logo?.status === 200, logo?.status ?? 'ERR');
}

async function main() {
    // ── Santé ──
    await call('Santé', 'GET', '/health', { check: d => d?.database === 'connected' ? true : 'base non connectée' });

    // ── Super-admin ──
    const sa = await login('super-admin', SA_EMAIL, SA_PASSWORD);
    await call('Authentification', 'POST', '/auth/login', { json: { email: SA_EMAIL, password: 'mauvais-mot-de-passe' }, expect: 401, scenario: 'mauvais mot de passe' });
    await call('Authentification', 'POST', '/auth/login', { json: { email: SA_EMAIL }, expect: 400, scenario: 'champs manquants' });
    await call('Authentification', 'POST', '/auth/login', { json: { email: 'inconnu@smoke.test', password: 'x' }, expect: 401, scenario: 'compte inexistant' });
    await call('Erreurs', 'POST', '/auth/login', { raw: '{"email": ', headers: { 'Content-Type': 'application/json' }, expect: 400, scenario: 'JSON malformé (pas de pile renvoyée)' });

    // ── Inscription d'une clinique (lien de mot de passe par e-mail) ──
    const adminEmail = email('admin');
    await call('Inscription clinique', 'POST', '/auth/register-clinic', { json: { clinicName: 'X' }, expect: 400, scenario: 'champs manquants' });
    await call('Inscription clinique', 'POST', '/auth/register-clinic', { json: { clinicName: `Clinique Smoke ${RUN}`, clinicType: 'Généraliste', ownerName: 'Amal Smoke', email: adminEmail }, expect: 201,
        check: d => d?.emailEnvoye === true ? true : 'emailEnvoye ≠ true' });
    await call('Inscription clinique', 'POST', '/auth/register-clinic', { json: { clinicName: 'Doublon', ownerName: 'A B', email: adminEmail }, expect: 409, scenario: 'e-mail déjà utilisé' });
    const welcome = await checkMail('E-mails', 'bienvenue + lien (register-clinic)', adminEmail, 'appel d\'envoi effectué');
    const setupToken = welcome[0] ? await linkFromMail(welcome[0].ID) : null;
    await call('Inscription clinique', 'POST', '/auth/setup-password', { json: { token: setupToken }, expect: 400, scenario: 'mot de passe manquant' });
    await call('Inscription clinique', 'POST', '/auth/setup-password', { json: { token: setupToken, password: '123' }, expect: 400, scenario: 'mot de passe trop court' });
    await call('Inscription clinique', 'POST', '/auth/setup-password', { json: { token: 'jeton.invalide.xx', password: PASSWORD }, expect: [400, 401], scenario: 'jeton invalide' });
    await call('Inscription clinique', 'POST', '/auth/setup-password', { json: { token: setupToken, password: PASSWORD }, scenario: 'création du mot de passe',
        check: d => d?.token ? true : 'pas de jeton de session' });
    await call('Inscription clinique', 'POST', '/auth/setup-password', { json: { token: setupToken, password: PASSWORD }, expect: 409, scenario: 'lien réutilisé' });
    const admin = await login('admin', adminEmail);

    // Inscription SaaS (/register) : lien client + notification interne
    const saasEmail = email('saas');
    const saas = await call('Inscription SaaS', 'POST', '/auth/register', { json: { clinicName: `SaaS Smoke ${RUN}`, ownerName: 'Sami Saas', email: saasEmail, phone: '0600000000', plan: 'Pro' }, expect: 201 });
    await call('Inscription SaaS', 'POST', '/auth/register', { json: { clinicName: 'x' }, expect: 400, scenario: 'champs manquants' });
    await checkMail('E-mails', 'lien de configuration (register)', saasEmail, 'appel d\'envoi effectué');
    if (process.env.ADMIN_NOTIFICATION_EMAIL) await checkMail('E-mails', 'notification nouveau client', process.env.ADMIN_NOTIFICATION_EMAIL, 'appel d\'envoi effectué');

    // ── JWT ──
    await call('JWT', 'GET', '/auth/me', { token: admin, check: d => d?.user?.role === 'admin' ? true : 'rôle inattendu' });
    await call('JWT', 'GET', '/auth/me', { expect: 401, scenario: 'sans jeton' });
    await call('JWT', 'GET', '/auth/me', { token: 'abc.def.ghi', expect: [401, 403], scenario: 'jeton malformé' });
    const me = JSON.parse(Buffer.from(admin.split('.')[1], 'base64url'));
    await call('JWT', 'GET', '/auth/me', { token: forgeToken({ ...me }, 'autre-secret'), expect: [401, 403], scenario: 'signature invalide' });
    await call('JWT', 'GET', '/auth/me', { token: forgeToken({ ...me, role: 'super_admin' }, 'autre-secret'), expect: [401, 403], scenario: 'rôle falsifié' });
    await call('JWT', 'GET', '/auth/me', { token: forgeToken({ ...me, iat: 1, exp: 2 }, 'autre-secret'), expect: [401, 403], scenario: 'jeton expiré' });
    record('Déconnexion', '—', '(pas de route serveur)', 'jeton sans état : la déconnexion efface la session côté navigateur', true, 'N/A', 'vérifiée dans le test des pages');

    // ── Administration des comptes ──
    await denied('Admin comptes', 'GET', '/admin/users', null);
    const mk = async (role, extra = {}, label = role) => {
        const e = email(label);
        const r = await call('Admin comptes', 'POST', '/admin/users', { token: admin, json: { nom: 'Smoke', prenom: role, email: e, password: PASSWORD, role, telephone: '0600000001', ...extra }, expect: 201, scenario: `création ${role}` });
        return { email: e, id: r.data?.userId, medecinId: r.data?.medecinId };
    };
    const doctor = await mk('doctor', { specialite: 'Cardiologie' });
    const doctor2 = await mk('doctor', {}, 'doctor2');
    const secretary = await mk('secretary');
    const nurse = await mk('nurse', { doctorId: doctor.medecinId });
    const pharmacist = await mk('pharmacist');
    const lab = await mk('lab_technician');
    const spare = await mk('secretary', {}, 'spare');
    await call('Admin comptes', 'POST', '/admin/users', { token: admin, json: { nom: 'a', prenom: 'b', email: email('bad'), password: PASSWORD, role: 'pirate' }, expect: 400, scenario: 'rôle invalide' });
    await call('Admin comptes', 'POST', '/admin/users', { token: admin, json: { nom: 'a', prenom: 'b', email: doctor.email, password: PASSWORD, role: 'doctor' }, expect: 409, scenario: 'e-mail en double' });
    await call('Admin comptes', 'POST', '/admin/users', { token: admin, json: { nom: 'a' }, expect: 400, scenario: 'champs manquants' });

    const tDoc = await login('médecin', doctor.email);
    const tDoc2 = await login('médecin 2', doctor2.email);
    const tSec = await login('secrétaire', secretary.email);
    const tNur = await login('infirmier', nurse.email);
    const tPha = await login('pharmacien', pharmacist.email);
    const tLab = await login('technicien de labo', lab.email);

    await denied('Admin comptes', 'GET', '/admin/users', tSec);
    await call('Admin comptes', 'GET', '/admin/users', { token: admin, check: d => (Array.isArray(d) ? d : d?.users || d?.data)?.length >= 6 ? true : 'liste incomplète' });
    await call('Admin comptes', 'GET', '/admin/users?role=doctor', { token: admin, scenario: 'filtre par rôle' });
    await call('Admin comptes', 'GET', '/admin/stats', { token: admin });
    await call('Admin comptes', 'GET', '/admin/doctors', { token: admin });
    await call('Admin comptes', 'PUT', `/admin/users/${spare.id}`, { token: admin, json: { telephone: '0611111111' } });
    await call('Admin comptes', 'PUT', '/admin/users/999999', { token: admin, json: { telephone: '0611111111' }, expect: 404, scenario: 'compte inexistant' });
    await call('Admin comptes', 'PUT', `/admin/users/${spare.id}/password`, { token: admin, json: { password: 'NouveauMdp2026!' } });
    await call('Admin comptes', 'PUT', `/admin/users/${spare.id}/password`, { token: admin, json: { password: '1' }, expect: 400, scenario: 'mot de passe trop court' });
    await call('Admin comptes', 'PUT', `/admin/doctors/${doctor2.medecinId}/password`, { token: admin, json: { password: PASSWORD } });
    await call('Admin comptes', 'PATCH', `/admin/users/${spare.id}/toggle`, { token: admin, scenario: 'suspension' });
    await call('Authentification', 'POST', '/auth/login', { json: { email: spare.email, password: 'NouveauMdp2026!' }, expect: 403, scenario: 'compte suspendu refusé' });
    await call('Admin comptes', 'DELETE', `/admin/users/${spare.id}`, { token: admin });
    await call('Admin comptes', 'DELETE', '/admin/users/999999', { token: admin, expect: 404, scenario: 'compte inexistant' });
    // Invitation : e-mail + création du mot de passe par le lien
    const invited = email('invite');
    await call('Admin comptes', 'POST', '/admin/users/invite', { token: admin, json: { email: invited, name: 'Ines Invite', role: 'nurse' }, expect: [200, 201] });
    await call('Admin comptes', 'POST', '/admin/users/invite', { token: admin, json: { email: invited }, expect: 400, scenario: 'champs manquants' });
    const inv = await checkMail('E-mails', 'invitation du personnel', invited, 'appel d\'envoi effectué');
    const invTok = inv[0] ? await linkFromMail(inv[0].ID) : null;
    await call('Admin comptes', 'POST', '/auth/setup-password', { json: { token: invTok, password: PASSWORD }, scenario: 'invitation acceptée' });

    // ── Clinique et départements ──
    await call('Clinique', 'GET', '/clinic', { token: tSec });
    await call('Clinique', 'GET', '/clinic', { expect: 401, scenario: 'sans jeton' });
    await call('Clinique', 'PUT', '/clinic', { token: admin, json: { phone: '0522000000', address: '1 rue du Test' } });
    await call('Clinique', 'PUT', '/clinic', { token: tSec, json: { phone: '1' }, expect: 403, scenario: 'mauvais rôle' });
    const logo = await call('Clinique', 'POST', '/clinic/logo', { token: admin, form: multipart({}, { field: 'logo', data: PNG, type: 'image/png', name: 'logo.png' }), expect: [200, 201] });
    await call('Clinique', 'POST', '/clinic/logo', { token: admin, form: multipart({}, { field: 'logo', data: Buffer.from('<svg onload=alert(1)>'), type: 'image/svg+xml', name: 'x.svg' }), expect: 400, scenario: 'type de fichier refusé (SVG)' });
    const logoUrl = logo.data?.logoUrl || logo.data?.logo || logo.data?.url;
    if (logoUrl) { const lr = await fetch(`${BASE}${logoUrl}`); record('Clinique', 'GET', '/uploads/logos/:fichier', 'logo servi publiquement', lr.status === 200, lr.status); }
    await call('Clinique', 'GET', '/clinic/departements', { token: admin });
    const dep = await call('Clinique', 'POST', '/clinic/departements', { token: admin, json: { nom: `Cardiologie ${RUN}`, lits: 10 }, expect: [200, 201] });
    await call('Clinique', 'POST', '/clinic/departements', { token: admin, json: {}, expect: 400, scenario: 'nom manquant' });
    const depId = dep.data?.id || dep.data?.departement?.id;
    const dep2 = await call('Clinique', 'POST', '/clinic/departements', { token: admin, json: { nom: `Pédiatrie ${RUN}`, lits: 4 }, expect: [200, 201], scenario: 'second département' });
    const dep2Id = dep2.data?.id;
    await call('Clinique', 'PUT', `/clinic/departements/${depId}`, { token: admin, json: { nom: `Cardio ${RUN}`, lits: 12 } });
    await call('Clinique', 'PATCH', `/clinic/departements/${depId}/toggle`, { token: admin });
    await call('Clinique', 'PUT', '/clinic/departements/999999', { token: admin, json: { nom: 'x' }, expect: 404, scenario: 'inexistant' });
    await call('Clinique', 'POST', '/clinic/departements', { token: tDoc, json: { nom: 'x' }, expect: 403, scenario: 'mauvais rôle' });

    // ── Chambres ──
    await denied('Chambres', 'GET', '/rooms', tPha);
    const room = await call('Chambres', 'POST', '/rooms', { token: tSec, json: { numero: `S${rnd(3)}`, typeChambre: 'privee', nbLits: 1, tarifTtc: 500 }, expect: [200, 201] });
    const roomId = room.data?.id || room.data?.chambre?.id;
    const room2 = await call('Chambres', 'POST', '/rooms', { token: tSec, json: { numero: `T${rnd(3)}`, typeChambre: 'double', nbLits: 2, tarifTtc: 300 }, expect: [200, 201], scenario: 'seconde chambre' });
    const room2Id = room2.data?.id || room2.data?.chambre?.id;
    await call('Chambres', 'POST', '/rooms', { token: tSec, json: { numero: 'Z1' }, expect: 400, scenario: 'type manquant' });
    await call('Chambres', 'POST', '/rooms', { token: tNur, json: { numero: 'Z1', typeChambre: 'privee' }, expect: 403, scenario: 'mauvais rôle' });
    await call('Chambres', 'GET', '/rooms', { token: tNur });
    await call('Chambres', 'GET', `/rooms/${roomId}`, { token: tSec });
    await call('Chambres', 'GET', '/rooms/999999', { token: tSec, expect: 404, scenario: 'inexistante' });
    await call('Chambres', 'PUT', `/rooms/${room2Id}/status`, { token: tSec, json: { statut: 'hors_service' } });
    await call('Chambres', 'PUT', `/rooms/${room2Id}/status`, { token: tSec, json: { statut: 'nimporte' }, expect: 400, scenario: 'statut invalide' });
    await call('Chambres', 'DELETE', `/rooms/${room2Id}`, { token: tSec });
    await call('Chambres', 'DELETE', '/rooms/999999', { token: tSec, expect: 404, scenario: 'inexistante' });

    // ── Patients ──
    await denied('Patients', 'GET', '/patients', tPha);
    const cin = newCin();
    const pBody = { cin, nom: 'Patient', prenom: 'Smoke', dateNaissance: '1985-04-12', sexe: 'M', telephone: '0612345678', email: email('patient'), ville: 'Casablanca', insurance: 'CNOPS (80%)' };
    const p = await call('Patients', 'POST', '/patients', { token: tSec, json: pBody, expect: 201 });
    const patientId = p.data?.id; // numéro de dossier (identifiant exposé par l'API)
    await checkMail('E-mails', 'bienvenue patient (création du dossier)', pBody.email, 'appel d\'envoi effectué', /^Bienvenue/);
    await call('Patients', 'POST', '/patients', { token: tSec, json: { ...pBody, cin: '12AB' }, expect: 400, scenario: 'CIN invalide' });
    await call('Patients', 'POST', '/patients', { token: tSec, json: pBody, expect: 409, scenario: 'CIN en double' });
    await call('Patients', 'POST', '/patients', { token: tSec, json: { cin: newCin() }, expect: 400, scenario: 'champs manquants' });
    await call('Patients', 'POST', '/patients', { token: tNur, json: pBody, expect: 403, scenario: 'mauvais rôle' });
    await call('Patients', 'GET', '/patients', { token: tSec });
    await call('Patients', 'GET', `/patients?search=Smoke`, { token: tSec, scenario: 'recherche' });
        await call('Patients', 'GET', `/patients/check-cin/ZZ000000`, { token: tSec, expect: [200, 404], scenario: 'CIN inconnu' });
    const pd = await call('Patients', 'GET', `/patients/${patientId}`, { token: tSec });
    const cc = await call('Patients', 'GET', `/patients/check-cin/${cin}`, { token: tSec, scenario: 'identifiant interne (dbId, utilisé par le front)' });
    const patientNum = cc.data?.patient?.dbId;
    await call('Patients', 'POST', '/patients', { token: tSec, json: { ...pBody, cin: newCin(), bloodType: 'O+' }, expect: 403, scenario: 'secrétaire : champ médical refusé' });
    await call('Patients', 'GET', '/patients/999999', { token: tSec, expect: 404, scenario: 'inexistant' });
    await call('Patients', 'PUT', `/patients/${patientId}`, { token: tSec, json: { telephonePrincipal: '0699999999' } });
    await call('Patients', 'PUT', `/patients/${patientId}`, { token: tSec, json: { allergies: ['Arachide'] }, expect: 403, scenario: 'secrétaire : champ médical refusé' });
    await call('Patients', 'PUT', `/patients/${patientId}`, { token: tSec, json: { sexe: 'X' }, expect: 400, scenario: 'sexe invalide' });
    await call('Patients', 'PUT', '/patients/999999', { token: tSec, json: { nom: 'x' }, expect: 404, scenario: 'inexistant' });
    // Scans de CIN
    const scan = await call('Scans CIN', 'POST', `/patients/${cin}/upload-scan`, { token: tSec, form: multipart({ face: 'recto' }, { field: 'scan', data: PNG, type: 'image/png', name: 'cin.png' }), expect: [200, 201] });
    await call('Scans CIN', 'POST', `/patients/${cin}/upload-scan`, { token: tSec, form: multipart({ face: 'recto' }, { field: 'scan', data: Buffer.from('MZ pas une image'), type: 'image/png', name: 'faux.png' }), expect: 400, scenario: 'faux PNG (signature)' });
    await call('Scans CIN', 'POST', `/patients/${cin}/upload-scan`, { token: tSec, form: multipart({ face: 'recto' }), expect: 400, scenario: 'fichier manquant' });
    await call('Scans CIN', 'POST', `/patients/${cin}/upload-scan`, { token: tPha, form: multipart({}, { field: 'scan', data: PNG, type: 'image/png', name: 'cin.png' }), expect: 403, scenario: 'mauvais rôle' });
    await call('Scans CIN', 'POST', `/patients/ZZ000000/upload-scan`, { token: tSec, form: multipart({}, { field: 'scan', data: PNG, type: 'image/png', name: 'cin.png' }), expect: [200, 201], scenario: 'CIN pas encore enregistré (voulu : scan avant création du dossier)' });
    const docs = await call('Scans CIN', 'GET', `/patients/${patientId}/documents`, { token: tSec });
    const scanList = docs.data?.cinScans || docs.data?.scans || docs.data?.cin || [];
    const scanId = (Array.isArray(docs.data) ? docs.data.find(d => d.type === 'cin') : scanList[0])?.id;
    const dl = await call('Scans CIN', 'GET', `/patients/${patientId}/documents/cin/${scanId}`, { token: tSec, scenario: 'téléchargement authentifié',
        check: d => Buffer.isBuffer(d) && d.equals(PNG) ? true : 'contenu différent' });
    await call('Scans CIN', 'GET', `/patients/${patientId}/documents/cin/${scanId}`, { token: tNur, expect: 403, scenario: 'mauvais rôle' });
    await call('Scans CIN', 'GET', `/patients/${patientId}/documents/cin/999999`, { token: tSec, expect: 404, scenario: 'scan inexistant' });
    const pub = await fetch(`${BASE}/uploads/cin-scans/`).catch(() => null);
    record('Scans CIN', 'GET', '/uploads/cin-scans/…', 'jamais servi publiquement', !pub || pub.status !== 200 || !(pub.headers.get('content-type') || '').startsWith('image'), pub?.status ?? 'ERR');

    // ── Photo de profil (médecin) ──
    const photo = await call('Photo de profil', 'POST', '/auth/profile-photo', { token: tDoc, form: multipart({}, { field: 'photo', data: PNG, type: 'image/png', name: 'moi.png' }), check: d => d?.photoUrl ? true : 'photoUrl absente' });
    if (photo.data?.photoUrl) { const pr = await fetch(`${BASE}${photo.data.photoUrl}`); record('Photo de profil', 'GET', '/uploads/profiles/:fichier', 'photo servie publiquement', pr.status === 200, pr.status); }
    await call('Photo de profil', 'POST', '/auth/profile-photo', { token: tDoc, form: multipart({}, { field: 'photo', data: Buffer.from('<html>'), type: 'text/html', name: 'x.html' }), expect: 400, scenario: 'type refusé (HTML)' });
    await call('Photo de profil', 'POST', '/auth/profile-photo', { token: tDoc, form: multipart({}), expect: 400, scenario: 'fichier manquant' });
    await call('Photo de profil', 'POST', '/auth/profile-photo', { token: tSec, form: multipart({}, { field: 'photo', data: PNG, type: 'image/png', name: 'moi.png' }), expect: 403, scenario: 'rôle non médecin' });
    await call('Photo de profil', 'POST', '/auth/profile-photo', { form: multipart({}), expect: 401, scenario: 'sans jeton' });

    // ── Médecins ──
    await call('Médecins', 'GET', '/doctors', { token: tSec });
    await call('Médecins', 'GET', '/doctors', { expect: 401, scenario: 'sans jeton' });
    await call('Médecins', 'GET', `/doctors/${doctor.medecinId}`, { token: tSec });
    await call('Médecins', 'GET', '/doctors/999999', { token: tSec, expect: 404, scenario: 'inexistant' });
    await call('Médecins', 'GET', `/doctors/${doctor.medecinId}/stats`, { token: tDoc });
    await call('Médecins', 'GET', `/doctors/${doctor.medecinId}/stats`, { token: tSec, expect: 403, scenario: 'mauvais rôle' });
    await call('Médecins', 'GET', `/doctors/${doctor.medecinId}/absences`, { token: tSec });

    // ── Rendez-vous ──
    await denied('Rendez-vous', 'GET', '/appointments', tPha);
    const rdvDate = dateIn(1);
    const rdv = await call('Rendez-vous', 'POST', '/appointments', { token: tSec, json: { patientCin: cin, doctorId: doctor.medecinId, date: rdvDate, heure: '10:00', typeConsultation: 'premiere', motif: 'Contrôle smoke' }, expect: 201 });
    const rdvId = rdv.data?.id || rdv.data?.rdv?.id || rdv.data?.appointment?.id;
    await checkMail('E-mails', 'confirmation de rendez-vous', pBody.email, 'appel d\'envoi effectué', /rendez-vous/i);
    await call('Rendez-vous', 'POST', '/appointments', { token: tSec, json: { patientCin: cin, doctorId: doctor.medecinId, date: rdvDate, heure: '10:00', motif: 'x' }, expect: 409, scenario: 'créneau occupé' });
    await call('Rendez-vous', 'POST', '/appointments', { token: tSec, json: { patientCin: cin }, expect: 400, scenario: 'champs manquants' });
    await call('Rendez-vous', 'POST', '/appointments', { token: tSec, json: { patientCin: 'ZZ000000', doctorId: doctor.medecinId, date: rdvDate, heure: '11:00', motif: 'x' }, expect: 404, scenario: 'patient inexistant' });
    await call('Rendez-vous', 'POST', '/appointments', { token: tSec, json: { patientCin: cin, doctorId: 999999, date: rdvDate, heure: '11:00', motif: 'x' }, expect: 404, scenario: 'médecin inexistant' });
    await call('Rendez-vous', 'GET', '/appointments', { token: tSec });
    await call('Rendez-vous', 'GET', `/appointments?date=${rdvDate}`, { token: tDoc, scenario: 'médecin, filtre date' });
    await call('Rendez-vous', 'GET', `/appointments/${rdvId}`, { token: tSec });
    await call('Rendez-vous', 'GET', '/appointments/999999', { token: tSec, expect: 404, scenario: 'inexistant' });
    await call('Rendez-vous', 'PATCH', `/appointments/${rdvId}`, { token: tSec, json: { motif: 'Contrôle smoke modifié' } });
    await call('Rendez-vous', 'PUT', `/appointments/${rdvId}/status`, { token: tSec, json: { status: 'confirme' } });
    await call('Rendez-vous', 'PUT', '/appointments/999999/status', { token: tSec, json: { status: 'confirme' }, expect: 404, scenario: 'inexistant' });
    await call('Patients', 'PUT', `/patients/${patientId}`, { token: tDoc, json: { bloodType: 'O+', allergies: ['Pénicilline'] }, scenario: 'médecin traitant : champs médicaux' });
    // RDV du jour pour la file d'attente et le check-in
    const rdvToday = await call('Rendez-vous', 'POST', '/appointments', { token: tSec, json: { patientCin: cin, doctorId: doctor.medecinId, date: dateIn(0), heure: '23:30', motif: 'Consultation du jour' }, expect: 201, scenario: 'RDV du jour' });
    const rdvTodayId = rdvToday.data?.id; // numéro de RDV
    const rdvTodayDetail = await call('Rendez-vous', 'GET', `/appointments/${rdvTodayId}`, { token: tSec, scenario: 'détail RDV du jour' });
    const rdvTodayNum = rdvTodayDetail.data?.dbId ?? (Number.isInteger(rdvTodayDetail.data?.id) ? rdvTodayDetail.data.id : undefined);
    await call('Accueil', 'POST', '/patients/checkin', { token: tSec, json: { cin, mode: 'saisie_cin' }, expect: [200, 201] });
    await call('Accueil', 'POST', '/patients/checkin', { token: tSec, json: {}, expect: 400, scenario: 'CIN manquant' });
    await call('Accueil', 'POST', '/patients/checkin', { token: tDoc, json: { cin }, expect: 403, scenario: 'mauvais rôle' });

    // ── Absences ──
    await denied('Absences', 'GET', '/absences', tPha);
    const abs = await call('Absences', 'POST', '/absences', { token: tDoc, json: { typeAbsence: 'conge_annuel', dateDebut: dateIn(30), dateFin: dateIn(32), motif: 'Congé smoke' }, expect: [200, 201] });
    const absId = abs.data?.id || abs.data?.absence?.id;
    await call('Absences', 'POST', '/absences', { token: tDoc, json: { motif: 'x' }, expect: 400, scenario: 'dates manquantes' });
    await call('Absences', 'POST', '/absences', { token: tDoc, json: { typeAbsence: 'vacances', dateDebut: dateIn(40), dateFin: dateIn(41), motif: 'x' }, expect: 400, scenario: "type d'absence invalide" });
    await call('Absences', 'POST', '/absences', { token: tSec, json: { dateDebut: dateIn(30), dateFin: dateIn(31), motif: 'x' }, expect: 403, scenario: 'mauvais rôle' });
    await call('Absences', 'GET', '/absences', { token: tSec });
    await call('Absences', 'PATCH', `/absences/${absId}`, { token: tSec, json: { statut: 'validee' } });
    await call('Absences', 'PATCH', `/absences/${absId}`, { token: tSec, json: { statut: 'peut-etre' }, expect: 400, scenario: 'statut invalide' });
    await call('Absences', 'PATCH', '/absences/999999', { token: tSec, json: { statut: 'validee' }, expect: 404, scenario: 'inexistante' });

    // Périmètre infirmier (voulu) : patients hospitalisés ou affectés à son service → l'admin affecte
    await call('Accès patients', 'POST', '/patient-access/nurse-services', { token: admin, json: { userId: nurse.id, departmentId: depId }, expect: [200, 201] });
    const asg = await call('Accès patients', 'POST', '/patient-access/assignments', { token: admin, json: { patientId: patientNum, departmentId: depId, kind: 'service', startsAt: new Date().toISOString(), endsAt: new Date(Date.now() + 86400000).toISOString(), reason: 'Affectation au service (test smoke)' }, expect: 201, scenario: 'affectation au service' });
    // ── Infirmerie : file, constantes ──
    await denied('Infirmerie', 'GET', '/nurse/queue', tPha);
    await call('Infirmerie', 'GET', '/nurse/queue', { token: tNur });
    await call('Infirmerie', 'POST', '/nurse/vitals', { token: tNur, json: { rdvId: rdvTodayId, vitals: { temperature: 37.2, tension: '12/8', pouls: 72, saturation: 98 } }, expect: [200, 201] });
    await call('Infirmerie', 'POST', '/nurse/vitals', { token: tNur, json: {}, expect: [400, 404], scenario: 'données manquantes' });
    await call('Infirmerie', 'GET', `/nurse/vitals-history/${cin}`, { token: tNur });
    const dossier = patientId;
    await call('Infirmerie', 'GET', `/nurse/patient-by-dossier/${dossier}`, { token: tNur });
    await call('Infirmerie', 'GET', '/nurse/patient-by-dossier/PAT-0000-99999', { token: tNur, expect: 404, scenario: 'dossier inexistant' });
    await call('Infirmerie', 'GET', '/nurse/scan/jeton-inconnu', { token: tNur, expect: [400, 404], scenario: 'QR inconnu' });
    await call('Infirmerie', 'POST', '/nurse/alert', { token: tNur, json: { patientId: patientNum, patientName: 'Smoke Patient', message: 'Alerte smoke', urgency: 'haute' }, expect: [200, 201] });
    await call('Infirmerie', 'POST', '/nurse/alert', { token: tNur, json: {}, expect: 400, scenario: 'message manquant' });

    // ── Examens ──
    const cat = await call('Examens', 'GET', '/examens/catalog', { token: tDoc, check: d => Array.isArray(d) && d.length ? true : 'catalogue vide (alimenter examens_catalog)' });
    await call('Examens', 'GET', '/examens/catalog', { token: tSec, expect: 403, scenario: 'mauvais rôle' });
    const ex = await call('Examens', 'POST', '/examens', { token: tDoc, json: { patientCin: cin, rdvId: rdvTodayId, examensIds: [cat.data?.[0]?.id] }, expect: [200, 201] });
    await call('Examens', 'POST', '/examens', { token: tDoc, json: { patientCin: cin }, expect: 400, scenario: 'examens manquants' });
    await call('Examens', 'POST', '/examens', { token: tLab, json: { patientCin: cin, examensIds: [1] }, expect: 403, scenario: 'mauvais rôle' });
    const exams = await call('Examens', 'GET', '/examens', { token: tLab });
    const examId = (Array.isArray(exams.data) ? exams.data : exams.data?.examens || [])[0]?.id || ex.data?.examens?.[0]?.id || ex.data?.[0]?.id;
    await call('Examens', 'GET', `/examens/patient/${cin}`, { token: tDoc });
    await call('Examens', 'PATCH', `/examens/${examId}/statut`, { token: tLab, form: multipart({ statut: 'termine', resultats: 'Normal' }, { field: 'fichier', data: PNG, type: 'image/png', name: 'resultat.png' }), expect: 200, scenario: 'résultat avec fichier' });
    await call('Examens', 'PATCH', `/examens/${examId}/statut`, { token: tLab, json: { statut: 'nimporte' }, expect: 400, scenario: 'statut invalide' });
    await call('Examens', 'PATCH', '/examens/999999/statut', { token: tLab, json: { statut: 'en_cours' }, expect: 404, scenario: 'inexistant' });
    await call('Examens', 'GET', `/examens/${examId}/fichier`, { token: tDoc, expect: [200, 404], scenario: 'fichier de résultat (authentifié)' });
    await call('Examens', 'GET', `/examens/${examId}/fichier`, { token: tSec, expect: 403, scenario: 'mauvais rôle' });

    // ── Ordonnances ──
    await denied('Ordonnances', 'GET', '/prescriptions', tSec);
    const presc = await call('Ordonnances', 'POST', '/prescriptions', { token: tDoc, json: { patientCin: cin, rdvId: rdvTodayId, diagnostique: 'Rhinopharyngite', medicaments: [{ nom: 'Paracétamol', dosage: '500 mg', frequence: '3', duree: '5 jours' }] }, expect: [200, 201] });
    const prescId = presc.data?.ordonnance?.id ?? presc.data?.id;
    await call('Ordonnances', 'POST', '/prescriptions', { token: tDoc, json: { patientCin: cin, medicaments: [{ nom: 'X', frequence: 'souvent' }] }, expect: 400, scenario: 'fréquence invalide' });
    await call('Ordonnances', 'POST', '/prescriptions', { token: tDoc, json: { patientCin: 'ZZ000000', medicaments: [{ nom: 'X', frequence: '1' }] }, expect: 404, scenario: 'patient inexistant' });
    await call('Ordonnances', 'POST', '/prescriptions', { token: tNur, json: { patientCin: cin, medicaments: [{ nom: 'X', frequence: '1' }] }, expect: 403, scenario: 'mauvais rôle' });
    await call('Ordonnances', 'GET', '/prescriptions', { token: tPha });
    await call('Ordonnances', 'GET', `/prescriptions/${prescId}`, { token: tDoc });
    await call('Ordonnances', 'GET', '/prescriptions/999999', { token: tDoc, expect: 404, scenario: 'inexistante' });

    // ── Pharmacie ──
    await denied('Pharmacie', 'GET', '/pharmacy/products', tSec);
    const code = `SMK${rnd(5)}`;
    await call('Pharmacie', 'POST', '/pharmacy/products', { token: tPha, json: { codeProduit: code, nomCommercial: 'Paracétamol 500', forme: 'comprime', categorie: 'medicament', prixVente: 12, stockActuel: 3 }, expect: [200, 201] });
    await call('Pharmacie', 'POST', '/pharmacy/products', { token: tPha, json: {}, expect: 400, scenario: 'champs manquants' });
    await call('Pharmacie', 'GET', '/pharmacy/products', { token: tPha });
    await call('Pharmacie', 'GET', '/pharmacy/stock?search=Parac', { token: tDoc, scenario: 'recherche (médecin)' });
    await call('Pharmacie', 'POST', `/pharmacy/stock/${code}`, { token: tPha, json: { quantity: 50 } });
    await call('Pharmacie', 'POST', `/pharmacy/stock/${code}`, { token: tPha, json: { quantity: 'abc' }, expect: 400, scenario: 'quantité invalide' });
    await call('Pharmacie', 'POST', '/pharmacy/stock/INCONNU', { token: tPha, json: { quantity: 5 }, expect: 404, scenario: 'produit inexistant' });
    await call('Pharmacie', 'GET', '/pharmacy/alerts', { token: tPha });
    await call('Pharmacie', 'GET', '/pharmacy/lots', { token: tPha });
    await call('Pharmacie', 'GET', '/pharmacy/dispensations', { token: tPha });
    await call('Ordonnances', 'PATCH', `/prescriptions/${prescId}/status`, { token: tPha, json: { statut: 'nimporte' }, expect: 400, scenario: 'statut invalide' });
    await call('Ordonnances', 'PATCH', `/prescriptions/${prescId}/status`, { token: tDoc, json: { statut: 'dispensee' }, expect: 403, scenario: 'mauvais rôle' });
    // Circuit du médicament
    await call('Circuit médicament', 'GET', '/nurse/medications', { token: tPha });
    await call('Circuit médicament', 'POST', `/nurse/prescriptions/${prescId}/advance`, { token: tPha, json: { nextStatus: 'preparee' }, expect: [200, 400, 409], scenario: 'étape suivante' });
    await call('Circuit médicament', 'POST', `/nurse/prescriptions/${prescId}/deliver`, { token: tPha, expect: [200, 400, 409] });
    await call('Circuit médicament', 'POST', `/nurse/prescriptions/${prescId}/administer`, { token: tNur, json: { itemId: 1, slotIndex: 0, done: true }, expect: [200, 400, 409] });
    await call('Circuit médicament', 'POST', '/nurse/prescriptions/999999/deliver', { token: tPha, expect: 404, scenario: 'inexistante' });
    await call('Circuit médicament', 'POST', `/nurse/prescriptions/${prescId}/administer`, { token: tPha, json: {}, expect: 403, scenario: 'mauvais rôle' });
    await call('Pharmacie', 'DELETE', `/pharmacy/products/${code}`, { token: tPha });
    await call('Pharmacie', 'DELETE', '/pharmacy/products/INCONNU', { token: tPha, expect: 404, scenario: 'inexistant' });

    // ── Hospitalisations ──
    await denied('Hospitalisations', 'GET', '/hospitalisations/active', tSec);
    const hosp = await call('Hospitalisations', 'POST', '/hospitalisations', { token: tDoc, json: { patientId: patientNum ?? patientId, diagnostic: 'Pneumopathie', motif: 'Surveillance', etat: 'stable' }, expect: [200, 201] });
    const hospId = hosp.data?.id || hosp.data?.hospitalisation?.id;
    await call('Hospitalisations', 'POST', '/hospitalisations', { token: tDoc, json: {}, expect: 400, scenario: 'patient manquant' });
    await call('Hospitalisations', 'POST', '/hospitalisations', { token: tDoc, json: { patientId: patientNum ?? patientId }, expect: 409, scenario: 'double hospitalisation' });
    await call('Hospitalisations', 'GET', '/hospitalisations/nurses', { token: tSec });
    await call('Hospitalisations', 'GET', '/hospitalisations/admissions', { token: tSec });
    await call('Hospitalisations', 'GET', '/hospitalisations/administrative-stays', { token: tSec });
    await call('Hospitalisations', 'PUT', `/hospitalisations/${hospId}/admit`, { token: tSec, json: { chambreId: roomId, lit: 1, nurseId: nurse.id } });
    await call('Hospitalisations', 'PUT', '/hospitalisations/999999/admit', { token: tSec, json: { chambreId: roomId, lit: 1, nurseId: nurse.id }, expect: 404, scenario: 'inexistante' });
    await call('Hospitalisations', 'GET', '/hospitalisations/active', { token: tNur });
    await call('Hospitalisations', 'GET', `/hospitalisations/${hospId}`, { token: tDoc });
    await call('Hospitalisations', 'GET', '/hospitalisations/999999', { token: tDoc, expect: 404, scenario: 'inexistante' });
    await call('Hospitalisations', 'PUT', `/hospitalisations/${hospId}/treatment`, { token: tDoc, json: { medicaments: [{ nom: 'Amoxicilline', dosage: '1 g', frequence: '2' }], etat: 'stable' } });
    await call('Hospitalisations', 'POST', `/hospitalisations/${hospId}/vitals`, { token: tNur, json: { temperature: 38.9, tension: '13/8', saturation: 93, pouls: 110 }, expect: [200, 201] });
    const al = await call('Hospitalisations', 'POST', `/hospitalisations/${hospId}/alerts`, { token: tNur, json: { typeAlerte: 'temperature', description: 'Fièvre', urgency: 'critique' }, expect: [200, 201] });
    await call('Hospitalisations', 'POST', `/hospitalisations/${hospId}/alerts`, { token: tNur, json: { typeAlerte: 'fievre' }, expect: 400, scenario: "type d'alerte invalide" });
    await call('Hospitalisations', 'POST', `/hospitalisations/${hospId}/alerts`, { token: tNur, json: {}, expect: 400, scenario: 'type manquant' });
    await call('Hospitalisations', 'POST', `/hospitalisations/${hospId}/soins`, { token: tNur, json: { typeSoin: 'pansement', notes: 'RAS' }, expect: [200, 201] });
    await call('Hospitalisations', 'POST', `/hospitalisations/${hospId}/soins`, { token: tNur, json: {}, expect: 400, scenario: 'type manquant' });
    await call('Hospitalisations', 'POST', `/hospitalisations/${hospId}/soins`, { token: tSec, json: { typeSoin: 'x' }, expect: 403, scenario: 'mauvais rôle' });
    const alertId = al.data?.id || al.data?.alerte?.id || al.data?.alert?.id;
    await call('Hospitalisations', 'PUT', `/hospitalisations/alertes/${alertId}/resolve`, { token: tDoc });
    await call('Hospitalisations', 'PUT', '/hospitalisations/alertes/999999/resolve', { token: tDoc, expect: 404, scenario: 'inexistante' });
    await call('Infirmerie', 'GET', '/nurse/hospitalized', { token: tNur });
    await call('Hospitalisations', 'PUT', `/hospitalisations/${hospId}/discharge`, { token: tDoc });
    await call('Hospitalisations', 'PUT', `/hospitalisations/${hospId}/close`, { token: tSec, expect: [200, 409] });
    await call('Hospitalisations', 'PUT', `/hospitalisations/chambres/${roomId}/clean`, { token: tNur });
    await call('Hospitalisations', 'PUT', '/hospitalisations/chambres/999999/clean', { token: tNur, expect: 404, scenario: 'inexistante' });

    // ── Facturation ──
    await denied('Facturation', 'GET', '/billing', tDoc);
    const pend = await call('Facturation', 'GET', `/billing/pending/${cin}`, { token: tSec, check: d => d?.lignes?.length ? true : 'aucune prestation à facturer' });
    const lignes = (pend.data?.lignes || []).map(l => ({ ...l, quantite: l.quantite ?? 1, prixUnitaire: l.prixUnitaire ?? 0 }));
    const fac = await call('Facturation', 'POST', '/billing', { token: tSec, json: { patientCin: cin, lignes, assuranceTaux: 80 }, expect: [200, 201] });
    const facId = fac.data?.facture?.id || fac.data?.id;
    await call('Facturation', 'POST', '/billing', { token: tSec, json: { patientCin: cin }, expect: 400, scenario: 'lignes manquantes' });
    await call('Facturation', 'POST', '/billing', { token: tSec, json: { patientCin: cin, lignes: [{ description: 'x', quantite: 1, prixUnitaire: 1, sourceType: 'consultation', sourceId: 999999 }] }, expect: 404, scenario: 'source inexistante' });
    await call('Facturation', 'GET', '/billing', { token: tSec });
    await call('Facturation', 'GET', `/billing/${facId}`, { token: tSec });
    await call('Facturation', 'GET', '/billing/999999', { token: tSec, expect: 404, scenario: 'inexistante' });
    await call('Facturation', 'GET', `/billing/patient/${cin}`, { token: tSec });
    await call('Facturation', 'PATCH', `/billing/${facId}/pay`, { token: tSec, json: { modePaiement: 'especes' } });
    await call('Facturation', 'PATCH', `/billing/${facId}/pay`, { token: tSec, json: { modePaiement: 'especes' }, expect: [400, 409], scenario: 'déjà payée' });

    // ── Tableaux de bord et performance ──
    for (const [role, tok] of [['secretary', tSec], ['doctor', tDoc], ['pharmacist', tPha], ['lab_technician', tLab], ['admin', admin]]) {
        await call('Tableaux de bord', 'GET', `/dashboard/${role}`, { token: tok });
    }
    await call('Tableaux de bord', 'GET', '/dashboard/admin', { token: tSec, expect: 403, scenario: 'mauvais rôle' });
    await call('Tableaux de bord', 'GET', '/dashboard/admin', { expect: 401, scenario: 'sans jeton' });
    for (const r of ['overview', 'activity', 'occupancy', 'finance', 'indicators']) await call('Performance', 'GET', `/performance/${r}`, { token: admin });
    await denied('Performance', 'GET', '/performance/overview', tDoc);
    await call('Abonnement', 'GET', '/subscription/status', { token: admin });
    await call('Abonnement', 'GET', '/subscription/status', { expect: 401, scenario: 'sans jeton' });

    // ── Accès aux dossiers (affectations, accès exceptionnels, journal) ──
    await call('Accès patients', 'POST', '/patient-access/assignments', { token: admin, json: {}, expect: 400, scenario: 'données manquantes' });
    await call('Accès patients', 'POST', '/patient-access/assignments', { token: tSec, json: { patientId }, expect: 403, scenario: 'mauvais rôle' });
    const asgId = asg.data?.id || asg.data?.assignment?.id;
    if (asgId) await call('Accès patients', 'POST', `/patient-access/assignments/${asgId}/revoke`, { token: admin });
    // Affectation maintenue : le test des pages ouvre le dossier en tant qu'infirmier (périmètre du service)
    await call('Accès patients', 'POST', '/patient-access/assignments', { token: admin, json: { patientId: patientNum, departmentId: depId, kind: 'service', startsAt: new Date().toISOString(), endsAt: new Date(Date.now() + 86400000).toISOString(), reason: 'Affectation maintenue (test des pages)' }, expect: 201, scenario: 'nouvelle affectation au service' });
    const exc = await call('Accès patients', 'POST', '/patient-access/exceptional-access/requests', { token: admin, json: { patientId: patientNum, justification: 'Urgence vitale : patient inconscient, test de fumée NextClinic', scopes: ['patients'] }, expect: [200, 201] });
    await call('Accès patients', 'GET', '/patient-access/exceptional-access/requests', { token: tDoc });
    const excId = exc.data?.id || exc.data?.request?.id;
    if (excId) await call('Accès patients', 'POST', `/patient-access/exceptional-access/requests/${excId}/approve`, { token: tDoc, expect: [200, 403, 409] });
    if (excId) await call('Accès patients', 'POST', `/patient-access/exceptional-access/requests/${excId}/revoke`, { token: admin, expect: [200, 409] });
    const exc2 = await call('Accès patients', 'POST', '/patient-access/exceptional-access/requests', { token: admin, json: { patientId: patientNum, justification: 'Seconde demande à refuser : test de fumée NextClinic', scopes: ['examens'] }, expect: 201, scenario: 'seconde demande' });
    if (exc2.data?.id) await call('Accès patients', 'POST', `/patient-access/exceptional-access/requests/${exc2.data.id}/reject`, { token: tDoc, expect: [200, 403, 409], scenario: 'refus par le médecin' });
    await call('Accès patients', 'POST', '/patient-access/exceptional-access/requests', { token: admin, json: { patientId: patientNum, justification: 'trop court', scopes: ['patients'] }, expect: 400, scenario: 'justification trop courte' });
    await call('Accès patients', 'POST', '/patient-access/exceptional-access/requests/999999/approve', { token: tDoc, expect: 404, scenario: 'inexistante' });
    await call('Accès patients', 'GET', '/patient-access/audit', { token: tDoc, scenario: 'médecin : ses propres accès' });
    await call('Accès patients', 'GET', '/patient-access/audit', { token: admin, expect: 403, scenario: 'admin sans habilitation de responsable (voulu)' });
    await call('Accès patients', 'GET', '/patient-access/audit', { expect: 401, scenario: 'sans jeton' });
    const ns2 = await call('Accès patients', 'POST', '/patient-access/nurse-services', { token: admin, json: { userId: nurse.id, departmentId: dep2Id }, expect: [200, 201], scenario: 'second service' });
    if (ns2.data?.id) await call('Accès patients', 'DELETE', `/patient-access/nurse-services/${ns2.data.id}`, { token: admin });
    await call('Clinique', 'DELETE', `/clinic/departements/${dep2Id}`, { token: admin });
    await call('Clinique', 'DELETE', '/clinic/departements/999999', { token: admin, expect: 404, scenario: 'inexistant' });
    await call('Accès patients', 'DELETE', '/patient-access/nurse-services/999999', { token: admin, expect: [200, 404], scenario: 'inexistant (suppression idempotente)' });
    await call('Accès patients', 'GET', `/patient-access/authored/${patientNum}`, { token: tDoc });
    await call('Accès patients', 'GET', `/patient-access/authored/${patientNum}`, { token: tSec, expect: 403, scenario: 'mauvais rôle' });

    // ── IA (sans clé : doit échouer proprement, sans appel sortant) ──
    await call('IA', 'POST', '/ai/patient-summary', { token: tDoc, json: { patientId: patientNum }, expect: [200, 503], scenario: 'sans clé API : 503 propre' });
    await call('IA', 'POST', '/ai/patient-summary', { token: tDoc, json: {}, expect: 400, scenario: 'patientId manquant' });
    await call('IA', 'POST', '/ai/chat', { token: tDoc, json: { message: 'Bonjour' }, expect: [200, 503], scenario: 'sans clé API : 503 propre' });
    await call('IA', 'POST', '/ai/chat', { token: tDoc, json: {}, expect: 400, scenario: 'message manquant' });
    await call('IA', 'POST', '/ai/ocr-cin', { token: tSec, json: { imageBase64: PNG.toString('base64'), mimeType: 'image/png' }, expect: [200, 503], scenario: 'sans clé API : 503 propre' });
    await call('IA', 'POST', '/ai/ocr-cin', { token: tNur, json: {}, expect: 403, scenario: 'mauvais rôle' });
    await call('IA', 'POST', '/ai/chat', { json: { message: 'x' }, expect: 401, scenario: 'sans jeton' });

    // ── Cloisonnement entre cliniques ──
    const otherAdminEmail = email('autre');
    await call('Cloisonnement', 'POST', '/auth/register-clinic', { json: { clinicName: `Autre ${RUN}`, ownerName: 'Omar Autre', email: otherAdminEmail }, expect: 201, scenario: 'seconde clinique' });
    const om = await waitMail(otherAdminEmail);
    const oTok = om[0] ? await linkFromMail(om[0].ID) : null;
    const os = await call('Cloisonnement', 'POST', '/auth/setup-password', { json: { token: oTok, password: PASSWORD }, scenario: 'admin seconde clinique' });
    const other = os.data?.token;
    await call('Cloisonnement', 'POST', '/admin/users', { token: other, json: { nom: 'O', prenom: 'sec', email: email('osec'), password: PASSWORD, role: 'secretary' }, expect: 201, scenario: 'secrétaire seconde clinique' });
    const tOSec = await login('secrétaire seconde clinique', email('osec'));
    await call('Cloisonnement', 'GET', `/patients/${patientId}`, { token: tOSec, expect: [403, 404], scenario: 'patient d\'une autre clinique invisible' });
    await call('Cloisonnement', 'GET', `/patients/${patientId}/documents/cin/${scanId}`, { token: tOSec, expect: [403, 404], scenario: 'scan CIN d\'une autre clinique invisible' });
    await call('Cloisonnement', 'GET', `/billing/${facId}`, { token: tOSec, expect: [403, 404], scenario: 'facture d\'une autre clinique invisible' });
    await call('Cloisonnement', 'PUT', `/admin/users/${doctor.id}`, { token: other, json: { telephone: '0' }, expect: [403, 404], scenario: 'compte d\'une autre clinique' });

    // ── Super-admin ──
    await denied('Super-admin', 'GET', '/super-admin/stats', admin);
    await call('Super-admin', 'GET', '/super-admin/stats', { token: sa });
    const clinics = await call('Super-admin', 'GET', '/super-admin/clinics', { token: sa });
    await call('Super-admin', 'GET', '/super-admin/users', { token: sa });
    const list = Array.isArray(clinics.data) ? clinics.data : clinics.data?.clinics || [];
    const saasClinic = list.find(c => (c.name || '').startsWith(`SaaS Smoke ${RUN}`)) || { id: saas.data?.clinicId };
    await call('Super-admin', 'POST', `/super-admin/clinics/${saasClinic.id}/extend-trial`, { token: sa, json: { days: 7 }, expect: [200, 400] });
    await call('Super-admin', 'PUT', `/super-admin/clinics/${saasClinic.id}/status`, { token: sa, json: { status: 'suspended' } });
    await call('Super-admin', 'PUT', `/super-admin/clinics/${saasClinic.id}/status`, { token: sa, json: { status: 'nimporte' }, expect: 400, scenario: 'statut invalide' });
    await call('Super-admin', 'PUT', '/super-admin/clinics/999999/status', { token: sa, json: { status: 'active' }, expect: 404, scenario: 'inexistante' });
    await call('Super-admin', 'DELETE', `/super-admin/clinics/${saasClinic.id}`, { token: sa, expect: [200, 204] });
    await call('Super-admin', 'DELETE', '/super-admin/clinics/999999', { token: sa, expect: 404, scenario: 'inexistante' });

    // ── Suppression d'un patient (second patient, médecin traitant) ──
    const cin2 = newCin();
    const p2 = await call('Patients', 'POST', '/patients', { token: tDoc, json: { ...pBody, cin: cin2, email: undefined }, expect: 201, scenario: 'création par médecin' });
    const p2Id = p2.data?.id || p2.data?.patient?.id;
    await call('Patients', 'DELETE', `/patients/${p2Id}`, { token: tSec, expect: 403, scenario: 'mauvais rôle' });
    await call('Patients', 'DELETE', `/patients/${p2Id}`, { token: tDoc, expect: [200, 204] });
    await call('Patients', 'DELETE', '/patients/999999', { token: tDoc, expect: 404, scenario: 'inexistant' });

    // ── CORS ──
    const evil = await fetch(`${API}/health`, { headers: { Origin: 'https://evil.example' } });
    const acao = evil.headers.get('access-control-allow-origin');
    record('CORS', 'GET', '/health', 'origine étrangère refusée (production)', acao !== 'https://evil.example' && acao !== '*', evil.status, acao ? `ACAO=${acao}` : 'pas d\'en-tête ACAO');
    if (ALLOWED_ORIGIN) {
        const good = await fetch(`${API}/health`, { headers: { Origin: ALLOWED_ORIGIN } });
        record('CORS', 'GET', '/health', 'origine du front autorisée', good.headers.get('access-control-allow-origin') === ALLOWED_ORIGIN, good.status);
    }
    await call('Erreurs', 'GET', '/route-inexistante', { token: admin, expect: 404, scenario: 'route inconnue' });

    // État pour le test des pages et la vérification de persistance
    const scanSha256 = dl.data && Buffer.isBuffer(dl.data) ? createHash('sha256').update(dl.data).digest('hex') : null;
    writeFileSync(STATE_FILE, JSON.stringify({
        run: RUN, password: PASSWORD,
        accounts: { admin: adminEmail, doctor: doctor.email, secretary: secretary.email, nurse: nurse.email, pharmacist: pharmacist.email, lab_technician: lab.email, super_admin: SA_EMAIL },
        secretaryEmail: secretary.email, patientId, patientCin: cin, scanId, scanSha256, rdvId: rdvTodayId, logoUrl,
    }, null, 2));
}

function report() {
    const ko = rows.filter(r => !r.ok);
    const esc = (s) => String(s).replace(/\|/g, '\\|');
    const md = [
        `| Fonctionnalité | Route | Cas | Résultat | Statut HTTP | Détail |`,
        `|---|---|---|---|---|---|`,
        ...rows.map(r => `| ${esc(r.feature)} | \`${esc(r.route)}\` | ${esc(r.scenario)} | ${r.ok ? 'OK' : '**KO**'} | ${r.status} | ${esc(r.detail)} |`),
    ].join('\n');
    if (REPORT_FILE) writeFileSync(REPORT_FILE, `${md}\n\nTotal : ${rows.length} vérifications, ${rows.length - ko.length} OK, ${ko.length} KO\n`);
    console.log(`\nTotal : ${rows.length} vérifications, ${rows.length - ko.length} OK, ${ko.length} KO`);
    process.exitCode = ko.length ? 1 : 0;
}

try {
    if (process.argv.includes('--check-persistence')) await persistenceCheck();
    else await main();
} catch (err) {
    record('Script', '—', '—', 'exception', false, 'ERR', err.stack?.split('\n').slice(0, 3).join(' ⟂ '));
}
report();
