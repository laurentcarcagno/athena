# T-0102 : Finitions du Lot 1

- **Lot** : 1 (ajoutée à la demande « on n'accepte pas les écarts sauf s'ils sont infaisables »)
- **Objectif** : fermer les écarts restants du Lot 1 : colonnes par vue, épinglage d'une vue, sélecteur de frères du fil d'Ariane, rejeu des e2e.
- **Critères d'acceptation** (testables) :
  - Les colonnes du tableau se choisissent (état, tracker, date, chaque champ), se trient, figurent dans l'adresse et s'enregistrent avec la vue ; une vue les restitue
  - Une vue enregistrée s'épingle aux favoris et le rail y mène
  - Chaque segment du fil d'Ariane (projet, tracker, vue) propose ses frères au clavier, sans appel réseau tant que le menu est fermé
  - Les e2e passent
- **Tests à écrire** : `lib/columns.test.ts`, `web10.test.tsx`, `components/Breadcrumb.test.tsx`, `e2e/tests/navigation.spec.ts`
- **Migration** : aucune (`saved_filter.columns` existe depuis la 032)
- **Dépendances** : T-0061
