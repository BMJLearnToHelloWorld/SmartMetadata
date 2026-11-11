# Home page: compact the topics grid, align tokens to one source, remove the right rail

- **Status:** Accepted
- **Revisions:** v1 2026-11-11 (initial)
- **Deciders:** Bai
- **Guard:** `useTopicsView.test.ts` (no-intersection), `CustomizeMyData.test.ts` (gapped layout renders packed), `MyDataView.test.ts` (no rail, hero in top stack, welcome owns the page), `tokens.test.ts` (TS==CSS pairs), `fonts.test.ts` (no CDN faces in theme.css), `HomeWidgetCard.test.ts` (tone tile, summary in header)
- **Related:** `~/workspace/work/home-style-diagnosis/REPORT.md` (§7 items ①–⑪), supersedes ADR:2026-11-07-my-data-right-rail-keeps-home-hero, Bai 2026-11-11 15:03 (remove the right rail, follow the official layout)

## Context

The home page copied official's react-grid-layout coordinates but
renders them in a native CSS grid, which never compacts: with every
topic expanded each card's lower ~2/3 (~283 px) was covered by the
next row, and expanding any one topic overlapped immediately. The
diagnosis (REPORT.md) found the same missing compaction in the
customize-page editor grid, an unstyled widget "view more" link class
in 8 widgets, an undefined `--sm-brand` token, a global limit banner
outside AppShell fighting a fixed `100vh − 64px` page height, a
welcome screen that did not own the page, no inset rounded panel, a
card header that did not match official's TopicCardHeader, 14 px
margins against official's 24 px, a 3-bar skeleton, a Customise entry
hidden from non-admins, tokens.ts disagreeing with theme.css on 5
values, a duplicate Inter/Poppins `@font-face` (local fonts.css vs
CDN theme.css), and a right search-hero rail official does not have.
Bai confirmed the layout focus (background image ignored) and
approved removing the rail.

Two diagnosis claims did not survive implementation. The editor grid
does not overlap: its working layout is already tightly packed by
`packWidgetsTightly` on every path (load, add, remove, drag, reset),
so the render-level compaction there is a guard, not a fix. And the
`Menu` component tokens are not dead: they style the app's dropdown
menus (row-overflow, workflow header, intake forms); only the sider
overrides them with CSS, which is intentional product styling — so
the Menu block stays, and the AppShell submenu-popup `!important`s
stay too (the cascade cannot be verified without a browser).

## Decision

- **Compaction (T-1/T-2).** `compactDisplayLayout` (pure, exported,
  RGL-vertical-equivalent, per-column cursor) compacts the
  subdivided display layout on the home page and the editor grid on
  render. The saved layout is never rewritten. The editor's drag math
  is unchanged: it already operates in the packed/rendered row space
  and its handler repacks.
- **Link + brand (S-H1/S-H2).** `.home-widget-card__link` lives
  globally in theme.css (slot content carries the widget's scope
  attribute, so a scoped rule cannot match it); `--sm-brand` is
  defined as `var(--sm-color-primary)`. The PlatformHealthWidget
  scoped copy is deleted.
- **Banner-aware height (S-H3/T-4).** LimitBanner publishes its
  measured height as `--sm-banner-height` on the document root
  (ResizeObserver, `0px` when hidden, removed on unmount); the
  shell header height is the single token `--sm-header-height:
  64px`; `.my-data` height subtracts both.
- **Welcome + panel (L-H2/L-H3).** First login early-returns only
  WelcomeScreen; the hidden limit driver stays mounted so the
  banner still works. `.my-data` is the frame (content bg,
  `0 6px 6px 12px`); `.my-data__scroll` is the inset rounded panel
  (`20px 20px 48px`, radius 16px, home canvas, clips at the
  corners).
- **Card header + radius (M-2/S-M3).** Per official TopicCardHeader:
  40px tone tile (icon + tint from the per-widget TONE table in
  `widgetTones.ts`), 14px title with the summary under it, status
  trailing right (max 50%, truncated, full text on hover), and the
  whole strip is the collapse button when collapsible (chevron
  decorative). Card radius is `var(--sm-radius-card)` (product
  token, 6px — not official's 12px: radii follow the product's own
  token); head min-height 48px is dropped (content height); body
  padding 16px is dropped (Ant default 24px). Official's indigo and
  purple tiles map to the primary tint — the product has no indigo
  or purple tint token. `ProductOutlined` does not exist in the
  installed icons version; DataProducts uses `ClusterOutlined`.
- **Margins (M-1/S-L1).** Top gap/margin 14px → 24px, grid gap
  14px → 24px, scroll margin 14px → 0 with panel padding.
- **Skeleton + Customise (M-5/M-3).** Skeleton is a 2-column grid
  of 6 cards, styled as a panel. Customise shows for any selected
  persona; the admin gate lives at the editor route only.
- **Single token source (S-M1/S-M5).** tokens.ts aligns toward the
  CSS values: `contentBg` `#f0f2f5` → `#fafafa`, `bgElevated`
  `#f7f8fa` → `#fafafa` (and `colorBgElevated` now takes
  `bgElevated`, not `bgContainer`), `borderColor`/`borderSecondary`
  `#f0f0f0` → `#d5d7da`/`#e9eaeb`, `SM_SHADOW_CARD` decoupled from
  `SM_SHADOWS.xs` to the theme.css two-segment card shadow. The
  duplicate CDN `@font-face` blocks are deleted from theme.css;
  fonts.css (local `@fontsource` packages) is the only copy. The
  font-stack string keeps `Poppins` as an unloaded fallback name.
- **Rail removal (⑪).** The right rail is gone; HomeHero sits
  full-width under the greeting in the top stack and the cards regain
  full width. Narrow screens keep the 2-column grid (no breakpoint
  collapse), which also removes the `<=1100px` media query's
  load-bearing `!important`s and the dead `.home-area` class. This
  supersedes ADR:2026-11-07-my-data-right-rail-keeps-home-hero.
- **Not changed.** Theme colours stay the product's own (#005587
  dev_ui); background image, logo and product name are untouched;
  official's first-row-overlaps-welcome-panel is official design and
  is not "fixed" — after compaction the home page has no overlap at
  all. The remaining LOW items from REPORT.md §7 ⑫ are a follow-up.

## Consequences

- The home page renders with no overlapping cards in any collapse
  state; the no-intersection tests guard the default, one-collapsed
  and all-collapsed states on both grids.
- The banner can no longer push a second scrollbar; its height is a
  measured value, not a guessed constant.
- The Menu tokens and the submenu-popup `!important`s remain as
  documented exceptions — removing either needs its own live
  verification, not a drive-by in this batch.
- The card header is taller than before (two-line title block) and
  the card radius is 6px everywhere the token is used; body padding
  is Ant's 24px. If the taller header reads as too heavy, the
  revert is one line per change, all in HomeWidgetCard.
- Live verification is still owed (needs Bai's transient admin
  login): open the home page, expand one collapsed topic,
  screenshot; confirm the sider submenu popup styling and the
  banner-while-showing layout in the browser.
