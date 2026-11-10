# Custom Properties stage 4 — per-type permission gate

- **Status:** Accepted
- **Revisions:** v1 2026-11-10 (initial)
- **Deciders:** Bai (scope lock + 77 decisions 2026-11-07; G-23 stage 4 review APPROVE + 10 conditions, REVIEW-W3-G-STAGES.md §3)
- **Guard:** `src/composables/useEntityPermissions.test.ts` (enabled-gating, deleted forcing edit flags false, refresh re-fetch, error → all-false flags), `src/views/admin/CustomPropertyTypeDetailView.test.ts` (stage 4 gate block: buttons absent/present, schema-tab Add rule, loading fail-closed, permission-error toast, form unopenable without EditAll), `src/router/guards.test.ts` (both route names map to `'type'`)
- **Related:** `~/workspace/work/milestone-20261107/wave3/REVIEW-W3-G-STAGES.md` (§3, §5.1), `~/workspace/work/milestone-20261107/RULING-custom-properties.md` (G-D5), `docs/decisions/2026-11-08-custom-properties-s3-config-write-side.md` (§9 pre-check, now implemented)

## Context

Stages 1–3 landed the custom properties Hub allowlist, the types list, the
detail view, and the config write side — but the Add/Edit/Delete buttons
had no permission gating at all: they showed whenever the type id was known,
and the routes were admin-only by the route guard's default (unmapped admin
routes stay admin-only). Official gates the same page twice: the route
(`AdminProtectedRoute` = `isAdminUser || hasPermission`) and the buttons
(`useEntityPermissions(ResourceEntity.TYPE, { id })` → `canEditAll`).

Stage 3's review condition 11 was the stage-4 handoff: the API layer
supported TYPE (generic string resource) but the product had no
`useEntityPermissions` hook and no `ResourceEntity` enum, so stage 4 could
not copy official's wiring verbatim. This batch builds the hook and lands
the gate. Ruling residual R3 ("permission API support for TYPE unverified")
is CLOSED by the evidence in §3.2 of the review: API layer
(`api/permissions.ts` generic string resource + `stores/permissions.ts`
wrappers), server (`PermissionsResource.java` byte-identical pin vs main),
and the live-verification requirement for the runtime check.

## Decision

### 1. The shared `useEntityPermissions` composable is built once, by G-23

`src/composables/useEntityPermissions.ts` is the single UI entry point for
entity permissions, mirroring pin's hook
(`hooks/useEntityPermissions/useEntityPermissions.ts`, 108 lines). G-18
stage 2 consumes it for ONTOLOGY / ONTOLOGY_CONCEPT; it must NOT build a
second copy or a per-batch wrapper (REVIEW-W3-G-STAGES §5.1).

- Signature mirrors pin: `(resource, identifier: string | { id }, options?:
  { deleted?, enabled? })` → `{ ...DerivedPermissionFlags, permissions,
  isLoading, error, refresh }`.
- `ResourceEntity` is a string-literal union, not a runtime enum — the
  product has no enum convention here: `'type' | 'ontology' |
  'ontologyConcept' | 'ontologyProperty' | 'ontologyAxiom' |
  'relationshipType' | 'glossary' | 'glossaryTerm'`, with `TYPE = 'type'`
  (pin `permissions.enum.ts:51`). It includes at least the values G-18
  stage 2 and G-23 stage 4 need.
- Implementation is over the permission store (`getEntityPermissionById` /
  `getEntityPermissionByFqn`, per-principal cache already in the store),
  `enabled && Boolean(key)` gating (no fetch before the key resolves),
  `DEFAULT_ENTITY_PERMISSION` (all-false ops) before load, flags via the
  existing `getDerivedPermissionFlags(permissions, deleted)`, and
  `refresh()` invalidating the store entry for that key — a new store
  `invalidateEntityPermission(resource, identifier)` — never bypassing
  the store with a direct API call.
- Vue adaptation (pin is React): pin re-evaluates on every render, so a
  plain `enabled: Boolean(id)` re-gates when the id resolves; Vue setup
  runs once, so the identifier and the options are `MaybeRefOrGetter` —
  a plain string / object / boolean works exactly as in pin, and a
  computed/ref re-triggers the fetch when the id resolves. A key change
  resets the permissions to the all-false default immediately, so the
  previous entity's grant is never shown while the new one loads
  (fail-closed); a generation counter drops stale in-flight responses.
- Error → all-false flags + error surfaced (not swallowed): the caller
  toasts it while the gated buttons stay hidden.

