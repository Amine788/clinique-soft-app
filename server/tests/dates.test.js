import { test } from 'node:test';
import assert from 'node:assert/strict';
import { jourClinique, ajouterJours, premierDuMois, dernierDuMois, premierDeLAnnee, minuitClinique } from '../services/dates.js';
// Dates de la clinique (Africa/Casablanca) : même résultat quel que soit le fuseau du serveur




// Fuseaux du serveur simulés (process.env.TZ est pris en compte à chaud par Node, y compris sous Windows)
const FUSEAUX_SERVEUR = ['UTC', 'Africa/Casablanca', 'America/New_York', 'Asia/Tokyo'];
const pourChaqueFuseau = (verifier) => {
    const initial = process.env.TZ;
    try {
        for (const tz of FUSEAUX_SERVEUR) {
            process.env.TZ = tz;
            assert.equal(Intl.DateTimeFormat().resolvedOptions().timeZone, tz);
            verifier(tz);
        }
    } finally {
        if (initial === undefined) delete process.env.TZ; else process.env.TZ = initial;
    }
};

test('Dates : le jour est celui de la clinique, avec UTC+1 et UTC+0', () => {
    pourChaqueFuseau(() => {
        // Cas historiques : ne pas figer une prévision de décalage pour 2026.
        assert.equal(jourClinique(new Date('2024-01-14T23:30:00Z')), '2024-01-15');
        assert.equal(jourClinique(new Date('2024-01-14T22:30:00Z')), '2024-01-14');
        assert.equal(minuitClinique('2024-01-15').toISOString(), '2024-01-14T23:00:00.000Z');
        assert.equal(jourClinique(new Date('2024-03-20T23:30:00Z')), '2024-03-20');
        assert.equal(minuitClinique('2024-03-21').toISOString(), '2024-03-21T00:00:00.000Z');
    });
});

test('Dates : les changements de décalage donnent des journées de 25 et 23 heures', () => {
    pourChaqueFuseau(() => {
        const heure = 3600000;
        assert.equal(minuitClinique('2024-03-11') - minuitClinique('2024-03-10'), 25 * heure);
        assert.equal(minuitClinique('2024-04-15') - minuitClinique('2024-04-14'), 23 * heure);
        for (const jour of ['2024-03-10', '2024-04-14']) {
            const debut = minuitClinique(jour);
            const fin = minuitClinique(ajouterJours(jour, 1));
            assert.equal(jourClinique(debut), jour);
            assert.equal(jourClinique(new Date(debut.getTime() - 1)), ajouterJours(jour, -1));
            assert.equal(jourClinique(new Date(fin.getTime() - 1)), jour);
            assert.equal(jourClinique(fin), ajouterJours(jour, 1));
        }
    });
});

test('Dates : minuit de la clinique borne exactement le jour, toute l’année', () => {
    pourChaqueFuseau(() => {
        for (let j = '2026-01-01'; j < '2027-01-01'; j = ajouterJours(j, 1)) {
            const minuit = minuitClinique(j);
            assert.equal(jourClinique(minuit), j, j);
            assert.equal(jourClinique(new Date(minuit.getTime() - 1)), ajouterJours(j, -1), j);
        }
    });
});

test('Dates : arithmétique des jours et des mois', () => {
    pourChaqueFuseau(() => {
        assert.equal(ajouterJours('2026-12-31', 1), '2027-01-01');
        assert.equal(ajouterJours('2026-03-01', -1), '2026-02-28');
        assert.equal(premierDuMois('2026-01-15', -1), '2025-12-01');
        assert.equal(premierDuMois('2026-10-19'), '2026-10-01');
        assert.equal(dernierDuMois('2024-02-10'), '2024-02-29');
        assert.equal(dernierDuMois('2026-10-19', -1), '2026-09-30');
        assert.equal(premierDeLAnnee('2026-10-19'), '2026-01-01');
    });
});
