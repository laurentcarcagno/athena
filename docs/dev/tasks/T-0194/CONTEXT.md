# T-0194 : phases datées, frise des gates (B12)

- `components/PhaseTimeline.tsx` : frise des phases du gabarit (phase courante `aria-current="step"`, dates prévues, revue prévue et tenue, décision, « Hors gabarit »), modification des dates par le chef du projet (`PUT …/template/phases/:phase`), historique des dates prévues.
- `ProjectTemplateCard` : la frise s'insère dans la carte « Gabarit et phase » ; le passage de phase a une décision (Go, Go avec réserves, No go) et une note obligatoire hors Go ; le no go s'enregistre sans changer de phase.
- Tests : `web18.test.tsx` (13), suite web 630/630. Pas d'e2e (à la vérification du lot).
- Non fait : lignes de phase créées depuis le gabarit et décision par l'assurance qualité (reportés, voir T-0193) ; frise multi-projets (I2).
