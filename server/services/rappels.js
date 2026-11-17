// Rappels de rendez-vous par e-mail, la veille, pour les cliniques qui ont activé « E-mails aux patients ».
// Vérification toutes les heures ; envoi à partir de HEURE_ENVOI (heure de la clinique), une seule fois par
// RDV (rendez_vous.rappel_24h_envoye). Sans compte Gmail configuré, rien n'est lancé.
import { Op } from 'sequelize';
import { RendezVous, Patient, Medecin, User, Clinic } from '../models/index.js';
import { sendAppointmentReminder, emailConfigure } from './emailService.js';
import { moduleActif, MODULE_EMAILS_PATIENTS } from './modulesClinique.js';
import { jourClinique, ajouterJours, CLINIC_TZ } from './dates.js';

export const HEURE_ENVOI = 9;
const STATUTS_A_RAPPELER = ['planifie', 'confirme'];

const heureClinique = (instant) => Number(new Intl.DateTimeFormat('en-US', { timeZone: CLINIC_TZ, hour: 'numeric', hourCycle: 'h23' }).format(instant));

/** Envoie les rappels des RDV du lendemain ; renvoie le nombre d'e-mails envoyés */
export async function envoyerRappelsDuLendemain({ envoyer = sendAppointmentReminder, maintenant = new Date() } = {}) {
    if (heureClinique(maintenant) < HEURE_ENVOI) return 0;

    const rdvs = await RendezVous.findAll({
        where: {
            dateRdv: ajouterJours(jourClinique(maintenant), 1),
            statut: { [Op.in]: STATUTS_A_RAPPELER },
            rappel24hEnvoye: { [Op.not]: true },
        },
        include: [
            { model: Patient, attributes: ['prenom', 'nom', 'email'], where: { email: { [Op.and]: [{ [Op.ne]: null }, { [Op.ne]: '' }] } } },
            { model: Medecin, attributes: ['id'], include: [{ model: User, attributes: ['prenom', 'nom'] }] },
        ],
    });

    const cliniques = new Map();
    let envoyes = 0;
    for (const rdv of rdvs) {
        if (!cliniques.has(rdv.clinic_id)) cliniques.set(rdv.clinic_id, await Clinic.findByPk(rdv.clinic_id));
        const clinic = cliniques.get(rdv.clinic_id);
        if (!clinic || !moduleActif(clinic, MODULE_EMAILS_PATIENTS)) continue;

        const medecinUser = rdv.Medecin?.User;
        try {
            await envoyer({
                email: rdv.Patient.email,
                prenom: rdv.Patient.prenom,
                doctorName: medecinUser ? `Dr. ${medecinUser.prenom} ${medecinUser.nom}` : 'votre médecin',
                date: rdv.dateRdv,
                heureDebut: rdv.heureDebut,
                clinic,
            });
            await rdv.update({ rappel24hEnvoye: true });
            envoyes++;
        } catch (err) {
            // Non marqué : nouvel essai à la prochaine vérification
            console.error(`[RAPPELS] Échec pour le RDV ${rdv.numeroRdv} :`, err.message);
        }
    }
    if (envoyes) console.log(`[RAPPELS] ${envoyes} rappel(s) de rendez-vous envoyé(s)`);
    return envoyes;
}

/** Lance la vérification horaire (au démarrage du serveur) */
export function demarrerRappels() {
    if (!emailConfigure()) {
        console.log('[RAPPELS] Service e-mail non configuré : rappels de RDV désactivés');
        return null;
    }
    const verifier = () => envoyerRappelsDuLendemain().catch(err => console.error('[RAPPELS]', err.message));
    setTimeout(verifier, 60 * 1000);
    return setInterval(verifier, 60 * 60 * 1000);
}
