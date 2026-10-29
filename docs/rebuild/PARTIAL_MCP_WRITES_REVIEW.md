# Partial MCP writes — review

## Scope
Close the backend-08 Partial for `create_entity` / `patch_entity` / `create_test_case` as **1:1 Apache REST** on clean-room `smartmetadata-mcp`. No Collate invent, no AI/RDF tools, no copy of `openmetadata-mcp` implementation.

## Contracts
| Tool | Apache REST | Required inputs (Apache schema) |
|---|---|---|
| `create_entity` | `POST /v1/{collection}` | allowlisted `entityType` → collection; `name`; optional `description` / `displayName`; optional `fields` = extra Create*Request keys as documented (e.g. `glossary` FQN). Server validates schema requireds. |
| `patch_entity` | `PATCH /v1/{collection}/name/{fqn}` | allowlisted `entityType` + `fqn`; RFC 6902 patch array (or JSON-array string); `Content-Type: application/json-patch+json`. |
| `create_test_case` | `POST /v1/dataQuality/testCases` | CreateTestCaseRequest: `name`, `testDefinition` (from `testDefinitionName`), `entityLink` built as `<#E::{type}::{fqn}>` or `…::columns::{columnName}`; optional `description` / `parameterValues`. |

Allowlist is the same `ENTITY_COLLECTIONS` gate as `get_entity_details` (Collate/RDF types rejected).

## Explicit non-goals
- Owner/tag **name → EntityReference** resolution (Collate invent) — pass Apache-shaped refs in `fields` if needed.
- AI / RDF / persona MCP tools
- KPI CRUD (separate Partial)
- ProductVerified / live IntegrationVerified

## Status
**BehaviorMatched (unit)**. Harness `REQUIRED_MCP_TOOLS` locked at 14. Not ProductVerified.

## Tests
`cd smartmetadata-mcp && npm test`
`python scripts/rebuild/check_apache_positive_regression.py`
