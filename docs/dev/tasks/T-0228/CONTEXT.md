# T-0228 : interface de la capacité (B35)

- Page `/capacite` (`pages/CapacityPage.tsx`, interrupteur `ppm.capacity`) : filtres (dates, mois ou semaine, équipe), carte de chaleur personne x période (taux de charge écrit et palier en toutes lettres, infobulle des projets), graphique capacité contre charge de l équipe (barres, vue tableau), goulots classés avec les projets, mes absences (ajout, retrait). Lien depuis la page Charge des équipes.
- Non fait : saisie de la disponibilité (temps partiel) et des allocations par l interface (API et services faits ; saisie par le chef de projet et le manager à ajouter) ; planning d affectation par personne (Gantt) ; courbes besoin contre capacité par rôle (les besoins par rôle sont dans l API). Tests : `CapacityPage.test.tsx`.
