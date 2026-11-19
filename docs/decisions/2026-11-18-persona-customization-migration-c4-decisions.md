# Persona customization migration (C-4): six non-AI categories, verbatim storage, explicit abnormal states

- **Status:** Accepted
- **Revisions:** v1 2026-11-18 (initial)
- **Deciders:** Bai
- **Guard:** `views/home/CustomizePageView.test.ts`,
  `api/personaDocumentCompat.test.ts`, and reviewer verification for the live
  gates (no automated suite may stand in for them)
- **Related:** C-4 implementation specification, fifth revision
  (APPROVE_SPEC_BOUNDED, t353, limited to the frozen artifact, the six
  non-AI categories, the exclusions and residuals, the discovery procedure,
  and the three gates); ADR:2026-11-18-route-denial-renders-in-place-permission-placeholder;
  ADR:2026-11-18-guard-declarations-are-route-meta-with-allof

## Context

Pin paths below are relative to `openmetadata-ui/src/main/resources/ui/src/`,
verified against `origin/main` 392b3efd. Pin's persona customization surface
is the customizable page (`pages/CustomizablePage/CustomizablePage.tsx`), the
page utilities (`utils/CustomizePage/PersonaPage.utils.ts`), the document
store queries (`rest/queries/docStoreQuery.ts`), and the per-surface
consumers (home landing page, data marketplace, entity detail tabs). The
persona document is a free-form `data` object
(`openmetadata-spec/src/main/resources/json/schema/entity/docStore/document.json:9-14`),
the page schema declares `layout` as an object
(`openmetadata-spec/src/main/resources/json/schema/system/ui/page.json:55-58`,
`additionalProperties: false`, required fields at `:80-86`), and the server
does not validate the document body on write
(`openmetadata-service/src/main/java/org/openmetadata/service/jdbi3/DocumentRepository.java:117-120`).
Pin's runtime, however, treats `layout` as an array: the widget utilities
filter and map it (`utils/CustomizeMyDataPageWidgetUtils.tsx:237-269`), so an
object-valued `layout` is anomalous at runtime even though the schema allows
an object.

The product's pre-migration customization lived on nested routes under the
old settings space, with three saver defects: navigation changes were
ignored, a missing `personaPreferences` path misused `replace`, and unedited
page fields were lost. The C-4 migration moves six non-AI categories onto
pin's document model: the five customization cards (navigation, app layout,
Landing page, Data Marketplace, governance/data-assets entity tabs) plus
navigation edit/save and existing-sidebar consumption. The seventh pin
category, `askCollateSidebar`
(`utils/PersonaClassBase.ts:96-153`, seven categories in total), is a real
OSS capability but is not in scope and must not be auto-expanded into it.

## Decision

### Scope and old URLs

- The six non-AI categories above are the closure scope. The five cards
  alone do not close C-4. No placeholder card may be built to present seven
  cards. The `askCollateSidebar` scope ruling (R-C4-SIDEBAR) is a separate
  product decision and stays open.
- Old nested customization URLs break (option A): the product does not take
  over the old nested routes and builds no compatibility redirect. This is a
  product migration policy, not a claim that pin forbids redirects. After
  route deletion an old URL still matches the catch-all route, and the guard
  answer depends on the guard regime: under the prefix regime the guard
  answers by full path, while after prefix retirement a logged-in non-admin
  hitting an old URL lands in `not-found`. The two-stage guard matrices
  govern the two regimes separately (see the related guard records).
- Drill-down uses pin's dot-hash form (`#customize-ui.data-assets`,
  `components/Settings/Persona/CustomizeUI/CustomizeUI.tsx:43-56`, with the
  dot separator at `constants/char.constants.ts:18`). A valid entity lands
  on its accurate `pageFqn`, never a default Table page. Unknown entities,
  Tag, Classification, and invalid entities must not enter edit save. Only
  the three leaf categories may drop the entity in a bounded conversion;
  governance ignores the entity and would hit the wrong target.

### Storage, editor, save, consumption (§4.4)

- D1, storage retains verbatim except for pin-consistent retention gates:
  entries without a string pageType are dropped (the official
  normalizer), non-string entityType and non-array tabs values are
  dropped, and schema-invalid appMode values are dropped. Apart from
  these gates, the document body is stored exactly as loaded, with no
  other normalization, silent repair, or default injection at the
  storage layer. Pin's page update matches page types by verbatim
  string comparison with no normalization
  (`utils/CustomizePage/PersonaPage.utils.ts:87-121`).
