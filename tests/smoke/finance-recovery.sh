#!/usr/bin/env bash
# Uniquement une pile de test jetable, jamais une base de clinique.
. "$(dirname "${BASH_SOURCE[0]}")/../../scripts/_commun.sh"
[[ "$PROJET" =~ ^nextclinic-smoke- ]] || erreur "Projet de test distinct requis"
[ "$(valeur DB_NAME)" = nextclinic_smoke ] || erreur "Base de test requise"
: "${SMOKE_OUT:?Dossier de rapports requis}"
export BACKUP_DIR="$SMOKE_OUT/recovery-backups" CONFIRMER=RESTAURER SANS_SAUVEGARDE=1
mkdir -p "$BACKUP_DIR"

fingerprint() {
    local tables
    tables="$(sql_root -e "SELECT GROUP_CONCAT(CONCAT(CHAR(96), TABLE_NAME, CHAR(96)) ORDER BY TABLE_NAME) FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_TYPE='BASE TABLE'")"
    sql_root -e "CHECKSUM TABLE $tables EXTENDED"
    sql_root -e "SELECT 'trigger', TRIGGER_NAME, EVENT_OBJECT_TABLE FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA=DATABASE() ORDER BY 2; SELECT 'routine', ROUTINE_NAME FROM information_schema.ROUTINES WHERE ROUTINE_SCHEMA=DATABASE() ORDER BY 2"
    "${DC[@]}" run --rm --no-deps -T --entrypoint sh api -c 'cd /app/uploads && find . -type f -exec sha256sum {} + | sort -k2'
}
"${DC[@]}" stop api proxy
fingerprint > "$SMOKE_OUT/recovery-before.txt"
bash "$ROOT/scripts/backup.sh"
dump="$(find "$BACKUP_DIR" -maxdepth 1 -type f -name 'db-*.sql.gz' | sort | tail -n 1)"
[ -n "$dump" ] || erreur "Sauvegarde absente"
bash "$ROOT/scripts/restore.sh" "$dump"
"${DC[@]}" stop api proxy
fingerprint > "$SMOKE_OUT/recovery-after.txt"
cmp "$SMOKE_OUT/recovery-before.txt" "$SMOKE_OUT/recovery-after.txt" || erreur "Données ou fichiers différents après restauration"
"${DC[@]}" up -d --wait
controle_public
echo "OK RECOVERY : paiements, factures, audit et fichiers identiques après restauration"
