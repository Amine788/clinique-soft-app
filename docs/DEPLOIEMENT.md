# Déploiement Docker — NextClinic ERP

Trois conteneurs, une seule adresse publique :

| Service | Image | Rôle | Exposé |
|---|---|---|---|
| `proxy` | `nextclinic-web` (Caddy 2.11) | Front compilé + reverse proxy `/api`, `/uploads`, `/socket.io` ; HTTPS automatique | 80 / 443 |
| `api` | `nextclinic-api` (Node 22) | API Express + Socket.io + rappels horaires | non (réseau interne) |
| `db` | `mysql:8.4.13` | Base de données | non (réseau interne, sans Internet) |

Volumes : `db_data` (base), `uploads` (photos, logos, résultats d'examens, scans de CIN), `caddy_data` (certificats).
**L'API doit rester à une seule instance** (rappels et connexions temps réel en mémoire).

## 1. Configuration

```bash
cp docker/.env.example docker/.env      # puis remplacer TOUTES les valeurs
chmod 600 docker/.env
```

Secrets à générer (`node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`) :
`JWT_SECRET`, `DB_PASSWORD`, `DB_ROOT_PASSWORD`, `DB_BOOTSTRAP_PASSWORD`, `SUPER_ADMIN_PASSWORD`.
Compte de migration : `DB_MIGRATION_USER=root`, `DB_MIGRATION_PASSWORD` = `DB_ROOT_PASSWORD`.
En production : `SITE_ADDRESS=erp.votre-domaine.ma`, `FRONTEND_URL=https://erp.votre-domaine.ma`, `HTTP_PORT=80`, `HTTPS_PORT=443`.

`docker/.env` n'est jamais commité ni copié dans une image.

## 2. Démarrage (base neuve)

L'API ne crée aucune table : le schéma et ses protections sont installés avant son premier démarrage.

```bash
docker compose -f docker/compose.yaml --profile install build
docker compose -f docker/compose.yaml up -d --wait db
docker compose -f docker/compose.yaml --profile install run --rm db-install                                # schéma
docker compose -f docker/compose.yaml --profile install run --rm db-install node database/seedExamens.js   # catalogue d'examens
docker compose -f docker/compose.yaml --profile install run --rm db-app-account                            # compte limité de l'API
docker compose -f docker/compose.yaml up -d --wait
docker compose -f docker/compose.yaml ps          # db et api « healthy »
curl -s https://erp.votre-domaine.ma/api/health   # {"status":"ok","database":"connected",...}
```

Ce parcours est vérifié par `NO_CACHE=1 PERSISTENCE=1 bash tests/smoke/run.sh docker`.
Le script `server/seed.js` (données de démonstration, **supprime** des données) n'est pas inclus dans l'image.

## 3. Reprendre une base existante (sans perte)

```bash
# Sur l'ancienne machine : export en lecture seule
mysqldump -u<user> -p --single-transaction --routines --triggers --no-tablespaces \
  --default-character-set=utf8mb4 nextclinic_db > docker/backups/reprise.sql

# Base Docker démarrée seule, puis import
docker compose -f docker/compose.yaml up -d db
docker compose -f docker/compose.yaml exec -T db \
  sh -c 'MYSQL_PWD="$MYSQL_ROOT_PASSWORD" mysql -uroot --default-character-set=utf8mb4 "$MYSQL_DATABASE"' \
  < docker/backups/reprise.sql
docker compose -f docker/compose.yaml --profile install run --rm db-install       # protections et tables manquantes
docker compose -f docker/compose.yaml --profile install run --rm db-app-account   # compte limité de l'API
docker compose -f docker/compose.yaml up -d
```

Vérifier ensuite le nombre de lignes de chaque table des deux côtés. Les migrations `server/database/migrations/*.sql`
doivent avoir été appliquées à l'ancienne base **avant** l'export ; ne jamais les rejouer à l'aveugle.
Copier aussi les fichiers téléversés (`server/uploads/`) dans le volume :

```bash
docker compose -f docker/compose.yaml cp server/uploads/. api:/app/uploads/
# Obligatoire : « cp » rend root propriétaire ; l'API (utilisateur node, uid 1000) doit pouvoir y écrire
docker run --rm --network none -v nextclinic_uploads:/u alpine:3.22.7 chown -R 1000:1000 /u
```

(Sous Git Bash sur Windows, préfixer la dernière commande par `MSYS_NO_PATHCONV=1`.)

## 4. Sauvegarde et restauration

```bash
# Sauvegardes (à planifier chaque jour par cron sur le VPS) — fichiers créés en 600 dans docker/backups/
docker compose -f docker/compose.yaml --profile backup run --rm backup           # base  → nextclinic_db-<date>.sql.gz
docker compose -f docker/compose.yaml --profile backup run --rm backup-uploads   # fichiers → uploads-<date>.tar.gz
```

`docker/backups/` contient des données de santé : il est ignoré par Git. Le copier, chiffré, **hors du VPS**.

### Restauration en production (après incident)

```bash
docker compose -f docker/compose.yaml stop api proxy
gzip -dc docker/backups/nextclinic_db-AAAAMMJJ-HHMMSS.sql.gz | docker compose -f docker/compose.yaml exec -T db \
  sh -c 'MYSQL_PWD="$MYSQL_ROOT_PASSWORD" mysql -uroot "$MYSQL_DATABASE"'
docker run --rm --network none -v nextclinic_uploads:/u -v "$PWD/docker/backups:/b:ro" alpine:3.22.7 \
  sh -c 'tar xzf /b/uploads-AAAAMMJJ-HHMMSS.tar.gz -C /u && chown -R 1000:1000 /u'
docker compose -f docker/compose.yaml start api proxy
```

### Test de restauration (chaque mois, sans toucher à la production)

Restaurer dans un environnement **jetable et sans réseau**, puis comparer avec la production :

```bash
# Base : conteneur MySQL isolé
docker run -d --name nextclinic-restore-test --network none -e MYSQL_ROOT_PASSWORD=<aléatoire> \
  -e MYSQL_DATABASE=restauration mysql:8.4.13 --character-set-server=utf8mb4 --collation-server=utf8mb4_unicode_ci
gzip -dc docker/backups/nextclinic_db-<date>.sql.gz | docker exec -i nextclinic-restore-test \
  sh -c 'MYSQL_PWD="$MYSQL_ROOT_PASSWORD" mysql -uroot restauration'
#   → comparer, table par table, le nombre de lignes et la somme des crc32(id) avec la production

# Fichiers : volume isolé
docker volume create nextclinic-restore-test-uploads
docker run --rm --network none -v nextclinic-restore-test-uploads:/r -v "$PWD/docker/backups:/b:ro" alpine:3.22.7 \
  tar xzf /b/uploads-<date>.tar.gz -C /r
#   → comparer les sha256sum des fichiers avec ceux du volume nextclinic_uploads

# Nettoyage
docker rm -f nextclinic-restore-test && docker volume rm nextclinic-restore-test-uploads
```

Ne jamais afficher le contenu des tables ni des fichiers dans un rapport : seulement des nombres et des empreintes.
Dernier test réussi : 2026-10-22 (21 tables, 133 lignes, 9 fichiers identiques).

## 5. Mise à jour et retour arrière

```bash
APP_VERSION=2026-10-22 docker compose -f docker/compose.yaml up -d --build   # nouvelle version étiquetée
APP_VERSION=<version précédente> docker compose -f docker/compose.yaml up -d  # retour arrière (images conservées)
```

Faire une sauvegarde avant chaque mise à jour. `docker compose down` conserve les données ;
**ne jamais utiliser `down -v`** (supprime les volumes : base et fichiers).

## 6. Développement

```bash
docker compose -f docker/compose.yaml -f docker/compose.dev.yaml up -d   # base (127.0.0.1:3307) + API (127.0.0.1:3001, rechargement auto)
npm run dev                                                              # front Vite, proxy vers 127.0.0.1:3001
```

Arrêter d'abord tout serveur Node local qui occupe le port 3001.
Le développement est un projet distinct (`nextclinic-dev`) : ses volumes ne sont **jamais** ceux de la production,
même sur la même machine. Sa base démarre vide (importer une sauvegarde au besoin, § 3).

## 7. VPS (Linux)

- Docker Engine + plugin Compose ; 2 vCPU, 2 à 4 Go de RAM, 40 Go de SSD au départ (estimation).
- Pare-feu : 22 (SSH par clé), 80, 443 uniquement. La base n'est jamais exposée.
- DNS : enregistrement A/AAAA du domaine vers le VPS avant le premier démarrage (certificat HTTPS automatique).
- Sortie autorisée : SMTP 587 (e-mails) et HTTPS (API d'IA). Certains hébergeurs bloquent le port 587.
- Journaux Docker limités (10 Mo × 5 par service).
