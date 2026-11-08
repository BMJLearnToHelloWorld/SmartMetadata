# My-data landing grid uses non-subdivided row height (rowHeight 133.33, h 3)

- **Status:** Accepted
- **Revisions:** v1 2026-11-07 (initial)
- **Deciders:** Bai
- **Guard:** `landingPageLayout.test.ts` (widgetHeight), `MyDataView.test.ts` (grid row height)
- **Related:** Wave 1 W1-5 stage A, `wave1/REVIEW-W1-5-G11.md` condition 2, `RULING-my-data.md` §1.3

## Context

The official landing grid renders each widget at `h:3` rows of
`rowHeight 133.33` with a 16px margin, so one card is
`3 × (133.33 + 16) − 16 = 431.99px` tall. Official `useTopicsView`
also defines a subdivided rendering for its collapse/list view modes:
the row height is quartered to `(133.33 + 16) / 4 − 16 = 21.3325`
and the display layout's `h` and `y` are multiplied by 4
(`h:3 → 12`; a collapsed card is 3 subdivided rows, about 96px).

Stage A has no collapse and no list view, so the subdivided
conversion buys nothing — but the two conventions are easy to mix:
pairing the stored `h:3` with the subdivided row height 21.3325
shrinks every card to about 96px, silently (the cells are still
there, just short).

## Decision

Stage A uses **non-subdivided rendering only**:

- `rowHeight = 133.33`, `h = 3`, `margin = 16`, `cols = 2`;
- saved layouts stay at non-subdivided `h:3`;
- the reserved height is `widgetHeight(h) = h × (rowHeight + margin) − margin`,
  computed from the same constants in `landingPageLayout.ts`
  (`LANDING_PAGE_WIDGET_HEIGHT_PX = widgetHeight(3)`), and the grid's
  `grid-auto-rows` is bound to that value — one source, no second copy
  of the number in CSS.

## Consequences

- The subdivided conversion belongs to stage D (view controls), where
  it must be introduced together with the collapse/list states that
  need it — never by changing the stored `h:3` or the row height alone.
- Any future change to the row height must update `widgetHeight` and
  the grid in the same step; the unit test pins `widgetHeight(3)` to
  431.99 so a mismatch fails loudly instead of shrinking cards.
