#!/usr/bin/env bash
# Catalogue d'examens courants (server/database/seeds/examens-courants.json : 31 examens, prix indicatifs en MAD).
#
#   scripts/seed-catalogue.sh --dry-run   affiche ce qui serait ajouté, sans rien écrire
#   scripts/seed-catalogue.sh             ajoute les examens absents
#
# Idempotent : n'ajoute que les examens dont le code ET le nom sont nouveaux, ne modifie ni ne supprime jamais
# un examen existant. Ajuster les prix dans le fichier JSON AVANT le premier lancement (ensuite : en SQL).
# Le fichier JSON est lu dans l'image : après une modification, relancer scripts/deploy.sh avant ce script.
. "$(dirname "${BASH_SOURCE[0]}")/_commun.sh"

"${DC[@]}" up -d --wait db
"${DC[@]}" --profile install run --rm -T db-install node database/seedExamens.js "$@"
