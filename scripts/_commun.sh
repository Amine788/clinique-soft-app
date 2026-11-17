#!/usr/bin/env bash
# Fonctions communes aux scripts d'exploitation de NextClinic (chargé par les autres scripts, jamais lancé seul).
#
# Variables lues dans l'environnement, sinon dans le fichier d'environnement, sinon valeur par défaut :
#   ENV_FILE              fichier d'environnement (défaut : .env.prod à la racine du dépôt)
#   COMPOSE_PROJECT_NAME  nom du projet Docker Compose (défaut : nextclinic) ; préfixe des volumes
#   COMPOSE_SURCOUCHE     fichier compose supplémentaire (tests uniquement)
#   ETAT_DIR              dossier de .app-version et deploiements.log (défaut : racine du dépôt)
# Le fichier d'environnement n'est jamais exécuté (« sourcé ») : un mot de passe contenant $ ou ` reste intact.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${ENV_FILE:-$ROOT/.env.prod}"
PROJET="${COMPOSE_PROJECT_NAME:-nextclinic}"
# Dossier de .app-version (version en service) et de deploiements.log : racine du dépôt sur le serveur
ETAT_DIR="${ETAT_DIR:-$ROOT}"
# Git Bash sous Windows (tests locaux uniquement) : chemins Windows explicites, et aucune conversion automatique
# des arguments (sinon « /app/uploads » deviendrait « C:/Program Files/Git/app/uploads »). Sans effet sous Linux.
if command -v cygpath >/dev/null 2>&1; then
    ROOT="$(cygpath -m "$ROOT")"; ENV_FILE="$(cygpath -m "$ENV_FILE")"
    if [ -n "${COMPOSE_SURCOUCHE:-}" ]; then COMPOSE_SURCOUCHE="$(cygpath -m "$COMPOSE_SURCOUCHE")"; fi
    export MSYS_NO_PATHCONV=1
fi

log() { printf '\n== %s\n' "$*"; }
erreur() { printf 'ERREUR : %s\n' "$*" >&2; exit 1; }

[ -f "$ENV_FILE" ] || erreur "fichier d'environnement introuvable : $ENV_FILE (copier .env.prod.example en .env.prod et le remplir)"
RESTANTS="$(grep -E '^[A-Z_]+=change[-_]me$' "$ENV_FILE" | cut -d= -f1 | tr '\n' ' ' || true)"
[ -z "$RESTANTS" ] || erreur "valeurs « change-me » à remplacer dans $ENV_FILE : $RESTANTS"
if [ "$(uname -s)" = Linux ]; then
    case "$(stat -c %a "$ENV_FILE")" in 600|400) ;; *) echo "ATTENTION : $ENV_FILE est lisible par d'autres comptes (chmod 600 $ENV_FILE)" >&2 ;; esac
fi

# Valeur d'une variable : environnement, sinon dernière définition dans le fichier, sinon défaut
valeur() {
    local nom="$1" defaut="${2:-}" v
    if [ -n "${!nom:-}" ]; then printf '%s' "${!nom}"; return; fi
    v="$(grep -E "^${nom}=" "$ENV_FILE" | tail -n 1 | cut -d= -f2- || true)"
    printf '%s' "${v:-$defaut}"
}

# Version des images en service : écrite par deploy.sh et rollback.sh après un démarrage réussi
# (sinon : APP_VERSION du fichier d'environnement, ou « local », selon docker-compose.prod.yml)
if [ -z "${APP_VERSION:-}" ] && [ -f "$ETAT_DIR/.app-version" ]; then export APP_VERSION="$(cat "$ETAT_DIR/.app-version")"; fi

DC=(docker compose -p "$PROJET" --env-file "$ENV_FILE" -f "$ROOT/docker-compose.prod.yml")
if [ -n "${COMPOSE_SURCOUCHE:-}" ]; then DC+=(-f "$COMPOSE_SURCOUCHE"); fi

# Commande SQL exécutée en root dans le conteneur db, sur la base de l'application
sql_root() { "${DC[@]}" exec -T db sh -c 'MYSQL_PWD="$MYSQL_ROOT_PASSWORD" exec mysql -uroot -N --default-character-set=utf8mb4 "$@" "$MYSQL_DATABASE"' sh "$@"; }

# Nombre de tables de la base (0 sur une installation neuve)
nombre_tables() { sql_root -e "SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE()" | tr -d '[:space:]'; }

# /api/health par l'adresse publique (DNS, HTTPS et proxy compris) ; avertit sans échouer
controle_public() {
    local url; url="$(valeur FRONTEND_URL)/api/health"
    for _ in $(seq 1 30); do
        if curl -fsS --max-time 10 "$url" >/dev/null 2>&1; then echo "OK : $url répond"; return 0; fi
        sleep 2
    done
    echo "ATTENTION : $url ne répond pas (DNS, certificat HTTPS ou pare-feu à vérifier)" >&2
}