- D2, the editor shows an explicit abnormal state: when stored data cannot
  be edited safely, the editor surfaces an explicit abnormal state instead
  of rendering a repaired or defaulted form. The editor's explicit handling
  of an empty-object `{}` layout is unchanged by the read-side decisions
  below.
- D3, save performs no automatic conversion: saving writes what the editor
  holds, with no silent conversion of abnormal values into defaults and no
  overwrite of retained fields. The three saver defects are fixed: navigation
  changes are persisted, the `personaPreferences` path uses the correct
  operation, and unedited page fields survive a save. The array-element
  patch form (`add /data/pages/0`) is pin's form for appending a page
  (`components/discovery/personal-space/Profile/tabs/personas/customize/EntityCustomizeOverlay.test.tsx:203-205`).
- D4, consumption applies no silent default — scoped to the `layout` field
  only. A non-array `layout` at a consumption site follows the read-side
  rules below, never a quiet fallback. Non-array `tabs` are outside D4's
  scope and follow pin's default: when a page has no tabs, the widget
  utilities return the default tab set
  (`utils/CustomizePage/CustomizePageWidgetUtils.ts:145-161`), and the
  `page.layout` branch in that function is unreachable in that case.

### Read-side `{}` decisions

- The marketplace read side: an empty-object `{}` layout takes the default
  branch, and storage retention means the stored value is not overwritten
  by the default. A non-empty object layout errors into an explicit Alert.
  The marketplace normalization sorts by `y`, forces full width, and renders
  a vertical column (`pages/DataMarketplacePage/DataMarketplacePage.component.tsx:61-68,119-139,193-197`).
- The home read side: an empty-object `{}` layout errors. Home consumes
  only LandingPage entries (`components/MyData/HomeLandingPage/HomeLandingPage.tsx:109-122`).
- The editor side (D2) keeps its explicit handling of `{}`; the read-side
  decisions above do not change it.

### The four callbacks, pinned quirks

Pin's customizable page has four save callbacks
(`pages/CustomizablePage/CustomizablePage.tsx:263-470`), and the product
reproduces their observable behavior, quirks included:

- Callback 1 returns early when the new document is identical to the
  current one, and its catch shows a toast without throwing (`:263-306`).
- Callback 2 (navigation save) shows a toast on failure and does not
  rethrow (`:308-351`, catch at `:342-350`). See the observed difference
  below.
- Callback 3, when the document has an id and the `personPreferences`
  array is non-empty, maps over the array and replaces the matching
  entry; non-matching existing entries are returned unchanged, and a
  new entry for an unmatched persona is silently lost because the map
  branch never appends. When the condition does not hold, the new
  entry is appended unconditionally, spreading an `undefined`
  `landingPageSettings` into the appended entry (`:353-386`). All
  three quirks are reproduced, not repaired.
- Callback 4 shows a toast on failure and then throws (`:421-470`, comment
  at `:466-468`). It is the only callback that throws.
- Initialization builds a template document on a 404 response (with
  `navigation: null`), shows only a toast for a non-404 failure, and runs
  once (`:472-514`).

### Equivalence standard, marketplace, and Landing

- The equivalence standard is b*: behavioral and save-semantics equivalence,
  not line-by-line or same-framework identity. The product is Vue/Pinia;
  pin is React/Redux-Query. What must match is observable behavior and what
  a save writes, not the code shape.
- The marketplace standard is c*: pin's read side is a full-width vertical
  column sorted by `y` with content-driven height. The product fixes its
  three deviations: half-width side-by-side rendering, kind de-duplication
  that drops multiple instances of the same kind, and the reversed priority
  between the old `page.layout` and the default tab order.
- The Landing page is a fixed two-column grid with `w=1`, `h=3`, and no
  resizing (`utils/CustomizeMyDataPageWidgetUtils.tsx:26`;
  `constants/CustomizeMyDataPage.constants.ts:17,20`;
  `components/MyData/CustomizableComponents/CustomizeMyData/CustomizeMyData.tsx:300-303`).
  That is pin behavior and must not be misjudged as a gap, and it must not
  be applied to the 23 entity pages or the marketplace. The Landing save
  falls back to the current page type
  (`components/MyData/CustomizableComponents/CustomizeMyData/CustomizeMyData.tsx:195-203`).

