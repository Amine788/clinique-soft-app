// Fonctions partagées par les routes « nurse ».
import { jourClinique } from '../../services/dates.js';

// Helper to get today's date in string format YYYY-MM-DD
// Jour de la clinique : toISOString() donnait la date UTC, celle de la veille entre minuit et 1 h au Maroc
export const getTodayStr = () => jourClinique();
