// Extraction prudente : champs illisibles laissés vides, aucune identité inventée.
const normaliser = value => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
function dateIso(value) {
    const m = value?.match(/(\d{2})\s*[./-]\s*(\d{2})\s*[./-]\s*(\d{4})/);
    if (!m) return null;
    const [, d, month, y] = m;
    const date = new Date(Date.UTC(Number(y), Number(month) - 1, Number(d)));
    return date.getUTCFullYear() === Number(y) && date.getUTCMonth() === Number(month) - 1 && date.getUTCDate() === Number(d) ? y + '-' + month + '-' + d : null;
}
export function parseCinText(text, confidence = 0) {
    const lines = String(text || '').split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    const latin = lines.map(l => l.replace(/[^\p{Script=Latin}\d\s.,:'’/()-]/gu, '').trim());
    const upper = latin.map(normaliser);
    const labelled = (label) => {
        const re = new RegExp('^' + label + '\\s*[:.-]?\\s*(.*)$', 'i');
        for (let i = 0; i < latin.length; i++) {
            const match = normaliser(latin[i]).match(re);
            if (match) {
                const value = match[1] || normaliser(latin[i + 1] || '');
                if (/^[A-Z][A-Z '-]{1,60}$/.test(value) && !/^(NOM|PRENOM|NEE? |DATE |SEXE|CARTE|ROYAUME|NATIONALE)/.test(value)) return value;
            }
        }
        return null;
    };
    const dateLines = upper.map((line, index) => ({ index, value: dateIso(line) })).filter(item => item.value);
    const birthLabel = upper.findIndex(l => /\bNEE? (LE|EN)\b|DATE DE NAISSANCE/.test(l));
    // L'OCR déforme souvent « Né le ». Deux dates distinctes dans l'ordre naissance/validité servent de repères.
    const firstDate = dateLines.length >= 2 && dateLines[0].value < dateLines.at(-1).value ? dateLines[0] : null;
    const birthAt = birthLabel >= 0 ? birthLabel : firstDate?.index ?? -1;
    const expiryAt = upper.findIndex(l => /VALABLE|EXPIRE|EXPIRATION/.test(l));
    const nearbyDate = i => {
        if (i < 0) return null;
        for (let j = i; j <= Math.min(i + 3, upper.length - 1); j++) {
            if (j > i && /VALABLE|EXPIRATION|NEE? LE|NAISSANCE/.test(upper[j])) break;
            const date = dateIso(upper[j]); if (date) return date;
        }
        return null;
    };
    let prenom = labelled('PRENOMS?'), nom = labelled('NOM(?: DE FAMILLE)?');
    // Ancienne CIN : prénom et nom latins juste avant « Né le », seulement si deux lignes nettes.
    if (!prenom && !nom && birthAt >= 2) {
        const candidates = upper.slice(0, birthAt).filter(l => /^[A-Z][A-Z '-]{1,60}$/.test(l) && !/ROYAUME|MAROC|CARTE|NATIONALE|IDENTITE|KINGDOM|MOROCCO|NATIONAL|IDENTITY|VALABLE|DIRECTEUR|GENERAL|SEXE|^ENEIE$|^NEIE$/.test(l) && l.split(/\s+/).every(w => w.length > 1));
        if (candidates.length >= 2) [prenom, nom] = candidates.slice(-2);
    }
    const cin = upper.join('\n').match(/\b[A-Z]{1,2}[ \t]*\d{3}[ \t]*\d{3}\b/)?.[0].replace(/\s/g, '') || null;
    const sexe = upper.join('\n').match(/\bSEXE\s*[:.-]?\s*([MF])\b/)?.[1] || null;
    const birthLines = birthAt < 0 ? '' : upper.slice(birthAt, Math.min(upper.length, birthAt + 5)).join('\n');
    const lieu = birthAt < 0 ? null : birthLines.match(/\d{4}\s+A\s+([A-Z][A-Z '-]+)/)?.[1]?.trim() || birthLines.match(/^A\s+([A-Z][A-Z '-]+)/m)?.[1]?.trim() || null;
    return { cin, nom, prenom, dateNaissance: nearbyDate(birthAt) || firstDate?.value || null, dateExpiration: nearbyDate(expiryAt),
        lieuNaissance: lieu, sexe, adresse: null,
        confiance: Math.min(1, Math.max(0, Number(confidence) || 0) / 100), texte: text || '' };
}
