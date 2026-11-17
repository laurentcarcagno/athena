# T-0190 : méta du projet (B10)

- Migration **067** : table `project_meta` (une ligne par projet, absente = champs vides), plutôt que des colonnes sur `project` : politique `acl_read` restrictive comme les autres tables PPM, aucune migration de données. Contrainte `planned_end >= planned_start` en base et dans le service.
- `apps/api/src/ppm/project-meta.service.ts`, `project-meta.controller.ts` : `GET /v1/projects/:p/meta` (tout rôle qui voit le projet), `PATCH` (administrateur ou chef désigné, `MemberService.requireManager`, désormais exporté par `CoreModule`). Mise à jour partielle (`null` vide un champ) ; sponsor = compte connu ; audit `project.update`.
- Web : `components/ProjectInfoCard.tsx` dans la vue d'ensemble (lecture pour tous, modification pour le chef et l'administrateur).
- Corrigé en passant : les titres de `PpmSettings.tsx` (T-0187) ne respectaient pas le test de typographie (`ath-section-title`).
- Non fait, prévu plus tard : signalement de l'écart entre `planned_end` et la fin calculée (affichage, lots suivants) ; `lifecycle_state` vient de T-0191.
