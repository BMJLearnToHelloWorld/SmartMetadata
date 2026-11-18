# Glossary-term relation edits carry every unedited field in the PUT body

- **Status:** Accepted
- **Revisions:** v1 2026-11-18 (initial)
- **Deciders:** Bai (2026-11-18: settings-page fixes align 1:1 with official; A-group batch, GTR-D10)
- **Guard:** `smartmetadata-ui/src/views/admin/GlossaryTermRelationSettingsView.test.ts` (edit PUT carries all nine unedited fields; second edit without reload still carries them); `smartmetadata-ui/src/api/relationshipTypes.test.ts` (unknown `entityStatus` maps to `undefined`)
- **Related:** upstream pin `a3012259ca` (`RelationshipTypeForm.utils.ts` `toRequestEntityStatus`, `toRelationshipTypeForm`, `toRelationshipTypeRequest`; `GlossaryTermRelationSettings.tsx` `RELATIONSHIP_TYPE_FIELDS`)

## Context

The server PUT replaces the whole relationship type: `RelationshipTypeResource.updateEntity` rebuilds the entity from the request body and keeps only `id`, `systemDefined`, and `provider` from the stored entity. A field the request omits is cleared. The settings form edits only ten field groups, so the six stored fields it never edits (`disjointWith`, `domain`, `entityStatus`, `propertyChain`, `range`, `replacedBy`) plus `owners`/`reviewers` were silently wiped on every edit of a custom type that carried them — and `owners`/`reviewers` never even reached the form, because the list request did not pass `fields=owners,reviewers` and the server nulls them otherwise.

## Decision

- An edit PUT carries all nine unedited fields (`disjointWith`, `domain`, `entityStatus`, `iri`, `owners`, `propertyChain`, `range`, `replacedBy`, `reviewers`).
- Carried values pass through verbatim: no trim, no filter, no dedupe. `entityStatus` is the one exception — it maps per official `toRequestEntityStatus`, so anything outside the seven literals is dropped to `undefined`. That drop is official behavior, not a relaxation by this batch.
- `inverse` is likewise not trimmed.
- The list request passes `fields=owners,reviewers` explicitly from the settings-page call site; other call sites of the shared fetch-all helper are unchanged.

## Consequences

When `CreateRelationshipType` gains a field, the three layers (API mapping, form values, request builder) must gain it together, or the omission must be recorded explicitly as intended. A field must never be omitted on the grounds that the page does not display it. The `entityStatus` drop rule must be re-checked whenever official `toRequestEntityStatus` changes. No post-save refetch is added: the PUT response echoes the full entity, so a second edit without reload keeps every field.
