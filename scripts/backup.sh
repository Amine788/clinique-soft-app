#!/usr/bin/env bash
# Sauvegarde de NextClinic, sans arrêt du service : base MySQL (dump cohérent) + fichiers téléversés
# (photos, logos, résultats d'examens, scans de CIN), puis rotation et copie distante facultative.
#
#   scripts/backup.sh
#
# Produit, dans BACKUP_DIR (dossier en 700, fichiers en 600 : données de santé) :
#   db-AAAAMMJJ-HHMMSS.sql.gz        base complète (tables, triggers, routines)
#   uploads-AAAAMMJJ-HHMMSS.tar.gz   contenu du volume des fichiers
# Variables (.env.prod ou environnement) :
#   BACKUP_DIR         dossier des sauvegardes (défaut : backups/ à la racine du dépôt)
#   RETENTION_JOURS    sauvegardes plus anciennes supprimées du VPS (défaut : 14)
#   BACKUP_RSYNC_DEST  copie hors du VPS par rsync/SSH (ex. sauvegarde@autre-serveur:/srv/nextclinic) ; vide = aucune
# Planification (crontab -e), chaque nuit à 2 h 30 :
#   30 2 * * * /home/deploy/clinique-soft-app/scripts/backup.sh >> /home/deploy/nextclinic-backup.log 2>&1
. "$(dirname "${BASH_SOURCE[0]}")/_commun.sh"
umask 077

DIR="$(valeur BACKUP_DIR "$ROOT/backups")"
RETENTION="$(valeur RETENTION_JOURS 14)"
DEST="$(valeur BACKUP_RSYNC_DEST)"
[[ "$RETENTION" =~ ^[0-9]+$ ]] || erreur "RETENTION_JOURS doit être un nombre de jours : $RETENTION"
mkdir -p "$DIR" 2>/dev/null || erreur "impossible de créer $DIR (sudo install -d -m 700 -o \"\$USER\" $DIR)"
chmod 700 "$DIR"

STAMP="$(date +%Y%m%d-%H%M%S)"
DB_F="$DIR/db-$STAMP.sql.gz"
UP_F="$DIR/uploads-$STAMP.tar.gz"
trap 'rm -f "$DB_F.part" "$UP_F.part"' EXIT

log "Base de données → $DB_F"
"${DC[@]}" up -d --wait db
"${DC[@]}" exec -T db sh -c 'MYSQL_PWD="$MYSQL_ROOT_PASSWORD" exec mysqldump -uroot --single-transaction --routines --triggers \
    --no-tablespaces --default-character-set=utf8mb4 "$MYSQL_DATABASE"' | gzip > "$DB_F.part"
gzip -t "$DB_F.part"
gzip -dc "$DB_F.part" | tail -n 1 | grep -q 'Dump completed' || erreur "dump incomplet (pas de ligne « Dump completed »)"
mv "$DB_F.part" "$DB_F"

log "Fichiers téléversés → $UP_F"
"${DC[@]}" run --rm --no-deps -T --entrypoint tar api -czf - -C /app/uploads . > "$UP_F.part"
gzip -t "$UP_F.part"
mv "$UP_F.part" "$UP_F"
ls -l "$DB_F" "$UP_F"

log "Rotation : suppression des sauvegardes de plus de $RETENTION jours"
find "$DIR" -maxdepth 1 -type f \( -name 'db-*.sql.gz' -o -name 'uploads-*.tar.gz' \) -mtime +"$RETENTION" -print -delete

if [ -n "$DEST" ]; then
    log "Copie hors du VPS → $DEST"
    rsync -a "$DB_F" "$UP_F" "$DEST/"
fi
log "Sauvegarde terminée : $STAMP"
