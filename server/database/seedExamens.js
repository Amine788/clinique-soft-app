// Catalogue d'examens courants : seed idempotent (relançable sans doublon).
// L'installation (install.js) crée la table examens_catalog vide et aucune route ne la remplit :
// sans ce seed, les médecins ne peuvent prescrire aucun examen.
//
// N'ajoute que les examens absents (même code OU même nom, sans tenir compte de la casse) ;
// ne modifie ni ne supprime jamais un examen existant (les prix ajustés sont conservés).
// Liste : database/seeds/examens-courants.json (prix standard indicatifs en MAD, à ajuster avant).
//
// Usage : npm run db:seed-examens   (variables DB_* ou DATABASE_URL, comme l'API)
//         node database/seedExamens.js --dry-run   (affiche ce qui serait ajouté)
import '../loadEnv.js';
import path from 'node:path';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import sequelize from '../config/database.js';
import { ExamenCatalog } from '../models/examenCatalog.js';

const LISTE = path.join(path.dirname(fileURLToPath(import.meta.url)), 'seeds', 'examens-courants.json');
const TYPES = ExamenCatalog.getAttributes().type.values;

export function lireListe(fichier = LISTE) {
    const { examens } = JSON.parse(readFileSync(fichier, 'utf8'));
    if (!Array.isArray(examens) || !examens.length) throw new Error('Liste d\'examens vide');
    for (const e of examens) {
        if (!e.code || e.code.length > 20 || !e.nom || !TYPES.includes(e.type) || !(Number(e.prixStandard) >= 0)) {
            throw new Error(`Examen invalide dans la liste : ${JSON.stringify(e)}`);
        }
    }
    return examens;
}

export async function seedExamens({ examens = lireListe(), dryRun = false } = {}) {
    return sequelize.transaction(async (transaction) => {
        const existants = await ExamenCatalog.findAll({ attributes: ['code', 'nom'], transaction });
        const codes = new Set(existants.map(e => e.code.toLowerCase()));
        const noms = new Set(existants.map(e => e.nom.trim().toLowerCase()));
        const nouveaux = examens.filter(e => !codes.has(e.code.toLowerCase()) && !noms.has(e.nom.trim().toLowerCase()));
        if (!dryRun && nouveaux.length) {
            await ExamenCatalog.bulkCreate(nouveaux.map(e => ({
                code: e.code, nom: e.nom, type: e.type, categorie: e.categorie || null,
                prixStandard: Number(e.prixStandard), actif: true,
            })), { transaction });
        }
        return { avant: existants.length, ajoutes: nouveaux.map(e => e.code), ignores: examens.length - nouveaux.length };
    });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    const dryRun = process.argv.includes('--dry-run');
    try {
        await sequelize.authenticate();
        const r = await seedExamens({ dryRun });
        console.log(`Catalogue d'examens : ${r.avant} existant(s), ${r.ajoutes.length} ${dryRun ? 'à ajouter' : 'ajouté(s)'}, ${r.ignores} déjà présent(s).`);
        if (r.ajoutes.length) console.log(`  ${r.ajoutes.join(', ')}`);
    } catch (error) {
        console.error(`Seed du catalogue d'examens refusé : ${error.message}`);
        process.exitCode = 1;
    } finally {
        await sequelize.close();
    }
}
