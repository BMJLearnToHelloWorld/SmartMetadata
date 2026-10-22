# Asset governance fields are written with RFC 6902 PATCH and TagLabel

- **Status:** Accepted
- **Revisions:** v1 2026-10-22 (initial)
- **Deciders:** SmartMetadata rebuild (Phase 4)
- **Guard:** `smartmetadata-ui` asset writes use `PATCH /v1/{tables|topics}/{id}` with `Content-Type: application/json-patch+json`; tag values include TagLabel required keys; reviewers reject invented tag endpoints and CCL UI reuse
- **Related:** `docs/rebuild/PHASE4.md`; ADR:2026-10-22-clean-room-vue-spa

## Context

Phase 4 must let operators edit description, owners, tags, and domain on a
wired asset without copying the Collate Community License React console. The
server already PATCHes those entities as JSON Patch (same as Phase 2 role
assignment) and documents TagLabel required keys in
`openmetadata-spec` `type/tagLabel.json`. Bulk
`PUT /v1/tags/{id}/assets/add` is a many-assets-one-tag API, not the
asset-detail contract.

## Decision

- On table and topic detail, write `/description`, `/owners`, `/tags`, and
  `/domains` in one RFC 6902 PATCH to `/v1/{tables|topics}/{id}`.
- `/owners` and `/domains` values are `{id,type}` entity references
  (`type` is `user`/`team` or `domain`).
- `/tags` values are TagLabel objects with `tagFQN`, `source`
  (`Classification` or `Glossary`), `labelType=Manual`, `state=Confirmed`.
- Do not invent fields. Do not use bulk tag/asset APIs on this page.
- Glossary list filter `?glossary=` sends the glossary **id**. Create
  glossary term / tag / domain / data product bodies use the documented
  Create* required keys only.

## Consequences

Asset governance stays on the same PATCH content type Phase 2 already uses.
A later phase that wants bulk apply, CSV import, or more entity types adds a
new record. Switching to PUT of a full table/topic entity is a new decision.
