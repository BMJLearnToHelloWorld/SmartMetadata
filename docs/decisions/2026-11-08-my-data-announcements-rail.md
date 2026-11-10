# My-data stage C: announcement rail, critical banner, greeting header

- **Status:** Accepted
- **Revisions:** v1 2026-11-08 (initial)
- **Deciders:** Bai
- **Guard:** `features/home/widgets/AnnouncementsRail.test.ts`, `features/home/widgets/CriticalAnnouncements.test.ts`, `features/home/widgets/AnnouncementCard.test.ts`, `catalog/announcementLifecycle.test.ts`, `catalog/announcementType.test.ts`, `utils/stripMarkdown.test.ts`, `features/home/useDismissedAnnouncements.test.ts`, `features/home/useRailPager.test.ts`, `features/home/HomeLandingPageHeader.test.ts`
- **Related:** Wave 2 G-11 B/C, `wave2/REVIEW-W2-G11-BC.md` condition 18, official `components/MyData/HomeLandingPage/` (`CriticalAnnouncements`, `AnnouncementsRail`, `AllAnnouncementsDialog`, `AnnouncementCard`, `HomeLandingPageHeader`, `announcementLifecycle`, `useDismissedAnnouncements`, `useRailPager`), `utils/AnnouncementsUtils.ts`, `utils/RichTextStringUtils.ts`

## Context

Stage C puts official's Home landing page top on the page: the live
critical system announcements as a banner, the greeting header as
its fallback, and the asset announcements rail below it with its
"view all" dialog. The banner and the rail sit inside
`my-data__scroll` above the grid; no create entry lives on home.

## Decision

- **Critical banner:** fetches ALL pages (`active`, `system`,
  `type: Critical`, 25/page) and sorts by `startTime` desc — the
  server pages in its own order, so sorting one page alone could
  leave the newest out. No live announcements withdraws the whole
  section and the greeting header (fallback slot) renders instead;
  the dialog is not involved. Multi-item paging is user-driven
  only, never auto-rotating, through the shared `useRailPager`.
- **Dismiss keys:** two independent localStorage keys, one per
  surface — `om-home-dismissed-announcements:<userId>` (rail) and
  `om-home-dismissed-critical-announcements:<userId>` (banner) —
  pruned against what each surface shows, JSON-tolerant, and the
  key deleted when empty. The API has no per-user dismiss, so this
  is browser-local by design.
- **All-announcements dialog:** loads only when opened, 50/page on
  the `after` cursor, sorted across pages by
  `compareAnnouncements` (Active, then Scheduled, then Expired,
  newest start first); the badge is the server total less the
  dismissals among the pages loaded. It mounts beside the section,
  not inside it, so dismissing the last live card from the open
  dialog cannot unmount the dialog itself.
- **AnnouncementCard:** the type table is ported from
  `AnnouncementsUtils` (only Custom honours the stored `color` and
  `customTypeName`); lifecycle (Active/Scheduled/Expired, only
  Active dismissible) is derived from the start/end window, never
  the stored status snapshot. The description is flattened with
  `stripMarkdown` and clamped to two lines with a tooltip. The
  title is a stretched whole-card link when the entity has a
  product detail route; domain/dataProduct announcements carry an
  FQN while the governance detail routes take an entity id, so
  those stay plain text — the FQN still shows in the footer.
  Non-live cards render dimmed with a status badge.
- **Greeting header:** 40px avatar + `Hi, <name>` (start-cased
  display name) + subtitle; classic always renders — the product
  has no AI mode.
- **Two-up rule (R-W2G11-6):** official sizes the rail off the
  section's own width with a `@2xl` container query; the product
  has no Tailwind container queries, so a plain
  `@media (min-width: 720px)` breakpoint on the rail carries the
  same rule. A lone announcement takes the full width.
- **Refresh (R-W2G11-7):** official revalidates on route
  activation / websocket-dirty / max-age; the product has no such
  channel — the 60s TTL plus route re-entry re-check is the
  equivalent, and no channel is built.

## Product adaptations (deliberate, not ports)

- The critical banner is a dark slab: official uses gray-900; the
  product palette's darkest neutral is gray 100 (`#4d4d4f`), used
  with white text.
- The card's entity icon is omitted: the product has no
  entity-icon abstraction; the FQN text carries the reference.
- The type icons are Antd icons (`ExclamationCircleOutlined`,
  `InfoCircleOutlined`, `WarningOutlined`, `StopOutlined`,
  `BellOutlined`); the surface tints are written out in full from
  the product palette (background 25% step, edge 50% step, text
  100% step).
- `stripMarkdown` is a small regex stripper: the product has no
  `remove-markdown` dependency.

## Consequences

- The home page's top is the banner (when live) or the greeting
  header, then the rail, then the grid — one welcome copy on the
  page (see the D-2 record).
- Dismissals are per-browser, per-user; a second device does not
  inherit them.
- Live verification of the rail needs announcement fixtures (Bai):
  the code proves the paging, sorting and dismiss wiring, not that
  real announcements render in the deploy environment.
