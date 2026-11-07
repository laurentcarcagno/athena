# Journal de la tâche T-0091

## Fait
- Migration **044** (la fiche disait 040, déjà prise) : `subscription` (item, tracker ou vue enregistrée), `notification`, `notification_pref`, RLS forcée + `org_isolation` ; politique restrictive d'ayants droit sur `subscription` et `notification` ; fonction `notify_can_see(sujet, item)` (liste d'ayants droit du projet ou du tracker, contrôle export) pour évaluer les droits d'un destinataire autre que l'acteur.
- `apps/api/src/notify/` : `emit` (génération dans la transaction de l'événement, atomique avec lui), `NotifyService` (liste, lu / non lu, abonnements, réglages), `NotifyController` (`/v1/me/notifications`, `/v1/me/notification-prefs`, `/v1/projects/:p/subscriptions`, `/v1/subscriptions/:id`).
- Événements branchés : transition (`ArtifactService.transition`), commentaire (`LinkService.addComment`), lien suspect (`ArtifactService.update`, notifie les abonnés de l'item **source** du lien), mention (point d'entrée `emit` avec `direct`, utilisé par T-0093), `approval` réservé à T-0094. Le créateur d'un item et qui le commente le suivent automatiquement.
- Interface : `NotificationCenter` (cloche dans une barre supérieure `ath-topbar` à droite du fil d'Ariane, compteur, liste, lu / non lu, réglages par événement, Échap, focus rendu), `SubscribeToggle` (fiche, panneau de détail, écran tracker, vue enregistrée), textes FR/EN, classe `ath-visually-hidden`.
- Tests : `notify.test.ts` (14 : transition, commentaire, suspect, tracker, vue, réglages, lu / non lu, isolation entre personnes, liste d'ayants droit, retrait de droit à la lecture, contrôle export, mention directe, RLS forcée), `NotificationCenter.test.tsx` (8 dont axe), `e2e/tests/notifications.spec.ts` (axe dans le navigateur, clavier).

## Décisions
- Une notification ne porte **aucune valeur de champ** : clés, statuts, identifiant de commentaire. Le destinataire relit l'item avec ses propres droits (restrictions de lecture par champ comprises).
- Droits vérifiés deux fois : à la génération (`notify_can_see`) et à la lecture (politique de la table) : un droit retiré masque aussi les notifications déjà reçues.
- Abonnement à une vue : la requête enregistrée est évaluée sur l'item avec `forbiddenFields` = tous les champs à lecture restreinte du projet (pas de déduction par la requête) ; une requête devenue invalide est ignorée (savepoint), jamais d'échec de l'événement.
- Rôle `athena-qa` : les routes personnelles (notifications, réglages, abonnements) acceptent `athena-qa` en écriture, car elles ne modifient aucune donnée de projet. Toutes les autres écritures restent interdites.

## Écarts
- Aucun. Le champ `approval` de l'événement est prévu pour T-0094.
