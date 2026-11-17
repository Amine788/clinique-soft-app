import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import mysql from 'mysql2/promise';
import jwt from 'jsonwebtoken';
import { jourClinique } from '../services/dates.js';
import { authorizedTestDatabase, verifyTestServer } from './databaseSafety.js';
// Outils des tests d'intégration : base MySQL/MariaDB de test recréée à chaque lancement,
// vrai serveur (index.js) démarré dans un processus fils, appels HTTP avec des JWT signés.
//
// Cible exclusivement fournie par docker/compose.security-test.yaml (voir I17).








const SERVER_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export const DB = authorizedTestDatabase(process.env);
const PORT = parseInt(process.env.TEST_PORT || '3999', 10);
const JWT_SECRET = 'clinicsoft-tests-secret';

// Environnement commun au serveur et au processus de test.
// DATABASE_URL vide : dotenv ne l'écrase pas, et config/database.js choisit alors MySQL.
const SERVER_ENV = {
    DATABASE_URL: '',
    DB_HOST: DB.host,
    DB_PORT: String(DB.port),
    DB_USER: DB.user,
    DB_PASSWORD: DB.password,
    DB_NAME: DB.name,
    JWT_SECRET,
    PORT: String(PORT),
    NODE_ENV: 'test',
    // Aucun appel sortant pendant les tests : pas d'e-mail réel, pas d'appel à l'IA
    GMAIL_USER: '',
    GMAIL_APP_PASSWORD: '',
    SMTP_USER: '',
    SMTP_PASSWORD: '',
    EMAIL_FROM: '',
    SMTP_HOST: '',
    ADMIN_NOTIFICATION_EMAIL: '',
    ANTHROPIC_API_KEY: '',
    ANTHROPIC_BASE_URL: '',
    // Pas de super-admin du .env local : chaque test crée les comptes dont il a besoin
    SUPER_ADMIN_EMAIL: '',
    SUPER_ADMIN_PASSWORD: '',
};

