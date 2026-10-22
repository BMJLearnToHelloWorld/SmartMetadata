# Collaboration reads Activity and posts Conversations, not /v1/feed

- **Status:** Accepted
- **Revisions:** v1 2026-10-22 (initial)
- **Deciders:** SmartMetadata rebuild (Phase 9)
- **Guard:** `smartmetadata-ui` feed clients call `GET /v1/activity` and `GET/POST /v1/conversations`; reviewers reject a `/v1/feed` client and CCL UI reuse
- **Related:** `docs/rebuild/PHASE9.md`; ADR:2026-10-22-clean-room-vue-spa; ADR:2026-10-22-dq-entity-links-use-message-parser-format

## Context

Older OpenMetadata consoles used a single `/v1/feed` thread API
(`CreateThread` / posts). This server no longer has that resource. The
replacement is split: lightweight change events on
`ActivityResource` (`/v1/activity`), operator comments on
`ConversationResource` (`/v1/conversations`), governance work items on
`TaskResource` (`/v1/tasks`), and time-bound notices on
`AnnouncementResource` (`/v1/announcements`).

## Decision

- Global and entity-scoped **feeds** are `GET /v1/activity` and
  `GET /v1/activity/entity/{type}/name/{fqn}`.
- Operator **comments** are `POST /v1/conversations` with required
  `message` and MessageParser `about` (`<#E::type::fqn>`). Replies are
  `POST /v1/conversations/{id}/replies` or `POST /v1/activity/{id}/replies`
  with `{ "message" }`.
- Do not invent `/v1/feed`, `CreateThread`, or a chatbot/AI thread type.
- Tasks and announcements use their own EntityResource collections.

## Consequences

Phase 9 can ship feed + comments against documented APIs. Adding
`/my-feed` / `/following` / `/mentions` tabs, reactions, or persona
landing is a new decision. Restoring a `/v1/feed` facade is forbidden
without a server change.
