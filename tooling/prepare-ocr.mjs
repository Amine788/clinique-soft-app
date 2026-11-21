// Assets fournis par les versions verrouillées dans package-lock.json.
import { cp, mkdir, readdir, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const root = new URL('../', import.meta.url);
const dest = new URL('public/ocr/runtime/', root);
await mkdir(dest, { recursive: true });
for (const name of ['worker.min.js', 'worker.min.js.LICENSE.txt', 'tesseract.esm.min.js']) await cp(new URL('node_modules/tesseract.js/dist/' + name, root), new URL(name, dest));
await cp(new URL('node_modules/tesseract.js/LICENSE.md', root), new URL('LICENSE.txt', dest));
await mkdir(new URL('core/', dest), { recursive: true });
for (const name of await readdir(new URL('node_modules/tesseract.js-core/', root))) {
    if (/\.wasm(\.js)?$/.test(name) || name === 'LICENSE') await cp(new URL('node_modules/tesseract.js-core/' + name, root), new URL('core/' + name, dest));
}
for (const lang of ['fra', 'ara']) if ((await stat(new URL('public/ocr/lang/' + lang + '.traineddata', root))).size < 100000) throw new Error('Modèle OCR incomplet : ' + lang);
console.log('OCR local préparé : ' + fileURLToPath(dest));
