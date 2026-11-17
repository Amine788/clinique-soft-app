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

## Lancement avec Docker

```bash
cp docker/.env.example docker/.env      # remplir TOUTES les valeurs (tableau ci-dessous)

docker compose -f docker/compose.yaml --profile install build
docker compose -f docker/compose.yaml up -d --wait db
docker compose -f docker/compose.yaml --profile install run --rm db-install
docker compose -f docker/compose.yaml --profile install run --rm db-install node database/seedExamens.js
docker compose -f docker/compose.yaml --profile install run --rm db-app-account
docker compose -f docker/compose.yaml up -d --wait
```

- `db-install` installe le schéma avec le compte de migration (`DB_MIGRATION_USER`).
- Le seed ajoute 31 examens courants (`server/database/seeds/examens-courants.json`, prix
  indicatifs à ajuster) ; il n'ajoute que les examens absents et ne modifie jamais l'existant.
- `db-app-account` crée le compte MySQL **limité** de l'API (`DB_USER`) : droits par table,
  aucun droit DDL. À relancer après chaque `db-install` qui ajoute des tables.
- Le super-administrateur de la plateforme est créé au premier démarrage depuis
  `SUPER_ADMIN_EMAIL` / `SUPER_ADMIN_PASSWORD`.
- Sauvegardes : `docker compose -f docker/compose.yaml --profile backup run --rm backup` (base)
  et `… --profile backup run --rm backup-uploads` (fichiers téléversés), dans `docker/backups/`.

## Tests

| Commande | Contenu |
|---|---|
| `npm run lint` (racine) | ESLint sur le front, l'API et les tests |
| `npm run build` (racine) | build de production du front |
| `TEST_DB_AUTHORIZED_TARGET=mysql-test:3306/nextclinic_security_test docker compose -f docker/compose.security-test.yaml up --build --abort-on-container-exit --exit-code-from tests` | tests d'intégration de l'API (node:test) contre une base MySQL jetable |
| `bash tests/smoke/run.sh local` | test de fumée : toutes les routes (cas normal, erreurs, 401/403) et toutes les pages React par rôle ; base jetable, e-mails capturés par Mailpit |
| `NO_CACHE=1 PERSISTENCE=1 bash tests/smoke/run.sh docker` | même test sur la pile Docker complète : images sans cache, redémarrages, persistance |

Les tests n'utilisent que des bases jetables et des valeurs de test
([`tests/smoke/README.md`](tests/smoke/README.md)) ; aucun e-mail réel n'est envoyé.

## Variables d'environnement

Modèles : [`docker/.env.example`](docker/.env.example) (Docker),
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
| `APP_VERSION` | Étiquette des images construites (permet de revenir à une version précédente) |
| `VITE_API_URL` | Front seulement, si le front est servi sur un autre domaine que l'API (vide avec Docker) |

Générer un secret : `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`.

## Licence

Tous droits réservés. Aucune réutilisation sans autorisation.
