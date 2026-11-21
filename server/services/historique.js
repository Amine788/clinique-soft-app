// Historique médical et administratif : ce qui interdit une suppression définitive.
// Plusieurs liens sont en suppression en cascade (hospitalisations du médecin, soins et constantes de
// l'infirmier) : supprimer un compte ou une clinique qui a un historique effacerait des dossiers médicaux.
// Un tel compte se désactive, une telle clinique se suspend.
import {
    Patient, CinScan, RendezVous, Pointage, Facture, Hospitalisation, HospitalisationSoin,
    HospitalisationVital, HospitalisationAlerte, ExamenPatient, Absence, Medecin,
} from '../models/index.js';
import { Prescription } from '../routes/prescriptions.js';
import { BillingPayment } from '../models/billingPayment.js';

const auMoinsUn = async requetes => (await Promise.all(requetes)).some(n => n > 0);

// Le compte a-t-il laissé une trace (saisie, soin, ordonnance, RDV…) ?
export async function compteAvecHistorique(user) {
    const parUser = [
        Patient.count({ where: { creeParUserId: user.id } }),
        CinScan.count({ where: { uploadeParUserId: user.id } }),
        RendezVous.count({ where: { creePar: user.id } }),
        RendezVous.count({ where: { pointePar: user.id } }),
        Pointage.count({ where: { pointePar: user.id } }),
        Facture.count({ where: { creeParUserId: user.id } }),
        BillingPayment.count({ where: { creeParUserId: user.id } }),
        Hospitalisation.count({ where: { nurseId: user.id } }),
        HospitalisationSoin.count({ where: { realisePar: user.id } }),
        HospitalisationVital.count({ where: { prisPar: user.id } }),
        HospitalisationAlerte.count({ where: { resoluPar: user.id } }),
        Absence.count({ where: { traitePar: user.id } }),
        Prescription.count({ where: { dispenseParUserId: user.id } }),
    ];
    const medecin = await Medecin.findOne({ where: { userId: user.id }, attributes: ['id'] });
    const parMedecin = medecin ? [
        RendezVous.count({ where: { medecinId: medecin.id } }),
        Prescription.count({ where: { medecinId: medecin.id } }),
        Hospitalisation.count({ where: { medecinId: medecin.id } }),
        ExamenPatient.count({ where: { medecinId: medecin.id } }),
        Absence.count({ where: { medecinId: medecin.id } }),
    ] : [];
    return auMoinsUn([...parUser, ...parMedecin]);
}

// La clinique contient-elle des données patients ou de soins ?
export async function cliniqueAvecDonnees(clinicId) {
    const where = { clinic_id: clinicId };
    return auMoinsUn([
        Patient.count({ where }),
        CinScan.count({ where }),
        RendezVous.count({ where }),
        Pointage.count({ where }),
        Facture.count({ where }),
        Hospitalisation.count({ where }),
        ExamenPatient.count({ where }),
        Prescription.count({ where }),
    ]);
}
