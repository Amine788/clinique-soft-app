# Installation MySQL et protection du journal

Le démarrage de l'API ne crée plus de tables, de triggers ni de routine SQL.
Le schéma et les protections doivent être installés avant de lancer l'API.
Les objets existants ne sont pas supprimés par l'installateur.

## Comptes séparés

Le compte de migration prépare le schéma avec `CREATE`, `ALTER`, `INDEX`,
`REFERENCES`, `TRIGGER`, `CREATE ROUTINE`, les lectures nécessaires et les droits
requis par `sequelize.sync`. Sur MySQL avec journal binaire actif, la création
des triggers peut nécessiter un compte administratif supplémentaire. Ne pas
accorder `SUPER` à l'API ni changer automatiquement la configuration globale
du serveur pour contourner ce contrôle.

Le compte créant les triggers et la routine en devient le `DEFINER`. Il doit
rester présent et conserver les droits nécessaires à leur exécution et à la
lecture des métadonnées des triggers. Ne pas le supprimer après l'installation.
Les identifiants de migration ne sont fournis qu'au processus d'installation.

Le compte applicatif possède les droits métier par table :

- `SELECT, INSERT` sur `clinical_access_audit_events` ;
- `SELECT, INSERT, UPDATE, DELETE` sur les autres tables métier ;
- `EXECUTE` sur la seule routine `nextclinic_audit_protection_status` ;
- aucun droit `CREATE`, `ALTER`, `DROP`, `TRIGGER`, `CREATE ROUTINE`, `ALTER ROUTINE`
  ni `GRANT OPTION`.

Créer un compte applicatif distinct si le compte existant dispose de droits
globaux ou sur `base.*` : les privilèges MySQL sont cumulatifs. Ajouter des droits
par table ne retire pas un `UPDATE`, `DELETE` ou `DROP` déjà accordé plus largement.
L'utilisateur créé automatiquement par l'image MySQL officielle a des droits
sur toute la base ; ce compte doit servir à la préparation, pas être considéré
comme un compte applicatif limité.

Sur une base Docker neuve, renseigner `DB_BOOTSTRAP_USER` et
`DB_BOOTSTRAP_PASSWORD` pour ce compte initial, distinct de `DB_USER`. Le repli
sur les anciennes variables est conservé pour les configurations existantes ;
il ne réduit aucun droit déjà accordé. Le compte applicatif limité est créé
séparément par l'administrateur. Le compte de migration du profil `install`
peut être le compte administratif requis par la configuration du journal binaire.

Après création du compte applicatif par l'administrateur, celui-ci peut générer
les commandes d'attribution depuis la base installée (remplacer le compte
d'exemple), les relire puis les exécuter :

```sql
USE nextclinic_db;
SELECT CONCAT(
    'GRANT ', IF(TABLE_NAME = 'clinical_access_audit_events',
        'SELECT, INSERT', 'SELECT, INSERT, UPDATE, DELETE'),
    ' ON `', REPLACE(TABLE_SCHEMA, '`', '``'), '`.`',
    REPLACE(TABLE_NAME, '`', '``'), '` TO ''nextclinic_app''@''%'';'
) AS grant_statement
FROM information_schema.TABLES
WHERE TABLE_SCHEMA = DATABASE() AND TABLE_TYPE = 'BASE TABLE';
GRANT EXECUTE ON PROCEDURE nextclinic_db.nextclinic_audit_protection_status TO 'nextclinic_app'@'%';
```

Configurer ensuite `DB_USER` et `DB_PASSWORD` de l'API avec ce compte limité.
Ces commandes ne sont pas exécutées automatiquement sur une base existante.

Avec Docker, le service ponctuel `db-app-account` (profil `install`) fait tout
cela de façon idempotente avec le compte root de la base : il crée le compte
`DB_USER` s'il manque, (re)définit son mot de passe `DB_PASSWORD`, retire tous ses
droits puis accorde exactement les droits ci-dessus (`docker/create-app-account.sh`).
Le relancer après chaque `db-install` qui ajoute des tables :

```powershell
docker compose -f docker/compose.yaml --profile install run --rm db-app-account
```

## Installation ou mise à jour, API arrêtée

1. Sauvegarder la base existante et arrêter l'API.
2. Fournir au processus d'installation les identifiants de migration.
3. Exécuter `npm run db:install` depuis `server`.
4. Vérifier les droits du compte applicatif, puis redémarrer l'API avec ce compte.

