// Point d'entrée unique des modèles : un fichier par modèle, les relations dans associations.js.
// L'ordre des imports est celui de la définition historique des tables.
import sequelize from '../config/database.js';
import cls from 'cls-hooked';
import { Clinic } from './clinic.js';
import { Departement } from './departement.js';
import { User } from './user.js';
import { Patient } from './patient.js';
import { CinScan } from './cinScan.js';
import { DossierMedical } from './dossierMedical.js';
import { Medecin } from './medecin.js';
import { RendezVous } from './rendezVous.js';
import { Pointage } from './pointage.js';
import { Chambre } from './chambre.js';
import { Hospitalisation } from './hospitalisation.js';
import { HospitalisationSoin } from './hospitalisationSoin.js';
import { HospitalisationVital } from './hospitalisationVital.js';
import { HospitalisationAlerte } from './hospitalisationAlerte.js';
import { ProduitPharmacie } from './produitPharmacie.js';
import { ExamenCatalog } from './examenCatalog.js';
import { ExamenPatient } from './examenPatient.js';
import { Facture } from './facture.js';
import { LigneFacture } from './ligneFacture.js';
import { Absence } from './absence.js';
import './associations.js';

// ============================================================
// CLINIQUE PAR DÉFAUT À LA CRÉATION — pose clinic_id sur un nouvel enregistrement s'il manque
// ============================================================
const tenantModels = [
    Patient, CinScan, Medecin, RendezVous, Pointage,
    Chambre, ProduitPharmacie, ExamenPatient, User, Facture, Hospitalisation
];

// Le filtre automatique par clinique (lectures, comptages, écritures en masse) est posé modèle par modèle
// dans config/database.js : un hook global ne reçoit pas le modèle et ne filtrait donc jamais.
sequelize.addHook('beforeValidate', (instance) => {
    const namespace = cls.getNamespace('clinicsoft-tenant');
    const clinicId = namespace ? namespace.get('clinicId') : null;
    if (clinicId && tenantModels.includes(instance.constructor)) {
        if (!instance.clinic_id) {
            instance.clinic_id = clinicId;
        }
    }
});

export {
    Clinic, User, Patient, CinScan, DossierMedical, Medecin,
    RendezVous, Pointage, Chambre, ProduitPharmacie, ExamenCatalog, ExamenPatient,
    Facture, LigneFacture, Absence, Departement,
    Hospitalisation, HospitalisationSoin, HospitalisationVital, HospitalisationAlerte
};
export default sequelize;