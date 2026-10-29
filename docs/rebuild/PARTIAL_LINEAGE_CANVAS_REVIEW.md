# Partial close #1 ? lineage canvas UI write

Branch: `rebuild/partial-lineage-canvas-write`

## Design

Wire the existing Vue lineage canvas so a user can **create** an entity-level
lineage edge by connecting two visible nodes. The HTTP contract is the same
Apache path already used by ingestion `RestClient.put_lineage` and MCP
`create_lineage`:

`PUT /v1/lineage/{fromType}/name/{fromFqn}/{toType}/name/{toFqn}`

Default body: `{ "source": "Manual" }` (MCP create_lineage).

`deleteEntityLineageByName` is exposed in `smartmetadata-ui/src/api/lineage.ts`
to mirror `RestClient.delete_lineage_by_name`, but the canvas has **no** delete
control yet ? this PR does not invent one.

## Scope

| Item | Status |
|---|---|
| `putEntityLineage` / `deleteEntityLineageByName` API helpers | In |
| Vue Flow `nodes-connectable` + `@connect` ? PUT ? reload GET | In |
| Unit tests (API + LineageView connect stub) | In |
| Edge delete UI / pipeline edge editor / column-mapping editor | Out (no invent) |
| Empty-graph first edge (needs a second node on canvas) | Residual |
| ProductVerified / live IntegrationVerified | Out |

## Status

**BehaviorMatched (unit)** for canvas ? Apache PUT.

## How to verify

```bash
cd smartmetadata-ui
npm test -- src/api/lineage.test.ts src/views/LineageView.test.ts src/components/lineage/LineageGraph.test.ts
```

Manual (already-running slim server; this PR does not redeploy):

1. Open a lineage graph that already has at least two nodes.
2. Drag from a node source handle to another node target handle.
3. Confirm the edge persists after reload (GET).