### Freshness (U-09), homepage policy (M4), and evidence-first

- U-09: the product keeps a single Pinia slot for the persona document with
  FQN-gated synchronization. This is known not to be equivalent to pin's
  five-minute stale time and query de-duplication
  (`rest/queries/docStoreQuery.ts:35,37,39-41`). The difference is recorded
  here as a known non-equivalence, not hidden: concurrent edits and
  cross-tab freshness behave differently, and no claim of freshness
  equivalence may be made.
- M4: stored homepage customizations are not consumed by the home page.
  That is pin behavior — home reads only LandingPage entries — and the
  product accepts it. Stored homepage data is retained verbatim (D1) and
  remains editable; it is simply not rendered by home.
- Object-layout evidence-first policy: no silent discard and no
  convert-to-default overwrite save is pre-approved for object-valued
  layouts. Abnormal stored data gets an explicit prompt, the original
  field is retained, and any conversion rule must be auditable. The online
  read-only enumeration (2026-11-18 11:14:58) found exactly one `persona.*`
  document (`persona.seed_persona`), one page, one tab, two widgets, and an
  array-valued layout, with no object layout; that snapshot covers current
  library rows including the undeleted filter and covers neither history,
  physically deleted rows, nor other instances. Absence of an object layout
  in that snapshot is not zero migration risk, and the snapshot document
  must not be called a seed document.

## Observed difference, not an approved change (C-ENTRY-1)

The C-4 specification §3.3 says callback 2 throws on failure. Pin's
navigation-save callback shows a toast and does not rethrow
(`pages/CustomizablePage/CustomizablePage.tsx:342-350`); only callback 4
throws. The implementation follows pin. This record notes the difference
as observed; it does not approve a specification change, and the
specification text awaits erratum confirmation.

## Consequences

The document model becomes the single customization store, and the old
nested-route state is gone. The three gates close C-4 in order: source
implementation plus automated benchmarking yields BehaviorMatched, a real
front-end/back-end chain yields IntegrationVerified, and post-deployment
product acceptance yields ProductVerified. No gate may be claimed from a
lower gate's evidence, and automated results never stand in for the live
chain. The navigation Reset writes `null` only as the default-tree
generator's input, locally; Save writes a `NavigationItem[]`
(`pages/SettingsNavigationPage/SettingsNavigationPage.tsx:63-98`). The
AppLayoutEditor's non-working AI option is disabled in the Persona editor
only (M3); the tenant-page AI option is a separate residual below.

## Open items

- R-C4-DRIVE: four Drive leaves (`directory`, `file`, `spreadsheet`,
  `worksheet`) have no fetch/detail wiring; the closeable consumption scope
  is the other 15 data-assets leaves plus 4 governance leaves plus Tag
  (`pages/TagPage/TagPage.tsx:160-162` shows Tag consuming custom pages).
- Tab-layer boundary of the close scope: `GlossaryTermDetailView`,
  `TagDetailView`, and `MetricDetailView` are tab-less standalone route
  views with no tab layer and no `useCustomPages` wiring; their types are
  covered through the generic `assets/:entityType` surface
  (`AssetDetailView`, which consumes custom pages by entity type), not
  through per-type tab consumption. `ClassificationDetailView` stays
  excluded (spec §1.7).
- R-C4-APPMODE-TENANT: the tenant page still offers the AI option. The M3
  disable covers the Persona editor only; the product-level claim is
  narrowed accordingly and the tenant surface stays open.
- R-C4-SIDEBAR: the `askCollateSidebar` scope ruling is undecided.
- AppMode stays unaligned (ruling c): pin's appMode is a Classic/AI runtime
  switch spanning user preference, persona document, tenant default, and
  session lifecycle. Bringing AI into scope needs a scope ruling first and
  a full consumer review; no AI control that does not work may be shown as
  if it closed anything.
- Live confirmations outstanding: the error-boundary premise (pin has a
  top-level boundary at `AppRoot.tsx:97-100`; the product has none, so only
  function-level throw equivalence is claimed), the per-tab widget
  consumption renderer, the view-mode call chain, and items U-02, U-03,
  U-04, U-07, and U-11. None is closed by this record.
- The 161-item deletion set and the D-8/D-1/D-16 deletions remain on hold
  and are not approved by this record.
