# Journal de la tâche T-0092

## Fait
- Migration **045** (la fiche disait « aucune » : l'heure par personne et le suivi des envois exigent du stockage) : `notification_digest` (activé, heure, fuseau, langue, `last_sent_at`), `notification.digested_at`.
- `notify/smtp.ts` : client SMTP sans dépendance (EHLO, STARTTLS, TLS implicite, AUTH PLAIN, UTF-8 en base64, protection contre l'injection d'en-têtes, refus de l'authentification en clair hors boucle locale). `notify/mailer-config.ts` : `mailerFrom(env)` renvoie `null` sans `SMTP_HOST`/`SMTP_FROM` ou avec `DIGEST_ENABLED=false` ; alors aucun client n'existe et aucune connexion ne peut s'ouvrir.
- `notify/digest.ts` : `composeDigest` (par projet, clé, phrase, lien canonique, plafond de 100 lignes, FR/EN, aucune valeur de champ), `DigestService` (réglages ; `runDue` : à l'heure locale choisie, au plus un courriel par 20 h, non lues et non reprises seulement, lecture sous les droits de la personne via `runAs`, échec = réessai au cycle suivant sans rien marquer).
- Planification : boucle `résumé` du worker (`DIGEST_INTERVAL_MS`, 5 min), ajoutée seulement si la messagerie est configurée. Routes `GET|PUT /v1/me/notification-digest` (`available` faux sans SMTP).
- Helm : `config.smtp.*` (désactivé par défaut et dans `values-isolated.yaml`), variables d'environnement SMTP ou `DIGEST_ENABLED=false`, politique réseau du worker vers `smtp.cidr` seulement si activé ; rendu vérifié avec `tools/helm-docker.sh` dans les trois cas.
- Interface : réglage du résumé (case + heure, fuseau du navigateur, langue de l'interface) dans « Réglages » du centre de notifications, message « indisponible » sans messagerie.
- Tests : `smtp.test.ts` (12 : clair, AUTH, refus, injection, TLS implicite, STARTTLS, certificat inconnu, non-sortie T-0077 avec le garde : un relais public est refusé avant toute résolution de nom, `mailerFrom` nul), `digest.test.ts` (9 : composition, fuseaux, un courriel par jour, heure et langue par personne, non lues seulement, droits et contrôle export, échec puis réessai, sans messagerie), `workers.test.ts` (+1), `NotificationCenter.test.tsx` (+2).

## Décisions
- Pas de bibliothèque de messagerie : un client SMTP minimal suffit (un message texte) et ne multiplie pas la surface de dépendances d'une instance isolée.
- `SMTP_CA_FILE` (PEM) pour une autorité interne ; sinon `NODE_EXTRA_CA_CERTS` fonctionne aussi. Le chart n'ajoute pas de montage de certificat (hors périmètre).

## Écarts
- Aucun.
