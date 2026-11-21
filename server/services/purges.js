// Nettoyages périodiques : données qui n'ont plus de raison d'être gardées (loi 09-08 : minimisation).
import { unlink } from 'node:fs/promises';
import { join, basename } from 'node:path';
import { Op } from 'sequelize';
import { CinScan } from '../models/index.js';
import { dossierScansCin } from './scansCin.js';
import { purgerSessionsExpirees } from './sessions.js';

// Un scan de CIN envoyé avant la création du dossier est rattaché au patient à sa création.
// Sans dossier créé dans ce délai, le scan (pièce d'identité) est supprimé : ligne et fichier.
export const DELAI_SCAN_ORPHELIN_MS = 24 * 60 * 60 * 1000;

/** Supprime les scans de CIN sans patient depuis plus de `delaiMs` ; renvoie le nombre de scans supprimés */
export async function purgerScansOrphelins({ dossier = dossierScansCin(), delaiMs = DELAI_SCAN_ORPHELIN_MS, maintenant = new Date() } = {}) {
    const limite = new Date(maintenant.getTime() - delaiMs);
    const scans = await CinScan.findAll({
        where: { patientId: null, uploaded_at: { [Op.lt]: limite } },
        attributes: ['id', 'fichierNom'],
    });
    let supprimes = 0;
    for (const scan of scans) {
        // Ligne d'abord, et seulement si le scan est toujours sans patient : un dossier créé entre-temps le garde
        const n = await CinScan.destroy({ where: { id: scan.id, patientId: null } });
        if (!n) continue;
        supprimes++;
        try {
            // Seul le nom du fichier est repris : aucun chemin ne peut sortir du dossier des scans
            await unlink(join(dossier, basename(scan.fichierNom)));
        } catch (err) {
            if (err.code !== 'ENOENT') console.error(`[PURGE] Fichier du scan #${scan.id} non supprimé :`, err.code || err.message);
        }
    }
    if (supprimes) console.log(`[PURGE] ${supprimes} scan(s) de CIN sans dossier patient depuis plus de 24 h supprimé(s)`);
    return supprimes;
}

/** Une passe complète ; une erreur sur un nettoyage n'empêche pas l'autre */
export async function lancerPurges() {
    await purgerScansOrphelins().catch(err => console.error('[PURGE] Scans de CIN :', err.message));
    await purgerSessionsExpirees().catch(err => console.error('[PURGE] Sessions :', err.message));
}

/** Nettoyage au démarrage du serveur (après 1 minute) puis toutes les heures */
export function demarrerPurges() {
    setTimeout(lancerPurges, 60 * 1000).unref?.();
    const minuterie = setInterval(lancerPurges, 60 * 60 * 1000);
    minuterie.unref?.();
    return minuterie;
}
