// Fréquences proposées à la prescription et nombre de prises par jour envoyé au back
// (plan d'administration infirmier, voir server/services/posologie.js)
export const PRISES_PAR_JOUR = { '1 fois/jour': 1, '2 fois/jour': 2, '3 fois/jour': 3, '4 fois/jour': 4, 'Matin et soir': 2, 'Au besoin': 1 };

// Schéma unique d'un médicament : { id, nom, posologie, frequence, timesPerDay, duree, moment, instructions, quantite }.
// Les anciens champs (med, dose, dosage) restent lus pour les ordonnances enregistrées avant.
export const nomMedicament = m => m.nom || m.med || 'Médicament';
export const posologieMedicament = m => m.posologie || m.dosage || m.dose || '';
