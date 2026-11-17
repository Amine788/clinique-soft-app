// Dates « calendrier » de la clinique, indépendantes du fuseau du serveur.
// dateRdv (DATEONLY) est saisie à l'heure locale de la clinique : « aujourd'hui » doit être le jour
// de la clinique, ni celui du serveur (UTC sur un hébergeur), ni toISOString() (UTC).
export const CLINIC_TZ = process.env.CLINIC_TZ || 'Africa/Casablanca';

const jourFormat = new Intl.DateTimeFormat('en-CA', { timeZone: CLINIC_TZ, year: 'numeric', month: '2-digit', day: '2-digit' });
const heureFormat = new Intl.DateTimeFormat('en-US', {
    timeZone: CLINIC_TZ, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
});

/** Jour de la clinique au format AAAA-MM-JJ (par défaut : maintenant) */
export const jourClinique = (instant = new Date()) => jourFormat.format(instant);

const parties = (jour) => jour.split('-').map(Number);
const versJour = (ms) => new Date(ms).toISOString().slice(0, 10); // arithmétique faite en UTC pur

/** Jour décalé de n jours */
export const ajouterJours = (jour, n) => {
    const [a, m, j] = parties(jour);
    return versJour(Date.UTC(a, m - 1, j + n));
};

/** Premier jour du mois de `jour`, décalé de `mois` mois */
export const premierDuMois = (jour, mois = 0) => {
    const [a, m] = parties(jour);
    return versJour(Date.UTC(a, m - 1 + mois, 1));
};

/** Dernier jour du mois de `jour`, décalé de `mois` mois */
export const dernierDuMois = (jour, mois = 0) => {
    const [a, m] = parties(jour);
    return versJour(Date.UTC(a, m + mois, 0));
};

/** Premier jour de l'année de `jour` */
export const premierDeLAnnee = (jour) => `${jour.slice(0, 4)}-01-01`;

// Écart (ms) entre l'heure de la clinique et UTC à un instant donné
const decalage = (instant) => {
    const p = Object.fromEntries(heureFormat.formatToParts(instant).map(x => [x.type, x.value]));
    return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second) - Math.floor(instant.getTime() / 1000) * 1000;
};

/** Instant de minuit (heure de la clinique) au début de `jour`, pour les colonnes DATETIME */
export const minuitClinique = (jour) => {
    const [a, m, j] = parties(jour);
    const utc = Date.UTC(a, m - 1, j);
    return new Date(utc - decalage(new Date(utc - decalage(new Date(utc)))));
};
