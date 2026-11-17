-- ============================================================
-- ClinicSoft — Schéma MySQL Complet
-- Base de données : clinicsoft_db
-- Charset : utf8mb4 (support arabe/accents)
-- ============================================================

CREATE DATABASE IF NOT EXISTS clinicsoft_db
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE clinicsoft_db;

-- ============================================================
-- TABLE 1 — USERS
-- ============================================================
CREATE TABLE users (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  matricule     VARCHAR(20) NOT NULL UNIQUE,
  nom           VARCHAR(100) NOT NULL,
  prenom        VARCHAR(100) NOT NULL,
  email         VARCHAR(150) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  role          ENUM('admin','doctor','pharmacist','secretary') NOT NULL,
  telephone     VARCHAR(20),
  photo_url     VARCHAR(500),
  statut        ENUM('actif','conge','inactif') DEFAULT 'actif',
  last_login    DATETIME,
  created_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_email  (email),
  INDEX idx_role   (role)
) ENGINE=InnoDB;

-- ============================================================
-- TABLE 2 — PATIENTS (CIN = identifiant principal)
-- ============================================================
CREATE TABLE patients (
  id                    INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  cin_numero            VARCHAR(20) NOT NULL UNIQUE,
  cin_type              ENUM('CIN','Passeport','CarteSejour','LaissezPasser') NOT NULL DEFAULT 'CIN',
  cin_date_expiration   DATE NOT NULL,
  cin_est_verifiee      BOOLEAN DEFAULT FALSE,
  cin_methode_verif     ENUM('Non_verifie','IA_OCR','Manuel') DEFAULT 'Non_verifie',
  numero_dossier        VARCHAR(20) NOT NULL UNIQUE,
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
  qr_code_token         VARCHAR(255) UNIQUE,
  cree_par_user_id      INT UNSIGNED NOT NULL,
  created_at            DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at            DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (medecin_traitant_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (cree_par_user_id) REFERENCES users(id),
  UNIQUE INDEX idx_cin (cin_numero),
  INDEX idx_nom_prenom (nom, prenom),
  INDEX idx_telephone (telephone_principal)
) ENGINE=InnoDB;

-- ============================================================
-- TABLE 3 — CIN_SCANS
-- ============================================================
CREATE TABLE cin_scans (
  id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  patient_id      INT UNSIGNED NOT NULL,
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
  FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE,
  FOREIGN KEY (uploade_par_user_id) REFERENCES users(id),
  INDEX idx_patient_id (patient_id),
  INDEX idx_cin (cin_numero)
) ENGINE=InnoDB;

-- ============================================================
-- TABLE 4 — DOSSIERS_MEDICAUX
-- ============================================================
CREATE TABLE dossiers_medicaux (
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
-- TABLE 5 — MEDECINS
-- ============================================================
CREATE TABLE medecins (
  id                  INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
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
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ============================================================
-- TABLE 6 — RENDEZ_VOUS
-- ============================================================
CREATE TABLE rendez_vous (
  id                INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
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
  statut            ENUM('planifie','confirme','arrive','en_cours','termine','reporte','annule','non_presente') DEFAULT 'planifie',
  salle             VARCHAR(50),
  heure_arrivee     DATETIME,
  pointe_par        INT UNSIGNED,
  mode_pointage     ENUM('saisie_cin','scan_cin','qr_code','app_mobile'),
  rappel_24h_envoye BOOLEAN DEFAULT FALSE,
  cree_par          INT UNSIGNED NOT NULL,
  created_at        DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at        DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (patient_id) REFERENCES patients(id),
  FOREIGN KEY (medecin_id) REFERENCES medecins(id),
  FOREIGN KEY (pointe_par) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (cree_par) REFERENCES users(id),
  INDEX idx_patient_cin (patient_cin),
  INDEX idx_date (date_rdv),
  INDEX idx_medecin_date (medecin_id, date_rdv),
  INDEX idx_statut (statut)
) ENGINE=InnoDB;

-- ============================================================
-- TABLE 7 — POINTAGES (Check-in)
-- ============================================================
CREATE TABLE pointages (
  id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  patient_id      INT UNSIGNED NOT NULL,
  patient_cin     VARCHAR(20) NOT NULL,
  rdv_id          INT UNSIGNED,
  heure_arrivee   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  mode_pointage   ENUM('saisie_cin','scan_cin','qr_code','app_mobile') NOT NULL,
  pointe_par      INT UNSIGNED NOT NULL,
  cin_expiree     BOOLEAN DEFAULT FALSE,
  impaye_detecte  BOOLEAN DEFAULT FALSE,
  FOREIGN KEY (patient_id) REFERENCES patients(id),
  FOREIGN KEY (rdv_id) REFERENCES rendez_vous(id) ON DELETE SET NULL,
  FOREIGN KEY (pointe_par) REFERENCES users(id),
  INDEX idx_cin (patient_cin),
  INDEX idx_date (heure_arrivee)
) ENGINE=InnoDB;

-- ============================================================
-- TABLE 8 — CHAMBRES
-- ============================================================
CREATE TABLE chambres (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  numero        VARCHAR(20) NOT NULL UNIQUE,
  type_chambre  ENUM('suite','privee','double','commune','urgences','usi') NOT NULL,
  nb_lits       TINYINT NOT NULL,
  tarif_ttc     DECIMAL(10,2),
  statut        ENUM('disponible','occupee','hors_service') DEFAULT 'disponible',
  equipements   JSON,
  INDEX idx_statut (statut)
) ENGINE=InnoDB;

-- ============================================================
-- TABLE 9 — SEJOURS
-- ============================================================
CREATE TABLE sejours (
  id                  INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  numero_sejour       VARCHAR(20) NOT NULL UNIQUE,
  patient_id          INT UNSIGNED NOT NULL,
  patient_cin         VARCHAR(20) NOT NULL,
  chambre_id          INT UNSIGNED NOT NULL,
  medecin_referent_id INT UNSIGNED NOT NULL,
  date_admission      DATETIME NOT NULL,
  date_sortie_prevue  DATE,
  date_sortie_reelle  DATETIME,
  motif               TEXT NOT NULL,
  statut              ENUM('en_cours','sorti','transfere') DEFAULT 'en_cours',
  created_at          DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (patient_id) REFERENCES patients(id),
  FOREIGN KEY (chambre_id) REFERENCES chambres(id),
  FOREIGN KEY (medecin_referent_id) REFERENCES medecins(id),
  INDEX idx_cin (patient_cin),
  INDEX idx_statut (statut)
) ENGINE=InnoDB;

-- ============================================================
-- TABLE 10 — PRODUITS_PHARMACIE
-- ============================================================
CREATE TABLE produits_pharmacie (
  id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  code_produit    VARCHAR(20) NOT NULL UNIQUE,
  dci             VARCHAR(200) NOT NULL,
  nom_commercial  VARCHAR(200) NOT NULL,
  forme           ENUM('comprime','sirop','injectable','pommade','autre') NOT NULL,
  dosage          VARCHAR(100),
  categorie       ENUM('medicament','consommable','equipement','laboratoire') NOT NULL,
  prix_achat      DECIMAL(10,2),
  prix_vente      DECIMAL(10,2),
  stock_minimum   INT NOT NULL DEFAULT 10,
  stock_actuel    INT NOT NULL DEFAULT 0,
  actif           BOOLEAN DEFAULT TRUE,
  INDEX idx_code (code_produit),
  INDEX idx_stock (stock_actuel)
) ENGINE=InnoDB;

-- ============================================================
-- TABLE 11 — LOTS_STOCK
-- ============================================================
CREATE TABLE lots_stock (
  id                INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  produit_id        INT UNSIGNED NOT NULL,
  numero_lot        VARCHAR(100) NOT NULL,
  date_peremption   DATE NOT NULL,
  quantite_initiale INT NOT NULL,
  quantite_restante INT NOT NULL,
  reception_par     INT UNSIGNED NOT NULL,
  statut            ENUM('actif','epuise','expire') DEFAULT 'actif',
  FOREIGN KEY (produit_id) REFERENCES produits_pharmacie(id),
  FOREIGN KEY (reception_par) REFERENCES users(id),
  INDEX idx_peremption (date_peremption)
) ENGINE=InnoDB;

-- ============================================================
-- TABLE 12 — DISPENSATIONS
-- ============================================================
CREATE TABLE dispensations (
  id                INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  patient_id        INT UNSIGNED NOT NULL,
  patient_cin       VARCHAR(20) NOT NULL,
  prescripteur_id   INT UNSIGNED NOT NULL,
  pharmacien_id     INT UNSIGNED NOT NULL,
  produit_id        INT UNSIGNED NOT NULL,
  lot_id            INT UNSIGNED NOT NULL,
  quantite          INT NOT NULL,
  date_dispensation DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (patient_id) REFERENCES patients(id),
  FOREIGN KEY (prescripteur_id) REFERENCES users(id),
  FOREIGN KEY (pharmacien_id) REFERENCES users(id),
  FOREIGN KEY (produit_id) REFERENCES produits_pharmacie(id),
  FOREIGN KEY (lot_id) REFERENCES lots_stock(id),
  INDEX idx_cin (patient_cin),
  INDEX idx_date (date_dispensation)
) ENGINE=InnoDB;

-- ============================================================
-- TABLE 13 — FACTURES
-- ============================================================
CREATE TABLE factures (
  id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  numero_facture  VARCHAR(20) NOT NULL UNIQUE,
  patient_id      INT UNSIGNED NOT NULL,
  patient_cin     VARCHAR(20) NOT NULL,
  date_facture    DATE NOT NULL,
  total_ttc       DECIMAL(10,2) NOT NULL,
  part_assurance  DECIMAL(10,2) DEFAULT 0,
  reste_a_charge  DECIMAL(10,2) NOT NULL,
  statut          ENUM('impayee','partielle','payee','annulee') DEFAULT 'impayee',
  mode_paiement   ENUM('especes','cheque','virement','carte','tiers_payant'),
  date_paiement   DATETIME,
  cree_par        INT UNSIGNED NOT NULL,
  created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (patient_id) REFERENCES patients(id),
  FOREIGN KEY (cree_par) REFERENCES users(id),
  INDEX idx_cin (patient_cin),
  INDEX idx_statut (statut)
) ENGINE=InnoDB;

-- ============================================================
-- TABLE 14 — LIGNES_FACTURE
-- ============================================================
CREATE TABLE lignes_facture (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  facture_id    INT UNSIGNED NOT NULL,
  designation   VARCHAR(200) NOT NULL,
  quantite      DECIMAL(10,2) NOT NULL,
  prix_unitaire DECIMAL(10,2) NOT NULL,
  montant_total DECIMAL(10,2) NOT NULL,
  FOREIGN KEY (facture_id) REFERENCES factures(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ============================================================
-- TABLE 15 — ABSENCES_MEDECINS
-- ============================================================
CREATE TABLE absences_medecins (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  medecin_id    INT UNSIGNED NOT NULL,
  type_absence  ENUM('conge_annuel','maladie','formation','sans_solde','autre') NOT NULL,
  date_debut    DATE NOT NULL,
  date_fin      DATE NOT NULL,
  nombre_jours  INT GENERATED ALWAYS AS (DATEDIFF(date_fin, date_debut) + 1) VIRTUAL,
  motif         TEXT NOT NULL,
  statut        ENUM('en_attente','valide','refuse') DEFAULT 'en_attente',
  traite_par    INT UNSIGNED,
  created_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (medecin_id) REFERENCES medecins(id) ON DELETE CASCADE,
  FOREIGN KEY (traite_par) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_medecin (medecin_id),
  INDEX idx_dates (date_debut, date_fin)
) ENGINE=InnoDB;

-- ============================================================
-- TABLE 16 — AI_LOGS
-- ============================================================
CREATE TABLE ai_logs (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id       INT UNSIGNED NOT NULL,
  patient_cin   VARCHAR(20),
  type_requete  ENUM('resume_patient','chat','ocr_cin') NOT NULL,
  tokens_utilises INT,
  duree_ms      INT,
  statut        ENUM('succes','erreur','timeout') DEFAULT 'succes',
  created_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id),
  INDEX idx_user (user_id),
  INDEX idx_type (type_requete)
) ENGINE=InnoDB;

-- ============================================================
-- DONNÉES DE TEST (SEED)
-- ============================================================
INSERT INTO users (matricule, nom, prenom, email, password_hash, role) VALUES
('ADMIN001', 'Admin',   'System',  'admin@clinicsoft.test',        '$2b$12$placeholder', 'admin'),
('MED0042',  'Benali',  'Ahmed',   'dr.benali@clinic.test',        '$2b$12$placeholder', 'doctor'),
('MED0043',  'Berrada', 'Nadia',   'n.berrada@clinicsoft.test',    '$2b$12$placeholder', 'doctor'),
('PHA001',   'Idrissi', 'Youssef', 'pharm.idrissi@clinic.test',    '$2b$12$placeholder', 'pharmacist'),
('SEC001',   'Amrani',  'Fatima',  'sec.amrani@clinic.test',       '$2b$12$placeholder', 'secretary');

INSERT INTO patients (cin_numero, cin_date_expiration, cin_est_verifiee, cin_methode_verif, numero_dossier, nom, prenom, date_naissance, sexe, telephone_principal, cree_par_user_id) VALUES
('BK456789', '2029-08-20', TRUE,  'IA_OCR',       'PAT-2026-00101', 'MARTIN',      'Sophie',  '1992-04-12', 'F', '06 12 34 56 78', 5),
('A123456',  '2027-05-10', TRUE,  'Manuel',       'PAT-2026-00102', 'BERNARD',     'Thomas',  '1974-06-18', 'M', '07 98 76 54 32', 5),
('CD789012', '2023-12-31', FALSE, 'Non_verifie',  'PAT-2026-00103', 'KADDOUR',     'Leïla',   '1998-09-03', 'F', '06 55 44 33 22', 5),
('T456123',  '2028-03-15', TRUE,  'IA_OCR',       'PAT-2026-00104', 'TAHIRI',      'Karim',   '1981-03-15', 'M', '06 77 88 99 00', 5),
('BE345678', '2030-11-05', TRUE,  'Manuel',       'PAT-2026-00105', 'ALAMI',       'Mohamed', '1980-05-12', 'M', '06 11 22 33 44', 5),
('GH234567', '2027-09-22', TRUE,  'IA_OCR',       'PAT-2026-00106', 'ALAMI',       'Mohamed', '1995-11-03', 'M', '06 99 88 77 66', 5),
('BK987654', '2026-01-15', TRUE,  'Manuel',       'PAT-2026-00107', 'EL MANSOURI', 'Youssef', '1959-07-28', 'M', '06 44 55 66 77', 5);
