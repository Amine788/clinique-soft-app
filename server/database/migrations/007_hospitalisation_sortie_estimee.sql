-- ============================================================
-- Migration 007 — date de sortie estimée d'une hospitalisation (P17)
-- Base : clinicsoft_db — pour une base EXISTANTE.
-- (Une base neuve créée avec setup_mysql.sql à jour n'en a pas besoin.)
--
-- OBLIGATOIRE avant de déployer le code : le modèle Hospitalisation lit cette
-- colonne ; sans elle, toutes les routes d'hospitalisation renvoient 500.
-- Elle est remplie quand la secrétaire planifie une hospitalisation à la prise de RDV.
-- ============================================================

-- A) DIAGNOSTIC (lecture seule) : 0 ligne = colonne absente, appliquer B
SELECT column_name FROM information_schema.columns
WHERE table_schema = DATABASE() AND table_name = 'hospitalisations' AND column_name = 'date_sortie_estimee';

-- B) MIGRATION
ALTER TABLE hospitalisations
  ADD COLUMN date_sortie_estimee DATE NULL AFTER date_sortie;

-- C) VARIANTE POSTGRESQL (déploiement avec DATABASE_URL, ex. Neon) — à la place de B
-- ALTER TABLE hospitalisations ADD COLUMN IF NOT EXISTS date_sortie_estimee DATE;
