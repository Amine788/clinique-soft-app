// Créneaux d'administration infirmier, partagés par prescriptions, nurse et hospitalisations
export const SLOT_TIMES = {
    1: ["08:00"],
    2: ["08:00", "20:00"],
    3: ["08:00", "14:00", "20:00"],
    4: ["08:00", "12:00", "16:00", "20:00"],
};
export const SLOT_LABELS = { "08:00": "Matin", "12:00": "Midi", "14:00": "Après-midi", "16:00": "Après-midi", "20:00": "Soir" };

// Libellés de fréquence non numériques proposés par ConsultationPage
const FREQUENCES_TEXTE = { 'matin et soir': 2, 'au besoin': 1 };

// Nombre de prises par jour (1 à 4), ou null si la fréquence n'est pas reconnue.
// timesPerDay numérique prime ; sinon on lit la fréquence texte (« 3 fois/jour », « Matin et soir »…).
export function timesPerDayOf(item) {
    const n = Number(item?.timesPerDay);
    if (SLOT_TIMES[n]) return n;
    const freq = String(item?.frequence ?? '').trim().toLowerCase();
    if (FREQUENCES_TEXTE[freq]) return FREQUENCES_TEXTE[freq];
    const parsed = parseInt(freq, 10);
    return SLOT_TIMES[parsed] ? parsed : null;
}

// Schéma unique d'un médicament d'ordonnance (consultation, dossier patient, hospitalisation).
// Accepte les anciens champs (med, dose, dosage, qty…) pour les ordonnances déjà enregistrées.
export function normalizeMedicament(m = {}, index = 0) {
    const timesPerDay = timesPerDayOf(m);
    return {
        id: m.id || (index + 1),
        nom: m.nom || m.med || m.medicamentNom || '',
        posologie: m.posologie || m.dosage || m.dose || '',
        frequence: m.frequence || (timesPerDay ? `${timesPerDay} fois/jour` : ''),
        timesPerDay,
        duree: m.duree || '',
        moment: m.moment || '',
        instructions: m.instructions || '',
        quantite: parseInt(m.quantite || m.qty, 10) || 1,
    };
}

export function parseMedicaments(json) {
    try {
        const list = typeof json === 'string' ? JSON.parse(json || '[]') : (json || []);
        return Array.isArray(list) ? list.map(normalizeMedicament) : [];
    } catch {
        return [];
    }
}

// Message d'erreur si la liste n'est pas enregistrable, sinon null
export function medicamentsInvalides(medicaments) {
    if (!Array.isArray(medicaments)) return 'Liste de médicaments invalide';
    const sansNom = medicaments.find(m => !(m?.nom || m?.med || '').trim());
    if (sansNom) return 'Nom du médicament requis';
    const inconnu = medicaments.find(m => !timesPerDayOf(m));
    if (inconnu) return `Fréquence non reconnue pour ${inconnu.nom || inconnu.med} : ${inconnu.frequence ?? inconnu.timesPerDay ?? 'vide'}`;
    return null;
}

export function generateSlots(items) {
    const slots = [];
    items.forEach((item, index) => {
        const times = SLOT_TIMES[timesPerDayOf(item)] || SLOT_TIMES[1];
        times.forEach(t => {
            slots.push({
                itemId: item.id || (index + 1),
                time: t,
                label: SLOT_LABELS[t] || t,
                done: false,
                doneAt: null,
                doneBy: null
            });
        });
    });
    return slots;
}
