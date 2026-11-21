#!/usr/bin/env bash
# Retour à une version précédente de NextClinic (images de l'API et du front construites par deploy.sh).
#
#   scripts/rollback.sh             liste les versions disponibles sur le serveur
#   scripts/rollback.sh <version>   redémarre l'API et le proxy sur ces images
#
# La base et les fichiers ne sont PAS modifiés. Si la version abandonnée avait changé le schéma de façon
# incompatible, restaurer aussi la sauvegarde faite par deploy.sh juste avant elle (scripts/restore.sh).
. "$(dirname "${BASH_SOURCE[0]}")/_commun.sh"
cd "$ROOT"

VERSION="${1:-}"
if [ -z "$VERSION" ]; then
    echo "Version en service : $(cat "$ETAT_DIR/.app-version" 2>/dev/null || echo inconnue)"
    echo "Versions disponibles (les plus récentes d'abord) :"
    docker image ls nextclinic-api --format '{{.Tag}}' | grep -E '^[0-9]{8}-[0-9]{6}-' | sort -r
    exit 0
fi
docker image inspect "nextclinic-api:$VERSION" "nextclinic-web:$VERSION" >/dev/null 2>&1 \
    || erreur "images introuvables pour la version $VERSION (scripts/rollback.sh sans argument pour la liste)"

export APP_VERSION="$VERSION"
log "Redémarrage sur la version $VERSION"
"${DC[@]}" up -d --wait --no-build api proxy
controle_public

echo "$VERSION" > "$ETAT_DIR/.app-version"
printf '%s\t%s\tretour arrière\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$VERSION" >> "$ETAT_DIR/deploiements.log"
"${DC[@]}" ps --format '{{.Service}}\t{{.Status}}'
log "Version en service : $VERSION"
