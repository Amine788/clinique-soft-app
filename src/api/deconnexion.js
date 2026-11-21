import api from './axios';
import { useAuthStore } from '../store/authStore';

// Déconnexion volontaire : le serveur ferme la session de ce poste (le jeton ne sert plus, même copié),
// puis la session est effacée du navigateur. Serveur injoignable ou session déjà expirée : effacement local quand même.
export async function seDeconnecter() {
    const { token, logout } = useAuthStore.getState();
    if (token) {
        try {
            // Corps {} et non null : « null » envoyé en JSON est refusé par express.json (400)
            await api.post('/auth/logout', {}, { skipAuthRedirect: true, timeout: 5000 });
        } catch { /* session déjà fermée ou serveur injoignable : la session locale est effacée ci-dessous */ }
    }
    logout();
}
