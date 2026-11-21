#!/usr/bin/env bash
# Test de fumée NextClinic avant déploiement — base MySQL JETABLE et valeurs de test uniquement.
#
#   bash tests/smoke/run.sh local    API + front (build de production) sur l'hôte, MySQL et Mailpit en conteneurs
#   bash tests/smoke/run.sh docker   pile de production docker-compose.prod.yml (projet « nextclinic-smoke », volumes à part)
#   bash tests/smoke/run.sh deux-domaines
#                                    même pile Docker pour l'API, mais front compilé avec VITE_API_URL et servi à part
#                                    (http://127.0.0.1:4174, comme un front sur Vercel) : CORS, temps réel, images et
#                                    documents vérifiés entre deux origines
#
# Options (variables d'environnement) :
#   NO_CACHE=1     mode docker : reconstruit les images sans cache
#   PERSISTENCE=1  mode docker : arrête/redémarre les conteneurs puis vérifie base et fichiers téléversés
#   HTTPS_LOCAL=1  mode docker : proxy relancé sur « localhost » ; HTTPS par certificat interne et redirection vérifiés
#   EXPLOITATION=1 mode docker : installation par scripts/deploy.sh et seed-catalogue.sh ; puis backup.sh, base détruite,
#                  restore.sh (empreinte identique), deploy.sh x2 (données conservées), rollback.sh
#   KEEP=1         ne supprime pas l'environnement de test à la fin
#   SKIP_PAGES=1   saute le test des pages React (Chrome requis sinon : CHROME_PATH)
# Rapports : tests/smoke/out/ (non suivi par git). Code de sortie ≠ 0 si un contrôle est KO.
set -uo pipefail

MODE="${1:-local}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SMOKE="$ROOT/tests/smoke"
OUT="${SMOKE_OUT:-$SMOKE/out}"
mkdir -p "$OUT"
SMOKE_ENV="${SMOKE_ENV_FILE:-$SMOKE/smoke.env}"
SMOKE_PROJECT="${SMOKE_PROJECT_NAME:-nextclinic-smoke}"
[[ "$SMOKE_PROJECT" =~ ^nextclinic-smoke(-[a-z0-9-]+)?$ ]] || { echo "Projet de test invalide" >&2; exit 2; }
set -a; . "$SMOKE_ENV"; set +a
[ "$DB_NAME" = nextclinic_smoke ] || { echo "Base de test attendue : nextclinic_smoke" >&2; exit 2; }
export SMOKE_STATE="$OUT/state-$MODE.json" SMOKE_MAILPIT_URL="http://127.0.0.1:${SMOKE_MAILPIT_PORT:-8026}"
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
verifier() { # libellé, commande… : OK/KO et code de sortie global
    local libelle="$1"; shift
    if "$@" >/dev/null 2>&1; then echo "OK  $libelle"; else echo "KO  $libelle"; STATUS=1; fi
}

# ── Scripts d'exploitation (mode docker, EXPLOITATION=1) ──
# Requête SQL (entrée standard) en root sur la base de test
sql_test() { "${DC[@]}" exec -T db sh -c 'MYSQL_PWD="$MYSQL_ROOT_PASSWORD" exec mysql -uroot -N --default-character-set=utf8mb4 "$MYSQL_DATABASE"'; }
# Empreinte complète, API arrêtée : somme de contrôle de chaque table, triggers, routines, sha256 de chaque fichier
empreinte() {
    local tables
    tables="$(sql_test <<'SQL'
SELECT GROUP_CONCAT(CONCAT('`', TABLE_NAME, '`') ORDER BY TABLE_NAME) FROM information_schema.TABLES
WHERE TABLE_SCHEMA = DATABASE() AND TABLE_TYPE = 'BASE TABLE';
SQL
)"
    echo "CHECKSUM TABLE $tables EXTENDED;" | sql_test
    sql_test <<'SQL'
