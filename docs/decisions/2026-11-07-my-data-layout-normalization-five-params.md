# My-data layout normalization takes all five parameters, with the registry as the known-key source

- **Status:** Accepted
- **Revisions:** v1 2026-11-07 (initial)
- **Deciders:** Bai
- **Guard:** `landingPageLayout.test.ts`, `landingPageWidgets.test.ts`, `MyDataView.test.ts`
- **Related:** Wave 1 W1-5 stage A, `wave1/REVIEW-W1-5-G11.md` condition 1 and 4, `RULING-my-data.md` §1.4

## Context

Official `normalizeLandingPageLayout` takes five parameters
`(savedLayout, defaultLayout, excludedWidgetFqns, cols,
knownWidgetKeys)`. Each one carries a distinct rule, and dropping
any of them silently changes the outcome:

- `savedLayout` — the persona document's stored layout, or nothing.
- `defaultLayout` — the 13-item `DEFAULT_LANDING_PAGE_LAYOUT`, used
  when the saved layout is missing, empty, or filters down to nothing.
- `excludedWidgetFqns` — the three retired keys
  (`KnowledgePanel.MyData`, `KnowledgePanel.Following`,
  `KnowledgePanel.DataAssets`) that must never render again, even
  though upgraded instances still carry them in stored documents.
- `cols` — 2, the grid width the reflow packs against.
- `knownWidgetKeys` — the registry's key set, the whitelist that
  decides whether a stored key still names a renderable widget.

## Decision

The product port keeps the five-parameter signature exactly — no
parameter is defaulted away at the call site. The values are fixed
as follows:

- `excludedWidgetFqns` is the official three retired keys, verbatim;
  `MY_TASK` and `TOTAL_DATA_ASSETS` are not excluded (their keys
  were reused by the topic cards that replaced them).
- `knownWidgetKeys` is `MY_DATA_WIDGET_KEYS`, the registry's key set
  in default-layout order. The key strings live once in
  `landingPageLayout.ts` (`LANDING_PAGE_WIDGET_KEYS`); the registry in
  `landingPageWidgets.ts` builds its entries from those constants, so
  adding or retiring a widget is a change in exactly one place.
- The 13-item default layout is copied item by item from official
  `DEFAULT_LANDING_PAGE_LAYOUT`. The per-widget `*_DEFAULT_VALUES`
  templates are never reused for coordinates — their `x/y` are
  placeholders (e.g. CuratedAssets `x:2, y:0`).
- A `savedLayout` that is `undefined`, or a Record-shaped layout
  (the JSON editor stores pages verbatim), counts as no saved layout
  and resolves to the default layout. Filtering to empty also resolves
  to the default layout — never to a blank page.
- An unknown key renders nothing (the registry resolves it to null)
  and leaves no empty placeholder cell; the layout is filtered to
  renderable cells before it reaches the grid.

One deliberate hardening beyond the official code: a stored entry
whose key is not a string, or whose `x`/`y` are not finite numbers
(hand-edited JSON can carry those), is dropped instead of placed —
official would place it as NaN. The rule is the same fail-safe as an
unknown key, and it is covered by unit tests.

## Consequences

- Callers must pass all five arguments; a future caller that wants a
  different grid width or key set says so explicitly at the call site.
- The reflow only re-packs on overflow (`x + w > cols`); a saved
  layout that already fits is returned untouched, gaps included.
