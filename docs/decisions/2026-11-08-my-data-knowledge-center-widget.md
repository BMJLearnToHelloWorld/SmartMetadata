# My-data KnowledgeCenter widget: recent pages, quick links, create gate

- **Status:** Accepted
- **Revisions:** v1 2026-11-08 (initial); v2 2026-11-08 (follow-up: the limit is a post-create refresh, not a create gate — review condition 13's wording was wrong; the create modal moves out of the card slot)
- **Deciders:** Bai
- **Guard:** `features/home/widgets/KnowledgeCenterWidget.test.ts`, `catalog/safeHttpUrl.test.ts`
- **Related:** Wave 2 G-11 B/C, `wave2/REVIEW-W2-G11-BC.md` condition 13, official `components/MyData/Widgets/ContextCenterWidget.tsx`

## Context

The stage-A placeholder stood where official shows the Context Center
widget: the most recently updated knowledge pages, quick links out,
and a create entry gated on permission only.

## Decision

- The widget fetches 10 pages (`listKnowledgePages`, `updatedAt`
  desc) through `useWidgetLoad` (5-min TTL) and shows 6 rows; the
  recent label counts the pages updated this week ("10+" floor when
  all fetched are recent and the server total is larger).
- Quick links go out through `getSafeHttpUrl` (only `http:`/`https:`
  protocols; an unsafe URL falls back to the article-page button);
  the rest open the article page.
- The empty state's create action is gated on `canCreate` from
  `getResourcePermission('page')` only. Official passes
  `getResourceLimit('knowledgeCenter', ...)` as the create flow's
  post-success callback (`ContextCenterWidget.tsx`), never as a gate:
  the review's condition-13 wording ("gated on permission and the
  limit") was wrong, and the v1 decision followed it. The widget
  refreshes the limit after a successful create instead, fail-open.
- Creation mounts the product's `ArticleFormModal` with
  `createKnowledgePage` — the product's create flow, not official's
  draft-then-edit. Recent == 0 shows the status "Caught up".
- The modal is mounted beside the card, not inside its default slot:
  `HomeWidgetCard` renders `<slot v-else />`, so a modal in the slot
  is unmounted exactly in the empty state where the create action
  lives, and the action could never open it.

## Consequences

- The widget's create entry is the product's article form; no
  draft-then-edit flow is built.
- The `safeHttpUrl` port is shared: any future outbound link from a
  stored URL reuses it rather than inventing its own check.
