-- ============================================================
-- Migration 009 — raison sociale de la clinique
-- Base : clinicsoft_db — pour une base EXISTANTE.
--
-- clinics.raison_sociale = dénomination légale imprimée en pied de facture et d'ordonnance
-- (ex. « STE … SARL AU »), à côté de l'ICE, l'IF, le RC, la TP et le RIB de la clinique.
-- clinics.name reste le nom d'affichage. Sans raison sociale, les documents impriment le nom.
-- À appliquer AVANT de déployer le serveur : le modèle lit cette colonne à chaque requête sur clinics.
-- ============================================================

-- A) DIAGNOSTIC (lecture seule) : 0 ligne = colonne absente, appliquer B
SELECT column_name FROM information_schema.columns
WHERE table_schema = DATABASE() AND table_name = 'clinics' AND column_name = 'raison_sociale';

-- B) COLONNE
ALTER TABLE clinics ADD COLUMN raison_sociale VARCHAR(200) NULL AFTER name;

-- C) VARIANTE POSTGRESQL (déploiement avec DATABASE_URL, ex. Neon) — à la place de B
-- ALTER TABLE clinics ADD COLUMN IF NOT EXISTS raison_sociale VARCHAR(200);
