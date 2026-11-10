# Custom Properties stage 3 — config write side

- **Status:** Accepted
- **Revisions:** v1 2026-11-08 (initial)
- **Deciders:** Bai (scope lock + 77 decisions 2026-11-07; G-23 stage 3 review APPROVE + 12 conditions)
- **Guard:** `src/api/customProperties.test.ts` (config assembly, validation, edit diff, PATCH retry), `src/views/admin/CustomPropertyTypeDetailView.test.ts` (create × 4 config kinds, edit PATCH, edit-scope controls, type-switch clearing, Applies To badge), `src/settings/customProperties.test.ts` (R-1 plurals, R-2 sort helper), `src/views/admin/SettingsHubView.test.ts` (zh-CN rendered order)
- **Related:** `~/workspace/work/milestone-20261107/wave2/REVIEW-W2-G23-S3.md`, `~/workspace/work/milestone-20261107/RULING-custom-properties.md`

## Context

Stages 1–2 (PR #163) landed the custom properties Hub allowlist, the
types list, the detail view, delete-by-PATCH, and the read-side config
summaries. The write side was still missing: the create/edit form could not
set the four config kinds (enum values, date/format, entity-reference types,
table columns), and edits went through a full PUT `addOrUpdateCustomProperty`.

## Decision

### 1. Edit-form scope is enum + entity-reference only (review condition 1)

The ruling §4 phrase "the edit form supports changing config" is unscoped
and wrong as written. The official edit form (`CustomPropertyEditForm.tsx`,
pin `a3012259ca`) changes ONLY two config kinds:

- enum config (`multiSelect` + `values`, additive — existing values are
  never removed: `updating-existing-not-possible-can-add-new-values`),
- entity-reference config (additive — `uniq([...saved, ...selected])`).

Format and table (columns) configs are NOT editable on edit: the edit form
renders no control for them and the PATCH carries no op for them. The create
form handles all four kinds. This batch implements exactly that scope. If
format/table editing is ever found necessary, it is a new decision — the
scope is not opened here.

### 2. Config assembly follows official `buildCustomPropertyConfig`

`src/api/customProperties.ts` ports
`CustomPropertiesPanel.utils.ts:buildCustomPropertyConfig` verbatim:

- enum → `{ config: { multiSelect, values } }`,
- format → `{ config: <format id string> }` (a bare string, not an object),
- entity-reference → `{ config: [type names] }`,
- table → `{ config: { columns } }`,
- other types → `customPropertyConfig` absent entirely.

`SUPPORTED_FORMAT_MAP` carries 7 date formats, **8 dateTime formats**, and
1 time format (`HH:mm:ss`) — the review's "9 dateTime formats" is a
miscount of the pin (`constants/CustomProperty.constants.ts`); the
implementation uses 8 and records the correction here.

`getCustomPropertyTypeFlags` ports the official type detection:
`enum` by name; format by `PROPERTY_TYPES_WITH_FORMAT =
['date-cp','dateTime-cp','time-cp']`; entity-reference by
`PROPERTY_TYPES_WITH_ENTITY_REFERENCE = ['entityReference',
'entityReferenceList']`; table by `TABLE_TYPE_CUSTOM_PROPERTY = 'table-cp'`.

`toCustomPropertyPayload` ports `toCustomPropertyPayload` except that the
product's `propertyType` keeps `{ id, type: 'type', name }` — the server's
existing accepted create shape (W1-2 landed `addOrUpdateCustomProperty`
with `name` in the payload); only the config assembly is new.

### 3. Edits go through PATCH, never PUT

`updateCustomPropertyByName` ports `metadataTypeAPI.ts`:
`patchCustomPropertyByName` + a hand-written diff (see §4) with the same
test-guard (the `test` op targets the current value at the live index, so a
concurrent edit fails the patch instead of silently overwriting), 400-only
retry, max 3 attempts (`MAX_CUSTOM_PROPERTY_PATCH_ATTEMPTS = 3`, shared
with delete). PUT is no longer used by the edit path: PUT would overwrite
concurrent changes and re-send the frozen propertyType. The property type
Select is disabled in edit (G-D3 (a)) and the type never enters the PATCH.

`getCustomPropertyChanges` ports `CustomPropertyEditForm.utils.ts`:
only the enum and entity-reference configs are computed; an unchanged
displayName is sent as `undefined` so the diff emits no
`add /displayName ""` op; entity-reference is the union of saved + selected
(additive).

### 4. The diff is hand-written, no fast-json-patch

The product has no `fast-json-patch` dependency and adding one for three
fields is unjustified. `diffCustomPropertyChanges` implements the exact
`compare` semantics the official call needs for these three fields:
unchanged → no op; field absent on the server copy → `add`; otherwise
`replace`. The array index is resolved against the server-fetched copy
(the same live-index rule delete uses), and a stale-index 400 triggers the
same re-GET + rebuild retry as delete.

### 5. Form validation ports the official rules, at submit time

`validateCustomPropertyForm` ports `CustomPropertyFormFields.tsx`:
name required, maxLength 256, `CUSTOM_PROPERTY_NAME_REGEX =
/^[A-Za-z0-9][A-Za-z0-9 _\-.,;%#@!'(){}[\]|=+?`]*$/`, case-insensitive
uniqueness against the existing names (create only — official is also
case-insensitive client-side while the server remains case-sensitive; see
residual R-W2G23-S3-1); description required; property type required; enum
values required for enum; format required and must be one of the supported
formats for date/dateTime/time; entity-reference types required; columns
required, 1–3, reserved `__row_id__` excluded.

Deliberate deviation, product pattern: official disables the Create button
while the form is invalid (live validation); the product validates at submit
time and reports the first issue. The behaviour is functionally equivalent
(nothing is submitted invalid) and the product's submit-time pattern is
already established across the admin forms; it is not changed here.

### 6. R-1 — en-US entity singular/plural wording

Official `GlobalSettingsClassBase.ts:748-986` uses the plural entity label
for 17 items and the singular for 8. The product rendered the singular for
16 of the 17 plural items (only dashboardDataModel was already plural).
This batch changes those 16 en-US `entity` values to the plural
(Tables, Stored procedures, Dashboards, Pipelines, Topics, Containers,
ML models, Search indexes, Charts, Directories, Files, Spreadsheets,
Worksheets, Articles, Teams, Users). The 8 singular stay: API collection,
API endpoint, Data product, Database, Database schema, Metric, Glossary
term, Domain. zh-CN has no singular/plural distinction and is untouched.
The W1-2 ADR is not edited; this correction is recorded here.

### 7. R-2 — Hub sorts by rendered label at runtime

Official sorts the custom-properties rows by rendered label at render time
(`:986`, `.sort((a,b) => a.label.localeCompare(b.label))`). The product's
Hub rendered the authored en-US label order, which is wrong in zh-CN.
`settings/hub.ts` gains `sortSettingsItemsByRenderedTitle(items, titleFn)`
(a pure helper sorting a copy) and `SettingsCategory.sortItemsByRenderedTitle`;
`SettingsHubView.vue` applies it per flagged category. Only the
custom-properties category is flagged — other categories keep their authored
order. The `settings/customProperties.test.ts` order assertion is retargeted
to the helper with shuffled input in both locales.

### 8. `explore.entity` keys for the entity-reference picker

The review's "tag has no corresponding key" is inverted: the pin has
`explore.entity.tag` (`'Tag'`) and the actually-missing keys are `team` and
`user` (absent from both en-US and zh-CN). This batch adds
`explore.entity.team` / `explore.entity.user` ('Team'/'User',
'团队'/'用户') and reuses existing keys otherwise, falling back to the
official English labels. The entity-reference picker renders the 16 official
options in pin order, including `tag`.

### 9. Stage-4 pre-check (recorded, NOT implemented)

The permission API layer supports the TYPE resource at code level
(`getResourcePermission(resource: string)` is generic; W1-0-CHECK §0-4
re-verified). But the product has NO `useEntityPermissions` hook and NO
`ResourceEntity` enum, so stage 4 cannot copy official's
`useEntityPermissions(ResourceEntity.TYPE, { id })` wiring. Stage 4 must
wire the gate via the store/permissionFlags or a new hook; that wiring is
stage 4's work, recorded here as a pre-check, not implemented in this batch.

## Consequences

- Create covers all four config kinds; edit covers enum + entity-reference
  only, exactly per official.
- Edits are PATCH-only with test-guard + retry; PUT is no longer used for
  edits.
- The detail view's Configuration column already echoed
  `customPropertyConfig` (stage 2 read side), so created configs are
  visible immediately.
- The Hub custom-properties rows now sort per the active locale.
- `settings.customProperties.createInvalid` is removed (submit-time
  validation reports per-field issues instead); `detailLead` no longer
  mentions the PUT transport.

## Residuals

- **R-W2G23-S3-1**: name uniqueness is case-insensitive client-side but
  the server is case-sensitive — a name differing only by case from an
  existing property passes the form and is rejected (or accepted) by the
  server. Official has the same asymmetry (client-side case-insensitive
  check, server case-sensitive). Live verification item, not a batch gap.
- **R-W2G23-S3-2**: live verification owed — create × 4 config kinds with
  the config echoed back in the Configuration column, edit enum add-only
  (remove attempt blocked), edit entity-reference add-only, PATCH
  test-guard retry on concurrent edit, and the Hub order in zh-CN.
  Needs Bai: admin login + the deployed build containing this batch.
