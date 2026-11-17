-- ============================================================
-- Migration 006 — types d'alerte « pouls » et « glycemie » (P15)
-- Base : clinicsoft_db — pour une base EXISTANTE (table créée par sequelize.sync).
--
-- OBLIGATOIRE avant de déployer le code : sans ces valeurs, MySQL refuse l'alerte
-- et la saisie de constantes avec un pouls ou une glycémie anormal renvoie 500.
-- ============================================================

-- A) DIAGNOSTIC (lecture seule) : la liste doit contenir 'pouls' et 'glycemie' après B
SELECT column_type FROM information_schema.columns
WHERE table_schema = DATABASE() AND table_name = 'hospitalisation_alertes' AND column_name = 'type_alerte';

-- B) MIGRATION
ALTER TABLE hospitalisation_alertes MODIFY COLUMN type_alerte
  ENUM('temperature','tension','saturation','pouls','glycemie','douleur','refus_traitement','perfusion','malaise','chute','urgence') NOT NULL;

-- C) VARIANTE POSTGRESQL (déploiement avec DATABASE_URL, ex. Neon) — à la place de B
-- ALTER TYPE "enum_hospitalisation_alertes_type_alerte" ADD VALUE IF NOT EXISTS 'pouls';
-- ALTER TYPE "enum_hospitalisation_alertes_type_alerte" ADD VALUE IF NOT EXISTS 'glycemie';
