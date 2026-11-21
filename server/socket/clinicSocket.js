/**
 * ClinicSoft — Socket.io Central Hub
 * Identité prise dans le JWT (handshake.auth.token), jamais dans les champs envoyés par le client.
 * Rooms par rôle et par clinique : clinic:<clinicId>:role:<role>
 * Rooms par user : user:<userId>
 */
import jwt from 'jsonwebtoken';
import { User, Clinic } from '../models/index.js';
import { JWT_SECRET } from '../middleware/auth.js';
import { moduleActif, MODULE_TEMPS_REEL } from '../services/modulesClinique.js';
import { trialEndFor } from '../config/trial.js';
import { sessionRevoquee } from '../services/sessions.js';

const onlineUsers = new Map(); // userId → socketId
const cliniqueDuUser = new Map(); // userId → clinicId (utilisateurs connectés)

// Bascule « Notifications temps réel » (page Réglages) : cliniques qui l'ont désactivée.
// Les alertes cliniques critiques (patient en danger) passent toujours, quelle que soit la bascule.
const cliniquesSansTempsReel = new Set();
const ALERTES_CRITIQUES = new Set(['hosp_alert', 'nurse_alert']);

/** Met à jour la bascule d'une clinique (au démarrage et à chaque enregistrement des Réglages) */
export function majTempsReel(clinic) {
    if (!clinic?.id) return;
    if (moduleActif(clinic, MODULE_TEMPS_REEL)) cliniquesSansTempsReel.delete(Number(clinic.id));
    else cliniquesSansTempsReel.add(Number(clinic.id));
}

export async function chargerReglagesTempsReel() {
    const cliniques = await Clinic.findAll({ attributes: ['id', 'activeModules'] });
    cliniques.forEach(majTempsReel);
}

const bloque = (clinicId, event) =>
    !ALERTES_CRITIQUES.has(event) && clinicId != null && cliniquesSansTempsReel.has(Number(clinicId));

let socketHubInstance = null;

/** Room d'un rôle dans une clinique ; null sans clinique (aucune diffusion entre cliniques) */
function roleRoom(clinicId, role) {
    if (!clinicId) {
        console.warn(`[SOCKET] Émission vers le rôle "${role}" ignorée : clinique inconnue`);
        return null;
    }
    return `clinic:${clinicId}:role:${role}`;
}

export const clinicSocket = {
    notifyAppointmentCreated(...args) { socketHubInstance?.notifyAppointmentCreated(...args); },
    notifyPatientArrived(...args) { socketHubInstance?.notifyPatientArrived(...args); },
    notifyNewPrescription(...args) { socketHubInstance?.notifyNewPrescription(...args); },
    notifyPrescriptionReady(...args) { socketHubInstance?.notifyPrescriptionReady(...args); },
    notifyMedsReadyForRoom(...args) { socketHubInstance?.notifyMedsReadyForRoom(...args); },
    notifyConsultationDone(...args) { socketHubInstance?.notifyConsultationDone(...args); },
    notifyStockAlert(...args) { socketHubInstance?.notifyStockAlert(...args); },
    notifyAbsenceRequest(...args) { socketHubInstance?.notifyAbsenceRequest(...args); },
    emitToUser(...args) { socketHubInstance?.emitToUser(...args); },
    emitToRole(...args) { socketHubInstance?.emitToRole(...args); },
    deconnecterUser(...args) { socketHubInstance?.deconnecterUser(...args); },
    deconnecterClinique(...args) { socketHubInstance?.deconnecterClinique(...args); },
    deconnecterSession(...args) { socketHubInstance?.deconnecterSession(...args); },
    getOnlineUsers() { return socketHubInstance ? socketHubInstance.getOnlineUsers() : []; }
};

