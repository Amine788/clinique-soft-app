-- ============================================================
-- Migration 002 — rôle super_admin + colonnes de clé de licence  (étape 5.3)
-- Base : clinicsoft_db — pour une base EXISTANTE.
-- (Une base neuve créée avec setup_mysql.sql à jour n'en a pas besoin.)
--
-- Les tables absentes (departements, hospitalisations*, prescriptions) n'ont pas
-- besoin de migration : sequelize.sync() les crée au démarrage si elles manquent.
--
-- Sauvegarde conseillée : phpMyAdmin > base clinicsoft_db > Exporter.
-- ============================================================

-- ------------------------------------------------------------
-- A) DIAGNOSTIC (lecture seule) — à lancer d'abord
-- ------------------------------------------------------------
-- A1) Type actuel de users.role : si c'est un ENUM sans 'super_admin', appliquer B1.
--     Si c'est VARCHAR(50) (table créée par Sequelize), NE PAS appliquer B1.
SELECT column_type FROM information_schema.columns
WHERE table_schema = DATABASE() AND table_name = 'users' AND column_name = 'role';

-- A2) Colonnes de clé de licence déjà présentes dans clinics ? (0 ligne = absentes, appliquer B2)
SELECT column_name FROM information_schema.columns
WHERE table_schema = DATABASE() AND table_name = 'clinics' AND column_name IN ('key_hash', 'key_prefix');

-- ------------------------------------------------------------
-- B) MODIFICATIONS — selon le diagnostic
-- ------------------------------------------------------------
-- B1) Ajouter 'super_admin' à l'ENUM du rôle (seulement si A1 montre un ENUM sans super_admin).
--     Sans cela, la création automatique du compte super-admin au démarrage échoue
--     (index.js) et le serveur s'arrête.
ALTER TABLE users
  MODIFY role ENUM('admin','doctor','pharmacist','secretary','nurse','lab_technician','super_admin') NOT NULL;

-- B2) Colonnes de clé de licence (seulement si A2 ne renvoie rien).
--     Sans elles, l'inscription d'une clinique (POST /auth/register, /auth/register-clinic)
--     échoue avec « Unknown column 'key_hash' ».
--     XAMPP fournit MariaDB, qui accepte IF NOT EXISTS ; sous MySQL 8, retirer « IF NOT EXISTS ».
ALTER TABLE clinics
  ADD COLUMN IF NOT EXISTS key_hash   VARCHAR(64) NULL UNIQUE AFTER active_modules,
  ADD COLUMN IF NOT EXISTS key_prefix VARCHAR(12) NULL AFTER key_hash;

-- ------------------------------------------------------------
-- C) VÉRIFICATION (lecture seule)
-- ------------------------------------------------------------
SELECT table_name, column_name, column_type
FROM information_schema.columns
WHERE table_schema = DATABASE()
  AND ((table_name = 'users' AND column_name = 'role')
    OR (table_name = 'clinics' AND column_name IN ('key_hash', 'key_prefix')));
