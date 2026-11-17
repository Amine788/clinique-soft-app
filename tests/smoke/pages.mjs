#!/usr/bin/env node
// Test de fumée des pages React : charge chaque page avec chaque rôle autorisé dans Chrome headless
// (protocole DevTools, sans dépendance) et vérifie : pas d'exception JavaScript, pas d'erreur console,
// pas d'appel /api en erreur, pas de redirection non voulue (connexion, accès refusé, module en construction).
// Teste aussi la déconnexion (session effacée, retour à /login).
//
// Prérequis : tests/smoke/api.mjs déjà passé (il écrit le fichier d'état : comptes, patient, RDV).
// Variables : SMOKE_FRONT_URL (ex. http://127.0.0.1:4173), SMOKE_BASE_URL (API, défaut = front),
//             SMOKE_STATE, SMOKE_PAGES_REPORT (rapport .md), CHROME_PATH, SMOKE_PAGE_WAIT_MS,
//             SMOKE_DEUX_DOMAINES=1 (front compilé avec VITE_API_URL, servi sur une autre origine que l'API)
import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync, mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const FRONT = (process.env.SMOKE_FRONT_URL || 'http://127.0.0.1:4173').replace(/\/+$/, '');
const API = `${(process.env.SMOKE_BASE_URL || FRONT).replace(/\/+$/, '')}/api`;
const STATE = JSON.parse(readFileSync(process.env.SMOKE_STATE || 'smoke-state.json', 'utf8'));
const REPORT_FILE = process.env.SMOKE_PAGES_REPORT || '';
const WAIT = Number(process.env.SMOKE_PAGE_WAIT_MS || 3000);
const DEUX_DOMAINES = process.env.SMOKE_DEUX_DOMAINES === '1';
const PORT = 9339;
const CHROME = process.env.CHROME_PATH || [
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    '/usr/bin/google-chrome', '/usr/bin/chromium', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].find(p => existsSync(p));

// Pages déclarées dans src/App.jsx et rôles autorisés (allowedRoles)
const CLINIC = ['admin', 'doctor', 'pharmacist', 'secretary', 'lab_technician', 'nurse'];
const PAGES = [
    ['/super-admin', ['super_admin']],
    ['/dashboard', CLINIC],
    ['/patients', ['secretary', 'doctor', 'admin', 'nurse']],
    ['/patients/create', ['secretary', 'doctor', 'admin']],
    [`/patients/${STATE.patientId}/profil`, ['secretary', 'doctor', 'admin', 'nurse']],
    ['/checkin', ['secretary', 'admin']],
    ['/absences', ['secretary', 'admin']],
    ['/secretary/admissions', ['secretary', 'admin']],
    ['/appointments', ['secretary', 'doctor', 'admin']],
    ['/appointments/new', ['secretary', 'admin']],
    ['/rooms', ['secretary', 'admin', 'nurse']],
    ['/billing', ['secretary', 'admin']],
    ['/laboratory', ['lab_technician']],
    ['/doctor/agenda', ['doctor']],
    [`/consultation/${STATE.rdvId}`, ['doctor']],
    ['/doctor/stats', ['doctor']],
    ['/doctor/prescriptions', ['doctor']],
    ['/doctor/absences', ['doctor']],
    ['/doctor/hospitalized', ['doctor']],
    ['/pharmacy/stock', ['pharmacist']],
    ['/pharmacy/alerts', ['pharmacist']],
    ['/pharmacy/dispensation', ['pharmacist']],
    ['/nurse/dashboard', ['nurse', 'doctor']],
    ['/nurse/prelevements', ['nurse']],
    ['/nurse/medications', ['nurse', 'doctor']],
    ['/nurse/qr', ['nurse', 'doctor']],
    ['/nurse/hospitalized', ['nurse']],
    ['/medication-flow', ['nurse', 'pharmacist', 'doctor']],
    ['/admin/users', ['admin']],
    ['/admin/clinic', ['admin']],
    ['/admin/performance', ['admin']],
    ['/admin/settings', ['admin']],
    // Page d'abonnement : hors menu, affichée à un compte connecté (essai expiré)
    ['/subscription', ['admin']],
];
// Pages médicales retirées au rôle admin (le serveur lui refuse ces données) : redirection attendue
const ADMIN_DENIED = ['/doctor/hospitalized', '/nurse/dashboard', '/nurse/prelevements', '/nurse/medications', '/nurse/qr', '/nurse/hospitalized', '/medication-flow'];
const PUBLIC = ['/', '/login', '/register', '/setup-password', '/unauthorized'];