export async function resetDatabase() {
    authorizedTestDatabase(process.env);
    const conn = await mysql.createConnection({ host: DB.host, port: DB.port, user: DB.user, password: DB.password });
    try {
        await verifyTestServer(conn);
        await conn.query(`DROP DATABASE IF EXISTS \`${DB.name}\``);
        await conn.query(`CREATE DATABASE \`${DB.name}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    } finally {
        await conn.end();
    }
}

// Prépare le schéma avec le compte de migration du banc, puis démarre l'API.
// env : variables propres à ce serveur (ex. NODE_ENV, PORT d'un second serveur)
export async function startServer(env = {}, { prepareDatabase = true, runtimeAccount = false } = {}) {
    authorizedTestDatabase(process.env);
    for (const key of ['DATABASE_URL', 'DB_HOST', 'DB_PORT', 'DB_USER', 'DB_PASSWORD', 'DB_NAME']) {
        if (key in env && env[key] !== SERVER_ENV[key]) throw new Error(`I17 : remplacement de ${key} interdit`);
    }
    if (prepareDatabase) {
    const installation = spawn(process.execPath, ['database/install.js'], {
        cwd: SERVER_DIR, env: { ...process.env, ...SERVER_ENV }, stdio: ['ignore', 'pipe', 'pipe'],
    });
    let installationLogs = '';
    installation.stdout.on('data', d => { installationLogs += d; });
    installation.stderr.on('data', d => { installationLogs += d; });
    await new Promise((resolve, reject) => {
        installation.once('error', reject);
        installation.once('exit', code => code === 0 ? resolve() : reject(new Error(`Installation de test refusée :\n${installationLogs}`)));
    });
    }
    const child = spawn(process.execPath, ['index.js'], {
        cwd: SERVER_DIR,
        env: { ...process.env, ...SERVER_ENV, ...env,
            ...(runtimeAccount ? { DB_USER: 'security_test_runtime', DB_PASSWORD: 'disposable-runtime-password' } : {}),
        },
        stdio: ['ignore', 'pipe', 'pipe'],
    });
    let logs = '';
    child.stdout.on('data', d => { logs += d; });
    child.stderr.on('data', d => { logs += d; });

    const base = `http://127.0.0.1:${env.PORT || PORT}`;
    // Création des tables par sync : de 3 à plus de 15 s selon la machine et l’état de MariaDB
    for (let i = 0; i < 450; i++) {
        if (child.exitCode !== null) throw new Error(`Le serveur s'est arrêté :\n${logs}`);
        try {
            const r = await fetch(`${base}/api/health`);
            const body = await r.json();
            if (body.database === 'connected') {
                return { base, logs: () => logs, stop: () => new Promise(res => { child.once('exit', res); child.kill(); }) };
            }
        } catch { /* pas encore prêt */ }
        await new Promise(r => setTimeout(r, 200));
    }
    child.kill();
    throw new Error(`Serveur non démarré après 90 s :\n${logs}`);
}

// Modèles Sequelize branchés sur la base de test (après startServer : les tables existent)
export async function loadModels() {
    authorizedTestDatabase(process.env);
    Object.assign(process.env, SERVER_ENV);
    const models = await import('../models/index.js');
    const { Prescription } = await import('../routes/prescriptions.js');
    return { ...models, Prescription, sequelize: models.default };
}

export function tokenFor(user) {
    return jwt.sign({
        id: user.id,
        email: user.email,
        name: `${user.prenom} ${user.nom}`,
        role: user.role,
        clinicId: user.clinic_id,
        clinic_id: user.clinic_id,
    }, JWT_SECRET, { expiresIn: '1h' });
}

// Client HTTP : client(base, user)('GET', '/api/...', body) → { status, body }
export function client(base, user) {
    const token = user ? tokenFor(user) : null;
    return async (method, url, body) => {
        const r = await fetch(base + url, {
            method,
            headers: {
                'Content-Type': 'application/json',
                ...(token && { Authorization: `Bearer ${token}` }),
            },
            body: body === undefined ? undefined : JSON.stringify(body),
        });
        const text = await r.text();
        let json;
        try { json = JSON.parse(text); } catch { json = text; }
        return { status: r.status, body: json };
    };
}

let seq = 0;
const uniq = () => `${Date.now().toString(36)}${(++seq).toString(36)}`.slice(-8).toUpperCase();

// Une clinique active avec un utilisateur par rôle, un médecin et un patient
export async function seedClinic(m, label) {
    const clinic = await m.Clinic.create({ name: `Clinique ${label}`, subscriptionStatus: 'active', type: 'Starter' });
    const users = {};
    for (const role of ['admin', 'doctor', 'nurse', 'secretary', 'pharmacist', 'lab_technician']) {
        users[role] = await m.User.create({
            clinic_id: clinic.id,
            matricule: `T-${uniq()}`,
            nom: role.toUpperCase(),
            prenom: label,
            email: `${role}.${uniq().toLowerCase()}@test.test`,
            passwordHash: 'x',
            role,
            statut: 'actif',
        });
    }
    const medecin = await m.Medecin.create({
        clinic_id: clinic.id,
        userId: users.doctor.id,
        matricule: `MED-${uniq()}`,
        numeroOrdre: `ORD-${uniq()}`,
        specialites: ['Médecine générale'],
        dateDebut: '2020-01-01',
    });
    const patient = await createPatient(m, clinic, users.secretary, 'AB123456');
    await patient.update({ medecinTraitantId: users.doctor.id });
    return { clinic, users, medecin, patient };
}

// Patient hospitalisé (statut admis) dans une chambre de sa clinique
export async function createHospitalisation(m, ctx, { numero = '101', lit = 'A', patient = ctx.patient } = {}) {
    const chambre = await m.Chambre.create({
        clinic_id: ctx.clinic.id, numero, typeChambre: 'privee', nbLits: 1, statut: 'occupee',
    });
    const hosp = await m.Hospitalisation.create({
        clinic_id: ctx.clinic.id,
        patientId: patient.id,
        medecinId: ctx.medecin.id,
        nurseId: ctx.users.nurse.id,
        chambreId: chambre.id,
        lit,
        diagnostic: 'Test',
        statut: 'admis',
        dateAdmission: new Date(Date.now() - 3600 * 1000),
    });
    return { chambre, hosp };
}

// Par défaut aujourd'hui, au calendrier de la clinique (comme les routes)
export async function createRdv(m, ctx, { date = jourClinique(), statut = 'confirme' } = {}) {
    return m.RendezVous.create({
        clinic_id: ctx.clinic.id,
        numeroRdv: `RDV-${uniq()}`,
        patientId: ctx.patient.id,
        patientCin: ctx.patient.cinNumero,
        medecinId: ctx.medecin.id,
        dateRdv: date,
        heureDebut: '09:00',
        heureFin: '09:30',
        typeConsultation: 'premiere',
        motif: 'Test',
        statut,
        creePar: ctx.users.secretary.id,
    });
}

export async function createPatient(m, clinic, creator, cin) {
    const patient = await m.Patient.create({
        clinic_id: clinic.id,
        cinNumero: cin,
        cinDateExpiration: '2030-01-01',
        numeroDossier: `PAT-${uniq()}`,
        nom: 'PATIENT',
        prenom: `de ${clinic.name}`,
        dateNaissance: '1980-05-10',
        sexe: 'M',
        telephonePrincipal: '0600000000',
        creeParUserId: creator.id,
    });
    await m.DossierMedical.create({ patientId: patient.id, allergies: '[]', maladiesChroniques: '[]' });
    return patient;
}
