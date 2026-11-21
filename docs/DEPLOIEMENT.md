# Déploiement Docker — NextClinic ERP

Pile de production : [`docker-compose.prod.yml`](../docker-compose.prod.yml). Trois conteneurs, une seule adresse publique :

| Service | Image | Rôle | Exposé |
|---|---|---|---|
| `proxy` | `nextclinic-web` (Caddy 2.11) | Front compilé + reverse proxy `/api`, `/uploads`, `/socket.io` ; HTTPS automatique | 80 / 443 |
| `api` | `nextclinic-api` (Node 22) | API Express + Socket.io + rappels horaires | non (réseau interne) |
| `db` | `mysql:8.4.13` | Base de données | non (réseau interne, sans Internet) |

Volumes : `db_data` (base), `uploads` (photos, logos, résultats d'examens, scans de CIN), `caddy_data` (certificats).
Tous les services redémarrent seuls (`restart: unless-stopped`) et ont un contrôle de santé.
**L'API doit rester à une seule instance** (rappels et connexions temps réel en mémoire).

Toutes les commandes se lancent depuis la racine du dépôt, sur le serveur, avec un compte membre du groupe `docker`.

## 1. Configuration

```bash
cp .env.prod.example .env.prod
chmod 600 .env.prod
nano .env.prod          # remplacer TOUTES les valeurs « change-me » (un commentaire décrit chaque variable)
```

Secrets : `openssl rand -hex 48` pour `JWT_SECRET`, `DB_PASSWORD`, `DB_ROOT_PASSWORD`, `DB_BOOTSTRAP_PASSWORD`
(une valeur différente pour chacun) ; `DB_MIGRATION_PASSWORD` = `DB_ROOT_PASSWORD` ; `openssl rand -hex 16` pour
`SUPER_ADMIN_PASSWORD`. Les scripts refusent de démarrer tant qu'une valeur `change-me` reste dans `.env.prod`.
`.env.prod` n'est jamais commité ni copié dans une image.

## 2. Première installation

Le DNS du domaine (`SITE_ADDRESS`) doit déjà viser le serveur : Caddy obtient le certificat au premier démarrage.

```bash
scripts/deploy.sh                       # images, base, schéma et protections, compte limité, démarrage
scripts/seed-catalogue.sh --dry-run     # aperçu du catalogue d'examens (prix : server/database/seeds/examens-courants.json)
scripts/seed-catalogue.sh               # ajout des examens absents (idempotent)
curl -s https://erp.votre-domaine.ma/api/health    # {"status":"ok","database":"connected",...}
```

Le super-administrateur est créé au premier démarrage (`SUPER_ADMIN_EMAIL`, `SUPER_ADMIN_PASSWORD`). Après la première
connexion, retirer `SUPER_ADMIN_PASSWORD` de `.env.prod` puis relancer `scripts/deploy.sh` (ou `SANS_PULL=1 scripts/deploy.sh`).
Le script `server/seed.js` (données de démonstration, **supprime** des données) n'est pas inclus dans l'image.

Le déploiement et le retour arrière ne sont validés qu'après une réponse de
`/api/health` confirmant `status: ok` à l'adresse publique. Une page HTML ou
une adresse indisponible provoque un échec ; le fichier `.app-version` conserve
alors la dernière version validée. Les nouveaux conteneurs peuvent déjà avoir démarré :
consulter les journaux et corriger la panne avant de relancer ou de revenir en arrière.

## 3. Mise à jour et retour arrière

```bash
scripts/deploy.sh               # git pull, sauvegarde, nouvelles images, schéma, redémarrage ; données conservées
scripts/rollback.sh             # liste des versions disponibles (5 dernières conservées)
scripts/rollback.sh <version>   # retour aux images de cette version ; base et fichiers inchangés
```

Si la version abandonnée avait modifié le schéma de façon incompatible, restaurer en plus la sauvegarde que
`deploy.sh` a faite juste avant elle (§ 4). **Ne jamais utiliser `docker compose down -v`** (supprime la base et les fichiers).
Historique des déploiements : `deploiements.log` (non suivi par Git).

## 4. Sauvegarde et restauration

```bash
scripts/backup.sh                                                   # base + fichiers, rotation, copie distante
scripts/restore.sh /var/backups/nextclinic/db-AAAAMMJJ-HHMMSS.sql.gz   # + uploads-… du même horodatage
```

Planification quotidienne (`crontab -e`) :

```
30 2 * * * /home/deploy/clinique-soft-app/scripts/backup.sh >> /home/deploy/nextclinic-backup.log 2>&1
```

Les sauvegardes contiennent des données de santé : dossier en 700, fichiers en 600, copie **hors du VPS** par
`BACKUP_RSYNC_DEST` (rsync par SSH avec clé). `restore.sh` demande de taper `RESTAURER`, sauvegarde l'état actuel,
recrée la base, remplace les fichiers, remet à jour le compte limité puis redémarre.
Sur un serveur neuf : `.env.prod`, puis `scripts/deploy.sh`, puis `scripts/restore.sh <sauvegarde>`. La restauration exécute les
migrations additives de la version installée avant de remettre les droits applicatifs et
de redémarrer l'API, afin de compléter les sauvegardes antérieures sans effacer leurs données.

### Test de restauration (chaque mois, sans toucher à la production)

Restaurer dans un environnement **jetable**, sur une autre machine ou sous un autre nom de projet, puis comparer :

```bash
cp .env.prod /tmp/env-restauration && sed -i 's/^HTTP_PORT=.*/HTTP_PORT=8081/; s/^HTTPS_PORT=.*/HTTPS_PORT=8444/; s/^SITE_ADDRESS=.*/SITE_ADDRESS=:80/' /tmp/env-restauration
export ENV_FILE=/tmp/env-restauration COMPOSE_PROJECT_NAME=nextclinic-restauration ETAT_DIR=/tmp SANS_PULL=1 SANS_SAUVEGARDE=1
scripts/deploy.sh && scripts/restore.sh /var/backups/nextclinic/db-<date>.sql.gz
#   → comparer le nombre de lignes des tables principales et les sha256 des fichiers avec la production
docker compose -p nextclinic-restauration -f docker-compose.prod.yml --env-file /tmp/env-restauration --profile install down -v
unset ENV_FILE COMPOSE_PROJECT_NAME ETAT_DIR SANS_PULL SANS_SAUVEGARDE; rm -f /tmp/env-restauration
```

Ne jamais afficher le contenu des tables ni des fichiers dans un rapport : seulement des nombres et des empreintes.
Le test de fumée `EXPLOITATION=1 bash tests/smoke/run.sh docker` fait ce parcours sur des données fictives
(empreinte complète identique avant sauvegarde et après restauration sur base vide).

## 5. Reprendre une base existante (sans perte)

```bash
# Sur l'ancienne machine : export en lecture seule
mysqldump -u<user> -p --single-transaction --routines --triggers --no-tablespaces \
  --default-character-set=utf8mb4 nextclinic_db | gzip > db-reprise.sql.gz
# Sur le serveur : installation (§ 2), puis chargement du dump (le schéma manquant est complété par deploy.sh)
scripts/deploy.sh
scripts/restore.sh db-reprise.sql.gz
SANS_PULL=1 scripts/deploy.sh
```

Les migrations `server/database/migrations/*.sql` doivent avoir été appliquées à l'ancienne base **avant** l'export ;
ne jamais les rejouer à l'aveugle. Fichiers téléversés de l'ancienne machine : les archiver
(`tar czf uploads-reprise.tar.gz -C server/uploads .`) et les passer en second argument de `restore.sh`.

## 6. Développement

```bash
cp .env.prod.example .env.dev    # valeurs de développement
docker compose --env-file .env.dev -f docker-compose.prod.yml -f docker/compose.dev.yaml up -d   # base (127.0.0.1:3307) + API (127.0.0.1:3001)
npm run dev                                                                                       # front Vite
```

Le développement est un projet distinct (`nextclinic-dev`) : ses volumes ne sont **jamais** ceux de la production.

## 7. Serveur (VPS Linux)

- Docker Engine + plugin Compose ; 2 vCPU, 2 à 4 Go de RAM, 40 Go de SSD au départ (estimation).
- Pare-feu : 22 (SSH par clé), 80, 443 (TCP et UDP) uniquement. La base n'est jamais exposée.
- DNS : enregistrement A (et AAAA) du domaine vers le VPS avant le premier démarrage.
- Sortie autorisée : SMTP 587 (e-mails) et HTTPS (API d'IA).
- Journaux Docker limités (10 Mo × 5 par service).

### Compatibilité des paiements lors d'un retour arrière

Après utilisation du registre des paiements (paiements partiels, patient et assurance), revenir uniquement à une
version qui prend en charge ce registre. Une ancienne version qui marque une facture intégralement payée
sans enregistrer son montant ne conserve pas la traçabilité des paiements partiels. Pour un retour à une
version antérieure à cette fonctionnalité, restaurer aussi sa sauvegarde cohérente selon la procédure ci-dessus.
