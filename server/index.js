import './loadEnv.js';
import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { Server } from 'socket.io';
import sequelize from './config/database.js';
import { verifyAuditProtection } from './services/auditProtection.js';
import { initSocket, chargerReglagesTempsReel } from './socket/clinicSocket.js';
import { demarrerRappels } from './services/rappels.js';
import { demarrerPurges } from './services/purges.js';
import { cheminJournal, gestionnaireErreurs, masquerErreursInternes } from './middleware/erreurs.js';
import authRoutes from './routes/auth.js';
import patientRoutes from './routes/patients.js';
import appointmentRoutes from './routes/appointments.js';
import doctorRoutes from './routes/doctors.js';
import pharmacyRoutes from './routes/pharmacy.js';
import roomRoutes from './routes/rooms.js';
import aiRoutes from './routes/ai.js';
import prescriptionRoutes from './routes/prescriptions.js';
import billingRoutes from './routes/billing.js';
import absenceRoutes from './routes/absences.js';
import dashboardRoutes from './routes/dashboard.js';
import examenRoutes from './routes/examens.js';
import adminRoutes from './routes/admin.js';
import clinicRoutes from './routes/clinic.js';
import nurseRoutes, { setNurseSocketIO } from './routes/nurse.js';
import hospitalisationRoutes from './routes/hospitalisations.js';
import performanceRoutes from './routes/performance.js';
import subscriptionRoutes from './routes/subscription.js';
import superAdminRoutes from './routes/superAdmin.js';
import patientAccessRoutes from './routes/patientAccess.js';
// Importer les routes





















const app = express();
app.disable('x-powered-by');
// Derrière un reverse proxy (Caddy en Docker) : nombre de proxys de confiance, pour connaître l'IP réelle du client
if (process.env.TRUST_PROXY) app.set('trust proxy', Number(process.env.TRUST_PROXY) || process.env.TRUST_PROXY);
const httpServer = createServer(app);
const PORT = process.env.PORT || 3001;

// Socket.io
const io = new Server(httpServer, {
    cors: { origin: '*', credentials: true }
});
export const clinicSocket = initSocket(io);
// Injecter socket dans le routeur nurse pour les alertes bidirectionnelles
setNurseSocketIO(io);

// CORS — accepte localhost en développement local (XAMPP)
const allowedOrigins = [
    'http://localhost:5173',
    'http://localhost:3000',
    'http://localhost:5174',
    process.env.FRONTEND_URL,
].filter(Boolean).map(o => o.replace(/\/+$/, ''));

app.use(cors({
    origin: (origin, cb) => {
        // Autoriser les requêtes sans origin (Postman, mobile, etc.)
        if (!origin) return cb(null, true);
        // Comparaison exacte : avec startsWith, « https://front.app.evil.com » passait pour « https://front.app » (V7)
        if (allowedOrigins.includes(origin)) return cb(null, true);
        // En dev, tout autoriser
        if (process.env.NODE_ENV !== 'production') return cb(null, true);
        // 403 (et non 500) : refus attendu, pas une panne du serveur
        return cb(Object.assign(new Error('Origine non autorisée (CORS)'), { status: 403, code: 'CORS_FORBIDDEN' }));
    },
    credentials: true
}));
app.use(express.json({ limit: '10mb' }));
// Seuls les photos de profil et les logos de clinique sont publics. Résultats d'examens et scans de CIN : jamais en accès libre
// (résultats via GET /api/examens/:id/fichier, authentifié et cloisonné par clinique)
app.use('/uploads/profiles', express.static('uploads/profiles'));
app.use('/uploads/logos', express.static('uploads/logos'));

// Logger simple — sans paramètres de requête et avec les numéros de CIN masqués (middleware/erreurs.js)
app.use('/api', (req, res, next) => {
    console.log(`[${new Date().toLocaleTimeString()}] ${req.method} ${cheminJournal(req.originalUrl)}`);
    next();
});

