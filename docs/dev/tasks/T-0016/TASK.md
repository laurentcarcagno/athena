# T-0016 : bibliotheque de composants @athena/ui (phase 1)
- Livre : Btn, StatusPill, Tag, FilterChip, SearchInput (Ctrl/Cmd+K), Field, Card (imbrication interdite par erreur), StatCard, Table/Th triable/Td mono, Tabs (fleches), Modal (focus piege, Echap, fond, retour du focus), Toast (5 s, pause au survol), EmptyState, PageHeader (bandeau tricolore), CornerFrame, Sidebar (logo ATHENA point rouge BOARD), Id (mono). Feuille de style sans ombre, degrade, flou ni arrondi ; rouge reserve au bandeau et au point du logo.
- Constats : regex d interdiction des arrondis avec retour arriere (faux positif sur border-radius: 0), corrige dans le lint ; bleu tricolore utilise a tort dans la barre laterale, corrige.
- Tests : 20 de composants (29 pour lUI).
- Non fait : Storybook, DatePicker, UserPicker, Tree, DiffViewer, editeur Markdown, theme sombre (hors v1), polices IBM Plex embarquees, tests axe automatiques.
