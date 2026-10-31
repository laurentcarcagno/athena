# T-0009 : OpenBao (KV, Transit) et champs confidentiels (phases 1 et 3)
- Livré : client OpenBao (KV v2, Transit avec clés dérivées, rotation et rewrap), chiffrement des champs confidentiels (`config.confidential`) avant écriture dans Git, câblage dans le worker, politique de moindre privilège testée avec un jeton limité.
- Constat : sans clé dérivée, Transit ignore le contexte ; les clés sont donc créées avec derived=true et le contexte (nom du champ) est obligatoire.
- Tests : 5 OpenBao + 1 bout en bout PostgreSQL/GitLab/OpenBao (52 au total pour lAPI).
- Non fait : authentification Kubernetes d OpenBao, identifiants PostgreSQL dynamiques, PKI/mTLS, chemins KV par projet pour secrets de webhooks, restitution des champs dans lAPI REST.
