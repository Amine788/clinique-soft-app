// Circuit d'une ordonnance : médecin (en_attente) → pharmacien (préparation) → remise → infirmier (administration).
// « administree » n'est jamais posé à la main : il découle de la validation de toutes les prises.

// Rôles du service de soins : administration des prises et confirmation de la livraison
export const ROLES_SOINS = ['nurse', 'doctor'];

// Pour chaque statut visé : statuts de départ admis et rôles autorisés
const ETAPES = {
    en_preparation: { depuis: ['en_attente'], roles: ['pharmacist'] },
    preparee: { depuis: ['en_attente', 'en_preparation'], roles: ['pharmacist'] },
    remise: { depuis: ['preparee'], roles: ['pharmacist', ...ROLES_SOINS] },
};

// { status, error } si le passage de `actuel` à `cible` est interdit pour ce rôle, sinon null
export function refusTransition(role, actuel, cible) {
    const etape = ETAPES[cible];
    if (!etape) return { status: 400, error: `Statut d'ordonnance invalide : ${cible}` };
    if (!etape.roles.includes(role)) return { status: 403, error: 'Ce rôle ne peut pas effectuer cette étape du circuit' };
    if (!etape.depuis.includes(actuel)) return { status: 400, error: `Passage impossible de « ${actuel} » à « ${cible} »` };
    return null;
}
