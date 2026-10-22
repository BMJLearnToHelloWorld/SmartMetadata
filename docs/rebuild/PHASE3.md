# Phase 3 — Clean-room lineage visualization

Phase 3 adds an upstream/downstream lineage graph to `smartmetadata-ui/` against
the existing Apache `LineageResource` REST API. It does not copy, transpile, or
import `openmetadata-ui` or `openmetadata-ui-core-components`.

Earlier phases: [PHASE0.md](PHASE0.md) (slim dist) · [PHASE1.md](PHASE1.md)
(login / search / table+topic detail) · [PHASE2.md](PHASE2.md) (admin).
ADR:2026-10-22-clean-room-vue-spa still applies. New viz record:
ADR:2026-10-22-lineage-vue-flow-dagre.

## What shipped

JWT route guards from Phase 1 are unchanged. Phase 1–2 routes stay.

| Surface | Location | Server contract |
|---|---|---|
| Lineage page | `views/LineageView.vue`, `components/lineage/*` | `GET /v1/lineage/{entity}/name/{fqn}?upstreamDepth=&downstreamDepth=` (`EntityLineage`, depth **0–3**) |
| Graph model | `src/lineage/graphModel.ts` | Joins UUID edges to `entity` + `nodes`; reads `lineageDetails` when present |
| Layout / canvas | dagre (LR) + Vue Flow | Pan/zoom; node click → `/assets/:entityType/:fqn` when type + FQN exist |
| Asset entry | `AssetDetailView.vue` **View lineage** | Table and Topic (any detail FQN; API 404 is shown if the type has no lineage) |
| Global entry | sider **Lineage** → `LineageHomeView.vue` | Type (table/topic) + FQN form; no hardcoded graph |

Routes (still JWT-guarded except `/login`):

`/lineage`, `/lineage/:entityType/:fqn`. Phase 1 `/search` and
`/assets/:entityType/:fqn` and Phase 2 `/admin/*` are unchanged.

Column-level lineage: if `lineageDetails.columnsLineage` is on an edge, the page
uses it for the edge label (when there is no description) and a **Column
mappings** table. There is no nested column canvas — that would invent
structure the GET payload does not require.

## How to run

Same as Phase 1: slim server from [PHASE0.md](PHASE0.md), then

```bash
make ui_install
make ui_dev
# http://localhost:5173
```

Stock bootstrap: `admin@open-metadata.org` / `admin` when the server was
initialized with defaults. Lineage needs catalog edges; an empty catalog
returns a graph with only the focus entity (empty state).

### Manual verify

1. Unauthenticated `/lineage/table/svc.db.schema.orders` redirects to
   `/login?redirect=...`.
2. Sign in. Search still works. Open a **table** (and a **topic** if the
   catalog has one). **View lineage** opens `/lineage/{type}/{fqn}`.
3. With edges in the catalog: graph shows upstream to the left and downstream
   to the right. Pan/zoom. Change upstream/downstream depth (0–3); the page
   refetches. Click a table/topic node → asset detail.
4. Depth 0 / no edges: empty copy
   “No upstream or downstream lineage at this depth”.
5. Sider **Lineage**: enter a known table FQN and open the same page.
6. Log out. Session key `sm.auth.v1` is cleared.

## Tests

```bash
cd smartmetadata-ui && npm test && npm run build
python3 scripts/rebuild/check_ccl_free_dist.py
```

Covered: lineage GET path + FQN encoding + depth clamp; EntityLineage → graph
mapping including UUID/`{id}` endpoints, stubs, column labels; LR layout;
LineageView empty/error/click-through/depth refetch.

## Non-goals (later phases)

- Impact analysis productization beyond this graph
- Glossary / classification deep editors (Phase 4)
- Data quality / observability (Phase 5)
- Ingestion / connectors / MCP
- Shipping the SPA inside `openmetadata-dist` (needs a new ADR)
- Lineage edge edit/create/delete, platform map, export, search-lineage
  pagination (`/getLineage`, `/getLineageByEntityCount`)

## Residual risks and open questions

- **Empty catalog.** No edges is an empty state, not a fake demo graph.
- **Search lineage vs EntityLineage.** The richer `/v1/lineage/getLineage`
  payload needs Elasticsearch. This phase uses the entity GET so a slim
  server without a warm lineage index still answers from the relationship
  store. Column hydration can be thinner on that path.
- **Depth cap.** The resource `@Max(3)`. The UI does not offer 4+.
- **Unwired entity types.** Node click still routes to the generic Phase 1
  asset page when type + FQN exist; that page only fetches table/topic.
- **Missing node refs.** Edges whose UUID is not in `nodes` become stub
  nodes labeled with the UUID (no invented FQN).
- **elkjs.** Not used (EPL-2.0). Layout is MIT dagre.

## Open questions (safest default already taken)

1. **Search-backed lineage for large graphs?** **No** in Phase 3.
2. **Column-level canvas?** **No** unless a later API documents a column
   graph we can map without inventing nodes.
3. **Serve SPA from slim Java?** Still **no** — same as Phase 1.

## Verification checklist

1. `cd smartmetadata-ui && npm test`
2. `cd smartmetadata-ui && npm run build`
3. `python3 scripts/rebuild/check_ccl_free_dist.py`
4. Manual path above against a running Phase 0 server with at least one
   lineage edge
