// Fonctions partagées par les routes « admin ».
// ─────────────────────────────────────────────────────────────────────────────
// Helper — récupère le clinic_id de l'admin et lève une erreur si absent
// ─────────────────────────────────────────────────────────────────────────────
export function getClinicId(req, res) {
    const clinicId = req.user.clinic_id || req.user.clinicId || null;
    if (!clinicId) {
        res.status(403).json({ error: 'Clinique non définie pour cet administrateur' });
        return null;
    }
    return clinicId;
}

// Rôles qu'un admin peut attribuer dans sa clinique (jamais super_admin ni un rôle inventé)
export const ROLES_CLINIQUE = ['doctor', 'secretary', 'pharmacist', 'lab_technician', 'nurse', 'admin'];
