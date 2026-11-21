-- ============================================================
-- ClinicSoft — Schéma MySQL Complet (Multi-Tenant avec clinic_id)
-- Base de données : clinicsoft_db
-- Charset : utf8mb4 (support arabe/accents)
-- À importer dans phpMyAdmin (XAMPP)
-- ============================================================

CREATE DATABASE IF NOT EXISTS clinicsoft_db
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE clinicsoft_db;

-- ============================================================
-- TABLE 0 — CLINICS (racine de la hiérarchie multi-tenant)
-- ============================================================
CREATE TABLE IF NOT EXISTS clinics (
  id                  INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name                VARCHAR(150) NOT NULL,
  raison_sociale      VARCHAR(200),                   -- dénomination légale (pied de facture / ordonnance)
  type                VARCHAR(50) DEFAULT 'Starter',   -- plan SaaS (Starter / Pro)
  specialite          VARCHAR(100),                   -- spécialité médicale
  address             VARCHAR(255),
  email               VARCHAR(150),
  phone               VARCHAR(20),
  logo_url            VARCHAR(500),
  ice                 VARCHAR(50),
  if_num              VARCHAR(50),
  rc                  VARCHAR(50),
  tp                  VARCHAR(50),
  rib                 VARCHAR(100),
  subscription_status ENUM('trial','active','suspended') DEFAULT 'trial',
  trial_ends_at       DATETIME NULL,                     -- fin d'essai prolongée par le super-admin (NULL = création + 24 h)
  active_modules      JSON,
  key_hash            VARCHAR(64) UNIQUE,                -- clé de licence hachée (SHA-256), jamais en clair
  key_prefix          VARCHAR(12),                       -- préfixe affichable, ex. CLN-A3F9
  created_at          DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at          DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- ============================================================
-- TABLE 1 — USERS  (avec clinic_id)
-- ============================================================
CREATE TABLE IF NOT EXISTS users (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  clinic_id     INT UNSIGNED,                          -- ← clé d'isolation
  matricule     VARCHAR(20) NOT NULL UNIQUE,
  nom           VARCHAR(100) NOT NULL,
  prenom        VARCHAR(100) NOT NULL,
  email         VARCHAR(150) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  role          ENUM('admin','doctor','pharmacist','secretary','nurse','lab_technician','super_admin') NOT NULL,
  telephone     VARCHAR(20),
  photo_url     VARCHAR(500),
  statut        ENUM('actif','conge','inactif') DEFAULT 'actif',
  last_login    DATETIME,
  doctor_id     INT UNSIGNED,
  created_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (clinic_id) REFERENCES clinics(id) ON DELETE SET NULL,
  INDEX idx_clinic    (clinic_id),
  INDEX idx_email     (email),
  INDEX idx_role      (role)
) ENGINE=InnoDB;

-- ============================================================
-- TABLE 2 — PATIENTS  (avec clinic_id)
-- ============================================================
CREATE TABLE IF NOT EXISTS patients (
  id                    INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  clinic_id             INT UNSIGNED NOT NULL,          -- ← clé d'isolation
  cin_numero            VARCHAR(20) NOT NULL,
  cin_type              ENUM('CIN','Passeport','CarteSejour','LaissezPasser') NOT NULL DEFAULT 'CIN',
  cin_date_expiration   DATE NOT NULL,
  cin_est_verifiee      BOOLEAN DEFAULT FALSE,
  cin_methode_verif     ENUM('Non_verifie','IA_OCR','Manuel') DEFAULT 'Non_verifie',
  numero_dossier        VARCHAR(20) NOT NULL,
  nom                   VARCHAR(100) NOT NULL,
  prenom                VARCHAR(100) NOT NULL,
  date_naissance        DATE NOT NULL,
  lieu_naissance        VARCHAR(100),
  sexe                  ENUM('M','F') NOT NULL,
  telephone_principal   VARCHAR(20) NOT NULL,
  telephone_secondaire  VARCHAR(20),
  email                 VARCHAR(150),
  adresse_rue           VARCHAR(200),
  adresse_ville         VARCHAR(100),
  adresse_code_postal   VARCHAR(10),
  contact_urgence_nom   VARCHAR(200),
  contact_urgence_tel   VARCHAR(20),
  assurance_organisme   VARCHAR(150),
  assurance_numero      VARCHAR(100),
  assurance_taux        DECIMAL(5,2),
  medecin_traitant_id   INT UNSIGNED,
  photo_url             VARCHAR(500),
  qr_code_token         VARCHAR(255),
  cree_par_user_id      INT UNSIGNED NOT NULL,
  created_at            DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at            DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE INDEX idx_cin_par_clinique (clinic_id, cin_numero),  -- CIN unique par clinique
  UNIQUE INDEX idx_dossier_par_clinique (clinic_id, numero_dossier),
  FOREIGN KEY (clinic_id)          REFERENCES clinics(id) ON DELETE CASCADE,
  FOREIGN KEY (medecin_traitant_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (cree_par_user_id)   REFERENCES users(id),
  INDEX idx_nom_prenom (nom, prenom),
  INDEX idx_telephone  (telephone_principal)
) ENGINE=InnoDB;

-- ============================================================
-- TABLE 3 — CIN_SCANS  (avec clinic_id)
-- ============================================================
CREATE TABLE IF NOT EXISTS cin_scans (
  id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  clinic_id       INT UNSIGNED,
  patient_id      INT UNSIGNED,
  cin_numero      VARCHAR(20) NOT NULL,
  face            ENUM('recto','verso') NOT NULL,
  fichier_nom     VARCHAR(255) NOT NULL,
  fichier_path    VARCHAR(500) NOT NULL,
  fichier_taille  INT UNSIGNED,
  fichier_format  VARCHAR(50),
  fichier_hash    VARCHAR(64),
  ocr_effectue    BOOLEAN DEFAULT FALSE,
  ocr_donnees     JSON,
  ocr_confiance   DECIMAL(5,2),
  ocr_date        DATETIME,
  uploade_par_user_id INT UNSIGNED NOT NULL,
  uploaded_at     DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (clinic_id)           REFERENCES clinics(id) ON DELETE SET NULL,
  FOREIGN KEY (patient_id)          REFERENCES patients(id) ON DELETE CASCADE,
  FOREIGN KEY (uploade_par_user_id) REFERENCES users(id),
  INDEX idx_clinic    (clinic_id),
  INDEX idx_patient   (patient_id),
  INDEX idx_cin       (cin_numero)
) ENGINE=InnoDB;

-- ============================================================
-- TABLE 4 — DOSSIERS_MEDICAUX  (lié au patient, pas de clinic_id propre)
-- ============================================================
CREATE TABLE IF NOT EXISTS dossiers_medicaux (
  id                  INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  patient_id          INT UNSIGNED NOT NULL UNIQUE,
  groupe_sanguin      ENUM('A+','A-','B+','B-','AB+','AB-','O+','O-'),
  allergies           JSON,
  maladies_chroniques JSON,
  antecedents_chirurgi JSON,
  traitements_cours   JSON,
  taille_cm           DECIMAL(5,1),
  poids_kg            DECIMAL(5,1),
  updated_at          DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ============================================================
-- TABLE 5 — MEDECINS  (avec clinic_id)
-- ============================================================
CREATE TABLE IF NOT EXISTS medecins (
  id                  INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  clinic_id           INT UNSIGNED,                    -- ← clé d'isolation
  user_id             INT UNSIGNED NOT NULL UNIQUE,
  matricule           VARCHAR(20) NOT NULL UNIQUE,
  titre               ENUM('Dr.','Pr.','Chirurgien') DEFAULT 'Dr.',
  numero_ordre        VARCHAR(50) NOT NULL UNIQUE,
  specialites         JSON NOT NULL,
  date_debut          DATE NOT NULL,
  salle_consultation  VARCHAR(50),
  tarif_standard_ttc  DECIMAL(10,2),
  tarif_urgence_ttc   DECIMAL(10,2),
  duree_rdv_minutes   INT DEFAULT 30,
  statut              ENUM('actif','conge','inactif') DEFAULT 'actif',
  FOREIGN KEY (clinic_id) REFERENCES clinics(id) ON DELETE SET NULL,
  FOREIGN KEY (user_id)   REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_clinic (clinic_id)
) ENGINE=InnoDB;

-- ============================================================
-- TABLE 6 — RENDEZ_VOUS  (avec clinic_id)
-- ============================================================
CREATE TABLE IF NOT EXISTS rendez_vous (
  id                INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  clinic_id         INT UNSIGNED NOT NULL,             -- ← clé d'isolation
  numero_rdv        VARCHAR(20) NOT NULL UNIQUE,
  patient_id        INT UNSIGNED NOT NULL,
  patient_cin       VARCHAR(20) NOT NULL,
  medecin_id        INT UNSIGNED NOT NULL,
  date_rdv          DATE NOT NULL,
  heure_debut       TIME NOT NULL,
  heure_fin         TIME NOT NULL,
  type_consultation ENUM('premiere','suivi','urgente','bilan','vaccination','teleconsultation') NOT NULL,
  mode              ENUM('presentiel','teleconsultation') DEFAULT 'presentiel',
  motif             TEXT NOT NULL,
  statut            ENUM('planifie','confirme','arrive','pret','en_cours','termine','reporte','annule','non_presente') DEFAULT 'planifie',
  salle             VARCHAR(50),
  vitals            JSON,
  heure_arrivee     DATETIME,
  pointe_par        INT UNSIGNED,
  mode_pointage     ENUM('saisie_cin','scan_cin','qr_code','app_mobile'),
  rappel_24h_envoye BOOLEAN DEFAULT FALSE,
  est_facture       BOOLEAN DEFAULT FALSE,
  cree_par          INT UNSIGNED NOT NULL,
  created_at        DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at        DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (clinic_id)  REFERENCES clinics(id) ON DELETE CASCADE,
  FOREIGN KEY (patient_id) REFERENCES patients(id),
  FOREIGN KEY (medecin_id) REFERENCES medecins(id),
  FOREIGN KEY (pointe_par) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (cree_par)   REFERENCES users(id),
  INDEX idx_clinic        (clinic_id),
  INDEX idx_patient_cin   (patient_cin),
  INDEX idx_date          (date_rdv),
  INDEX idx_medecin_date  (medecin_id, date_rdv),
  INDEX idx_statut        (statut)
) ENGINE=InnoDB;

-- ============================================================
-- TABLE 7 — POINTAGES  (avec clinic_id)
-- ============================================================
CREATE TABLE IF NOT EXISTS pointages (
  id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  clinic_id       INT UNSIGNED,
  patient_id      INT UNSIGNED NOT NULL,
  patient_cin     VARCHAR(20) NOT NULL,
  rdv_id          INT UNSIGNED,
  heure_arrivee   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  mode_pointage   ENUM('saisie_cin','scan_cin','qr_code','app_mobile') NOT NULL,
  pointe_par      INT UNSIGNED NOT NULL,
  cin_expiree     BOOLEAN DEFAULT FALSE,
  impaye_detecte  BOOLEAN DEFAULT FALSE,
  FOREIGN KEY (clinic_id)  REFERENCES clinics(id) ON DELETE SET NULL,
  FOREIGN KEY (patient_id) REFERENCES patients(id),
  FOREIGN KEY (rdv_id)     REFERENCES rendez_vous(id) ON DELETE SET NULL,
  FOREIGN KEY (pointe_par) REFERENCES users(id),
  INDEX idx_clinic (clinic_id),
  INDEX idx_cin    (patient_cin),
  INDEX idx_date   (heure_arrivee)
) ENGINE=InnoDB;

-- ============================================================
-- TABLE 8 — CHAMBRES  (avec clinic_id)
-- ============================================================
CREATE TABLE IF NOT EXISTS chambres (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  clinic_id     INT UNSIGNED,
  numero        VARCHAR(20) NOT NULL,
  type_chambre  ENUM('suite','privee','double','commune','urgences','usi') NOT NULL,
  nb_lits       TINYINT NOT NULL,
  tarif_ttc     DECIMAL(10,2),
  statut        ENUM('disponible','occupee','hors_service') DEFAULT 'disponible',
  equipements   JSON,
  UNIQUE INDEX idx_num_par_clinique (clinic_id, numero),
  FOREIGN KEY (clinic_id) REFERENCES clinics(id) ON DELETE SET NULL,
  INDEX idx_statut (statut)
) ENGINE=InnoDB;

-- ============================================================
-- TABLE 9 — PRODUITS_PHARMACIE  (avec clinic_id)
-- ============================================================
CREATE TABLE IF NOT EXISTS produits_pharmacie (
  id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  clinic_id       INT UNSIGNED,
  code_produit    VARCHAR(20) NOT NULL,
  dci             VARCHAR(200) NOT NULL,
  nom_commercial  VARCHAR(200) NOT NULL,
  forme           ENUM('comprime','sirop','injectable','pommade','autre') NOT NULL,
  dosage          VARCHAR(100),
  categorie       VARCHAR(100) NOT NULL DEFAULT 'medicament',
  prix_achat      DECIMAL(10,2),
  prix_vente      DECIMAL(10,2),
  stock_minimum   INT NOT NULL DEFAULT 10,
  stock_actuel    INT NOT NULL DEFAULT 0,
  actif           BOOLEAN DEFAULT TRUE,
  UNIQUE INDEX idx_code_par_clinique (clinic_id, code_produit),
  FOREIGN KEY (clinic_id) REFERENCES clinics(id) ON DELETE SET NULL,
  INDEX idx_stock (stock_actuel)
) ENGINE=InnoDB;

-- ============================================================
-- TABLE 10 — EXAMENS_CATALOG  (catalogue global, pas de clinic_id)
-- ============================================================
CREATE TABLE IF NOT EXISTS examens_catalog (
  id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  code            VARCHAR(20) NOT NULL UNIQUE,
  nom             VARCHAR(200) NOT NULL,
  type            ENUM('laboratoire','radiologie') NOT NULL,
  categorie       VARCHAR(100),
  prix_standard   DECIMAL(10,2) NOT NULL,
  actif           BOOLEAN DEFAULT TRUE
) ENGINE=InnoDB;

-- ============================================================
-- TABLE 11 — EXAMENS_PATIENTS  (avec clinic_id)
-- ============================================================
CREATE TABLE IF NOT EXISTS examens_patients (
  id                  INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  clinic_id           INT UNSIGNED,
  patient_id          INT UNSIGNED NOT NULL,
  medecin_id          INT UNSIGNED NOT NULL,
  consultation_id     INT UNSIGNED,
  examen_id           INT UNSIGNED NOT NULL,
  statut              ENUM('en_attente','preleve','en_cours','termine','annule') DEFAULT 'en_attente',
  resultats           TEXT,
  fichier_resultat    VARCHAR(500),
  notes_obligatoires  TEXT,
  prix_facture        DECIMAL(10,2),
  date_resultat_prevue DATETIME,
  est_facture         BOOLEAN DEFAULT FALSE,
  created_at          DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at          DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (clinic_id)      REFERENCES clinics(id) ON DELETE SET NULL,
  FOREIGN KEY (patient_id)     REFERENCES patients(id),
  FOREIGN KEY (medecin_id)     REFERENCES medecins(id),
  FOREIGN KEY (examen_id)      REFERENCES examens_catalog(id),
  FOREIGN KEY (consultation_id) REFERENCES rendez_vous(id) ON DELETE SET NULL,
  INDEX idx_clinic    (clinic_id),
  INDEX idx_patient   (patient_id)
) ENGINE=InnoDB;

-- ============================================================
-- TABLE 12 — FACTURES  (avec clinic_id)
-- ============================================================
CREATE TABLE IF NOT EXISTS factures (
  id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  clinic_id       INT UNSIGNED,
  numero_facture  VARCHAR(20) NOT NULL,
  patient_id      INT UNSIGNED,
  patient_cin     VARCHAR(20) NOT NULL,
  rdv_id          INT UNSIGNED,
  sous_total      DECIMAL(10,2) DEFAULT 0,
  tva             DECIMAL(10,2) DEFAULT 0,
  total_ttc       DECIMAL(10,2) NOT NULL,
  assurance_taux  INT DEFAULT 0,
  part_assurance  DECIMAL(10,2) DEFAULT 0,
  reste_a_charge  DECIMAL(10,2) NOT NULL,
  statut          ENUM('en_attente','payee','annulee','impayee','partielle') DEFAULT 'en_attente',
  mode_paiement   VARCHAR(50),
  date_paiement   DATETIME,
  notes           TEXT,
  cree_par        INT UNSIGNED NOT NULL,
  created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE INDEX idx_facture_par_clinique (clinic_id, numero_facture),
  FOREIGN KEY (clinic_id)  REFERENCES clinics(id) ON DELETE SET NULL,
  FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE SET NULL,
  FOREIGN KEY (rdv_id)     REFERENCES rendez_vous(id) ON DELETE SET NULL,
  FOREIGN KEY (cree_par)   REFERENCES users(id),
  INDEX idx_cin    (patient_cin),
  INDEX idx_statut (statut)
) ENGINE=InnoDB;

-- ============================================================
-- TABLE 13 — LIGNES_FACTURE
-- ============================================================
CREATE TABLE IF NOT EXISTS lignes_facture (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  facture_id    INT UNSIGNED NOT NULL,
  source_type   VARCHAR(50),
  source_id     INT UNSIGNED,
  designation   VARCHAR(200) NOT NULL,
  quantite      DECIMAL(10,2) NOT NULL,
  prix_unitaire DECIMAL(10,2) NOT NULL,
  montant_total DECIMAL(10,2) NOT NULL,
  FOREIGN KEY (facture_id) REFERENCES factures(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ============================================================
-- TABLE 14 — ABSENCES_MEDECINS
-- ============================================================
CREATE TABLE IF NOT EXISTS absences_medecins (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  medecin_id    INT UNSIGNED NOT NULL,
  type_absence  ENUM('conge_annuel','maladie','formation','sans_solde','autre') NOT NULL,
  date_debut    DATE NOT NULL,
  date_fin      DATE NOT NULL,
  motif         TEXT NOT NULL,
  statut        ENUM('en_attente','valide','refuse') DEFAULT 'en_attente',
  traite_par    INT UNSIGNED,
  created_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (medecin_id) REFERENCES medecins(id) ON DELETE CASCADE,
  FOREIGN KEY (traite_par) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_medecin (medecin_id),
  INDEX idx_dates   (date_debut, date_fin)
) ENGINE=InnoDB;

-- ============================================================
-- TABLE 16 — HOSPITALISATIONS  (avec clinic_id)
-- Note : createdAt / updatedAt en camelCase, comme déclaré dans le modèle Sequelize
-- ============================================================
CREATE TABLE IF NOT EXISTS hospitalisations (
  id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  clinic_id       INT UNSIGNED,
  patient_id      INT UNSIGNED NOT NULL,
  medecin_id      INT UNSIGNED NOT NULL,
  nurse_id        INT UNSIGNED,
  chambre_id      INT UNSIGNED,
  lit             VARCHAR(50),
  diagnostic      VARCHAR(255),
  motif           TEXT,
  date_admission  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  date_sortie     DATETIME,
  date_sortie_estimee DATE,
  etat            ENUM('stable','surveillance','critique') DEFAULT 'stable',
  statut          ENUM('demande','admis','sortie_demandee','termine','annule') DEFAULT 'demande',
  est_facture     BOOLEAN DEFAULT FALSE,
  createdAt       DATETIME DEFAULT CURRENT_TIMESTAMP,
  updatedAt       DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (clinic_id)  REFERENCES clinics(id)  ON DELETE SET NULL,
  FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE,
  FOREIGN KEY (medecin_id) REFERENCES medecins(id) ON DELETE CASCADE,
  FOREIGN KEY (nurse_id)   REFERENCES users(id)    ON DELETE SET NULL,
  FOREIGN KEY (chambre_id) REFERENCES chambres(id) ON DELETE SET NULL,
  INDEX idx_clinic (clinic_id),
  INDEX idx_statut (statut)
) ENGINE=InnoDB;

-- ============================================================
-- TABLE 17 — HOSPITALISATION_SOINS
-- ============================================================
CREATE TABLE IF NOT EXISTS hospitalisation_soins (
  id                  INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  hospitalisation_id  INT UNSIGNED NOT NULL,
  type_soin           ENUM('pansement','perfusion','injection','catheter','oxygene','autre') NOT NULL,
  notes               TEXT,
  realise_par         INT UNSIGNED NOT NULL,
  realise_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (hospitalisation_id) REFERENCES hospitalisations(id) ON DELETE CASCADE,
  FOREIGN KEY (realise_par)        REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ============================================================
-- TABLE 18 — HOSPITALISATION_VITALS
-- ============================================================
CREATE TABLE IF NOT EXISTS hospitalisation_vitals (
  id                  INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  hospitalisation_id  INT UNSIGNED NOT NULL,
  temperature         VARCHAR(20),
  tension             VARCHAR(20),
  saturation          VARCHAR(20),
  glycemie            VARCHAR(20),
  pouls               VARCHAR(20),
  respiration         VARCHAR(20),
  poids               VARCHAR(20),
  pris_par            INT UNSIGNED NOT NULL,
  pris_at             DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (hospitalisation_id) REFERENCES hospitalisations(id) ON DELETE CASCADE,
  FOREIGN KEY (pris_par)           REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ============================================================
-- TABLE 19 — HOSPITALISATION_ALERTES
-- ============================================================
CREATE TABLE IF NOT EXISTS hospitalisation_alertes (
  id                  INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  hospitalisation_id  INT UNSIGNED NOT NULL,
  type_alerte         ENUM('temperature','tension','saturation','douleur','refus_traitement','perfusion','malaise','chute','urgence') NOT NULL,
  description         TEXT,
  urgency             ENUM('normal','urgent','critique') DEFAULT 'normal',
  statut              ENUM('active','resolue') DEFAULT 'active',
  cree_at             DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  resolu_at           DATETIME,
  resolu_par          INT UNSIGNED,
  FOREIGN KEY (hospitalisation_id) REFERENCES hospitalisations(id) ON DELETE CASCADE,
  FOREIGN KEY (resolu_par)         REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

-- ============================================================
-- TABLE 20 — PRESCRIPTIONS  (ordonnances, avec clinic_id — cf. migration 001)
-- ============================================================
CREATE TABLE IF NOT EXISTS prescriptions (
  id                    INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  clinic_id             INT UNSIGNED,
  numero                VARCHAR(20) UNIQUE,
  patient_cin           VARCHAR(10) NOT NULL,
  medecin_id            INT UNSIGNED NOT NULL,
  rdv_id                INT UNSIGNED,
  hospitalisation_id    INT UNSIGNED,                  -- ordonnance de traitement d'une hospitalisation
  dispense_par_user_id  INT UNSIGNED,
  medicaments           TEXT NOT NULL,                 -- JSON
  slots                 TEXT,                          -- JSON : créneaux d'administration infirmier
  statut                ENUM('en_attente','en_preparation','preparee','remise','administree') DEFAULT 'en_attente',
  notes                 TEXT,
  diagnostique          TEXT,
  facturee              BOOLEAN DEFAULT FALSE,
  created_at            DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at            DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (clinic_id) REFERENCES clinics(id) ON DELETE SET NULL,
  INDEX idx_prescriptions_clinic (clinic_id),
  INDEX idx_prescriptions_hospitalisation (hospitalisation_id),
  INDEX idx_patient_cin (patient_cin)
) ENGINE=InnoDB;

-- ============================================================
-- DONNÉES DE DÉMO — Clinique de test (admin: admin@demo.test / admin123)
-- ============================================================

-- Clinique de démo
INSERT INTO clinics (name, type, specialite, email, subscription_status) VALUES
('Clinique Al-Shifa (Démo)', 'Starter', 'general', 'contact@alshifa.test', 'trial');

-- Admin de démo (mot de passe : admin123)
-- Hash bcrypt de 'admin123'
INSERT INTO users (clinic_id, matricule, nom, prenom, email, password_hash, role, statut) VALUES
(1, 'ADM-2026-0001', 'Admin', 'Demo', 'admin@demo.test',
 '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMeJfhN0p1m3u8vXrKjB9a2H2e', 'admin', 'actif');
