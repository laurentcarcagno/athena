# T-0215 : page roadmap (B27)

- `/portefeuilles/:clé/roadmap` (`PortfolioRoadmapPage`, `components/RoadmapView.tsx`) : frise SVG à couloirs (barre du projet, chevrons de phase, losanges de revue, carrés de version, repère du jour, marque de fin calculée au-delà de la fin prévue, couloir « non planifié » en fin), zoom année, trimestre, mois, vue tableau, projets clos sur demande, états vide et dégradé ; infobulles et titres en toutes lettres ; lien depuis la page du portefeuille. Liens : projet, phase, versions.
- Écarts : repli par portefeuille (au-delà de 50 couloirs) non fait : la page ne montre qu un portefeuille à la fois, le regroupement multi-portefeuilles est un besoin de la vue direction (I3). Tests : `RoadmapView.test.tsx` (axe vert).