// Aucune réponse 500 d'une route ne renvoie de détail interne (middleware/erreurs.js)
app.use('/api', masquerErreursInternes);

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/patients', patientRoutes);
app.use('/api/appointments', appointmentRoutes);
app.use('/api/doctors', doctorRoutes);
app.use('/api/pharmacy', pharmacyRoutes);
app.use('/api/rooms', roomRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/prescriptions', prescriptionRoutes);
app.use('/api/billing', billingRoutes);
app.use('/api/absences', absenceRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/examens', examenRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/clinic', clinicRoutes);
app.use('/api/nurse', nurseRoutes);
app.use('/api/hospitalisations', hospitalisationRoutes);
app.use('/api/performance', performanceRoutes);
app.use('/api/subscription', subscriptionRoutes);
app.use('/api/super-admin', superAdminRoutes);
app.use('/api/patient-access', patientAccessRoutes);


app.get('/api/health', async (req, res) => {
    try {
        await sequelize.authenticate();
        res.json({ status: 'ok', database: 'connected', socket: 'active', server: 'NextClinic API', timestamp: new Date().toISOString() });
    } catch {
        // 503 : la sonde de santé (Docker, superviseur) voit que la base est injoignable
        res.status(503).json({ status: 'degraded', database: 'disconnected', server: 'NextClinic API', timestamp: new Date().toISOString() });
    }
});

// Route de seed supprimée (dangereuse — faisait sync({ force: true }))
// Utiliser le fichier server/database/setup_mysql.sql dans phpMyAdmin pour initialiser la base


// Error handler (middleware/erreurs.js)
app.use(gestionnaireErreurs);

// Démarrer le serveur
async function start() {
    try {
        await sequelize.authenticate();
        const isMysql = sequelize.getDialect() === 'mysql';
        const dbType = isMysql ? 'MySQL (XAMPP local)' : `${sequelize.getDialect()} (DATABASE_URL)`;
        console.log(`\n✅ Connexion ${dbType} établie`);

        await verifyAuditProtection(sequelize);
        console.log('✅ Protections du journal vérifiées (installation séparée du démarrage)');

        // Bascule « Notifications temps réel » de chaque clinique (page Réglages)
        await chargerReglagesTempsReel();

        // Compte Super Admin initial, seulement s'il n'en existe aucun et s'il est fourni par l'environnement :
        // jamais de mot de passe écrit dans le code ni affiché dans les journaux
        const { User } = await import('./models/index.js');
        const superAdminExists = await User.findOne({ where: { role: 'super_admin' } });
        if (!superAdminExists) {
            const email = process.env.SUPER_ADMIN_EMAIL;
            const motDePasse = process.env.SUPER_ADMIN_PASSWORD;
            if (!email || !motDePasse || motDePasse.length < 12) {
                console.warn('⚠️  Aucun super-admin : définissez SUPER_ADMIN_EMAIL et SUPER_ADMIN_PASSWORD (12 caractères minimum) puis redémarrez.');
            } else {
                const bcrypt = await import('bcryptjs');
                await User.create({
                    matricule: 'SUP-ADM-0001',
                    nom: 'NextClinic',
                    prenom: 'SuperAdmin',
                    email,
                    passwordHash: await bcrypt.default.hash(motDePasse, 12),
                    role: 'super_admin',
                    statut: 'actif',
                    clinic_id: null
                });
                console.log(`✅ Compte Super Admin créé : ${email}`);
            }
        }
    } catch (error) {
        console.error('\n❌ Impossible de connecter à la base de données :', error.message);
        process.exit(1);
    }

    httpServer.listen(PORT, () => {
        console.log(`\n🏥 NextClinic API Server démarré sur http://localhost:${PORT}`);
        console.log(`   📊 Base de données : ${process.env.DB_NAME || 'clinicsoft_db'}`);
        console.log(`   🔌 Socket.io : actif (rooms: role:doctor | role:pharmacist | role:secretary)`);
        console.log(`   📧 Emails : ${process.env.SMTP_HOST || 'Gmail SMTP'}\n`);
        demarrerRappels();
        demarrerPurges();
    });
}

start();
