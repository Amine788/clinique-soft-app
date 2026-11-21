# NextClinic ERP

Logiciel de gestion de clinique (ERP) multi-établissements : accueil et dossiers patients,
rendez-vous, consultations et ordonnances, examens de laboratoire et d'imagerie, pharmacie et
circuit du médicament, hospitalisations et soins infirmiers, facturation, tableaux de bord.
Chaque clinique est cloisonnée (multi-tenant) et chaque rôle (administrateur, médecin,
secrétaire, infirmier, pharmacien, technicien de laboratoire, super-administrateur de la
plateforme) n'accède qu'à son périmètre.

| Partie | Technologies |
|---|---|
| Front | React 19, Vite, Tailwind CSS, React Router, Zustand, Socket.io client |
| API | Node.js (≥ 20), Express 4, Sequelize 6, Socket.io, JWT, Nodemailer |
| Base | MySQL 8.4 (PostgreSQL possible via `DATABASE_URL`) |
| Déploiement | Docker Compose : MySQL, API, Caddy (front statique + reverse proxy + HTTPS automatique) |

> Les données de démonstration et de test de ce dépôt sont **inventées** (adresses en `.test`,
> numéros fictifs). Ne jamais lancer `server/seed.js` ni charger `server/database/setup_mysql.sql`
> sur une base de production : ils créent des comptes de démonstration aux mots de passe connus.

## Prérequis

- Node.js 20 ou plus récent (22 dans les images Docker) et npm
- Docker et Docker Compose (déploiement, tests serveur, test de fumée)
- Un shell POSIX (Git Bash sous Windows) pour `tests/smoke/run.sh`

## Installation locale (développement)

```bash
npm ci                                  # front
cd server && npm ci                     # API
cp .env.example .env                    # dans server/ : remplacer toutes les valeurs « change-me »
```

Préparer une base MySQL vide, puis, depuis `server/` :

```bash
npm run db:install          # schéma + protections du journal d'audit (compte administratif)
npm run db:seed-examens     # catalogue d'examens courants (idempotent, relançable)
npm run dev                 # API sur http://localhost:3001
```

