# Journal de la tâche T-0093

## Fait
- `notify/mention.ts` : extraction des `@identifiant` (pas dans une adresse de courriel ni un chemin) et résolution vers les personnes qui **peuvent lire l'item** (`notify_can_see`) ; un identifiant inconnu ou sans accès est ignoré sans indication.
- `LinkService.addComment` : une mention notifie la personne mentionnée (destinataire direct, abonnée ou non) **à la place** de la notification de commentaire ; les autres abonnés reçoivent le commentaire. Si la personne a désactivé les mentions et qu'elle est abonnée, elle reçoit le commentaire. La réponse porte `mentions` (identifiants notifiables, auteur exclu).
- `emit` renvoie les destinataires ; options `exclude` et `directOnly` (une mention ne vise jamais les abonnés). Correction faite en cours de tâche : l'émission « mention » ajoutait d'abord les abonnés (détecté par `mention.test.ts`).
- `GET /v1/projects/:p/artifacts/:key/mentionable?q=` : autocomplétion limitée aux personnes qui peuvent lire l'item, sans soi-même ; `GET /v1/me/notifications?event=` pour filtrer.
- Interface : `MentionInput` (combobox ARIA : listbox, `aria-activedescendant`, flèches, Entrée ou Tab, Échap, annonce du nombre de suggestions), `MentionText` (mentions en évidence, aucun HTML interprété), section **Mentions** de « Mon travail » (lien, auteur, date, non lue, lecture marquée au clic).
- Tests : `mention.test.ts` (7), `MentionInput.test.tsx` (6 dont axe liste ouverte et page Mon travail), e2e `notifications.spec.ts` (mentions : autocomplétion au clavier, balisage laissé en texte, axe dans le navigateur).

## Décisions
- Aucune migration : les mentions s'appuient sur les tables de T-0091 (la fiche n'en prévoyait pas non plus).
- L'entrée dans « Mon travail » est une lecture des notifications `mention` (vingt dernières) : pas de second stockage à tenir à jour.

## Limites déclarées
- La mention se résout par identifiant (`username`) exact, sans tenir compte de la casse ; deux personnes ne partagent pas un même identifiant dans une organisation.
- Une mention déjà notifiée n'est pas retirée si le commentaire était modifié : les commentaires ne sont pas modifiables.

## Écarts
- Aucun.
