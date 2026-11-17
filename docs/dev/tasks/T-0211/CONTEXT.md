# T-0211 : critère de gate sur deux champs (B29)

- `CriterionSchema` (tracker_status) : champ `and` facultatif, cumulé à `where` (refusé sans `where`) ; `phaseCheck` compte les tickets sur les deux filtres. Rétrocompatible : un critère existant est inchangé. Test : `normative-templates.test.ts`.
