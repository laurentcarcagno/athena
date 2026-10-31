# T-0045 : report des références vers les .sdoc

- `docs/doc-writeback.ts` : setAthenaRefs (édition textuelle idempotente), DocWriteback.proposeRefs (branche + commit au nom de l utilisateur + MR). Route POST docs/:source/writeback. Testé contre le GitLab local.
