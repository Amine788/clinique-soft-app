# Test de fumée avant déploiement

À relancer avant chaque déploiement. Tout tourne sur une **base MySQL jetable** avec des
**valeurs de test** (`smoke.env`) : jamais la base de production, jamais de vrais identifiants,
aucun e-mail réel (Mailpit capture les envois et le script vérifie seulement qu'ils ont été produits).

## Lancer

Depuis la racine du dépôt (Git Bash sous Windows), Docker Desktop démarré, `npm ci` fait à la
racine et dans `server/` pour le mode local :

```bash
bash tests/smoke/run.sh local                      # API + build de production du front sur l'hôte
bash tests/smoke/run.sh docker                     # pile complète docker/compose.yaml
NO_CACHE=1 PERSISTENCE=1 bash tests/smoke/run.sh docker   # images sans cache + test de redémarrage
```

Rapports dans `tests/smoke/out/` (non suivi) : `api-<mode>.md`, `pages-<mode>.md`, journaux.
Le code de sortie vaut 1 si un contrôle est KO.

| Option | Effet |
|---|---|
| `NO_CACHE=1` | (docker) reconstruit les images sans cache |
| `PERSISTENCE=1` | (docker) `stop`/`start` puis `down`/`up` : la base et les fichiers téléversés doivent survivre |
| `KEEP=1` | garde l'environnement de test à la fin (pour inspecter) |
| `SKIP_PAGES=1` | saute le test des pages (Chrome requis sinon, chemin via `CHROME_PATH`) |

## Ce qui est vérifié

- **`api.mjs`** : toutes les routes Express (inventaire de `server/routes`). Pour chacune : cas
  normal, données invalides, ressource inexistante, accès sans jeton (401) et mauvais rôle (403).
  Parcours complet : inscription d'une clinique → lien de mot de passe reçu par e-mail →
  comptes de chaque rôle → patients, scans de CIN (signature réelle du fichier, téléchargement
  authentifié, jamais publics), RDV, absences, examens, ordonnances, circuit du médicament,
  pharmacie, hospitalisations, facturation, tableaux de bord, accès patients, IA (sans clé :
  refus propre), super-admin, cloisonnement entre deux cliniques, CORS, JWT falsifiés/expirés.
- **`pages.mjs`** : chaque page de `src/App.jsx`, avec chaque rôle autorisé, dans Chrome headless :
  aucune exception JavaScript, aucune erreur console, aucun appel `/api` en erreur, pas de
  redirection non voulue ; puis la déconnexion.

## Isolation

- Mode local : projet compose `nextclinic-smoke-local`, MySQL sur `127.0.0.1:3317` (stockage en
  mémoire), Mailpit sur `127.0.0.1:1026`/`8026`, API sur `3001`, front sur `4173`.
- Mode docker : projet `nextclinic-smoke` (volumes distincts de la pile réelle `nextclinic`),
  site sur `127.0.0.1:8091`. La surcouche `compose.docker.yaml` ajoute Mailpit, désactive le
  journal binaire de la base jetable et accepte le certificat auto-signé de Mailpit
  (`NODE_TLS_REJECT_UNAUTHORIZED=0`, **test uniquement**).
- Catalogue d'examens : alimenté par le seed du projet (`server/database/seedExamens.js`),
  lancé deux fois pour vérifier qu'il est idempotent (le second passage n'ajoute rien).
