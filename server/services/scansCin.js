import { open, writeFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { join } from 'node:path';
import multer from 'multer';
// Scans de CIN : face, type réel du fichier et nom sur disque sont décidés par le serveur, jamais par le client
// (ni le nom ni l'extension ni le type déclaré ne servent à nommer ou à servir le fichier)





// Dossier des scans sur le serveur (volume persistant en Docker), jamais servi en accès libre
export const dossierScansCin = () => join(process.cwd(), 'uploads/cin-scans');
export const FACES_CIN = ['recto', 'verso'];
const TAILLE_MAX = 5 * 1024 * 1024;

// Formats déjà acceptés par la fonctionnalité (photo réduite en JPEG par le front, PNG, PDF, HEIC des téléphones)
const TYPES_CIN = {
    jpeg: { mime: 'image/jpeg', ext: 'jpg' },
    png: { mime: 'image/png', ext: 'png' },
    pdf: { mime: 'application/pdf', ext: 'pdf' },
    heic: { mime: 'image/heic', ext: 'heic' },
};
const MARQUES_HEIC = new Set(['heic', 'heix', 'hevc', 'hevx', 'heim', 'heis', 'mif1', 'msf1']);
const SIGNATURE_PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const ERREUR_FICHIER = 'Fichier non supporté ou manquant. (JPG, PNG, PDF uniquement)';

/** Type réel d'un scan d'après ses premiers octets (signature) : 'jpeg', 'png', 'pdf', 'heic' ou null */
export function typeReelScan(octets) {
    if (!Buffer.isBuffer(octets) || octets.length < 8) return null;
    if (octets[0] === 0xff && octets[1] === 0xd8 && octets[2] === 0xff) return 'jpeg';
    if (octets.subarray(0, 8).equals(SIGNATURE_PNG)) return 'png';
    if (octets.subarray(0, 5).toString('latin1') === '%PDF-') return 'pdf';
    if (octets.length >= 12 && octets.subarray(4, 8).toString('latin1') === 'ftyp'
        && MARQUES_HEIC.has(octets.subarray(8, 12).toString('latin1'))) return 'heic';
    return null;
}

/**
 * Réception d'un scan (champ « scan », face « recto » ou « verso ») : fichier gardé en mémoire, contrôlé,
 * puis écrit dans `dossier` sous un nom généré. Remplit req.file comme le stockage disque de multer.
 */
export function recevoirScanCin(dossier) {
    const lire = multer({ storage: multer.memoryStorage(), limits: { fileSize: TAILLE_MAX, files: 1 } }).single('scan');
    return (req, res, next) => lire(req, res, async (err) => {
        if (err) {
            const tropLourd = err.code === 'LIMIT_FILE_SIZE';
            return res.status(tropLourd ? 413 : 400).json({ error: tropLourd ? 'Fichier trop volumineux (5 Mo maximum)' : ERREUR_FICHIER });
        }
        const face = req.body?.face || 'recto';
        if (!FACES_CIN.includes(face)) return res.status(400).json({ error: 'Face du scan invalide (recto ou verso)' });
        if (!req.file) return res.status(400).json({ error: ERREUR_FICHIER });

        // Le contenu doit être un format accepté, et correspondre au type déclaré par le navigateur
        const type = typeReelScan(req.file.buffer);
        const declare = req.file.mimetype === 'image/jpg' ? 'image/jpeg' : req.file.mimetype;
        if (!type || TYPES_CIN[type].mime !== declare) return res.status(400).json({ error: ERREUR_FICHIER });

        const nom = `${face}_${Date.now()}_${randomBytes(6).toString('hex')}.${TYPES_CIN[type].ext}`;
        const chemin = join(dossier, nom);
        try {
            await writeFile(chemin, req.file.buffer, { flag: 'wx' }); // jamais d'écrasement
        } catch (e) {
            return next(e);
        }
        req.body.face = face;
        req.file = { ...req.file, buffer: undefined, filename: nom, path: chemin, mimetype: TYPES_CIN[type].mime, destination: dossier };
        next();
    });
}

/**
 * Envoi d'un scan existant : type lu dans le contenu (jamais déduit de l'extension). Un fichier non reconnu,
 * y compris un ancien fichier mal nommé, part en téléchargement binaire et ne peut pas s'afficher comme une page.
 */
export async function envoyerScanCin(res, chemin) {
    const fichier = await open(chemin, 'r');
    const debut = Buffer.alloc(16);
    try {
        await fichier.read(debut, 0, 16, 0);
    } finally {
        await fichier.close();
    }
    const type = TYPES_CIN[typeReelScan(debut)];
    res.set({
        'Content-Type': type ? type.mime : 'application/octet-stream',
        'Content-Disposition': type ? 'inline' : 'attachment; filename="scan-cin.bin"',
        'X-Content-Type-Options': 'nosniff',
        'Content-Security-Policy': "default-src 'none'",
        'Cache-Control': 'private, no-store',
    });
    res.sendFile(chemin);
}
