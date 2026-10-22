# Phase 4 — Governance parity (clean-room UI)

Phase 4 extends `smartmetadata-ui/` with glossary, classification/tag, domain,
and data-product surfaces, plus description / owners / tags / domain edits on
wired asset detail. It talks only to existing Apache `openmetadata-service`
REST APIs. It does not copy, transpile, or import `openmetadata-ui` or
`openmetadata-ui-core-components`.

Earlier phases: [PHASE0.md](PHASE0.md) (slim dist) · [PHASE1.md](PHASE1.md)
(login / search / table+topic detail) · [PHASE2.md](PHASE2.md) (admin) ·
[PHASE3.md](PHASE3.md) (lineage). ADR:2026-10-22-clean-room-vue-spa still
applies. New write convention:
ADR:2026-10-22-asset-governance-uses-json-patch.

## What shipped

JWT route guards from Phase 1 are unchanged. Phase 1–3 routes stay.

| Surface | Location | Server contract |
|---|---|---|
| Glossaries list / create / edit | `views/governance/GlossariesListView.vue`, `GlossaryDetailView.vue` | `GET/POST/PUT /v1/glossaries` (`CreateGlossary` requires `name` + `description`) |
| Terms browse / create / edit | `GlossaryDetailView.vue`, `GlossaryTermDetailView.vue` | `GET /v1/glossaryTerms?glossary={id}`; `POST/PUT /v1/glossaryTerms` (`glossary` FQN + `name` + `description`); related terms as FQN list |
| Term related entities | `GlossaryTermDetailView.vue` | GET term `fields=relatedTerms`; `GET /v1/glossaryTerms/{id}/assets` |
| Classifications / tags | `ClassificationsListView.vue`, `ClassificationDetailView.vue`, `TagDetailView.vue` | `GET/POST/PUT /v1/classifications`; `GET /v1/tags?parent={classificationFqn}`; `POST/PUT /v1/tags` |
| Domains | `DomainsListView.vue`, `DomainDetailView.vue` | `GET/POST/PUT /v1/domains` (`name` + `description` + `domainType`); `GET /v1/domains/{id}/assets` |
| Data products | `DataProductsListView.vue`, `DataProductDetailView.vue` | `GET/POST/PUT /v1/dataProducts` (`name` + `description` + `domains` FQNs) |
| Asset description / owners / tags / domain | `AssetDetailView.vue` | `PATCH /v1/{tables\|topics}/{id}` RFC 6902 (`/description`, `/owners`, `/tags` TagLabel, `/domains`) |

Routes (still JWT-guarded except `/login`):

`/governance/glossaries`, `/governance/glossaries/:id`, `/governance/terms/:id`,
`/governance/classifications`, `/governance/classifications/:id`,
`/governance/tags/:id`, `/governance/domains`, `/governance/domains/:id`,
`/governance/data-products`, `/governance/data-products/:id`.

AppShell adds a **Governance** section. Search, lineage, and Admin stay.

## How to run

Same as Phase 1: slim server from [PHASE0.md](PHASE0.md), then

```bash
make ui_install
make ui_dev
# http://localhost:5173
```

Stock bootstrap: `admin@open-metadata.org` / `admin` when the server was
initialized with defaults. Governance writes need a principal that holds the
matching `EDIT_*` / create operations (admin does).

### Manual verify

1. Unauthenticated `/governance/glossaries` redirects to
   `/login?redirect=/governance/glossaries`.
2. Sign in. Search, lineage, and Admin still work.
3. **Governance → Glossaries**: list from `GET /v1/glossaries`. Create a
   glossary (`name` + `description`). Open it. Create a term (`glossary` FQN +
   `name` + `description`). Open the term; related terms and tagged assets
   come from the term GET / assets API (empty is fine).
4. **Classifications**: list from `GET /v1/classifications` (seeded PII / Tier
   usually exist). Create a classification; create a tag with
   `classification` set to that FQN. Edit display name / description.
5. Open a **table** from Search. **Edit governance**: change description;
   add/remove an owner (user or team); add/remove a classification tag or
   glossary term; assign a domain. Save. The page refetches; tags/owners/
   description/domain match the PATCH.
6. **Domains**: create a `Source-aligned` domain. Open it; assets list is
   whatever `GET /v1/domains/{id}/assets` returns.
7. **Data products**: create one with at least one domain FQN. Edit
   description / domains.
8. Log out. Session key `sm.auth.v1` is cleared.

## Tests

```bash
cd smartmetadata-ui && npm test && npm run build
python3 scripts/rebuild/check_ccl_free_dist.py
```

Covered: glossary / term / classification / tag / domain / data-product
clients against real paths and required bodies; TagLabel + asset JSON Patch;
GlossariesListView and ClassificationsListView rendering; AssetDetailView
PATCH of description/owners/tags/domains.

## Non-goals (later phases)

- Data quality tests / dashboards (Phase 5)
- Ingestion / connectors / MCP
- Shipping the SPA inside `openmetadata-dist` (needs a new ADR)
- Policy rule authoring / glossary CSV or RDF import / auto-classification
  recognizers / ODPS import / bulk `PUT .../assets/add` membership editors
- Hardcoded fake glossary or tag trees

## Residual risks and open questions

- **Glossary term list filter.** `GET /v1/glossaryTerms?glossary=` is a
  glossary **id** (`UUID.fromString`). The UI always sends the glossary id
  from the parent page, not the FQN.
- **Create tag classification.** `CreateTag` schema required keys are only
  `name` + `description`. The mapper still sets `classification` from the
  request. The UI always sends the parent classification FQN.
- **Tag apply vs bulk APIs.** Asset detail writes the whole `/tags` array
  with TagLabel objects (`tagFQN`, `source`, `labelType=Manual`,
  `state=Confirmed`). It does not call `PUT /v1/tags/{id}/assets/add`.
- **Related terms shape.** GET returns `TermRelation[]` (`term` +
  `relationType`). PUT still uses CreateGlossaryTerm `relatedTerms` as FQN
  strings. Typed relation CRUD (`POST /v1/glossaryTerms/{id}/relations`) is
  not wired.
- **Data product assets.** List uses `GET /v1/dataProducts/{id}/assets`.
  Adding assets through bulk `PUT /{name}/assets/add` is left for later.
- **Empty catalog.** Seeded classifications usually exist; glossaries,
  domains, and data products may be empty. Empty tables are empty states,
  not fake trees.
- **Unwired asset types.** Search still lists other `dataAsset` types.
  Governance PATCH is only offered when Phase 1 already wires table/topic
  and the GET returned an `id`.
- **Owner picker size.** Users/teams/tags load with `limit=100`. Larger
  catalogs need a later search-backed picker.

## Open questions (safest default already taken)

1. **Serve SPA from slim Java?** Still **no** — same as Phase 1.
2. **Bulk tag-to-many-assets editor?** **No** in Phase 4.
3. **Glossary CSV / RDF import?** **No**.
4. **Policy / approval workflow for terms?** **No** beyond what Phase 2
   already does with roles.

## Verification checklist

1. `cd smartmetadata-ui && npm test`
2. `cd smartmetadata-ui && npm run build`
3. `python3 scripts/rebuild/check_ccl_free_dist.py`
4. Manual path above against a running Phase 0 server
