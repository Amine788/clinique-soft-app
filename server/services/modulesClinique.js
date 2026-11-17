// Bascules de la page Réglages, stockées dans clinics.active_modules : { email_reminders, realtime_notifications }.
// Une bascule absente est activée. L'ancien format (liste de modules, seed) n'en contient aucune : tout est activé.
export const MODULE_EMAILS_PATIENTS = 'email_reminders';
export const MODULE_TEMPS_REEL = 'realtime_notifications';

export function moduleActif(clinic, cle) {
    let modules = clinic?.activeModules;
    if (typeof modules === 'string') {
        try { modules = JSON.parse(modules); } catch { modules = null; }
    }
    if (!modules || Array.isArray(modules) || typeof modules !== 'object') return true;
    return modules[cle] !== false;
}
