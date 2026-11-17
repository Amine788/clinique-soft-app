-- ============================================================
-- Migration 003 — ordonnance de traitement liée à l'hospitalisation (B14)
-- Base : clinicsoft_db — pour une base EXISTANTE.
-- (Une base neuve créée avec setup_mysql.sql à jour n'en a pas besoin.)
--
-- Le serveur démarre avec sequelize.sync({ alter: false }) : la colonne n'est
-- pas ajoutée automatiquement à une table prescriptions existante.
-- Sans elle, les routes d'hospitalisation et d'ordonnances échouent.
-- ============================================================

-- A) DIAGNOSTIC (lecture seule) : 0 ligne = colonne absente, appliquer B
SELECT column_name FROM information_schema.columns
WHERE table_schema = DATABASE() AND table_name = 'prescriptions' AND column_name = 'hospitalisation_id';

-- B) MIGRATION
ALTER TABLE prescriptions
  ADD COLUMN hospitalisation_id INT UNSIGNED NULL AFTER rdv_id,
  ADD INDEX idx_prescriptions_hospitalisation (hospitalisation_id);

-- C) VARIANTE POSTGRESQL (déploiement avec DATABASE_URL, ex. Neon) — à la place de B
-- ALTER TABLE prescriptions ADD COLUMN IF NOT EXISTS hospitalisation_id INTEGER;
-- CREATE INDEX IF NOT EXISTS idx_prescriptions_hospitalisation ON prescriptions (hospitalisation_id);

-- Les traitements d'hospitalisations déjà enregistrés sont repris par le serveur :
-- à la première modification, l'ordonnance correspondante reçoit son hospitalisation_id.
