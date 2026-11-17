// Fonctions partagées par les routes « patients ».
export const CIN_REGEX = /^[A-Z]{1,2}[0-9]{6}$/;

export const formatInsurance = p => p.assuranceOrganisme
    ? (p.assuranceTaux != null ? `${p.assuranceOrganisme} (${Number(p.assuranceTaux)}%)` : p.assuranceOrganisme)
    : null;
