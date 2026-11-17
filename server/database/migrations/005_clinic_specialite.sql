-- ============================================================
-- Migration 005 — spécialité de la clinique séparée du plan SaaS (B17)
-- Base : clinicsoft_db — pour une base EXISTANTE.
--
-- clinics.type = plan SaaS (Starter / Pro) ; clinics.specialite = spécialité médicale.
-- Avant cette correction, enregistrer la fiche clinique (ou s'inscrire via
-- /register-clinic) écrivait la spécialité dans type, à la place du plan.
-- ============================================================

-- A) DIAGNOSTIC (lecture seule) : 0 ligne = colonne absente, appliquer B
SELECT column_name FROM information_schema.columns
WHERE table_schema = DATABASE() AND table_name = 'clinics' AND column_name = 'specialite';

-- B) COLONNE
ALTER TABLE clinics ADD COLUMN specialite VARCHAR(100) NULL AFTER type;
ALTER TABLE clinics ALTER COLUMN type SET DEFAULT 'Starter';

-- C) REPRISE : une valeur de type qui n'est pas un plan est une spécialité
UPDATE clinics SET specialite = type
WHERE specialite IS NULL AND type IS NOT NULL AND type NOT IN ('Starter', 'Pro');

-- D) CONTRÔLE : cliniques dont le plan a été écrasé. Leur vrai plan est perdu :
--    le super-admin doit le rétablir à la main (Starter ou Pro), par exemple :
--    UPDATE clinics SET type = 'Pro' WHERE id = <id>;
SELECT id, name, type AS plan_actuel, specialite, subscription_status
FROM clinics WHERE type IS NULL OR type NOT IN ('Starter', 'Pro');

-- E) VARIANTE POSTGRESQL (déploiement avec DATABASE_URL, ex. Neon) — à la place de B
-- ALTER TABLE clinics ADD COLUMN IF NOT EXISTS specialite VARCHAR(100);
-- ALTER TABLE clinics ALTER COLUMN type SET DEFAULT 'Starter';
