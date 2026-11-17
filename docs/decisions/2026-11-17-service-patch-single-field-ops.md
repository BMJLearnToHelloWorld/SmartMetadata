# Service field writes send single-field JSON Patch ops, not the pin's whole-object compare

- **Status:** Accepted
- **Revisions:** v1 2026-11-17 (initial) · v2 2026-11-17 (Decision corrected: echo semantics are per call site, not whole-object replace everywhere)
- **Deciders:** service-detail parity design (DESIGN.md §8, ADR-4) under Bai's standing official-alignment rules
- **Guard:** `smartmetadata-ui/src/views/ingestion/ServiceDetailView.test.ts` (PATCH op assertions for tags, description, data products, display name)
- **Related:** upstream pin `a3012259ca` (classic page `compare` diff in `handleDataProductUpdate`, `saveUpdatedServiceData`, `handleDescriptionUpdate`)

## Context

The pin builds each service write by diffing the whole updated object against
the stored object (`compare`) and sending the resulting ops. Every call site
on this page changes exactly one field, so the whole-object diff always
reduces to one field's ops. The product already has single-field patch
builders (`setFieldPatch`, `descriptionPatch`, `ownersPatch`, `tagsPatch`,
`domainsPatch`) used by the asset pages.

## Decision

Each write call site sends exactly one single-field op: tags via
`setFieldPatch('/tags', …)`, description via `descriptionPatch` (skipped when
unchanged), data products via `setFieldPatch('/dataProducts', …)` with refs
sent as-is, display name via `setFieldPatch('/displayName', …)` (skipped when
unchanged), service attributes via `setFieldPatch('/serviceAttributes', …)`.
Failures toast and rethrow so the editing component stays in edit mode. What
merges back from the PATCH response differs per call site, following the
pin: display name merges only `displayName` (pin `handleUpdateDisplayName`)
and service attributes merge only `serviceAttributes`, so a partial echo
cannot clobber untouched local state; tags, description, and data products
whole-replace the service object from the response (pin
`saveUpdatedServiceData`).

## Consequences

A future call site that changes two fields in one save must not reuse a
single-field helper and assume equivalence — it must either send two ops or
reintroduce a whole-object diff, with a test proving the end state. The
single-field form keeps each write auditable in tests; it forbids silent
multi-field writes through these helpers.

## Amendment

v2 corrects the v1 Decision sentence claiming the response replaces the
whole service object at every call site. Display name and service
attributes merge only their own field back; only the tags, description,
and data-products call sites whole-replace. The single-field-op decision
itself is unchanged.
