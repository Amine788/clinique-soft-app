// Sessions : chaque jeton de session porte un identifiant unique (jti), ce qui permet à « Déconnexion »
// de fermer cette session côté serveur avant son expiration, sans toucher aux autres postes du même compte.
import { randomUUID } from 'node:crypto';
import { Op } from 'sequelize';
import { SessionRevoquee } from '../models/index.js';

/** Options de jwt.sign pour un jeton de session (durée + identifiant unique) */
export const optionsSession = (expiresIn) => ({ expiresIn, jwtid: randomUUID() });

/** Ferme la session d'un jeton déjà vérifié (contenu décodé : jti, exp). Sans jti (jeton antérieur), rien à faire. */
export async function revoquerSession(decoded) {
    if (!decoded?.jti || !decoded?.exp) return false;
    await SessionRevoquee.findOrCreate({
        where: { jti: String(decoded.jti) },
        defaults: { expireLe: new Date(decoded.exp * 1000) },
    });
    return true;
}

/** true si la session de ce jeton a été fermée par une déconnexion */
export async function sessionRevoquee(decoded) {
    if (!decoded?.jti) return false;
    return !!(await SessionRevoquee.findByPk(String(decoded.jti), { attributes: ['jti'] }));
}

/** Supprime les sessions révoquées déjà expirées (le jeton est de toute façon refusé) */
export async function purgerSessionsExpirees(maintenant = new Date()) {
    return SessionRevoquee.destroy({ where: { expireLe: { [Op.lt]: maintenant } } });
}