L'installateur répare d'abord les colonnes d'accès via la migration 010, qui
refuse les tables anciennes non vides à réconcilier. Il crée les tables manquantes
avec `force: false, alter: false`, puis installe les deux triggers et la routine.
Le modèle d'ordonnance est partagé depuis `models/prescription.js` ;
l'installation ne charge pas les routes HTTP et n'exige pas de secret JWT.
Il ne remplace aucun trigger ni routine existant non conforme : il refuse avec
une erreur explicite pour contrôle administratif. Les DDL MySQL ne sont pas
transactionnels ; après un échec, corriger sa cause et relancer la commande,
sans démarrer l'API entre-temps. Les migrations de colonnes historiques autres
que la 010 restent à appliquer séparément si elles sont nécessaires.

Sur une base neuve, démarrer d'abord `db`, installer le schéma, puis créer le
compte applicatif et attribuer ses droits avant de démarrer `api`.

Parcours Docker (renseigner `DB_MIGRATION_USER` et `DB_MIGRATION_PASSWORD` dans
l'environnement ou le fichier privé `docker/.env`) :

```powershell
docker compose -f docker/compose.yaml stop api
docker compose -f docker/compose.yaml --profile install build db-install
docker compose -f docker/compose.yaml --profile install run --rm db-install
docker compose -f docker/compose.yaml --profile install run --rm db-install node database/seedExamens.js
docker compose -f docker/compose.yaml --profile install run --rm db-app-account
docker compose -f docker/compose.yaml up -d --no-build api
```

Ce parcours (base avec journal binaire, installation par root, compte limité,
seed relancé deux fois) est vérifié par `tests/smoke/run.sh docker`.

Le profil `install` n'est pas lancé par un `up` ordinaire. La commande refuse des
identifiants de migration vides. Le conteneur API reçoit les seuls identifiants
applicatifs `DB_USER` et `DB_PASSWORD`, pas ceux de migration.

## Catalogue d'examens (seed)

L'installation crée la table `examens_catalog` vide et aucun écran ne la remplit :
sans catalogue, les médecins ne peuvent prescrire aucun examen. Le seed ajoute une
liste d'examens courants (`database/seeds/examens-courants.json`, 31 examens de
laboratoire et d'imagerie). Les **prix standard sont indicatifs (MAD)** : les
ajuster dans ce fichier avant le premier lancement.

Le seed est idempotent : il n'ajoute que les examens absents (même code ou même
nom, sans tenir compte de la casse), ne modifie ni ne supprime jamais un examen
existant (prix déjà ajustés conservés). Il peut être relancé sans risque, par
exemple après avoir complété la liste.

```powershell
# Docker (compte de migration du profil install), après l'installation du schéma :
docker compose -f docker/compose.yaml --profile install run --rm db-install node database/seedExamens.js --dry-run
docker compose -f docker/compose.yaml --profile install run --rm db-install node database/seedExamens.js

# Hors Docker, depuis server/ (variables DB_* ou DATABASE_URL) :
npm run db:seed-examens
```

Sortie attendue : `Catalogue d'examens : 0 existant(s), 31 ajouté(s), 0 déjà présent(s).`
puis, à la relance, `31 existant(s), 0 ajouté(s), 31 déjà présent(s).`

## Vérification au démarrage

L'API appelle la routine de contrôle. Celle-ci est en `SQL SECURITY DEFINER` et
`READS SQL DATA` : elle retourne uniquement les métadonnées des deux triggers,
sans paramètre, sans dossier patient et sans mutation. L'API vérifie leurs noms,
table, opérations, moment `BEFORE` et instruction de refus `SIGNAL SQLSTATE
'45000'`. Un objet absent, non conforme, un definer indisponible ou un défaut de
droit `EXECUTE` bloque le démarrage avec une invitation à relancer l'installation.
L'API ne tente pas de réparer ces objets.

Les triggers refusent les `UPDATE` et `DELETE` même depuis une requête SQL brute.
Les droits limités du compte applicatif interdisent aussi `TRUNCATE`, la suppression
de la table et celle des protections. Un administrateur MySQL reste capable de
changer ces objets : cette procédure ne constitue pas un archivage externe.

## Validation sur la base Docker jetable

Le banc prépare le schéma avec `security_test_runner`, puis démarre l'API dans
un processus séparé. Les tests ordinaires gardent ce compte de banc ; les tests
`auditRuntime.integration.js` utilisent en plus un compte applicatif limité.

```powershell
$env:TEST_DB_AUTHORIZED_TARGET = 'mysql-test:3306/nextclinic_security_test'
docker compose -f docker/compose.security-test.yaml build tests
docker compose -f docker/compose.security-test.yaml run --rm -T tests node --test --test-concurrency=1 tests/auditInstallation.test.js tests/setup.test.js tests/lot1.test.js
```

