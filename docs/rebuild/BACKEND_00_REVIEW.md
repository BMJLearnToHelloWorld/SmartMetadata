# backend-00 capability ledger — review

## Scope
Stage-0 **factual inventory** after fused backend #49–#58. Docs only.
Does **not** invent product surfaces, connectors, AI/RDF, or SSO/Persona.

## Shipped
| Item | Status |
|---|---|
| `docs/rebuild/CAPABILITY_LEDGER.md` | BehaviorMatched (documentation inventory) |
| Short pointer from `PARITY.md` | shipped in this PR |

## Explicit OutOfScope
See ledger OutOfScope section. Not debt.

## Anti-drift checks (this review)
- Status vocab only Missing|Partial|BehaviorMatched|IntegrationVerified|ProductVerified
- BehaviorMatched rows cite #49–#58 REVIEW / harness; no fake ProductVerified / IntegrationVerified
- OutOfScope (AI/RDF/SSO invent/Persona/Appearance/#18 purge/connector sprawl) listed and **not** counted as debt
- Partial leftovers honest: MemoryDagStore, dbt full parser, MCP write tools, profiler/DQ execution, lineage canvas UI write, Insights KPI CRUD, live e2e
- Connector ~102 Gap stays PARITY residual — no new batch invented here

## Status
Inventory complete relative to `BACKEND_01`…`10` + PARITY on tip
`941b5cab22`. Not ProductVerified. Not IntegrationVerified.

## How to verify
Read `CAPABILITY_LEDGER.md`; spot-check rows against the cited REVIEW docs and
`scripts/rebuild/check_apache_positive_regression.py` surfaces locked in #58.

## Next
After squash: Notion hub + backend-00 detail page; optional Alma tip upgrade only when asked.