Dans un autre terminal, à la racine : `npm run dev` (front sur http://localhost:5173 ; Vite relaie
`/api`, `/uploads` et `/socket.io` vers l'API).

Documentation complémentaire :
[installation MySQL et comptes séparés](server/database/INSTALLATION.md) ·
[calendrier et fuseau horaire](server/CALENDRIER.md) ·
[e-mails et IA](server/SERVICES_EXTERNES.md) ·
[déploiement Docker](docs/DEPLOIEMENT.md).

## Production avec Docker

Pile [`docker-compose.prod.yml`](docker-compose.prod.yml) : MySQL (non exposé), API, front servi
par Caddy avec HTTPS automatique sur le domaine de `SITE_ADDRESS`, volumes persistants.

```bash
cp .env.prod.example .env.prod && chmod 600 .env.prod   # remplir TOUTES les valeurs (tableau ci-dessous)
scripts/deploy.sh                    # installation ou mise à jour : build, schéma, compte limité, redémarrage
scripts/seed-catalogue.sh --dry-run  # aperçu du catalogue d'examens courants
scripts/seed-catalogue.sh            # ajout des examens absents (idempotent)
```

| Script | Rôle |
|---|---|
| `scripts/deploy.sh` | `git pull`, images étiquetées date-commit, sauvegarde si la base contient des données, schéma (`db-install`, idempotent), compte MySQL **limité** de l'API (`db-app-account`), redémarrage et contrôle de `/api/health`. Données conservées (volumes). |
| `scripts/backup.sh` | Dump MySQL cohérent + archive des fichiers téléversés (photos, logos, résultats, scans de CIN), rotation (`RETENTION_JOURS`), copie distante facultative (`BACKUP_RSYNC_DEST`). |
| `scripts/restore.sh` | Restauration d'une sauvegarde (base recréée, fichiers remplacés), après sauvegarde de l'état actuel. |
| `scripts/rollback.sh` | Retour aux images d'une version précédente (base et fichiers inchangés). |
| `scripts/seed-catalogue.sh` | Catalogue d'examens courants (`server/database/seeds/examens-courants.json`, prix indicatifs à ajuster). |

Le super-administrateur de la plateforme est créé au premier démarrage depuis
`SUPER_ADMIN_EMAIL` / `SUPER_ADMIN_PASSWORD`. Détails : [docs/DEPLOIEMENT.md](docs/DEPLOIEMENT.md).

## Tests

| Commande | Contenu |
|---|---|
| `npm run lint` (racine) | ESLint sur le front, l'API et les tests |
| `npm run build` (racine) | build de production du front |
| `TEST_DB_AUTHORIZED_TARGET=mysql-test:3306/nextclinic_security_test docker compose -f docker/compose.security-test.yaml up --build --abort-on-container-exit --exit-code-from tests` | tests d'intégration de l'API (node:test) contre une base MySQL jetable |
| `bash tests/smoke/run.sh local` | test de fumée : toutes les routes (cas normal, erreurs, 401/403) et toutes les pages React par rôle ; base jetable, e-mails capturés par Mailpit |
| `NO_CACHE=1 PERSISTENCE=1 bash tests/smoke/run.sh docker` | même test sur la pile de production `docker-compose.prod.yml` : images sans cache, redémarrages, persistance |
| `EXPLOITATION=1 HTTPS_LOCAL=1 bash tests/smoke/run.sh docker` | en plus : installation par `deploy.sh`, sauvegarde puis restauration sur base vide (empreinte identique), `deploy.sh` ×2, `rollback.sh`, HTTPS par certificat interne |
| `bash tests/smoke/run.sh deux-domaines` | front servi à part (comme sur Vercel) et API Docker : CORS, temps réel, images, documents |

Les tests n'utilisent que des bases jetables et des valeurs de test
([`tests/smoke/README.md`](tests/smoke/README.md)) ; aucun e-mail réel n'est envoyé.

## Variables d'environnement

Modèles : [`.env.prod.example`](.env.prod.example) (production Docker, un commentaire par variable),
[`server/.env.example`](server/.env.example) (API hors Docker), [`.env.example`](.env.example) (front).
Ne jamais versionner un fichier `.env` rempli.

| Variable | Rôle |
|---|---|
| `SITE_ADDRESS` | Adresse servie par Caddy : nom de domaine en production (HTTPS automatique), `:80` en local |
| `FRONTEND_URL` | URL publique du front (`https://domaine`) : origine CORS autorisée et liens envoyés par e-mail |
| `HTTP_PORT`, `HTTPS_PORT` | Ports publiés par Caddy (80 / 443) |
| `DB_NAME` | Nom de la base |
| `DB_USER`, `DB_PASSWORD` | Compte MySQL **limité** utilisé par l'API (créé par `db-app-account`) |
| `DB_ROOT_PASSWORD` | Mot de passe root MySQL (installation, comptes, sauvegardes) |
| `DB_BOOTSTRAP_USER`, `DB_BOOTSTRAP_PASSWORD` | Compte créé par l'image MySQL sur base neuve, distinct de `DB_USER` |
| `DB_MIGRATION_USER`, `DB_MIGRATION_PASSWORD` | Compte administratif du profil `install` (root convient : journal binaire actif) |
| `DB_HOST`, `DB_PORT` | Hôte et port MySQL (hors Docker) |
| `DATABASE_URL` | Optionnel : URL PostgreSQL, remplace la configuration MySQL |
| `TZ` / `CLINIC_TZ` | Fuseau de la clinique (défaut `Africa/Casablanca`) |
| `JWT_SECRET` | Secret de signature des sessions : obligatoire, long et aléatoire |
| `JWT_EXPIRES_IN` | Durée d'une session (défaut `8h`) |
| `SUPER_ADMIN_EMAIL`, `SUPER_ADMIN_PASSWORD` | Super-administrateur créé au premier démarrage s'il n'en existe aucun (12 caractères minimum) |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD` | Serveur d'envoi des e-mails (prioritaires sur Gmail) |
| `GMAIL_USER`, `GMAIL_APP_PASSWORD` | Alternative : compte Gmail et mot de passe d'application |
| `EMAIL_FROM` | Adresse d'expédition (si `SMTP_USER` n'est pas une adresse e-mail) |
| `ADMIN_NOTIFICATION_EMAIL` | Destinataire des notifications internes (nouvelle clinique inscrite) |
| `ANTHROPIC_API_KEY`, `AI_MODEL`, `AI_MAX_TOKENS`, `AI_TIMEOUT_MS` | Lecture automatique de la CIN et assistant IA ; optionnels (sans clé, ces fonctions répondent 503) |
| `BACKUP_DIR`, `RETENTION_JOURS`, `BACKUP_RSYNC_DEST` | Sauvegardes : dossier sur le serveur, durée de conservation, copie hors du serveur (`scripts/backup.sh`) |
| `VITE_API_URL` | Front seulement, si le front est servi sur un autre domaine que l'API (vide avec Docker) |

Générer un secret : `openssl rand -hex 48` (ou `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`).

## Licence

Tous droits réservés. Aucune réutilisation sans autorisation.

## Organisation, facturation et paiements

Une clinique, une équipe : l'administrateur crée les comptes et leur attribue un rôle (secrétaire, médecin,
infirmier, pharmacien, technicien de laboratoire…). Chaque compte accède aux fonctions de son rôle, sans
département ni service organisationnel.

Une prestation source ne peut pas figurer sur deux factures non annulées. La réservation intervient à l'émission,
dans la même transaction que la facture et ses lignes. Les créations et paiements acceptent des références
idempotentes pour éviter les doublons lors d'une nouvelle tentative réseau.

Les paiements patient et assurance sont enregistrés séparément, avec montant, date, mode et auteur.
Une facture reste partiellement réglée tant que la totalité n'est pas encaissée ; un ancien statut « payée »
ne crée jamais un encaissement supposé.

La migration additive `013_facturation_idempotence.js` est exécutée par `npm run db:install` et par le script
de déploiement. Elle ne supprime aucune donnée. Sur une base existante, les anciennes tables et colonnes de
départements sont conservées telles quelles mais ne sont plus utilisées.

Tests ciblés, uniquement dans le Compose de sécurité et sa base jetable autorisée :
`npm run test:facturation` dans `server/`.
