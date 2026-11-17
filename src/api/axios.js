import axios from 'axios';
import { useAuthStore } from '../store/authStore';

// Instance Axios centralisée avec interceptors
const api = axios.create({
    baseURL: import.meta.env.VITE_API_URL ? `${import.meta.env.VITE_API_URL}/api` : '/api',
    timeout: 10000,
    headers: { 'Content-Type': 'application/json' },
});

// Interceptor: Ajouter le token JWT à chaque requête
api.interceptors.request.use((config) => {
    const { token } = useAuthStore.getState();
    if (token) {
        config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
});

// Interceptor: Gérer les erreurs 401/403
// - 401 (session expirée / jeton invalide) → logout + /login
// - 403 abonnement suspendu ou essai expiré → /subscription
// - 403 compte suspendu → logout + /login
// - autre 403 (rôle refusé sur une action) → pas de redirection : la page affiche
//   error.response.data.error (l'accès aux pages est déjà contrôlé par ProtectedRoute)
// - /auth/login et les appels marqués { skipAuthRedirect: true } (pages publiques)
//   ne sont jamais redirigés : l'erreur s'affiche sur place
api.interceptors.response.use(
    (response) => response,
    (error) => {
        // Une annulation de chargement ne signale pas un échec du serveur.
        if (axios.isCancel(error)) return Promise.reject(error);
        console.error("[API ERROR]", {
            url: error.config?.url,
            status: error.response?.status,
            data: error.response?.data
        });
        const status = error.response?.status;
        const errCode = error.response?.data?.code;
        const isLoginRequest = error.config?.url?.includes('/auth/login');
        if (isLoginRequest || error.config?.skipAuthRedirect) {
            return Promise.reject(error);
        }
        if (status === 401 || (status === 403 && errCode === 'account_suspended')) {
            console.warn("🔐 Redirection login : session expirée ou compte suspendu.");
            const { logout } = useAuthStore.getState();
            logout();
            window.location.href = '/login';
        } else if (status === 403 && (errCode === 'subscription_suspended' || errCode === 'trial_expired')) {
            console.warn("💳 Abonnement expiré ou suspendu. Redirection /subscription.");
            window.location.href = '/subscription';
        }
        return Promise.reject(error);
    }
);

export default api;
