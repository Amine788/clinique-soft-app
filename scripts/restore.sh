#!/usr/bin/env bash
# Restauration de NextClinic depuis une sauvegarde de scripts/backup.sh.
# REMPLACE la base et les fichiers téléversés actuels.
#
#   scripts/restore.sh <dossier>/db-AAAAMMJJ-HHMMSS.sql.gz [<dossier>/uploads-AAAAMMJJ-HHMMSS.tar.gz]
#
# Sans second argument, l'archive des fichiers du même horodatage, dans le même dossier, est utilisée.
# Déroulé :
#   1. vérification des deux archives (intégrité gzip, dump complet) ;
#   2. confirmation : taper RESTAURER (ou CONFIRMER=RESTAURER pour un usage non interactif) ;
#   3. arrêt de l'API et du proxy ;
#   4. sauvegarde de l'état actuel, sauf si la base est vide (ou SANS_SAUVEGARDE=1) ;
#   5. base recréée puis rechargée depuis le dump ; volume des fichiers vidé puis rechargé ;
#   6. compte limité de l'API remis à jour (db-app-account), redémarrage, contrôle de /api/health.
# Sur un serveur neuf : remplir .env.prod, lancer scripts/deploy.sh (images et schéma), puis ce script.
. "$(dirname "${BASH_SOURCE[0]}")/_commun.sh"

DB_F="${1:-}"
[ -n "$DB_F" ] && [ -f "$DB_F" ] || erreur "usage : scripts/restore.sh <db-AAAAMMJJ-HHMMSS.sql.gz> [uploads-AAAAMMJJ-HHMMSS.tar.gz]"
UP_F="${2:-}"
if [ -z "$UP_F" ]; then
    NOM="$(basename "$DB_F" .sql.gz)"
    CANDIDAT="$(dirname "$DB_F")/uploads-${NOM#db-}.tar.gz"
    [ -f "$CANDIDAT" ] && UP_F="$CANDIDAT"
fi

log "Vérification des archives"
gzip -t "$DB_F"
gzip -dc "$DB_F" | tail -n 1 | grep -q 'Dump completed' || erreur "$DB_F : dump incomplet"
echo "Base     : $DB_F"
if [ -n "$UP_F" ]; then gzip -t "$UP_F"; echo "Fichiers : $UP_F"; else echo "Fichiers : aucune archive (les fichiers actuels seront conservés)"; fi

if [ "${CONFIRMER:-}" != RESTAURER ]; then
    printf '\nLa base et les fichiers du projet « %s » vont être REMPLACÉS. Taper RESTAURER pour continuer : ' "$PROJET"
    read -r reponse
    [ "$reponse" = RESTAURER ] || erreur "restauration annulée"
fi

log "Arrêt de l'API et du proxy"
"${DC[@]}" stop api proxy
"${DC[@]}" up -d --wait db

TABLES="$(nombre_tables)"
if [ "$TABLES" != 0 ] && [ "${SANS_SAUVEGARDE:-0}" != 1 ]; then
    log "Sauvegarde de l'état actuel avant remplacement ($TABLES tables)"
    "$ROOT/scripts/backup.sh"
fi

log "Base de données : recréation puis chargement du dump"
"${DC[@]}" exec -T db sh -c 'MYSQL_PWD="$MYSQL_ROOT_PASSWORD" exec mysql -uroot -e "DROP DATABASE IF EXISTS \`$MYSQL_DATABASE\`;
    CREATE DATABASE \`$MYSQL_DATABASE\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"'
gzip -dc "$DB_F" | "${DC[@]}" exec -T db sh -c 'MYSQL_PWD="$MYSQL_ROOT_PASSWORD" exec mysql -uroot --default-character-set=utf8mb4 "$MYSQL_DATABASE"'
echo "$(nombre_tables) tables chargées"

if [ -n "$UP_F" ]; then
    log "Fichiers téléversés : volume vidé puis rechargé"
    "${DC[@]}" run --rm --no-deps -T --entrypoint sh api -c 'find /app/uploads -mindepth 1 -delete && tar -xzf - -C /app/uploads && find /app/uploads -type f | wc -l' < "$UP_F"
fi

log "Compte limité de l'API (droits sur les tables restaurées)"
"${DC[@]}" --profile install run --rm -T db-app-account

log "Redémarrage"
"${DC[@]}" up -d --wait
"${DC[@]}" ps --format '{{.Service}}\t{{.Status}}'
controle_public
log "Restauration terminée depuis $(basename "$DB_F")"
