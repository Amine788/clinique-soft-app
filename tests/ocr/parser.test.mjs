import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { parseCinText } from '../../src/utils/cinOcrParser.js';

test('CIN étiquetée : identité, dates et sexe explicite', () => {
    const r = parseCinText('ROYAUME DU MAROC\nNom : EL FICTIF\nPrénom : AMINA\nNée le 21.04.1990 à CASABLANCA\nSexe : F\nValable jusqu’au 31/12/2035\nAB123456', 90);
    assert.equal(r.nom, 'EL FICTIF'); assert.equal(r.prenom, 'AMINA');
    assert.equal(r.dateNaissance, '1990-04-21'); assert.equal(r.dateExpiration, '2035-12-31');
    assert.equal(r.lieuNaissance, 'CASABLANCA'); assert.equal(r.sexe, 'F'); assert.equal(r.cin, 'AB123456'); assert.equal(r.confiance, 0.9);
});
test('ancienne CIN : deux lignes latines et en-têtes bilingues', () => {
    const r = parseCinText('ROYAUME DU MAROC المملكة المغربية\nCARTE NATIONALE D IDENTITE\nAMINA\nEL FICTIF\nNée le 21.04.1990\nà RABAT\nValable jusqu’au 31.12.2035\nAB 123456');
    assert.equal(r.prenom, 'AMINA'); assert.equal(r.nom, 'EL FICTIF'); assert.equal(r.lieuNaissance, 'RABAT'); assert.equal(r.sexe, null);
});
test('champ manquant, date impossible et texte illisible : aucune donnée inventée', () => {
    const r = parseCinText('Nom : EL FICTIF\nNé le 31.02.1990\nValable jusqu’au 31.13.2035');
    assert.equal(r.dateNaissance, null); assert.equal(r.dateExpiration, null); assert.equal(r.cin, null); assert.equal(r.sexe, null); assert.equal(r.prenom, null);
    assert.equal(parseCinText('موعد').nom, null);
});
test('naissance bissextile et noms composés', () => {
    const r = parseCinText('Nom\nEL FICTIF TEST\nPrénoms\nJEAN-PIERRE\nNé le 29-02-2000\nC123456');
    assert.equal(r.nom, 'EL FICTIF TEST'); assert.equal(r.prenom, 'JEAN-PIERRE'); assert.equal(r.dateNaissance, '2000-02-29');
});
test('modèles locaux intègres et versions connues', () => {
    for (const [lang, hash] of [['fra','ced037562e8c80c13122dece28dd477d399af80911a28791a66a63ac1e3445ca'], ['ara','e3206d3dc87fd50c24a0fb9f01838615911d25168f4e64415244b67d2bb3e729']]) {
        const file = readFileSync(new URL('../../public/ocr/lang/' + lang + '.traineddata', import.meta.url));
        assert.equal(createHash('sha256').update(file).digest('hex'), hash);
    }
});

test('photo avec libellé de naissance mal reconnu et lieu suivi de bruit', () => {
    const r = parseCinText("ROYAUME DU MAROC CARTE NATIONALE D IDENTITE\nAMINA SOFIA\nEL FICTIF\nEnéie | —09.04.1991\nà CASABLANCA 7\nValable jusqu'au 23.01.2035\nالمدير العام", 76);
    assert.equal(r.nom, 'EL FICTIF'); assert.equal(r.prenom, 'AMINA SOFIA');
    assert.equal(r.dateNaissance, '1991-04-09'); assert.equal(r.dateExpiration, '2035-01-23');
    assert.equal(r.lieuNaissance, 'CASABLANCA'); assert.equal(r.cin, null);
});

test('repérage de la carte au milieu d’un fond sombre', async () => {
    const { detectCardRegion } = await import('../../src/utils/cinOcrImage.js');
    const width = 120, height = 160, pixels = new Uint8ClampedArray(width * height * 4);
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
        const light = x >= 15 && x < 95 && y >= 55 && y < 109;
        const value = light ? 200 : 40, i = (y * width + x) * 4;
        pixels[i] = pixels[i+1] = pixels[i+2] = value; pixels[i+3] = 255;
    }
    const crop = detectCardRegion(pixels, width, height);
    assert.ok(crop); assert.ok(crop.x <= 15 && crop.x + crop.width >= 95);
    assert.ok(crop.y <= 55 && crop.y + crop.height >= 109);
    assert.ok(crop.width * crop.height < width * height / 2);
    assert.equal(detectCardRegion(new Uint8ClampedArray(width * height * 4), width, height), null);
});
