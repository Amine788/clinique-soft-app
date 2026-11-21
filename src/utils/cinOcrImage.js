// Repère une carte claire sur un fond sombre, sans supposer qu'elle remplit la photo.
export function detectCardRegion(pixels, width, height) {
    const light = (x, y) => { const i = (y * width + x) * 4; return pixels[i] * .299 + pixels[i + 1] * .587 + pixels[i + 2] * .114 > 135; };
    const rows = Array.from({ length: height }, (_, y) => {
        let count = 0; for (let x = 0; x < width; x++) if (light(x, y)) count++;
        return count >= width * .32;
    });
    const candidates = [];
    for (let start = 0; start < height; start++) {
        if (!rows[start]) continue;
        let end = start; while (end + 1 < height && rows[end + 1]) end++;
        const h = end - start + 1;
        if (h >= height * .1) {
            const xs = [];
            for (let x = 0; x < width; x++) { let count = 0; for (let y = start; y <= end; y++) if (light(x, y)) count++; if (count >= h * .4) xs.push(x); }
            if (xs.length) {
                const x = xs[0], w = xs.at(-1) - x + 1, ratio = w / h, area = w * h;
                if (ratio >= 1.25 && ratio <= 2.1 && area > width * height * .05 && area < width * height * .95) candidates.push({ x, y: start, width: w, height: h, area });
            }
        }
        start = end;
    }
    const best = candidates.sort((a, b) => b.area - a.area)[0];
    if (!best) return null;
    const padding = Math.round(Math.min(best.width, best.height) * .035);
    const x = Math.max(0, best.x - padding), y = Math.max(0, best.y - padding);
    return { x, y, width: Math.min(width, best.x + best.width + padding) - x, height: Math.min(height, best.y + best.height + padding) - y };
}
export async function prepareCinImage(file) {
    const bitmap = await createImageBitmap(file);
    try {
        const thumb = document.createElement('canvas');
        const scale = Math.min(1, 400 / Math.max(bitmap.width, bitmap.height));
        thumb.width = Math.round(bitmap.width * scale); thumb.height = Math.round(bitmap.height * scale);
        const ctx = thumb.getContext('2d', { willReadFrequently: true });
        ctx.drawImage(bitmap, 0, 0, thumb.width, thumb.height);
        const rect = detectCardRegion(ctx.getImageData(0, 0, thumb.width, thumb.height).data, thumb.width, thumb.height);
        const crop = rect ? { x: rect.x / scale, y: rect.y / scale, width: rect.width / scale, height: rect.height / scale } : { x: 0, y: 0, width: bitmap.width, height: bitmap.height };
        const canvas = document.createElement('canvas');
        const zoom = Math.min(3, 2200 / Math.max(crop.width, crop.height));
        canvas.width = Math.round(crop.width * zoom); canvas.height = Math.round(crop.height * zoom);
        const out = canvas.getContext('2d', { willReadFrequently: true });
        out.fillStyle = '#fff'; out.fillRect(0, 0, canvas.width, canvas.height);
        out.drawImage(bitmap, crop.x, crop.y, crop.width, crop.height, 0, 0, canvas.width, canvas.height);
        return canvas;
    } finally { bitmap.close(); }
}
