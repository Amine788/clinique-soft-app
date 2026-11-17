# E-mails et IA

Les secrets restent dans `server/.env` en local ou `docker/.env` pour Compose. Les fichiers `.env.example` décrivent les variables ; les fichiers privés ne sont pas versionnés. Redémarrer l'API après un changement de configuration.

## E-mails

Pour Gmail, renseigner `GMAIL_USER` et `GMAIL_APP_PASSWORD` (mot de passe d'application). Pour un autre fournisseur, renseigner `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD` et `EMAIL_FROM`. Les identifiants `SMTP_*` ont priorité sur les anciens identifiants Gmail. `EMAIL_FROM` attend une adresse seule. Le port 465 utilise TLS dès la connexion ; les autres ports exigent STARTTLS. Les délais de connexion et d'envoi sont bornés.

`ADMIN_NOTIFICATION_EMAIL` désigne le destinataire des notifications internes d'inscription ; à défaut, l'adresse d'envoi est utilisée. Les liens de configuration du compte, invitations, confirmations et rappels sont conservés.

## IA

Renseigner `ANTHROPIC_API_KEY` et `AI_MODEL` avec un modèle accessible au compte. `AI_MAX_TOKENS` vaut 1024 par défaut (128 à 8192), `AI_TIMEOUT_MS` vaut 20000 (1000 à 60000). Les appels ne sont pas automatiquement réessayés. Une clé absente ou factice rend les fonctions IA indisponibles sans bloquer le démarrage de l'application.

Les fonctions conservées sont le résumé patient, le chat et la lecture de CIN. La prédiction d'absence a été supprimée du code, des routes, des prompts et des schémas de nouvelle installation. Les statistiques des absences réellement constatées restent disponibles. Aucune suppression de colonne n'est exécutée dans les bases déjà installées.

## Diagnostic

Depuis `server` :

```powershell
npm run check:services
npm run check:services -- --smtp
npm run check:services -- --ai
npm run check:services -- --ai --sample
```

Sans option, le diagnostic contrôle uniquement la configuration. `--smtp` vérifie la connexion et l'authentification sans envoyer de message. `--ai` interroge le modèle configuré. `--sample` ajoute un appel IA avec une phrase fixe, sans donnée personnelle et sans accès à la base ; cet appel peut être facturé par le fournisseur. Le rapport masque les identifiants et retourne un code de sortie non nul en cas d'échec. Ce diagnostic ne remplace pas un essai de réception d'e-mail ni un essai OCR sur un document fictif.

Les réponses d'erreur distinguent notamment `EMAIL_NOT_CONFIGURED`, `EMAIL_AUTH_FAILED`, `EMAIL_TIMEOUT`, `AI_NOT_CONFIGURED`, `AI_AUTH_FAILED`, `AI_MODEL_UNAVAILABLE`, `AI_RATE_LIMITED` et `AI_TIMEOUT`. Le client reçoit un message explicite sans détail brut du fournisseur. Les résumés et le chat conservent leur flux SSE ; une erreur avant le flux retourne du JSON, une erreur pendant le flux est signalée dans celui-ci. Une réponse OCR vide ou tronquée retourne `AI_INVALID_RESPONSE`.

## État de la validation du 3 novembre 2026

Les tests utilisent un SMTP simulé, un serveur IA local simulé et la base Docker jetable. Aucun e-mail réel n'a été envoyé. Le diagnostic SMTP réel a refusé les identifiants actuels (`EMAIL_AUTH_FAILED`) ; la clé IA locale est une valeur d'exemple (`AI_NOT_CONFIGURED`). La réception réelle et les appels IA réels restent à valider après correction des secrets. Aucun déploiement ni modification de la base applicative n'a été réalisé à cette étape.