Après préparation de cette base, provisionner le seul compte jetable par une
commande administrative explicite. Le contrôle du nom de serveur et de base
dans le script interdit son utilisation sur la base applicative. Le banc Node
ne reçoit jamais les identifiants administratifs :

```powershell
Get-Content -Raw docker/security-test-runtime.sql | docker compose -f docker/compose.security-test.yaml exec -T mysql-test sh -c 'MYSQL_PWD=$MYSQL_ROOT_PASSWORD exec mysql -uroot'
docker compose -f docker/compose.security-test.yaml run --rm -T tests node --test --test-concurrency=1 tests/auditRuntime.integration.js
```

Le second groupe ne réinitialise pas la base. Il vérifie le démarrage et le
redémarrage avec les droits limités, la journalisation via API et le refus des
mutations et DDL. Le test négatif avec routine retirée est lancé séparément
après son retrait par l'opérateur administratif. Le retrait d'un trigger est
également testé dans `auditInstallation.test.js`.

### Essai avec journal binaire actif

Cette variante redémarre uniquement le MySQL jetable et réinitialise sa base.
Les identifiants suivants sont exclusivement ceux de cette pile de test.
Conserver les deux fichiers Compose sur chaque `run` ; un `run` avec le seul
fichier de base pourrait recréer MySQL avec le journal binaire désactivé.

```powershell
$env:TEST_DB_AUTHORIZED_TARGET = 'mysql-test:3306/nextclinic_security_test'
$auditStack = @('-f', 'docker/compose.security-test.yaml', '-f', 'docker/compose.audit-installation-test.yaml')
docker compose @auditStack up -d --wait mysql-test
docker compose @auditStack run --no-deps --rm -T tests node tests/resetAuthorizedDatabase.js
```

Avec `@@log_bin=1` et `@@log_bin_trust_function_creators=0`, l'installation avec
`DB_USER=security_test_runner` doit refuser la création des triggers faute du
privilège administratif requis. Ne pas changer cette variable globale ni
attribuer `SUPER` au compte applicatif. Après ce test négatif, réinitialiser de
nouveau la base jetable, puis lancer explicitement l'installateur administratif :

```powershell
docker compose @auditStack run --no-deps --rm -T tests node tests/resetAuthorizedDatabase.js
docker compose @auditStack run --no-deps --rm -T -e DB_HOST=mysql-test -e DB_PORT=3306 -e DB_NAME=nextclinic_security_test -e DB_USER=root -e DB_PASSWORD=disposable-root-password -e DATABASE_URL= tests npm run db:install
Get-Content -Raw docker/security-test-runtime.sql | docker compose @auditStack exec -T mysql-test sh -c 'MYSQL_PWD=$MYSQL_ROOT_PASSWORD exec mysql -uroot'
docker compose @auditStack run --no-deps --rm -T tests node --test --test-concurrency=1 tests/auditRuntime.integration.js
'DROP PROCEDURE nextclinic_security_test.nextclinic_audit_protection_status;' | docker compose @auditStack exec -T mysql-test sh -c 'MYSQL_PWD=$MYSQL_ROOT_PASSWORD exec mysql -uroot'
docker compose @auditStack run --no-deps --rm -T tests node --test tests/auditRuntimeRefusal.integration.js
```

Seul l'installateur administratif reçoit ici les identifiants root jetables.
Les tests Node utilisent le compte applicatif limité et le compte de banc pour
les données de test. Le compte de banc ne retire pas lui-même un objet dont le
definer est root ; MySQL peut imposer `SYSTEM_USER` pour cette opération.
Après la fin des tests, retirer avec l'opérateur les deux triggers créés par root
sur la base jetable, puis restaurer le MySQL de test habituel. La suite ordinaire
réinitialise cette base et réinstalle les protections avec son compte de banc :

```powershell
'DROP TRIGGER nextclinic_security_test.clinical_audit_no_update; DROP TRIGGER nextclinic_security_test.clinical_audit_no_delete;' | docker compose @auditStack exec -T mysql-test sh -c 'MYSQL_PWD=$MYSQL_ROOT_PASSWORD exec mysql -uroot'
docker compose -f docker/compose.security-test.yaml up -d --wait mysql-test
```

Références MySQL : [CREATE TRIGGER](https://dev.mysql.com/doc/refman/8.4/en/create-trigger.html),
[visibilité des triggers](https://dev.mysql.com/doc/refman/8.4/en/show-triggers.html),
[contexte de sécurité des routines](https://dev.mysql.com/doc/refman/8.4/en/stored-objects-security.html).
