-- ============================================================
-- Migration 008 — prolongation de l'essai gratuit par le super-admin
-- Base : clinicsoft_db — pour une base EXISTANTE.
-- (Une base neuve créée avec setup_mysql.sql à jour n'en a pas besoin.)
--
-- OBLIGATOIRE avant de déployer le code : le modèle Clinic lit cette colonne ;
-- sans elle, toute requête authentifiée échoue (la vérification d'abonnement lit la clinique).
-- NULL = fin d'essai calculée (création + 24 h, server/config/trial.js).
-- ============================================================

-- A) DIAGNOSTIC (lecture seule) : 0 ligne = colonne absente, appliquer B
SELECT column_name FROM information_schema.columns
WHERE table_schema = DATABASE() AND table_name = 'clinics' AND column_name = 'trial_ends_at';

-- B) MIGRATION
ALTER TABLE clinics ADD COLUMN trial_ends_at DATETIME NULL AFTER subscription_status;

-- C) CONTRÔLE : cliniques en essai déjà expirées avec la règle des 24 h.
--    À passer en actif ou à prolonger depuis le super-admin avant le déploiement.
SELECT id, name, created_at, DATE_ADD(created_at, INTERVAL 24 HOUR) AS fin_essai
FROM clinics
WHERE subscription_status = 'trial' AND trial_ends_at IS NULL
  AND DATE_ADD(created_at, INTERVAL 24 HOUR) < UTC_TIMESTAMP();

-- D) VARIANTE POSTGRESQL (déploiement avec DATABASE_URL, ex. Neon) — à la place de B
-- ALTER TABLE clinics ADD COLUMN IF NOT EXISTS trial_ends_at TIMESTAMP WITH TIME ZONE;
