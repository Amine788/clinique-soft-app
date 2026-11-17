// Utilitaire explicite pour les essais d'installation administrative.
// Le garde I17 et l'identité SQL sont contrôlés avant la réinitialisation.
import { resetDatabase } from './helpers.js';
await resetDatabase();
console.log('Base Docker jetable autorisée réinitialisée.');
