#!/usr/bin/env bash
# Test de fumée NextClinic avant déploiement — base MySQL JETABLE et valeurs de test uniquement.
#
#   bash tests/smoke/run.sh local    API + front (build de production) sur l'hôte, MySQL et Mailpit en conteneurs
#   bash tests/smoke/run.sh docker   pile complète docker/compose.yaml (projet « nextclinic-smoke », volumes à part)
#
# Options (variables d'environnement) :
#   NO_CACHE=1     mode docker : reconstruit les images sans cache
#   PERSISTENCE=1  mode docker : arrête/redémarre les conteneurs puis vérifie base et fichiers téléversés
#   KEEP=1         ne supprime pas l'environnement de test à la fin
#   SKIP_PAGES=1   saute le test des pages React (Chrome requis sinon : CHROME_PATH)
# Rapports : tests/smoke/out/ (non suivi par git). Code de sortie ≠ 0 si un contrôle est KO.
set -uo pipefail

MODE="${1:-local}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SMOKE="$ROOT/tests/smoke"
OUT="${SMOKE_OUT:-$SMOKE/out}"
mkdir -p "$OUT"
set -a; . "$SMOKE/smoke.env"; set +a
export SMOKE_STATE="$OUT/state-$MODE.json" SMOKE_MAILPIT_URL="http://127.0.0.1:8026"
STATUS=0
PIDS=()

log() { printf '\n== %s\n' "$*"; }
# Seed du catalogue d'examens lancé deux fois : le second passage ne doit rien ajouter (idempotence)
seed_twice() { # commande…
    "$@" || return 1
    local second; second="$("$@" 2>&1)" || { echo "$second"; return 1; }
    echo "$second"
    echo "$second" | grep -q " 0 ajouté(s)" || { echo "Seed non idempotent" >&2; return 1; }
}
wait_http() { # url, secondes
    for _ in $(seq 1 "$2"); do curl -sf -o /dev/null "$1" && return 0; sleep 1; done
    echo "Délai dépassé : $1" >&2; return 1
}
run_tests() { # base_api, front, origine autorisée
    log "API ($MODE)"
    SMOKE_BASE_URL="$1" SMOKE_ALLOWED_ORIGIN="$3" SMOKE_REPORT="$OUT/api-$MODE.md" node "$SMOKE/api.mjs" > "$OUT/api-$MODE.log" 2>&1 || STATUS=1
    grep -E '^KO|^Total' "$OUT/api-$MODE.log"
    if [ "${SKIP_PAGES:-0}" != 1 ]; then
        log "Pages React ($MODE)"
        SMOKE_BASE_URL="$1" SMOKE_FRONT_URL="$2" SMOKE_PAGES_REPORT="$OUT/pages-$MODE.md" node "$SMOKE/pages.mjs" > "$OUT/pages-$MODE.log" 2>&1 || STATUS=1
        grep -E '^KO|^Total' "$OUT/pages-$MODE.log" | cut -c1-300
    fi
}

