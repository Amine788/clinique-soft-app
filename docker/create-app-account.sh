#!/bin/sh
# Compte applicatif LIMITÉ de l'API (procédure de server/database/INSTALLATION.md, « Comptes séparés »).
# Lancé par : docker compose -f docker/compose.yaml --profile install run --rm db-app-account
# Idempotent : crée le compte s'il manque, (re)définit son mot de passe, retire tous ses droits,
# puis accorde seulement les droits métier, table par table :
#   SELECT, INSERT sur clinical_access_audit_events ; SELECT, INSERT, UPDATE, DELETE sur les autres ;
#   EXECUTE sur la routine nextclinic_audit_protection_status. Aucun droit DDL ni GRANT OPTION.
# À relancer après chaque `db-install` qui ajoute des tables (les droits sont par table).
set -eu
: "${APP_USER:?DB_USER requis}" "${APP_PASSWORD:?DB_PASSWORD requis}" "${DB_NAME:?DB_NAME requis}" "${MYSQL_PWD:?DB_ROOT_PASSWORD requis}"
[ "$APP_USER" != root ] || { echo "DB_USER ne doit pas être root : créer un compte applicatif distinct" >&2; exit 1; }

# Échappement d'une chaîne SQL entre apostrophes (antislash puis apostrophe)
esc() { printf '%s' "$1" | sed -e 's/\\/\\\\/g' -e "s/'/''/g"; }
U="$(esc "$APP_USER")"
P="$(esc "$APP_PASSWORD")"
sql() { mysql -h db --protocol=TCP -uroot "$@"; }

sql -e "CREATE USER IF NOT EXISTS '$U'@'%' IDENTIFIED BY '$P';
        ALTER USER '$U'@'%' IDENTIFIED BY '$P';
        REVOKE ALL PRIVILEGES, GRANT OPTION FROM '$U'@'%';"

GRANTS="$(sql -N "$DB_NAME" -e "SELECT CONCAT('GRANT ', IF(TABLE_NAME = 'clinical_access_audit_events', 'SELECT, INSERT', 'SELECT, INSERT, UPDATE, DELETE'),
    ' ON \`', REPLACE(TABLE_SCHEMA, '\`', '\`\`'), '\`.\`', REPLACE(TABLE_NAME, '\`', '\`\`'), '\` TO ''$U''@''%'';')
    FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_TYPE = 'BASE TABLE'")"
[ -n "$GRANTS" ] || { echo "Aucune table dans $DB_NAME : lancer d'abord db-install" >&2; exit 1; }

printf '%s\n' "$GRANTS" "GRANT EXECUTE ON PROCEDURE \`$DB_NAME\`.nextclinic_audit_protection_status TO '$U'@'%';" | sql "$DB_NAME"
echo "Compte applicatif $APP_USER : droits métier sur $(printf '%s\n' "$GRANTS" | wc -l) tables + EXECUTE sur la routine de contrôle."
