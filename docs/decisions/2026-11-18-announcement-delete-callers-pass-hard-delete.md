# Announcement delete callers pass hardDelete explicitly; the API default stays false

- **Status:** Accepted
- **Revisions:** v1 2026-11-18 (initial)
- **Deciders:** Bai (2026-11-18: A-group batch; official 1:1 parity required, no documented deviations)
- **Guard:** `smartmetadata-ui/src/api/announcements.test.ts` (delete block: explicit `true` wire, `false` default); `smartmetadata-ui/src/views/collaboration/AnnouncementsListView.test.ts` (delete sends `hardDelete=true` and reloads)
- **Related:** upstream pin `a3012259ca` (`rest/announcementsAPI.ts` `deleteAnnouncement`, `hooks/platform/useSystemAnnouncements.ts`, `components/common/EntityPageInfos/AnnouncementDrawer/AnnouncementDrawer.tsx`)

## Context

The server's `AnnouncementResource.delete` reads a `hardDelete` query
parameter defaulting to `false`. The product's only caller passed nothing,
so deletes were soft deletes — restorable in principle, but the UI offers
no restore surface, so a deleted announcement lingered in storage with no
way back. Pin's API carries the same `false` default, and both of pin's
production callers (the system list hook and the entity drawer) pass
`true` explicitly; the hook's comment gives the reason: a system
announcement has no entity page to restore it from.

## Decision

- `deleteAnnouncement(id, hardDelete = false)` keeps its signature and its
  `false` default, which is the pin API shape. The default must never be
  changed to `true`: that would hide a caller obligation inside the API
  and leave a future caller's semantics ambiguous.
- Hard delete is a caller obligation: every call site passes `true`
  explicitly. The list view's only call site does so.
- Any future announcement delete surface (for example an entity drawer)
  must likewise pass `true` explicitly.

## Consequences

A caller that forgets `true` silently creates an unrecoverable-by-UI
soft-deleted row, so the wire test locks the list call site's `true` and
the API test locks the default. Soft-deleted rows remain restorable via
`PUT /restore`, but the UI provides no restore surface; adding one is a
separate decision, not a reason to soften a delete.
