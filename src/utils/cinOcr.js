import { parseCinText } from './cinOcrParser';
import { estImageOcr } from './image';
import { prepareCinImage } from './cinOcrImage';

// Aucun scan n'est transmis à un fournisseur : worker, WASM et langues sont servis par l'application.
export async function extractCin(file, { signal, onProgress = () => {} } = {}) {
    if (!estImageOcr(file)) throw new Error('Pour la lecture OCR, choisissez une photo JPG ou PNG. Le PDF peut être archivé sans extraction.');
    const base = new URL(import.meta.env.BASE_URL + 'ocr/', window.location.origin).href;
    // Distribution navigateur officielle, chargée sans transformation CommonJS.
    const moduleUrl = base + 'runtime/tesseract.esm.min.js';
    const { default: Tesseract } = await import(/* @vite-ignore */ moduleUrl);
    const { createWorker, PSM } = Tesseract;
    if (signal?.aborted) throw new DOMException('Lecture annulée', 'AbortError');
    let worker, abort;
    const aborted = new Promise((_, reject) => {
        abort = () => reject(new DOMException('Lecture annulée', 'AbortError'));
        signal?.addEventListener('abort', abort, { once: true });
        if (signal?.aborted) abort();
    });
    const creating = createWorker('fra', 1, {
        workerPath: base + 'runtime/worker.min.js', workerBlobURL: true,
        corePath: base + 'runtime/core', langPath: base + 'lang', gzip: false, cacheMethod: 'none',
        errorHandler: () => {},
        logger: message => { if (!signal?.aborted) onProgress(message.status === 'recognizing text' ? Math.round(message.progress * 100) : 0); },
    });
    // Un worker dont le chargement finit après l'annulation doit aussi être libéré.
    creating.then(w => { if (signal?.aborted) w.terminate().catch(() => {}); }).catch(() => {});
    try {
        worker = await Promise.race([creating, aborted]);
        await worker.setParameters({ tessedit_pageseg_mode: PSM.AUTO, preserve_interword_spaces: '1' });
        const image = await prepareCinImage(file);
        const score = result => ['cin', 'nom', 'prenom', 'dateNaissance', 'dateExpiration', 'lieuNaissance'].filter(key => result[key]).length;
        let best = null;
        for (const mode of [PSM.AUTO, PSM.SPARSE_TEXT]) {
            if (signal?.aborted) throw new DOMException('Lecture annulée', 'AbortError');
            await worker.setParameters({ tessedit_pageseg_mode: mode });
            const { data } = await Promise.race([worker.recognize(image, { rotateAuto: true }), aborted]);
            const parsed = parseCinText(data.text, data.confidence);
            if (!best || score(parsed) > score(best)) best = parsed;
            if (score(best) >= 5) break;
        }
        if (!best?.cin && image.width / image.height > 1.25 && image.width / image.height < 2.1) {
            await worker.setParameters({ tessedit_pageseg_mode: PSM.SPARSE_TEXT, tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789' });
            const { data } = await Promise.race([worker.recognize(image, { rectangle: { left: Math.round(image.width * .5), top: Math.round(image.height * .68), width: Math.round(image.width * .48), height: Math.round(image.height * .23) } }), aborted]);
            const targeted = parseCinText(data.text, data.confidence);
            if (targeted.cin) best = { ...best, cin: targeted.cin };
        }
        if (!best?.texte?.trim()) throw new Error('Aucun texte lisible. Cadrez le recto de la carte et reprenez une photo nette.');
        return { ...best, nombreChamps: score(best) };
    } catch (error) {
        throw error instanceof Error ? error : new Error('Le moteur OCR ne peut pas démarrer. Rechargez la page ou saisissez les champs à la main.');
    } finally {
        signal?.removeEventListener('abort', abort);
        if (worker) await worker.terminate().catch(() => {});
    }
}