export function initSocket(io) {

    // Authentification : jeton de session vérifié, rôle et clinique relus en base
    io.use(async (socket, next) => {
        try {
            const decoded = jwt.verify(socket.handshake.auth?.token || '', JWT_SECRET);
            // Session fermée par « Déconnexion » : refusée comme dans l'API
            if (await sessionRevoquee(decoded)) return next(new Error('unauthorized'));
            socket.data.jti = decoded.jti || null;
            const user = await User.findByPk(decoded.id, { attributes: ['id', 'role', 'clinic_id', 'statut', 'nom', 'prenom'] });
            if (!user || user.statut === 'inactif') return next(new Error('unauthorized'));
            if (!user.clinic_id && user.role !== 'super_admin') return next(new Error('unauthorized'));
            // Même règle que l'API (authenticateJWT) : clinique suspendue ou essai expiré, pas de temps réel
            let finEssai = null;
            if (user.clinic_id) {
                const clinic = await Clinic.findByPk(user.clinic_id, { attributes: ['id', 'subscriptionStatus', 'createdAt', 'trialEndsAt'] });
                if (clinic?.subscriptionStatus === 'suspended'
                    || (clinic?.subscriptionStatus === 'trial' && new Date() > trialEndFor(clinic))) return next(new Error('unauthorized'));
                if (clinic?.subscriptionStatus === 'trial') finEssai = trialEndFor(clinic).getTime();
            }
            socket.data.finEssai = finEssai;
            socket.data.user = {
                userId: user.id,
                role: user.role,
                clinicId: user.clinic_id,
                name: `${user.prenom} ${user.nom}`,
            };
            next();
        } catch {
            next(new Error('unauthorized'));
        }
    });

    io.on('connection', (socket) => {
        const { userId, role, clinicId, name } = socket.data.user;

        // Rejoindre rooms
        const room = roleRoom(clinicId, role);
        if (room) socket.join(room);
        socket.join(`user:${userId}`);
        onlineUsers.set(userId, socket.id);
        cliniqueDuUser.set(userId, clinicId);
        console.log(`[SOCKET] ✅ ${role} "${name}" connecté (${socket.id})`);

        // Notifier collègues du même rôle et de la même clinique qu'on est en ligne
        if (room && !bloque(clinicId, 'user_online')) socket.broadcast.to(room).emit('user_online', { userId, name, role });

        // Essai en cours : la connexion est fermée à l'heure de fin. Si l'essai a été prolongé ou l'abonnement
        // activé entre-temps, le navigateur se reconnecte et l'état est relu en base (io.use).
        let minuterieEssai = null;
        if (socket.data.finEssai) {
            const delai = Math.min(Math.max(socket.data.finEssai - Date.now(), 0) + 1000, 2 ** 31 - 1);
            minuterieEssai = setTimeout(() => socket.disconnect(true), delai);
            minuterieEssai.unref?.();
        }

        socket.on('disconnect', () => {
            clearTimeout(minuterieEssai);
            onlineUsers.delete(userId);
            console.log(`[SOCKET] ❌ ${role} "${name}" déconnecté`);
        });
    });

    // ── Fonctions d'émission globales ──────────────────────────────────────
    // Toute émission passe par ces deux fonctions, qui appliquent la bascule de la clinique

    const envoyerUser = (userId, event, data) => {
        if (bloque(cliniqueDuUser.get(userId), event)) return;
        io.to(`user:${userId}`).emit(event, data);
    };
    const envoyerRoles = (clinicId, roles, event, data) => {
        if (bloque(clinicId, event)) return;
        const rooms = roles.map(r => roleRoom(clinicId, r)).filter(Boolean);
        if (rooms.length) io.to(rooms).emit(event, data);
    };

    socketHubInstance = {
        notifyQueueChanged(clinicId) {
            envoyerRoles(clinicId, ['secretary', 'admin', 'doctor', 'nurse'], 'queue_updated', { timestamp: new Date().toISOString() });
        },

        /** Secrétaire → Médecin : RDV créé */
        notifyAppointmentCreated(rdv, medecinId) {
            envoyerUser(medecinId, 'appointment_created', {
                type: 'appointment_created',
                title: 'Nouveau rendez-vous',
                message: `${rdv.patientPrenom} ${rdv.patientNom} — ${rdv.date} à ${rdv.heure}`,
                urgent: false,
                data: rdv,
                timestamp: new Date().toISOString()
            });
        },

        /** Secrétaire → Médecin : patient arrivé (check-in) */
        notifyPatientArrived(patient, rdv, medecinId) {
            envoyerUser(medecinId, 'patient_arrived', {
                type: 'patient_arrived',
                title: '🔔 Patient en salle d\'attente',
                message: `${patient.cin} — ${patient.prenom} ${patient.nom}`,
                urgent: true,
                allergie: patient.allergies?.length > 0 ? patient.allergies : null,
                data: { patient, rdv },
                timestamp: new Date().toISOString()
            });
        },

        /** Médecin → Pharmacien : ordonnance créée */
        notifyNewPrescription(ordonnance, clinicId) {
            envoyerRoles(clinicId, ['pharmacist'], 'new_prescription', {
                type: 'new_prescription',
                title: '💊 Nouvelle ordonnance à préparer',
                message: `${ordonnance.patientNom} — ${ordonnance.medicaments?.length || 0} médicament(s)`,
                urgent: true,
                sound: true,
                data: ordonnance,
                timestamp: new Date().toISOString()
            });
        },

        /** Pharmacien → Médecin : ordonnance préparée */
        notifyPrescriptionReady(ordonnance, medecinId) {
            envoyerUser(medecinId, 'prescription_ready', {
                type: 'prescription_ready',
                title: '✅ Médicaments préparés',
                message: `Ordonnance ${ordonnance.numero} prête — ${ordonnance.patientNom}`,
                urgent: false,
                data: ordonnance,
                timestamp: new Date().toISOString()
            });
        },

        /** Pharmacien → Secrétaire : médicaments prêts (si hospitalisé) */
        notifyMedsReadyForRoom(ordonnance, chambre, clinicId) {
            envoyerRoles(clinicId, ['secretary'], 'meds_ready_for_room', {
                type: 'meds_ready_for_room',
                title: '💊 Médicaments prêts',
                message: `Chambre ${chambre} — ${ordonnance.patientNom}`,
                urgent: false,
                data: { ordonnance, chambre },
                timestamp: new Date().toISOString()
            });
        },

        /** Médecin → Secrétaire : consultation terminée, générer facture */
        notifyConsultationDone(rdv, clinicId) {
            envoyerRoles(clinicId, ['secretary'], 'consultation_done', {
                type: 'consultation_done',
                title: '✅ Consultation terminée',
                message: `Générer la facture pour ${rdv.patientCin} — ${rdv.patientNom}`,
                urgent: false,
                data: rdv,
                timestamp: new Date().toISOString()
            });
        },

        /** Pharmacien + Admin : alerte stock bas */
        notifyStockAlert(produit, niveau, clinicId) {
            const evt = {
                type: 'stock_alert',
                title: `⚠️ Stock ${niveau} — ${produit.nomCommercial}`,
                message: `${produit.stockActuel} unités restantes (seuil: ${produit.seuilMinimum})`,
                urgent: niveau === 'rupture',
                data: produit,
                timestamp: new Date().toISOString()
            };
            envoyerRoles(clinicId, ['pharmacist', 'admin'], 'stock_alert', evt);
        },

        /** Médecin → Secrétaire + Admin : demande d'absence */
        notifyAbsenceRequest(absence, medecinNom, clinicId) {
            envoyerRoles(clinicId, ['secretary', 'admin'], 'absence_request', {
                type: 'absence_request',
                title: `🏖️ Demande d'absence — ${medecinNom}`,
                message: `Du ${absence.dateDebut} au ${absence.dateFin} — ${absence.nombreRdvImpactes || 0} RDV impactés`,
                urgent: true,
                data: absence,
                timestamp: new Date().toISOString()
            });
        },

        /** Utilitaire — émettre à un utilisateur spécifique */
        emitToUser(userId, event, data) {
            envoyerUser(userId, event, data);
        },

        /** Utilitaire — émettre aux membres d'un rôle dans une clinique */
        emitToRole(clinicId, role, event, data) {
            envoyerRoles(clinicId, [role], event, data);
        },

        /**
         * Ferme les connexions ouvertes d'un utilisateur (compte désactivé ou supprimé) : sans cela, un socket
         * déjà ouvert resterait dans les rooms de sa clinique et continuerait à recevoir ses notifications.
         * À la reconnexion, l'identité est relue en base (io.use) et un compte inactif est refusé.
         */
        deconnecterUser(userId) {
            io.in(`user:${userId}`).disconnectSockets(true);
            onlineUsers.delete(userId);
            cliniqueDuUser.delete(userId);
        },

        /** Ferme toutes les connexions ouvertes d'une clinique (clinique suspendue par le super-admin) */
        deconnecterClinique(clinicId) {
            for (const socket of io.sockets.sockets.values()) {
                if (Number(socket.data.user?.clinicId) === Number(clinicId)) socket.disconnect(true);
            }
        },

        /** Ferme les connexions ouvertes avec une session fermée par « Déconnexion » (ce poste seulement) */
        deconnecterSession(jti) {
            for (const socket of io.sockets.sockets.values()) {
                if (jti && socket.data.jti === jti) socket.disconnect(true);
            }
        },

        /** Obtenir les utilisateurs en ligne */
        getOnlineUsers() {
            return Array.from(onlineUsers.keys());
        }
    };

    return clinicSocket;
}
