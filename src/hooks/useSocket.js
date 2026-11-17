import { useEffect, useEffectEvent, useSyncExternalStore } from 'react';
import { io } from 'socket.io-client';
import { useAuthStore } from '../store/authStore';

// Version compilée (Docker/Caddy, Vercel) : même adresse que la page, sauf VITE_API_URL ; en développement local : serveur direct
const SOCKET_URL = import.meta.env.VITE_API_URL || (import.meta.env.DEV && window.location.hostname === 'localhost' ? 'http://localhost:3001' : window.location.origin);

let socketInstance = null;
let socketToken = null; // jeton avec lequel socketInstance s'est authentifié
let snapshot = { connected: false, socket: null, token: null };
const subscribers = new Set();
const subscribe = listener => { subscribers.add(listener); return () => subscribers.delete(listener); };
const getSnapshot = () => snapshot;
function publishSocket() {
    const connected = socketInstance?.connected || false;
    if (snapshot.socket === socketInstance && snapshot.connected === connected && snapshot.token === socketToken) return;
    snapshot = { connected, socket: socketInstance, token: socketToken };
    subscribers.forEach(listener => listener());
}

export function useSocket(onEvent) {
    const { user, token } = useAuthStore();
    const state = useSyncExternalStore(subscribe, getSnapshot);
    const handleEvent = useEffectEvent((event, data) => {
        onEvent?.[event]?.(data);
        onEvent?.onAny?.(event, data);
    });

    // Extraire des primitives stables pour éviter la boucle infinie
    const userId = user?.id;
    const userRole = user?.role;
    const userName = user?.name;

    useEffect(() => {
        if (!token || !userId) {
            // Déconnexion : plus aucune notification pour l'ancienne session
            socketInstance?.disconnect();
            socketInstance = null;
            socketToken = null;
            publishSocket();
            return;
        }

        // Singleton, recréé si la session change : le serveur tire l'identité du jeton
        if (socketInstance && socketToken !== token) {
            socketInstance.disconnect();
            socketInstance = null;
        }
        if (!socketInstance) {
            socketToken = token;
            socketInstance = io(SOCKET_URL, {
                auth: { token },
                transports: ['websocket', 'polling'],
                reconnection: true,
                reconnectionDelay: 2000,
            });
            const created = socketInstance;
            created.on('connect', () => {
                if (socketInstance !== created) return;
                publishSocket();
                console.log('[Socket] ✅ Connecté —', userRole, userName);
            });
            created.on('disconnect', () => {
                if (socketInstance === created) publishSocket();
            });
            publishSocket();
        }

        const socket = socketInstance;

        // Écouter tous les événements clinique (consultation + hospitalisation)
        const events = [
            // — Consultation & RDV —
            'appointment_created', 'patient_arrived',
            'new_prescription', 'prescription_ready',
            'meds_ready_for_room', 'meds_delivered', 'meds_administered', 'consultation_done',
            'stock_alert', 'absence_request', 'absence_decision',
            'user_online', 'examen_ready', 'nurse_alert',
            // — Hospitalisation —
            'hosp_demande',         // Médecin → Secrétaire : nouvelle demande d'hospit
            'hosp_validated',       // Secrétaire → Médecin + Nurse : admission validée
            'hosp_alert',           // Nurse → Médecin : alerte critique patient
            'treatment_updated',    // Médecin → Nurse : traitement modifié
            'discharge_requested',  // Médecin → Secrétaire : demande de sortie
            'chambre_status_changed' // Secrétaire → Tous : changement statut chambre
        ];

        const handlers = events.map(event => {
            const handler = data => handleEvent(event, data);
            socket.on(event, handler);
            return [event, handler];
        });

        return () => {
            handlers.forEach(([event, handler]) => socket.off(event, handler));
        };
    }, [token, userId, userRole, userName]); // ✅ Primitives stables uniquement

    return { connected: state.token === token && state.connected, socket: state.token === token ? state.socket : null };
}
