# T-0028 : phase 8 (securite, import JIRA/Tuleap, performance)
- Securite : 56 vulnerabilites connues (5 critiques, 16 elevees) ramenees a zero par montee de versions majeures (NestJS 11, Fastify 5, Zod 4, Vitest 4, React Router 7, Vite 6, Turbo) ; limiteur de debit et en-tetes de securite testes ; revue interne dans docs/security/REVUE.md (le test dintrusion externe reste a commander).
- Import : lecteur CSV RFC 4180 borne, export JIRA (colonnes repetees, traductions, liens, dates) et API REST Tuleap ; simulation a blanc avec rapport dEcarts ; import idempotent (import_map), sans passer par le workflow mais avec validation du schema ; liens resolus y compris vers des imports precedents ; route REST (simulation par defaut).
- Performance : 100 000 artefacts, toutes les requetes ATQL mesurees sous 300 ms au p95 (docs/perf/RESULTATS.md) ; garde-fou de regression dans la suite.
- Defaut corrige : IS EMPTY ne reconnaissait pas un null JSON.
- Tests : 244 API, 30 UI, 27 web, 4 SDK.
- Non fait : import de pieces jointes, de commentaires et de sprints JIRA, XML Tuleap, mesures de charge concurrente, test dintrusion externe, formation et documentation utilisateur.
