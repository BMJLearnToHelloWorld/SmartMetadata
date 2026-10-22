---
paths: "smartmetadata-ui/**/*.{ts,vue}"
---

# SmartMetadata Vue console

Product UI is `smartmetadata-ui/` (Vue 3 + Ant Design Vue, Apache-2.0). Official
React `openmetadata-ui` / `openmetadata-ui-core-components` were purged
(ADR:2026-10-22-ccl-trees-are-purged). Do not import those trees.

- Routes live in `src/router/index.ts`. Add a view next to the existing
  `src/views/` area it belongs to (admin, governance, quality, ingestion,
  collaboration).
- Talk to the Apache server through `src/api/` helpers already on the branch;
  do not invent undocumented REST paths.
- Unit tests: colocated `*.test.ts` / Vitest. `make ui_test` / `npm test`.
- Do not add Collate AI Studio widgets or a persona landing unless a new ADR
  says so (Phase 9 residual).
