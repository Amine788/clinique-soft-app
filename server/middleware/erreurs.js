// Journal des requêtes et gestionnaire d'erreurs global de l'API (séparés de index.js pour être testés seuls)

// Chemin journalisé sans paramètres de requête et avec les numéros de CIN masqués (données personnelles)
export const cheminJournal = (url) => url.split('?')[0].replace(/\/[A-Za-z]{1,2}\d{3,}(?=\/|$)/g, '/***');

// Filet de sécurité posé avant les routes : une réponse 500 écrite par le « catch » d'une route ne renvoie
// jamais de détail interne (message SQL, chemin, champ « details »). Le détail reste dans le journal de la route.
// Les autres statuts, dont les 5xx voulus (503 « IA non configurée »...), ne sont pas modifiés.
export const MESSAGE_ERREUR_INTERNE = 'Erreur interne du serveur';
export function masquerErreursInternes(req, res, next) {
    const json = res.json.bind(res);
    res.json = (corps) => json(res.statusCode === 500 ? { error: MESSAGE_ERREUR_INTERNE } : corps);
    next();
}

// Dernier middleware d'Express : réponse JSON { error, code }
export function gestionnaireErreurs(err, req, res, next) {
    // Statut posé volontairement (code de l'application, body-parser, CORS) : message destiné au client
    const statut = err.status || err.statusCode;
    if (statut && statut < 500) console.warn(`[ERREUR ${statut}] ${req.method} ${cheminJournal(req.originalUrl || '')} : ${err.message}`);
    else console.error('[GLOBAL ERROR]', err.stack);
    // Réponse déjà commencée (ex. flux SSE de l'IA) : impossible d'en envoyer une autre, Express ferme la connexion
    if (res.headersSent) return next(err);
    // Corps JSON au-delà de la limite d'express.json (ex. image OCR trop lourde, V3)
    if (err.type === 'entity.too.large') {
        return res.status(413).json({ error: 'Fichier trop volumineux (10 Mo maximum)', code: 'payload_too_large' });
    }
    // Fichier refusé par multer (taille, champ inattendu) : erreur du client, pas du serveur
    if (err.name === 'MulterError') {
        return err.code === 'LIMIT_FILE_SIZE'
            ? res.status(413).json({ error: 'Fichier trop volumineux', code: 'payload_too_large' })
            : res.status(400).json({ error: 'Envoi de fichier invalide', code: err.code });
    }
    // Erreur imprévue : jamais de détail interne (SQL, chemin, pile) renvoyé au client, seulement dans le journal
    if (!statut) return res.status(500).json({ error: 'Erreur interne du serveur' });
    res.status(statut).json({ error: err.message || 'Erreur interne du serveur', code: err.code });
}
