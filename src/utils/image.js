// Réduction des photos avant envoi (scan CIN, OCR) — V3
// Au-delà de 2576 px de grand côté, l'API d'IA réduit l'image de toute façon : on le fait ici,
// ce qui garde le scan sous la limite d'upload (5 Mo) et l'OCR sous celle du JSON (10 Mo).
export const IMAGE_MAX_COTE = 2576;
const TAILLE_SANS_REDUCTION = 1.5 * 1024 * 1024;

/** Types d'image acceptés par l'OCR (IA) */
export const estImageOcr = (file) => /^image\/(jpeg|png|webp|gif)$/.test(file?.type || '');

/**
 * Renvoie une photo d'au plus `maxCote` px de grand côté, en JPEG.
 * Les fichiers qui ne sont pas des photos (PDF, GIF) et les petites images sont renvoyés tels quels.
 */
export async function reduireImage(file, { maxCote = IMAGE_MAX_COTE, qualite = 0.9 } = {}) {
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) return file;

    const bitmap = await createImageBitmap(file); // orientation EXIF appliquée
    const echelle = Math.min(1, maxCote / Math.max(bitmap.width, bitmap.height));
    if (echelle === 1 && file.size <= TAILLE_SANS_REDUCTION) {
        bitmap.close();
        return file;
    }

    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * echelle);
    canvas.height = Math.round(bitmap.height * echelle);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff'; // fond blanc pour les PNG transparents
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();

    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', qualite));
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], file.name.replace(/\.[^.]+$/, '') + '.jpg', { type: 'image/jpeg' });
}