if [ "$MODE" = local ]; then
    LC=(docker compose --env-file "$SMOKE/smoke.env" -f "$SMOKE/compose.local.yaml")
    cleanup() {
        for p in "${PIDS[@]}"; do kill "$p" 2>/dev/null; done
        [ "${KEEP:-0}" = 1 ] || "${LC[@]}" down -v >/dev/null 2>&1
    }
    trap cleanup EXIT
    log "Base MySQL jetable (127.0.0.1:3317) et Mailpit"
    "${LC[@]}" up -d --wait || exit 1
    export DATABASE_URL="" DB_HOST=127.0.0.1 DB_PORT=3317 DB_USER=root DB_PASSWORD="$DB_ROOT_PASSWORD"
    log "Installation du schéma (base vide) et seed du catalogue d'examens (x2)"
    (cd "$ROOT/server" && node database/install.js) || exit 1
    (cd "$ROOT/server" && seed_twice node database/seedExamens.js) || exit 1
    log "Build de production du front"
    (cd "$ROOT" && npm run build > "$OUT/build-local.log" 2>&1) || { tail -20 "$OUT/build-local.log"; exit 1; }
    log "API (production, port 3001) et front (vite preview, port 4173)"
    (cd "$ROOT/server" && SMTP_HOST=127.0.0.1 SMTP_PORT=1026 NODE_TLS_REJECT_UNAUTHORIZED=0 NODE_ENV=production PORT=3001 \
        FRONTEND_URL=http://127.0.0.1:4173 CLINIC_TZ="$TZ" exec node index.js) > "$OUT/api-server-local.log" 2>&1 &
    PIDS+=($!)
    (cd "$ROOT" && exec node node_modules/vite/bin/vite.js preview --host 127.0.0.1 --port 4173 --strictPort) > "$OUT/preview-local.log" 2>&1 &
    PIDS+=($!)
    wait_http http://127.0.0.1:3001/api/health 120 || exit 1
    wait_http http://127.0.0.1:4173/ 60 || exit 1
    run_tests http://127.0.0.1:3001 http://127.0.0.1:4173 http://127.0.0.1:4173

elif [ "$MODE" = docker ]; then
    DC=(docker compose -p nextclinic-smoke --env-file "$SMOKE/smoke.env" -f "$ROOT/docker/compose.yaml" -f "$SMOKE/compose.docker.yaml")
    cleanup() { [ "${KEEP:-0}" = 1 ] || "${DC[@]}" --profile install down -v >/dev/null 2>&1; }
    trap cleanup EXIT
    BASE="http://127.0.0.1:${HTTP_PORT}"; export SMOKE_BASE_URL="$BASE"
    if [ "${NO_CACHE:-0}" = 1 ]; then log "Construction des images sans cache"; "${DC[@]}" --profile install build --no-cache || exit 1; fi
    log "Base et Mailpit"
    "${DC[@]}" up -d --build --wait db mailpit || exit 1
    log "Installation du schéma (profil install) et seed du catalogue d'examens (x2)"
    "${DC[@]}" --profile install run --rm db-install || exit 1
    seed_twice "${DC[@]}" --profile install run --rm -T db-install node database/seedExamens.js || exit 1
    log "Compte applicatif limité de l'API (x2 : idempotent)"
    "${DC[@]}" --profile install run --rm -T db-app-account || exit 1
    "${DC[@]}" --profile install run --rm -T db-app-account || exit 1
    log "API et proxy Caddy ($BASE)"
    "${DC[@]}" up -d --build --wait || exit 1
    wait_http "$BASE/api/health" 120 || exit 1
    "${DC[@]}" ps --format '{{.Service}}\t{{.State}}\t{{.Status}}'
    run_tests "$BASE" "$BASE" "$FRONTEND_URL"
    if [ "${PERSISTENCE:-0}" = 1 ]; then
        log "Persistance : stop/start des conteneurs"
        "${DC[@]}" stop && "${DC[@]}" start && "${DC[@]}" up -d --wait >/dev/null && wait_http "$BASE/api/health" 120
        node "$SMOKE/api.mjs" --check-persistence > "$OUT/persistence-stop-start.log" 2>&1 || STATUS=1
        grep -E '^(OK|KO)|^Total' "$OUT/persistence-stop-start.log"
        log "Persistance : down (sans -v) puis up — conteneurs recréés, volumes conservés"
        "${DC[@]}" down && "${DC[@]}" up -d --wait >/dev/null && wait_http "$BASE/api/health" 120
        node "$SMOKE/api.mjs" --check-persistence > "$OUT/persistence-down-up.log" 2>&1 || STATUS=1
        grep -E '^(OK|KO)|^Total' "$OUT/persistence-down-up.log"
    fi
    "${DC[@]}" logs --no-color > "$OUT/docker-logs.txt" 2>&1
else
    echo "Usage : bash tests/smoke/run.sh local|docker" >&2; exit 2
fi

log "Résultat : $([ $STATUS = 0 ] && echo 'tout est OK' || echo 'au moins un KO') — rapports dans $OUT"
exit $STATUS
