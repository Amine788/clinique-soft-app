# Référence de calendrier NextClinic

Le calendrier de la clinique utilise `Africa/Casablanca`. Les dates de rendez-vous
(`DATEONLY`) restent des jours locaux ; les bornes de requêtes horodatées sont
calculées par `minuitClinique`. Un jour local peut durer 23, 24 ou 25 heures.
Pour passer au jour suivant, utiliser `ajouterJours` sur la date locale puis
`minuitClinique`, sans ajouter systématiquement 24 heures à un instant.

## Environnement de référence

L'API et les tests Docker utilisent la même image Node, fixée par son empreinte
dans `Dockerfile` et `Dockerfile.security-test` :

```text
node:22.23.4-bookworm-slim@sha256:4b150b48b4116e2a22f2c39cc27025fbf4f153e2078fd3b14d159fdb5c7279da
```

Versions observées le 3 novembre 2026 : Node 22.23.4, ICU 78.3, données de fuseaux
2026e. `Intl.DateTimeFormat` utilise les données embarquées dans Node ; changer
uniquement la variable `TZ` ou les données de fuseaux du système ne remplace pas
cette référence. Le Compose applicatif configure le fuseau clinique avec
`${TZ:-Africa/Casablanca}` ; le Compose de validation fixe explicitement
`CLINIC_TZ=Africa/Casablanca`.

Le Node natif Windows présent sur le poste est différent : Node 24.14.0,
ICU 78.2, données de fuseaux 2025c. Les tests unitaires peuvent y être exécutés,
mais les validations applicatives de calendrier utilisent l'image Docker.
Par exemple, `2026-10-18T23:30:00Z` est interprété au 19 octobre par ce Node
Windows et au 18 octobre par la référence Docker. L'ancien test imposait le
19 octobre dans les deux environnements.

Lors d'une mise à jour, modifier ensemble les trois références `FROM` des deux
Dockerfiles, relever les versions Node/ICU/fuseaux et relancer les validations
ci-dessous avant de reconstruire l'API. Une reconstruction ou un déploiement de
l'API reste une étape distincte.

## Validation

Les tests de dates utilisent des cas historiques de 2024 avec UTC+0, UTC+1 et
les changements de décalage donnant des jours de 25 et 23 heures. Ils vérifient
les bornes à la milliseconde sous quatre fuseaux du serveur et tous les minuits
de 2026, sans imposer un décalage UTC+1 à une date future.

Les tests de rappels construisent leurs instants à partir du minuit local sur
deux journées sans transition, avec UTC+0 puis UTC+1. Ils vérifient l'absence de
rappel à 8 h 30, l'envoi à 9 h 30, les bascules, les doublons et la reprise après
échec. Les envois utilisent une fonction simulée ; aucun e-mail réel n'est envoyé.

Test unitaire local, sans base :

```powershell
node --test server/tests/dates.test.js
```

Même test dans l'image de référence déjà construite, sans réseau ni base :

```powershell
docker run --rm --network none --read-only -e CLINIC_TZ=Africa/Casablanca --entrypoint node nextclinic-security-test-tests --test tests/dates.test.js
```

Validation intégrée, exclusivement sur la base jetable du Compose de test :

```powershell
$env:TEST_DB_AUTHORIZED_TARGET = 'mysql-test:3306/nextclinic_security_test'
docker compose -f docker/compose.security-test.yaml build tests
docker compose -f docker/compose.security-test.yaml run --rm -T tests node --test --test-concurrency=1 tests/dates.test.js tests/rappels.test.js tests/dashboard.test.js tests/partielles.test.js
```
