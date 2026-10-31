# T-0044 : mode merge request par tracker

- Migration 024 `tracker.history_mode`. PATCH `/v1/projects/:p/trackers/:t/history-mode` ; sélecteur dans l éditeur de tracker.
- HistorySync : en mode merge_request, commits sur `athena/review/<TRACKER>` (créée depuis main), une MR ouverte unique. La synchronisation inverse ignore les commits Athena fusionnés (trailer Athena-Event-Id).
- Testé contre le GitLab local : branche, MR, fusion, trackers directs inchangés.
