# Custom property values are the entity extension object, patched in place

- **Status:** Accepted
- **Revisions:** v1 2026-10-22 (initial)
- **Deciders:** SmartMetadata rebuild (Phase 9)
- **Guard:** wired asset GET requests `fields=extension`; writes use `PATCH /extension` on `/v1/{tables|topics}/{id}`; definitions come from `GET /v1/metadata/types/name/{entityType}/customProperties`
- **Related:** `docs/rebuild/PHASE9.md`; ADR:2026-10-22-asset-governance-uses-json-patch

## Context

Custom properties are defined on the entity **type**
(`TypeResource`) and stored on each entity as `extension`. There is no
per-value REST collection. Inventing `PUT /v1/tables/{id}/customProperties`
would be a backend.

## Decision

- Load definitions from
  `GET /v1/metadata/types/name/{entityType}/customProperties`.
- Load values from the wired table/topic GET with `fields` including
  `extension`.
- Write the whole `/extension` object with the same RFC 6902 PATCH
  Phase 4 already uses for `/description`, `/owners`, `/tags`, `/domains`.
- Do not add or rename property *definitions* from this console. Do not
  invent a custom-property write path.

## Consequences

Empty type definitions stay an empty table. Complex property types
(entity reference, table, enum config) can be shown as JSON and edited
as text; a later phase can add typed editors without changing the write
contract.
