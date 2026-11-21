#!/usr/bin/env bash
# Installation ou mise à jour de NextClinic sur le serveur, sans perte de données (volumes conservés).
#
#   scripts/deploy.sh
#
# Déroulé (le même pour la première installation et les mises à jour, relançable sans risque) :
#   1. git pull en avance rapide uniquement (SANS_PULL=1 : code déjà en place) ;
#   2. construction des images, étiquetées date-commit (les précédentes restent pour rollback.sh) ;
#   3. démarrage de la base ; sauvegarde complète si elle contient déjà des données (SANS_SAUVEGARDE=1 pour s'en passer) ;
#   4. schéma et protections (db-install : crée ce qui manque, ne supprime rien) ;
#   5. compte limité de l'API (db-app-account : droits sur les nouvelles tables) ;
#   6. redémarrage de l'API et du proxy, attente de leur état « healthy », contrôle de l'adresse publique.
# Le catalogue d'examens se remplit à part : scripts/seed-catalogue.sh.
. "$(dirname "${BASH_SOURCE[0]}")/_commun.sh"
cd "$ROOT"

PRECEDENTE="$(cat "$ETAT_DIR/.app-version" 2>/dev/null || echo aucune)"

if [ "${SANS_PULL:-0}" != 1 ]; then
    log "Récupération du code (git pull --ff-only)"
    if [ -n "$(git status --porcelain --untracked-files=no)" ]; then
        echo "ATTENTION : fichiers suivis modifiés sur le serveur (conservés si git pull le permet) :" >&2
        git status --short --untracked-files=no >&2
    fi
    git pull --ff-only
fi
COMMIT="$(git rev-parse --short HEAD)"
export APP_VERSION="$(date +%Y%m%d-%H%M%S)-$COMMIT"

log "Construction des images (version $APP_VERSION)"
"${DC[@]}" --profile install build

log "Base de données"
"${DC[@]}" up -d --wait db
TABLES="$(nombre_tables)"
if [ "$TABLES" != 0 ] && [ "${SANS_SAUVEGARDE:-0}" != 1 ]; then
    log "Sauvegarde avant mise à jour ($TABLES tables)"
    "$ROOT/scripts/backup.sh"
fi

log "Schéma et protections (db-install)"
"${DC[@]}" --profile install run --rm -T db-install
log "Compte limité de l'API (db-app-account)"
"${DC[@]}" --profile install run --rm -T db-app-account

log "Redémarrage de l'API et du proxy"
"${DC[@]}" up -d --wait
controle_public

echo "$APP_VERSION" > "$ETAT_DIR/.app-version"
printf '%s\t%s\tcommit %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$APP_VERSION" "$COMMIT" >> "$ETAT_DIR/deploiements.log"
"${DC[@]}" ps --format '{{.Service}}\t{{.Status}}'

log "Nettoyage : 5 dernières versions des images conservées"
for image in nextclinic-api nextclinic-web; do
    docker image ls "$image" --format '{{.Tag}}' | grep -E '^[0-9]{8}-[0-9]{6}-' | sort -r | tail -n +6 \
        | while read -r tag; do docker image rm "$image:$tag" >/dev/null && echo "supprimée : $image:$tag"; done
done

log "Déployé : $APP_VERSION (précédente : $PRECEDENTE)"
[ "$PRECEDENTE" = aucune ] || echo "Retour arrière si besoin : scripts/rollback.sh $PRECEDENTE"
