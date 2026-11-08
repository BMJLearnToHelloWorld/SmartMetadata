# Custom properties settings: Hub 26 rows, pinned list scope, and index-addressed delete patch

- **Status:** Accepted
- **Revisions:** v1 2026-11-07 (initial)
- **Deciders:** Bai (scope lock 2026-11-07; DECISIONS-RESOLVED.md G-D1/G-D2/G-D5; Wave 1 review REVIEW-W1-2-G23.md)
- **Guard:** `src/settings/customProperties.test.ts`, `src/settings/hub.test.ts`,
  `src/views/admin/SettingsHubView.test.ts`, `src/api/customProperties.test.ts`,
  `src/views/admin/CustomPropertyTypeDetailView.test.ts`,
  `src/views/admin/CustomPropertyTypesListView.test.ts`
- **Related:** `~/workspace/work/milestone-20261107/RULING-custom-properties.md`,
  `~/workspace/work/milestone-20261107/wave1/REVIEW-W1-2-G23.md`,
  official pin `a3012259ca` (`utils/GlobalSettingsClassBase.ts:748-986`,
  `rest/metadataTypeAPI.ts:126-187`, `components/Settings/CustomProperty/CustomPropertyTable.utils.ts`)

## Context

The official settings surface for custom properties is a 26-card category
page (one card per entity type), while the product showed a single link to a
server-enumerated types table. The deep ruling split the rebuild into
stages; Wave 1 (W1-2) lands stages 1–2: the Hub rows and the detail page
(delete + Schema tab + search/filter + Configuration column). Three points
in the ruling and the Wave 1 plan were wrong or undecided and are settled
here so later stages cannot silently re-decide them.

## Decision

### 1. One definition of the 26 types (`settings/customProperties.ts`)

The 26 type names, their labels, descriptions and icons are defined exactly
once in `src/settings/customProperties.ts` (`CUSTOM_PROPERTY_TYPE_ENTRIES`,
`CUSTOM_PROPERTY_ENTITY_TYPES`, `CUSTOM_PROPERTY_ENTITY_TYPE_SET`). The
Settings Hub builds its 26 rows from it and the types list filters by it.
No second copy exists — in particular not in `api/customProperties.ts` and
not as a literal in either view.

### 2. Hub presentation: 26 rows inside the custom-properties category card

The product Hub is one card per category with a link list inside, so the 26
items land as 26 rows (icon + description) inside the existing
custom-properties card — not a second-level category page and not 26
standalone category cards. Rows link to the existing detail route with the
type name as the `entityType` param (G-D2 (a)); no `/settings/customProperties/<tab>`
aliases are added (G-D4 (a)). Icons are mapped onto the product's existing
ant-design icon set (see the mapping table in `customProperties.ts`); no
official icon asset is introduced. Descriptions follow official verbatim:
25 items share "Define the custom properties for your {entity} …" with the
singular entity label (dashboardDataModel keeps official's plural entity),
Columns uses its own column-level message. The source array is in rendered
label order (`localeCompare`, as official sorts at the end of its list).

### 3. List pagination: fetch once, filter, count the filtered set

The types list fetches with a limit that covers the whole allowlist
(`limit=100`, paging on only if the server still returns a cursor), filters
client-side to the 26, and reports the filtered count as the total. The
server total is never shown as the filtered total, and cursor paging per
page is gone: paging then filtering would under-fill pages and misstate
the total.

### 4. Delete is an index-addressed JSON Patch with a `test` guard

The ruling and the Wave 1 plan wrote the delete as
`remove /customProperties/<name>`. That path is invalid: JSON Patch
(RFC 6902) cannot address an array element by name, and the server answers
400. The implementation ports official `patchCustomPropertyByName`
(`metadataTypeAPI.ts:126-187`) verbatim in semantics: GET the fresh type,
find the property's index, PATCH `/v1/metadata/types/{id}` with
`application/json-patch+json` and ops
`[{op:'test', path:'/customProperties/{i}/name', value:<name>},
{op:'remove', path:'/customProperties/{i}'}]`. Only a 400 (stale index)
triggers a re-GET and rebuild, at most 3 attempts
(`MAX_CUSTOM_PROPERTY_PATCH_ATTEMPTS = 3`); any other error is thrown.
A property that is already gone resolves as deleted (refresh, no failure).
On success the PATCH response's `customProperties` update the page in
place; an unusable response body triggers a re-GET.

### 5. Search matches name and display name only; filter converges

Search matches `name` and `displayName`, never `description` (official
`matchesSearch`); the plan's "name/description" wording is corrected, not
followed. The type filter offers only the property types present in the
current definitions, sorted by label with counts, and a selected type
whose last property disappears drops out of the effective filter.

### 6. Stage boundary: read-side `customPropertyConfig` only

Stage 2 adds the read side of `customPropertyConfig` (parse it in
`mapCustomProperty`, render the Configuration column in the four official
forms) because the column would otherwise always show "—". Write-side
form fields, the edit-time `propertyType` freeze (G-D3 (a)) and name
validation stay stage 3; this batch does not tighten the edit form.
Per-type permission gating (G-D5 (a)) stays stage 4 (Wave 3); stage 2
keeps the route-level admin gate only.

## Consequences

- The types list can never show a server type outside the official 26
  (e.g. `aiApplication`, `auditReport`); those types' properties remain
  manageable from entity detail pages and direct URLs, as in official.
- The delete path is safe under concurrent edits: a shifted index fails
  the `test` op instead of deleting the wrong property.
- Stage 3 must keep the `customPropertyConfig` read shape defined here
  and add only the write-side fields; stage 4 must wire
  `ResourceEntity.TYPE` per-type gating without touching this delete path.
