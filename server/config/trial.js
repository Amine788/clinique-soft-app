// Essai gratuit d'une nouvelle clinique (statut 'trial') : 24 heures depuis sa création,
// sauf si le super-admin l'a prolongé (clinics.trial_ends_at).
export const TRIAL_DURATION_MS = 24 * 60 * 60 * 1000;

// Prolongation maximale accordée en une fois par le super-admin : 90 jours
export const MAX_TRIAL_EXTENSION_HOURS = 90 * 24;

export const TRIAL_EXPIRED_MESSAGE = 'Votre période d\'essai de 24 heures a expiré. Veuillez souscrire à un abonnement.';

// clinic : { createdAt, trialEndsAt? }
export function trialEndFor(clinic) {
    if (clinic.trialEndsAt) return new Date(clinic.trialEndsAt);
    return new Date(new Date(clinic.createdAt).getTime() + TRIAL_DURATION_MS);
}
