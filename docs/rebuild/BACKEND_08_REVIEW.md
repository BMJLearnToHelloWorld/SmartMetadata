# backend-08 MCP hygiene — review

## Scope
Wire Apache-REST-backed MCP tools onto clean-room `smartmetadata-mcp` and document Collate AI/RDF as **OutOfScope**. Does **not** copy `openmetadata-mcp`, does **not** invent Collate NLQ/persona/RDF tools, does **not** register Java `/mcp` (slim dist stays jar-free).

## Shipped tools (11)
| Tool | Apache contract |
|---|---|
| `search_entities` | `GET /v1/search/query` (existing) |
| `get_table` / `get_topic` | existing FQN getters (kept for clients) |
| `get_entity_details` | `GET /v1/{collection}/name/{fqn}` for allowlisted Apache entity types |
| `get_lineage` | existing depth-clamped GET |
| `create_lineage` | `PUT /v1/lineage/{from}/name/{fqn}/{to}/name/{fqn}` (same as ingestion `put_lineage`) |
| `list_glossaries` / `list_tags` | existing |
| `find_by_tag` | `GET /v1/search/query` + `query_filter` on `tags.tagFQN` |
| `get_test_definitions` | `GET /v1/dataQuality/testDefinitions` |
| `create_conversation` | existing OSS feed POST |

## Explicit OutOfScope (not debt unless scope expands in writing)
- Collate AI: `semantic_search`, persona/user/company/concept context, NLQ
- RDF / Knowledge Graph: `sparql_query`, `entity_neighborhood`, `shacl_validate`, `ontology_describe`, `root_cause_analysis`
- Still **Partial / later**: `create_entity`, `patch_entity`, `create_test_case` (write surfaces need richer schema; not inventing payloads this slice)

## Status
**BehaviorMatched (unit)** for the Apache-backed tools above. Not ProductVerified. Not IntegrationVerified.

## Tests
`cd smartmetadata-mcp && npm test`
