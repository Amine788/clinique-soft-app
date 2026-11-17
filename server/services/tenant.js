// Filtre explicite par clinique : le hook multi-tenant de models/index.js ne filtre pas les lectures
// (AUDIT_CODE.md 2.#20). Sans clinique (super-admin), aucun filtre n'est ajouté.
export const inClinic = (req, where = {}) => {
    if (!req.user?.clinic_id) throw Object.assign(new Error('Clinique requise'), { status: 403 });
    return { ...where, clinic_id: req.user.clinic_id };
};

export const byIdInClinic = req => ({ where: inClinic(req, { id: req.params.id }) });
