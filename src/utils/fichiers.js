import api from '../api/axios';
import toast from 'react-hot-toast';

// Ouvre un fichier protégé (résultat d'examen…) : téléchargé avec le jeton de session, puis affiché
// dans un nouvel onglet. L'onglet est ouvert avant l'appel pour ne pas être bloqué par le navigateur.
export async function ouvrirFichierProtege(url) {
    const onglet = window.open('', '_blank');
    try {
        const { data } = await api.get(url, { responseType: 'blob', timeout: 60000 });
        const lien = URL.createObjectURL(data);
        if (onglet) onglet.location.href = lien;
        else window.open(lien, '_blank');
        setTimeout(() => URL.revokeObjectURL(lien), 60000);
    } catch {
        onglet?.close();
        toast.error("Impossible d'ouvrir le fichier");
    }
}
