// Relations entre les modèles : importé une seule fois par models/index.js, après la définition de tous les modèles.
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

// ============================================================
// ASSOCIATIONS
// ============================================================

// User ↔ Clinic
User.belongsTo(Clinic, { foreignKey: 'clinic_id' });
Clinic.hasMany(User, { foreignKey: 'clinic_id' });

// Patient
Patient.belongsTo(Clinic, { foreignKey: 'clinic_id' });
Clinic.hasMany(Patient, { foreignKey: 'clinic_id' });

Patient.belongsTo(User, { as: 'medecinTraitant', foreignKey: 'medecin_traitant_id' });
Patient.belongsTo(User, { as: 'creePar', foreignKey: 'cree_par_user_id' });
Patient.hasOne(DossierMedical, { foreignKey: 'patient_id' });
Patient.hasMany(CinScan, { foreignKey: 'patient_id' });
Patient.hasMany(Pointage, { foreignKey: 'patient_id' });

DossierMedical.belongsTo(Patient, { foreignKey: 'patient_id' });
CinScan.belongsTo(Patient, { foreignKey: 'patient_id' });

// Medecin ↔ User ↔ Clinic
Medecin.belongsTo(User, { foreignKey: 'user_id' });
User.hasOne(Medecin, { foreignKey: 'user_id' });
Medecin.belongsTo(Clinic, { foreignKey: 'clinic_id' });
Clinic.hasMany(Medecin, { foreignKey: 'clinic_id' });

User.belongsTo(Medecin, { foreignKey: 'doctor_id', as: 'doctor' });
Medecin.hasMany(User, { foreignKey: 'doctor_id', as: 'nurses' });

// RendezVous ↔ Clinic
RendezVous.belongsTo(Clinic, { foreignKey: 'clinic_id' });
Clinic.hasMany(RendezVous, { foreignKey: 'clinic_id' });
RendezVous.belongsTo(Patient, { foreignKey: 'patient_id' });
RendezVous.belongsTo(Medecin, { foreignKey: 'medecin_id' });
Patient.hasMany(RendezVous, { foreignKey: 'patient_id' });

// Pointage ↔ Clinic
Pointage.belongsTo(Clinic, { foreignKey: 'clinic_id' });
Clinic.hasMany(Pointage, { foreignKey: 'clinic_id' });
Pointage.belongsTo(Patient, { foreignKey: 'patient_id' });
Pointage.belongsTo(RendezVous, { foreignKey: 'rdv_id' });

// Chambre ↔ Clinic
Chambre.belongsTo(Clinic, { foreignKey: 'clinic_id' });
Clinic.hasMany(Chambre, { foreignKey: 'clinic_id' });

// ProduitPharmacie ↔ Clinic
ProduitPharmacie.belongsTo(Clinic, { foreignKey: 'clinic_id' });
Clinic.hasMany(ProduitPharmacie, { foreignKey: 'clinic_id' });

// CinScan ↔ Clinic
CinScan.belongsTo(Clinic, { foreignKey: 'clinic_id' });
Clinic.hasMany(CinScan, { foreignKey: 'clinic_id' });

// ExamenPatient ↔ Clinic
ExamenPatient.belongsTo(Clinic, { foreignKey: 'clinic_id' });
Clinic.hasMany(ExamenPatient, { foreignKey: 'clinic_id' });
ExamenPatient.belongsTo(Patient, { foreignKey: 'patient_id' });
ExamenPatient.belongsTo(Medecin, { foreignKey: 'medecin_id' });
ExamenPatient.belongsTo(ExamenCatalog, { foreignKey: 'examen_id', as: 'examenDetails' });
ExamenPatient.belongsTo(RendezVous, { foreignKey: 'consultation_id', as: 'consultation' });
Patient.hasMany(ExamenPatient, { foreignKey: 'patient_id' });

// Facture ↔ Clinic
Facture.belongsTo(Clinic, { foreignKey: 'clinic_id' });
Clinic.hasMany(Facture, { foreignKey: 'clinic_id' });

// Departement ↔ Clinic
Departement.belongsTo(Clinic, { foreignKey: 'clinic_id' });
Clinic.hasMany(Departement, { foreignKey: 'clinic_id' });

// Facture ↔ Patient
Facture.belongsTo(Patient, { foreignKey: 'patient_id' });
Patient.hasMany(Facture, { foreignKey: 'patient_id' });

// Facture ↔ User (createur)
Facture.belongsTo(User, { as: 'createur', foreignKey: 'cree_par' });

// Facture ↔ LigneFacture
Facture.hasMany(LigneFacture, { as: 'lignes', foreignKey: 'facture_id', onDelete: 'CASCADE' });
LigneFacture.belongsTo(Facture, { foreignKey: 'facture_id' });

// Absence ↔ Medecin
Absence.belongsTo(Medecin, { foreignKey: 'medecin_id', as: 'medecin' });
Medecin.hasMany(Absence, { foreignKey: 'medecin_id', as: 'absences' });

// Absence ↔ User (validateur)
Absence.belongsTo(User, { foreignKey: 'traite_par', as: 'validateur' });


// Hospitalisation associations
Hospitalisation.belongsTo(Clinic, { foreignKey: 'clinic_id' });
Clinic.hasMany(Hospitalisation, { foreignKey: 'clinic_id' });

Hospitalisation.belongsTo(Patient, { foreignKey: 'patient_id', onDelete: 'CASCADE' });
Patient.hasMany(Hospitalisation, { foreignKey: 'patient_id', onDelete: 'CASCADE' });

Hospitalisation.belongsTo(Medecin, { foreignKey: 'medecin_id', onDelete: 'CASCADE' });
Medecin.hasMany(Hospitalisation, { foreignKey: 'medecin_id', onDelete: 'CASCADE' });

Hospitalisation.belongsTo(User, { as: 'nurse', foreignKey: 'nurse_id' });
User.hasMany(Hospitalisation, { as: 'hospitalisationsAsNurse', foreignKey: 'nurse_id' });

Hospitalisation.belongsTo(Chambre, { foreignKey: 'chambre_id' });
Chambre.hasMany(Hospitalisation, { foreignKey: 'chambre_id' });

// Hospitalisation details
Hospitalisation.hasMany(HospitalisationSoin, { as: 'soins', foreignKey: 'hospitalisation_id', onDelete: 'CASCADE' });
HospitalisationSoin.belongsTo(Hospitalisation, { foreignKey: 'hospitalisation_id', onDelete: 'CASCADE' });
HospitalisationSoin.belongsTo(User, { as: 'nurseActor', foreignKey: 'realise_par', onDelete: 'CASCADE' });

Hospitalisation.hasMany(HospitalisationVital, { as: 'vitals', foreignKey: 'hospitalisation_id', onDelete: 'CASCADE' });
HospitalisationVital.belongsTo(Hospitalisation, { foreignKey: 'hospitalisation_id', onDelete: 'CASCADE' });
HospitalisationVital.belongsTo(User, { as: 'nurseActorVitals', foreignKey: 'pris_par', onDelete: 'CASCADE' });

Hospitalisation.hasMany(HospitalisationAlerte, { as: 'alertes', foreignKey: 'hospitalisation_id', onDelete: 'CASCADE' });
HospitalisationAlerte.belongsTo(Hospitalisation, { foreignKey: 'hospitalisation_id', onDelete: 'CASCADE' });
HospitalisationAlerte.belongsTo(User, { as: 'resolvingDoctor', foreignKey: 'resolu_par', onDelete: 'SET NULL' });