SELECT 'tables', COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE();
SELECT 'trigger', TRIGGER_NAME, EVENT_OBJECT_TABLE FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA = DATABASE() ORDER BY 2;
SELECT 'routine', ROUTINE_NAME FROM information_schema.ROUTINES WHERE ROUTINE_SCHEMA = DATABASE() ORDER BY 2;
SQL
    "${DC[@]}" run --rm --no-deps -T --entrypoint sh api -c 'cd /app/uploads && find . -type f -exec sha256sum {} + | sort -k2'
}
comparer() { # libellé, empreinte de référence, empreinte à comparer
    local n_tables n_fichiers
    n_tables="$(grep -c $'\t' "$2" || true)"; n_fichiers="$(grep -c '  \./' "$2" || true)"
    if [ "$n_fichiers" -gt 0 ] && cmp -s "$2" "$3"; then echo "OK  $1 : base et fichiers identiques ($n_tables lignes d'empreinte, $n_fichiers fichiers)"
    else echo "KO  $1 : empreintes différentes ($2 / $3)"; diff "$2" "$3" | head -20; STATUS=1; fi
}
persistance() { # libellé : relecture par l'API (patient, scan de CIN, photo, logo, comptes)
    node "$SMOKE/api.mjs" --check-persistence > "$OUT/persistance-$1.log" 2>&1 || STATUS=1
    echo "    API après $1 : $(grep -E '^Total' "$OUT/persistance-$1.log")"
}
version_api() { docker inspect --format '{{.Config.Image}}' "$("${DC[@]}" ps -q api)"; }
exploitation() {
    local S="$ROOT/scripts" dump v1 v2 n
    log "Exploitation : scripts/backup.sh (API et proxy arrêtés pour figer l'empreinte de référence)"
    "${DC[@]}" stop api proxy >/dev/null 2>&1
    empreinte > "$OUT/empreinte-reference.txt"
    bash "$S/backup.sh" > "$OUT/exploitation-backup.log" 2>&1 || { echo "KO  backup.sh"; tail -20 "$OUT/exploitation-backup.log"; STATUS=1; return; }
    ls -l "$OUT"/sauvegardes | grep -E 'db-|uploads-' | awk '{print "    " $1, $5, $NF}'
    # Sauvegarde que backup.sh vient de produire : la plus récente (horodatage dans le nom)
    dump="$(ls "$OUT"/sauvegardes/db-*.sql.gz | sort | tail -n 1)"

    log "Exploitation : base et volumes détruits (down -v), base vide, puis scripts/restore.sh"
    "${DC[@]}" --profile install down -v >/dev/null 2>&1
    "${DC[@]}" up -d --wait db mailpit >/dev/null 2>&1
    echo "    tables avant restauration : $(echo 'SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE();' | sql_test)"
    bash "$S/restore.sh" "$dump" > "$OUT/exploitation-restore.log" 2>&1 || { echo "KO  restore.sh"; tail -20 "$OUT/exploitation-restore.log"; STATUS=1; return; }
    "${DC[@]}" stop api proxy >/dev/null 2>&1
    empreinte > "$OUT/empreinte-apres-restauration.txt"
    comparer "backup.sh puis restore.sh sur base vide" "$OUT/empreinte-reference.txt" "$OUT/empreinte-apres-restauration.txt"
    "${DC[@]}" up -d --wait >/dev/null 2>&1 && wait_http "$BASE/api/health" 60
    persistance restauration

    for n in 1 2; do
        # Référence prise juste avant : la relecture par l'API ajoute des lignes au journal d'audit des accès
        log "Exploitation : scripts/deploy.sh (passage $n)"
        "${DC[@]}" stop api proxy >/dev/null 2>&1
        empreinte > "$OUT/empreinte-avant-deploy-$n.txt"
        bash "$S/deploy.sh" > "$OUT/exploitation-deploy-$n.log" 2>&1 || { echo "KO  deploy.sh ($n)"; tail -20 "$OUT/exploitation-deploy-$n.log"; STATUS=1; return; }
        grep -E '^== Déployé' "$OUT/exploitation-deploy-$n.log" | sed 's/^/    /'
        export APP_VERSION="$(cat "$ETAT_DIR/.app-version")"
        "${DC[@]}" stop api proxy >/dev/null 2>&1
        empreinte > "$OUT/empreinte-deploy-$n.txt"
        comparer "deploy.sh (passage $n) : données conservées" "$OUT/empreinte-avant-deploy-$n.txt" "$OUT/empreinte-deploy-$n.txt"
        "${DC[@]}" up -d --wait >/dev/null 2>&1 && wait_http "$BASE/api/health" 60
        persistance "deploy-$n"
    done

    log "Exploitation : scripts/rollback.sh vers la version du premier passage"
    v1="$(sed -n 2p "$ETAT_DIR/deploiements.log" | cut -f2)"; v2="$APP_VERSION"
    bash "$S/rollback.sh" "$v1" > "$OUT/exploitation-rollback.log" 2>&1 || { echo "KO  rollback.sh"; tail -20 "$OUT/exploitation-rollback.log"; STATUS=1; return; }
    export APP_VERSION="$v1"
    verifier "rollback.sh : API sur nextclinic-api:$v1 (était $v2)" test "$(version_api)" = "nextclinic-api:$v1"
    wait_http "$BASE/api/health" 60
    persistance rollback
    # Images de test étiquetées par deploy.sh : supprimées (l'image en service est conservée)
    for v in $(cut -f2 "$ETAT_DIR/deploiements.log" | sort -u); do
        [ "$v" = "$v1" ] || docker image rm "nextclinic-api:$v" "nextclinic-web:$v" >/dev/null 2>&1 || true
    done
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
    LC=(docker compose --env-file "$SMOKE_ENV" -f "$SMOKE/compose.local.yaml")
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

elif [ "$MODE" = docker ] || [ "$MODE" = deux-domaines ]; then
    if [ "$MODE" = deux-domaines ]; then
        # Seule origine acceptée par l'API : celle du front servi à part (prioritaire sur smoke.env)
        FRONT_SEPARE="http://127.0.0.1:4174"; export FRONTEND_URL="$FRONT_SEPARE" SMOKE_DEUX_DOMAINES=1
    fi
    DC=(docker compose -p "$SMOKE_PROJECT" --env-file "$SMOKE_ENV" -f "$ROOT/docker-compose.prod.yml" -f "$SMOKE/compose.docker.yaml")
    cleanup() {
        for p in "${PIDS[@]}"; do kill "$p" 2>/dev/null; done
        [ "${KEEP:-0}" = 1 ] || "${DC[@]}" --profile install down -v >/dev/null 2>&1
    }
    trap cleanup EXIT
    BASE="http://127.0.0.1:${HTTP_PORT}"; export SMOKE_BASE_URL="$BASE"
    # Scripts d'exploitation (scripts/*.sh) appliqués à cette pile de test : jamais à la production
    export ENV_FILE="$SMOKE_ENV" COMPOSE_PROJECT_NAME="$SMOKE_PROJECT" COMPOSE_SURCOUCHE="$SMOKE/compose.docker.yaml" \
        BACKUP_DIR="$OUT/sauvegardes" ETAT_DIR="$OUT/etat" CONFIRMER=RESTAURER SANS_PULL=1
    rm -rf "$OUT/sauvegardes" "$OUT/etat"; mkdir -p "$OUT/etat"
    # Toujours une base neuve : une pile de test restée en place (KEEP=1, démo) fausserait l'installation et les empreintes.
    # Seul le projet de test nextclinic-smoke est concerné (jamais la pile réelle ni d'autres projets).
    log "Pile de test précédente supprimée (projet $SMOKE_PROJECT uniquement)"
    "${DC[@]}" --profile install down -v --remove-orphans >/dev/null 2>&1
    # Images reconstruites AVANT l'installation du schéma (comme scripts/deploy.sh) : sinon db-install
    # tournerait avec une image restée d'un lancement précédent et installerait un ancien schéma.
    if [ "${NO_CACHE:-0}" = 1 ]; then log "Construction des images sans cache"; "${DC[@]}" --profile install build --no-cache || exit 1
    else log "Construction des images"; "${DC[@]}" --profile install build || exit 1; fi
    log "Base et Mailpit"
    "${DC[@]}" up -d --build --wait db mailpit || exit 1
    if [ "${EXPLOITATION:-0}" = 1 ]; then
        # Parcours d'une première mise en production : deploy.sh sur base neuve, puis seed par son script
        log "Première installation par scripts/deploy.sh (base neuve)"
        bash "$ROOT/scripts/deploy.sh" > "$OUT/exploitation-deploy-0.log" 2>&1 || { tail -30 "$OUT/exploitation-deploy-0.log"; exit 1; }
        grep -E '^== (Déployé|Sauvegarde)|^OK|ATTENTION' "$OUT/exploitation-deploy-0.log"
        export APP_VERSION="$(cat "$ETAT_DIR/.app-version")"
        log "Catalogue d'examens par scripts/seed-catalogue.sh (x2)"
        seed_twice bash "$ROOT/scripts/seed-catalogue.sh" 2>&1 | grep -E "Catalogue|Seed" || exit 1
    else
        log "Installation du schéma (profil install) et seed du catalogue d'examens (x2)"
        "${DC[@]}" --profile install run --rm db-install || exit 1
        seed_twice "${DC[@]}" --profile install run --rm -T db-install node database/seedExamens.js || exit 1
        log "Compte applicatif limité de l'API (x2 : idempotent)"
        "${DC[@]}" --profile install run --rm -T db-app-account || exit 1
        "${DC[@]}" --profile install run --rm -T db-app-account || exit 1
    fi
    log "API et proxy Caddy ($BASE)"
    "${DC[@]}" up -d --build --wait || exit 1
    wait_http "$BASE/api/health" 120 || exit 1
    "${DC[@]}" ps --format '{{.Service}}\t{{.State}}\t{{.Status}}'
    if [ "$MODE" = deux-domaines ]; then
        # Front compilé comme pour Vercel : l'adresse de l'API est figée au build. Le proxy de vite preview vise
        # 127.0.0.1:3001 (rien n'y écoute) : un appel resté sur l'origine du front échouerait et serait signalé.
        log "Front séparé (build avec VITE_API_URL=$BASE, vite preview sur $FRONT_SEPARE)"
        (cd "$ROOT" && VITE_API_URL="$BASE" node node_modules/vite/bin/vite.js build --outDir "$OUT/front-deux-domaines" --emptyOutDir \
            > "$OUT/build-deux-domaines.log" 2>&1) || { tail -20 "$OUT/build-deux-domaines.log"; exit 1; }
        (cd "$ROOT" && exec node node_modules/vite/bin/vite.js preview --outDir "$OUT/front-deux-domaines" --host 127.0.0.1 --port 4174 --strictPort) \
            > "$OUT/preview-deux-domaines.log" 2>&1 &
        PIDS+=($!)
        wait_http "$FRONT_SEPARE/" 60 || exit 1
        run_tests "$BASE" "$FRONT_SEPARE" "$FRONT_SEPARE"
    else
        run_tests "$BASE" "$BASE" "$FRONTEND_URL"
    fi
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
    if [ "${HTTPS_LOCAL:-0}" = 1 ]; then
        # Domaine de test « localhost » : Caddy émet un certificat de son autorité interne (comme Let's Encrypt en production)
        log "HTTPS : proxy relancé avec SITE_ADDRESS=localhost (certificat interne de Caddy)"
        SITE_ADDRESS=localhost "${DC[@]}" up -d --wait proxy >/dev/null 2>&1 || { verifier "proxy HTTPS démarré" false; }
        sante=""; for _ in $(seq 1 30); do sante="$(curl -sk --max-time 5 --resolve "localhost:${HTTPS_PORT}:127.0.0.1" "https://localhost:${HTTPS_PORT}/api/health")" && [ -n "$sante" ] && break; sleep 1; done
        verifier "HTTPS : /api/health répond en TLS ($sante)" grep -q '"status":"ok"' <<< "$sante"
        emetteur="$(echo | openssl s_client -connect "127.0.0.1:${HTTPS_PORT}" -servername localhost 2>/dev/null | openssl x509 -noout -issuer 2>/dev/null)"
        verifier "HTTPS : certificat émis par l'autorité interne de Caddy ($emetteur)" grep -q 'Caddy Local Authority' <<< "$emetteur"
        redir="$(curl -s -o /dev/null --max-time 5 -w '%{http_code} %{redirect_url}' -H 'Host: localhost' "http://127.0.0.1:${HTTP_PORT}/api/health")"
        verifier "HTTP : redirection permanente vers HTTPS ($redir)" grep -qE '^30[18] https://localhost' <<< "$redir"
        "${DC[@]}" up -d --wait proxy >/dev/null 2>&1 && wait_http "$BASE/api/health" 60
    fi
    if [ "${EXPLOITATION:-0}" = 1 ]; then
        exploitation
    fi
    "${DC[@]}" logs --no-color > "$OUT/docker-logs.txt" 2>&1
else
    echo "Usage : bash tests/smoke/run.sh local|docker|deux-domaines" >&2; exit 2
fi

log "Résultat : $([ $STATUS = 0 ] && echo 'tout est OK' || echo 'au moins un KO') — rapports dans $OUT"
exit $STATUS
