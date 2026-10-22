# Phase 9 — Collaboration and long-tail UI (clean-room)

Phase 9 extends `smartmetadata-ui/` with activity, conversations, tasks,
announcements, and custom-property values against Apache
`openmetadata-service` REST. It does not copy, transpile, or import
`openmetadata-ui` or `openmetadata-ui-core-components`.

Earlier phases: [PHASE0.md](PHASE0.md)–[PHASE8.md](PHASE8.md).
ADR:2026-10-22-clean-room-vue-spa still applies. New conventions:
ADR:2026-10-22-collaboration-uses-activity-and-conversations and
ADR:2026-10-22-custom-property-values-use-extension-patch.

## What shipped

JWT route guards from Phase 1 are unchanged. Phase 1–8 routes stay.

| Surface | Location | Server contract |
|---|---|---|
| Global activity feed | `views/collaboration/ActivityFeedView.vue` | `GET /v1/activity` (`days`, `limit`) |
| Entity activity on asset detail | `AssetDetailView.vue` | `GET /v1/activity/entity/{type}/name/{fqn}` |
| Conversations (comments) | Activity page + asset detail | `GET/POST /v1/conversations` (`message` + `about` entity link); replies `POST /v1/conversations/{id}/replies` or `POST /v1/activity/{id}/replies` |
| Tasks list / create / resolve / comment | `TasksListView.vue`, `TaskDetailView.vue` | `GET/POST /v1/tasks`; `POST /v1/tasks/{id}/resolve` (`resolutionType`); `POST /v1/tasks/{id}/comments` (`message`) |
| Announcements | `AnnouncementsListView.vue` | `GET/POST /v1/announcements` (`description` + `startTime` + `endTime`) |
| Custom property values | `AssetDetailView.vue` | Definitions `GET /v1/metadata/types/name/{entityType}/customProperties`; values on GET `fields=extension`; write `PATCH /extension` |

There is **no** `/v1/feed` resource on this server. The historical thread API
was split into Activity + Conversations + Tasks + Announcements.

Routes (still JWT-guarded except `/login`):

`/activity`, `/tasks`, `/tasks/:id`, `/announcements`.

AppShell adds a **Collaboration** section. Search, lineage, Governance,
Quality, Observability, Ingestion, and Admin stay.

### Persona / landing — skipped

`GET /v1/personas` exists, but a landing page or nav switcher that consumed
`uiCustomization` / persona widgets would either invent a backend or pull in
Collate AI context (`PersonaContext*`, `AIContextMarkdown`). Phase 9 does not
list or switch personas.

## How to run

Same as Phase 1: slim server from [PHASE0.md](PHASE0.md), then

```bash
make ui_install
make ui_dev
# http://localhost:5173
```

Stock bootstrap: `admin@open-metadata.org` / `admin`. Writes need the matching
feed / task / announcement / `EDIT_CUSTOM_FIELDS` operations (admin does).

### Manual verify

1. Unauthenticated `/activity` redirects to `/login?redirect=/activity`.
2. Sign in. Search, lineage, Governance, Quality, Observability, Ingestion,
   and Admin still work.
3. **Collaboration → Activity**: list from `GET /v1/activity` (empty on a
   fresh catalog is fine). Post a conversation against a real table FQN
   (`message` + `<#E::table::{fqn}>`).
4. Open that **table** from Search. **Activity** and **Conversations** load
   from the entity-scoped APIs. Post another conversation from the asset
   page. **Custom properties** lists definitions (often empty) and the
   `extension` values when present.
5. **Tasks**: list open tasks. Create a `Custom` / `CustomTask` with a
   description and optional about-link. Open it. Resolve with `Completed`
   or add a comment.
6. **Announcements**: list. Create one with description + start + end. Leave
   FQN empty only if you are admin (system announcement).
7. Log out. Session key `sm.auth.v1` is cleared.

## Tests

```bash
cd smartmetadata-ui && npm test && npm run build
python3 scripts/rebuild/check_ccl_free_dist.py
```

Covered: activity / conversation / task / announcement / custom-property
clients against real paths and required bodies; extension JSON Patch;
Activity, Tasks, and Announcements list views; AssetDetailView activity,
conversations, and custom properties.

## Non-goals (later phases)

- Persona landing / `uiCustomization` nav (skipped; no thin non-AI path)
- Collate AI Studio / chatbot threads (DROP)
- Reactions, mention-only feeds, bulk task operations, suggestion apply
- Defining new custom *property types* (server forbids that)
- Phase 10 MCP — **done in** [PHASE10.md](PHASE10.md); Phase 11 harden — **done in** [PHASE11.md](PHASE11.md)
- Shipping the SPA inside `openmetadata-dist` (needs a new ADR)

## Residual risks and open questions

- **No `/v1/feed`.** Reviewers who remember the old thread resource should
  look at Activity + Conversations. ADR:2026-10-22-collaboration-uses-activity-and-conversations.
- **Task form schemas.** `CreateTask.payload` is validated against the
  `TaskFormSchema` for that type. Phase 9 only offers API-creatable types
  and defaults to `Custom` / `CustomTask` with description. Types that
  require a typed payload will 400 — that is the server, not a fake form.
- **Server-opened tasks.** `MemoryConflictReview` and `MetadataCompletion`
  cannot be created by clients.
- **Resolve transitions.** `/resolve` with `resolutionType` uses the
  workflow default transition. Tasks whose workflow rejects that default
  stay unresolved; we do not invent transition IDs.
- **System announcements.** No `entityLink` requires admin/bot. The UI
  allows leaving FQN empty and surfaces the 403.
- **Custom property shapes.** String / integer / number are edited as text.
  Entity-reference, table, and enum configs display as JSON strings. Empty
  catalogs have no definitions — empty table, not fake fields.
- **Empty activity.** Fresh servers have no `activity_stream` rows. Empty
  tables are empty states.
- **Persona.** Skipped as above.

## Open questions (safest default already taken)

1. **Invent a `/v1/feed` client for older docs?** **No.**
2. **Persona landing without Collate AI widgets?** **No** in this phase.
3. **Serve SPA from slim Java?** Still **no** — same as Phase 1.
4. **Reactions / following / my-feed tabs?** **Not in this phase** — the
   endpoints exist (`/v1/activity/my-feed`, `/following`, `/mentions`) and
   can be added later.

## Verification checklist

1. `cd smartmetadata-ui && npm test`
2. `cd smartmetadata-ui && npm run build`
3. `python3 scripts/rebuild/check_ccl_free_dist.py`
4. Manual path above against a running Phase 0 server