const rows = [];
function record(page, role, ok, apiCalls, detail) {
    rows.push({ page, role, ok, apiCalls, detail });
    console.log(`${ok ? 'OK' : 'KO'}  ${page} [${role}] ${detail || ''}`);
}

// ── CDP minimal ──
class Cdp {
    constructor(url) { this.ws = new WebSocket(url); this.id = 0; this.pending = new Map(); this.handlers = []; }
    open() {
        return new Promise((resolve, reject) => {
            this.ws.onopen = resolve; this.ws.onerror = reject;
            this.ws.onmessage = (e) => {
                const m = JSON.parse(e.data);
                if (m.id && this.pending.has(m.id)) { const p = this.pending.get(m.id); this.pending.delete(m.id); m.error ? p.reject(new Error(m.error.message)) : p.resolve(m.result); }
                else if (m.method) this.handlers.forEach(h => h(m));
            };
        });
    }
    send(method, params = {}, timeout = 15000) {
        const id = ++this.id; this.ws.send(JSON.stringify({ id, method, params }));
        return new Promise((resolve, reject) => {
            const t = setTimeout(() => { this.pending.delete(id); reject(new Error(`délai dépassé : ${method}`)); }, timeout);
            this.pending.set(id, { resolve: v => { clearTimeout(t); resolve(v); }, reject: e => { clearTimeout(t); reject(e); } });
        });
    }
    on(h) { this.handlers.push(h); }
    close() { this.ws.close(); }
}
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function session(role) {
    if (!role) return null;
    const email = STATE.accounts[role];
    const password = role === 'super_admin' ? process.env.SUPER_ADMIN_PASSWORD : STATE.password;
    const r = await fetch(`${API}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) });
    const j = await r.json();
    if (!j.token) throw new Error(`connexion ${role} impossible : ${j.error}`);
    return { state: { token: j.token, user: j.user, isAuthenticated: true }, version: 0 };
}

// Un seul onglet réutilisé : créer/fermer un onglet par page finit par bloquer Chrome headless
let tab = null, current = null, scriptId = null;
async function getTab() {
    if (tab) return tab;
    const r = await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: 'PUT', signal: AbortSignal.timeout(10000) });
    const t = await r.json();
    if (!t.webSocketDebuggerUrl) throw new Error('onglet Chrome non créé');
    tab = new Cdp(t.webSocketDebuggerUrl);
    await Promise.race([tab.open(), sleep(10000).then(() => { throw new Error('connexion DevTools impossible'); })]);
    tab.on(m => {
        // Une boîte de dialogue bloquerait la page : on la ferme toujours, et on la signale
        if (m.method === 'Page.javascriptDialogOpening') { current?.errors.push(`dialogue ${m.params.type} : ${m.params.message.slice(0, 80)}`); tab.send('Page.handleJavaScriptDialog', { accept: false }).catch(() => {}); }
        if (!current) return;
        if (m.method === 'Runtime.exceptionThrown') current.errors.push(`exception : ${m.params.exceptionDetails.exception?.description?.split('\n')[0] || m.params.exceptionDetails.text}`);
        if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') current.errors.push(`console.error : ${m.params.args.map(a => a.value ?? a.description ?? '').join(' ').slice(0, 160)}`);
        if (m.method === 'Network.requestWillBeSent' && m.params.request.url.includes('/api/')) current.reqs.set(m.params.requestId, m.params.request.method);
        if (m.method === 'Network.responseReceived' && m.params.response.url.includes('/api/') && current.reqs.has(m.params.requestId)) {
            const u = new URL(m.params.response.url);
            current.api.push({ call: `${current.reqs.get(m.params.requestId)} ${u.pathname}`, status: m.params.response.status });
        }
        if (m.method === 'Network.loadingFailed' && current.reqs.has(m.params.requestId) && !m.params.canceled) current.errors.push(`requête échouée : ${m.params.errorText}`);
        // Temps réel : connexions WebSocket ouvertes par la page et statut de la poignée de main (101 attendu)
        if (m.method === 'Network.webSocketCreated') current.ws.set(m.params.requestId, { url: m.params.url, status: null });
        if (m.method === 'Network.webSocketHandshakeResponseReceived' && current.ws.has(m.params.requestId)) current.ws.get(m.params.requestId).status = m.params.response.status;
    });
    await tab.send('Runtime.enable'); await tab.send('Network.enable'); await tab.send('Page.enable');
    return tab;
}
async function closeTab() { /* onglet partagé */ }

// Chrome headless se fige parfois (machine chargée) : une seule nouvelle tentative dans un onglet neuf.
// Une erreur de l'application, elle, ne lève pas d'exception ici : elle reste un KO.
async function visit(pagePath, auth) {
    try { return await visitOnce(pagePath, auth); } catch (err) {
        console.log(`(Chrome ne répond plus sur ${pagePath} : ${err.message} ; nouvel onglet)`);
        try { tab?.close(); } catch { /* onglet déjà perdu */ }
        tab = null; scriptId = null; current = null;
        return visitOnce(pagePath, auth);
    }
}

// Charge une page et collecte exceptions, erreurs console et appels /api
async function visitOnce(pagePath, auth) {
    const c = await getTab();
    current = null;
    await c.send('Page.navigate', { url: 'about:blank' });
    await sleep(200);
    if (scriptId) await c.send('Page.removeScriptToEvaluateOnNewDocument', { identifier: scriptId });
    const store = auth ? JSON.stringify(JSON.stringify(auth)) : 'null';
    ({ identifier: scriptId } = await c.send('Page.addScriptToEvaluateOnNewDocument', { source: `try { if (location.protocol.startsWith('http')) { localStorage.clear(); if (${store}) localStorage.setItem('clinicsoft-auth', ${store}); } } catch {}` }));
    const col = current = { errors: [], api: [], reqs: new Map(), ws: new Map() };
    await c.send('Page.navigate', { url: FRONT + pagePath });
    await sleep(WAIT);
    const { result } = await c.send('Runtime.evaluate', { expression: 'JSON.stringify({ path: location.pathname, text: document.body.innerText.slice(0, 2000), root: document.getElementById("root")?.children.length || 0 })', returnByValue: true });
    const page = JSON.parse(result.value);
    return { c, errors: col.errors, api: col.api, ws: [...col.ws.values()], page };
}

async function controlesDeuxDomaines(sessions) {
    const origineApi = new URL(API).origin;
    const sousApi = (url) => url.startsWith(`${origineApi}/`) || url.startsWith(`${origineApi.replace(/^http/, 'ws')}/`);
    if (new URL(FRONT).origin === origineApi) record('Deux domaines', '—', false, [], `front et API sur la même origine (${origineApi})`);

    // Temps réel : le centre de notifications de l'en-tête ouvre Socket.io vers l'API
    let v = await visit('/dashboard', sessions.doctor);
    const ws = v.ws.find(w => sousApi(w.url) && w.status === 101);
    record('Deux domaines : temps réel (Socket.io)', 'doctor', !!ws && !v.errors.length, [],
        ws ? `WebSocket établi vers ${origineApi}` : `aucune connexion établie (${v.ws.map(w => `${w.url} → ${w.status}`).join(', ') || 'aucune tentative'}) ${v.errors.join(' ; ')}`);

    // Images publiques servies par l'API : photo du médecin (en-tête) et logo de la clinique (menu)
    const { result } = await v.c.send('Runtime.evaluate', { expression: `JSON.stringify([...document.images].filter(i => /\\/uploads\\/(profiles|logos)\\//.test(i.src)).map(i => ({ src: i.src, chargee: i.complete && i.naturalWidth > 0 })))`, returnByValue: true });
    const images = JSON.parse(result.value);
    for (const [nom, dossier] of [['photo de profil', '/uploads/profiles/'], ['logo de la clinique', '/uploads/logos/']]) {
        const img = images.find(i => i.src.includes(dossier));
        record(`Deux domaines : ${nom}`, 'doctor', !!img && img.chargee && sousApi(img.src), [], img ? `${img.src} ${img.chargee ? 'affichée' : 'non chargée'}` : 'image absente de la page');
    }

    // Document protégé : même appel que ouvrirFichierProtege (jeton en en-tête, réponse binaire), depuis la page
    v = await visit('/dashboard', sessions.secretary);
    const url = `${API}/patients/${STATE.patientId}/documents/cin/${STATE.scanId}`;
    const { result: doc } = await v.c.send('Runtime.evaluate', { awaitPromise: true, returnByValue: true, expression: `(async () => {
        const jeton = JSON.parse(localStorage.getItem('clinicsoft-auth')).state.token;
        const r = await fetch(${JSON.stringify(url)}, { headers: { Authorization: 'Bearer ' + jeton } });
        return JSON.stringify({ statut: r.status, taille: (await r.blob()).size });
    })().catch(e => JSON.stringify({ erreur: String(e) }))` });
    const d = JSON.parse(doc.value);
    record('Deux domaines : document protégé (scan de CIN)', 'secretary', d.statut === 200 && d.taille > 0, [], d.erreur || `HTTP ${d.statut}, ${d.taille} octets`);
}

async function main() {
    if (!CHROME) throw new Error('Chrome introuvable : définir CHROME_PATH');
    const profile = mkdtempSync(path.join(tmpdir(), 'nextclinic-smoke-chrome-'));
    const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check', '--disable-gpu', '--disable-extensions', 'about:blank'], { stdio: 'ignore' });
    try {
        for (let i = 0; i < 50; i++) { try { await fetch(`http://127.0.0.1:${PORT}/json/version`); break; } catch { await sleep(200); } }
        const sessions = {};
        for (const role of [...CLINIC, 'super_admin']) sessions[role] = await session(role);

        for (const p of PUBLIC) {
            const { c, errors, api, page } = await visit(p, null);
            const bad = api.filter(a => a.status >= 500);
            record(p, 'public', !errors.length && !bad.length && page.root > 0, api, [...errors, ...bad.map(a => `${a.call} → ${a.status}`)].join(' ; ') || (page.path !== p ? `→ ${page.path}` : ''));
            await closeTab(c);
        }
        for (const [p, roles] of PAGES) {
            for (const role of roles) {
                let v;
                try { v = await visit(p, sessions[role]); } catch (err) { record(p, role, false, [], `test interrompu : ${err.message}`); continue; }
                const { c, errors, api, page } = v;
                const problems = [...errors];
                for (const a of api) if (a.status >= 400) problems.push(`${a.call} → ${a.status}`);
                if (page.path !== p) problems.push(`redirigé vers ${page.path}`);
                if (/Module en construction/.test(page.text)) problems.push('page « en construction »');
                if (!page.root) problems.push('rendu vide');
                record(p, role, !problems.length, api, problems.join(' ; '));
                await closeTab(c);
            }
        }
        // Admin : pages médicales inaccessibles (redirection, aucun appel API) et absentes de son menu
        for (const p of ADMIN_DENIED) {
            let v;
            try { v = await visit(p, sessions.admin); } catch (err) { record(p, 'admin (refus attendu)', false, [], `test interrompu : ${err.message}`); continue; }
            const problems = [...v.errors];
            if (v.page.path !== '/unauthorized') problems.push(`attendu /unauthorized, obtenu ${v.page.path}`);
            if (v.api.some(a => a.status >= 400)) problems.push('appel API en erreur');
            record(p, 'admin (refus attendu)', !problems.length, v.api, problems.join(' ; ') || 'redirigé vers /unauthorized');
        }
        {
            const { c } = await visit('/dashboard', sessions.admin);
            const { result } = await c.send('Runtime.evaluate', { expression: `JSON.stringify([...document.querySelectorAll('#app-sidebar a')].map(a => a.getAttribute('href')))`, returnByValue: true });
            const links = JSON.parse(result.value);
            const leaked = links.filter(h => ADMIN_DENIED.includes(h));
            record('Menu admin', 'admin', links.length > 0 && !leaked.length, [], leaked.length ? `liens présents : ${leaked.join(', ')}` : `${links.length} liens, aucune page médicale`);
        }
        // Front et API sur deux origines (ex. front sur Vercel, API sur un serveur) : temps réel, images publiques
        // et document protégé passent par l'adresse de l'API, avec le CORS du navigateur
        if (DEUX_DOMAINES) await controlesDeuxDomaines(sessions);
        // Déconnexion : bouton du menu, session effacée, page protégée → /login
        {
            const { c } = await visit('/dashboard', sessions.admin);
            await c.send('Runtime.evaluate', { expression: `[...document.querySelectorAll('#app-sidebar button')].find(b => b.textContent.includes('Déconnexion'))?.click()` });
            // Ne plus réinjecter la session au prochain chargement
            await c.send('Page.removeScriptToEvaluateOnNewDocument', { identifier: scriptId }); scriptId = null;
            await sleep(1000);
            const { result } = await c.send('Runtime.evaluate', { expression: `JSON.stringify({ path: location.pathname, auth: JSON.parse(localStorage.getItem('clinicsoft-auth') || '{}').state?.token || null })`, returnByValue: true });
            const after = JSON.parse(result.value);
            await c.send('Page.navigate', { url: FRONT + '/dashboard' });
            await sleep(1500);
            const { result: r2 } = await c.send('Runtime.evaluate', { expression: 'location.pathname', returnByValue: true });
            const ok = after.path === '/login' && !after.auth && r2.value === '/login';
            record('Déconnexion (bouton du menu)', 'admin', ok, [], ok ? 'session effacée, /dashboard renvoie vers /login' : `chemin=${after.path} jeton=${after.auth ? 'présent' : 'absent'} puis ${r2.value}`);
            await closeTab(c);
        }
    } finally {
        chrome.kill();
        await sleep(500);
        try { rmSync(profile, { recursive: true, force: true }); } catch { /* profil temporaire */ }
    }
}

try { await main(); } catch (err) { record('Script', '—', false, [], err.message); }
const ko = rows.filter(r => !r.ok);
const esc = (s) => String(s).replace(/\|/g, '\\|');
const md = ['| Page | Rôle | Résultat | Appels API (statut) | Détail |', '|---|---|---|---|---|',
    ...rows.map(r => `| \`${esc(r.page)}\` | ${r.role} | ${r.ok ? 'OK' : '**KO**'} | ${esc([...new Set(r.apiCalls.map(a => `${a.call} ${a.status}`))].join('<br>'))} | ${esc(r.detail || '')} |`)].join('\n');
if (REPORT_FILE) writeFileSync(REPORT_FILE, `${md}\n\nTotal : ${rows.length} chargements, ${rows.length - ko.length} OK, ${ko.length} KO\n`);
console.log(`\nTotal : ${rows.length} chargements, ${rows.length - ko.length} OK, ${ko.length} KO`);
process.exitCode = ko.length ? 1 : 0;
