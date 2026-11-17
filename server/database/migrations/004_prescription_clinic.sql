-- ============================================================
-- Migration 004 — clinique de chaque ordonnance (B13, AUDIT_CODE 2.#3)
-- Base : clinicsoft_db — pour une base EXISTANTE.
--
-- Les routes filtrent désormais les ordonnances par prescriptions.clinic_id.
-- Une ordonnance sans clinic_id n'est plus visible que du super-admin :
-- l'étape C est donc obligatoire, même si la colonne existe déjà.
-- ============================================================

-- A) DIAGNOSTIC (lecture seule) : 0 ligne = colonne absente (table créée par
--    sequelize.sync), appliquer B ; 1 ligne = colonne présente (setup_mysql.sql), passer à C
SELECT column_name FROM information_schema.columns
WHERE table_schema = DATABASE() AND table_name = 'prescriptions' AND column_name = 'clinic_id';

-- B) COLONNE (seulement si A ne renvoie rien)
ALTER TABLE prescriptions
  ADD COLUMN clinic_id INT UNSIGNED NULL AFTER id,
  ADD INDEX idx_prescriptions_clinic (clinic_id);

-- C) REMPLISSAGE : clinique du médecin prescripteur
UPDATE prescriptions p
JOIN medecins m ON m.id = p.medecin_id
SET p.clinic_id = m.clinic_id
WHERE p.clinic_id IS NULL;

-- D) CONTRÔLE : ordonnances restées sans clinique (médecin supprimé ou sans clinique)
SELECT id, numero, patient_cin, medecin_id FROM prescriptions WHERE clinic_id IS NULL;

-- E) VARIANTE POSTGRESQL (déploiement avec DATABASE_URL, ex. Neon) — à la place de B et C
-- ALTER TABLE prescriptions ADD COLUMN IF NOT EXISTS clinic_id INTEGER;
-- CREATE INDEX IF NOT EXISTS idx_prescriptions_clinic ON prescriptions (clinic_id);
-- UPDATE prescriptions p SET clinic_id = m.clinic_id
--   FROM medecins m WHERE m.id = p.medecin_id AND p.clinic_id IS NULL;
