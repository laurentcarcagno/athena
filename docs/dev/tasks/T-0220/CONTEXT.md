# T-0220 : comparaison, tendance et mini-courbes (B32, B21)

- `components/SnapshotPanel.tsx` (page du portefeuille) : liste des instantanés, instantané manuel (admin et PMO), comparaison de deux dates (écarts seulement : entré, sorti, modifié ; avant → après).
- `PortfolioHealthTable` : flèche de tendance des tuiles (en toutes lettres : en hausse, en baisse, stable, depuis la date de l instantané) et colonne Tendance du tableau (était : santé précédente, nouveau, mini-courbe des retards sur les derniers instantanés, sans axes). Lève l écart du lot 18 (flèche de tendance).
- Tests : `SnapshotPanel.test.tsx` (axe vert).
