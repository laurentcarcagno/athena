# T-0024 : branche et merge request depuis un ticket, documentation depuis GitLab
- Livre : association de depots de code a un projet (verifies aupres de GitLab), creation de branche normalisee bugfix|feature/<CLE>-<resume> depuis la branche par defaut, ouverture dune MR en brouillon dont le titre et la description referencent le ticket, liens code_ref et evenements ; uniquement la branche creee pour lartefact est acceptee (jamais de MR depuis main ni depuis un nom arbitraire). Recuperation des .sdoc dun depot GitLab (SHA de la reference enregistre, nombre borne, chemin valide) et indexation avec creation des liens ATHENA_REFS. Routes REST (503 si GitLab non configure).
- Constat : les tests dintegration saturaient le GitLab local en parallele ; fichiers de test executes en serie.
- Tests : 5 (GitLab reel) + 1 REST ; 206 au total.
- Non fait : webhook push du depot de documentation pour resynchroniser automatiquement, retroportages, notes de version, indicateurs DORA, CLI athena.