### 2. Detail-page gate, exactly per pin

In `CustomPropertyTypeDetailView.vue`:
`useEntityPermissions('type', { id: typeMeta.id ?? '' }, { enabled:
Boolean(typeMeta.id) })` — no `deleted` option (pin passes none for TYPE).
Permissions error → error toast (the raw error message, as pin's
`showErrorToast`), page stays readable. Add button
(`add-custom-property`): visible only when `activeTab ===
'custom-properties' && editPermission` (pin `usePageHeader
createPermission` rule). Row Edit and row Delete: hidden (not disabled —
pin's Actions column renders null when both are false) when
`!editPermission`. `canEdit = canDelete = editPermission` — no edit/delete
split (pin does not split them for custom properties; both ride
`hasAccess`).

### 3. Route mapping — the security-scoped widening

Both route names map to `'type'` in `ADMIN_ROUTE_RESOURCE`:
`'admin-settings-custom-properties': 'type'` and
`'admin-settings-custom-property-type': 'type'`. Both names are needed:
the detail route alone would admit a direct-URL non-admin while the list
(parent navigation) still forbade them. Entry grant is the existing
`hasAdminEntryGrant` (resource-level ViewAll || ViewBasic || EditAll via
`GET /v1/permissions/type`), unchanged — no new grant rule is invented.

This widens route access from admin-only to permission-gated. That is
exactly pin's `AdminProtectedRoute` semantics and the existing product
pattern for mapped routes (user/team), but it is a security-scoped
widening: the batch live-verifies the deny case (see Residuals) and maps
NO other route in this batch. The per-type entity gate alone cannot admit
its intended audience — while the routes are unmapped, the guard forbids
every non-admin at the route, so a non-admin holding `EditAll` on a
specific Type could never reach the buttons the entity gate would show
them; the entity gate without the route mapping would be dead code for
non-admins. Conversely, mapping the routes without the entity gate would
admit any non-admin with a resource-level type grant to buttons they may
not hold per-type. Pin does both; stage 4 does both.

### 4. No behavior change to the write paths; fail-closed loading

Add/Edit/Delete keep the S3-landed clients and payload rules (PUT add,
PATCH-by-name edit with 400-retry ×3, delete-resolves-undefined →
refresh). The gate only hides the entry points; it changes no payloads,
retries, or toasts. While `isLoading`, Add/Edit/Delete are absent — never
optimistically shown and then hidden (no flash-of-unauthorized-action).
The table/search/filter/schema tab render regardless (the read path is
unaffected by the gate). There is no keyboard shortcut, direct modal open,
or URL param that opens the form — hiding the buttons closes every entry
path, asserted in tests.

### 5. Test setup: the detail-view tests mock the permission store

`CustomPropertyTypeDetailView.test.ts` mocks `@/stores/permissions`
(precedent: `DataEstateWidget.test.ts`) so the gate's grant is
controllable per test (allow / empty / ViewBasic-only / pending /
rejecting) without touching the per-test fetch stubs. The composable's
own tests use the REAL store + a stubbed fetch boundary and cover the
fetch/invalidation behavior. The existing S3 tests keep passing under the
default allow grant — no assertion was weakened; the grant is the
permission context those tests always assumed (admin).

## Consequences

- Non-admins with a resource-level type grant can now enter the
  custom-properties routes (previously admin-only); whether they see
  Add/Edit/Delete on a given type is decided per-type by `EditAll`.
- Admins see no change (all buttons, as before).
- `useEntityPermissions` is shared infrastructure: G-18 stage 2 must
  import it, not reimplement it; a second copy is a review failure.
- The permission store gains `invalidateEntityPermission` (used only by
  the composable's `refresh()`).

## Residuals

- **R-W3G23-S4-1**: live verification owed — the 5-row matrix (review
  cond. 6): (a) non-admin with NO type grant: `GET /v1/permissions/type`
  returns without 404/500, detail + list routes forbidden; (b) non-admin
  with resource-level ViewBasic/ViewAll but no per-type EditAll: enters
  list + detail, sees table/search/schema, sees NO Add/Edit/Delete;
  (c) non-admin with per-type EditAll on one Type: sees buttons ONLY on
  that type's detail page; (d) admin: unchanged; (e) permission fetch
  failure: page readable, buttons hidden, error toast shown (forced
  failure, not just the happy path). Needs Bai: a non-admin test account
  + per-type grants fixtures. A missing (b) or (c) fixture means the
  batch reports "not live-verified" for that row, not "passed".
