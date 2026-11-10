# Curated Assets widget (my-data stage B)

- **Status:** Accepted
- **Revisions:** v1 2026-11-08 (initial); v2 2026-11-08 (follow-up: the modal moves out of the card slot)
- **Deciders:** Bai
- **Guard:** `curatedAssets.test.ts`, `useCuratedAssets.test.ts`, `CuratedAssetsWidget.test.ts`
- **Related:** Wave 2 G-11 B/C, `wave2/REVIEW-W2-G11-BC.md` condition 14, official `components/MyData/Widgets/CuratedAssetsWidget/`, `hooks/useCuratedAssets.ts`

## Context

The stage-B Curated Assets card is the official `CuratedAssetsSummaryWidget`
(`hooks/useCuratedAssets.ts`, `utils/curatedRule.ts`,
`utils/CuratedAssetsPureUtils.ts`, `utils/CuratedAssetsUtils.tsx`), not the
older `CuratedAssetsWidget.tsx` with its sort control. The config comes from
the widget's entry in `currentLayout`, looked up by widget key — never from
a `widgetConfig` prop, which the official `getWidgetFromKey` never passes.

## Decision

- Source: a saved `queryFilter` on the layout entry wins; otherwise the
  out-of-the-box chip rule (Tier `Tier.Tier1` AND Certification
  `Certification.Gold`). Selected entity types narrow the *filter* (an
  `entityType` should-clause), never the index: `dataAsset`, or `all` when
  the selection includes `all`.
- Health: one aggregation over the page's FQNs against the `testCase`
  index (`originEntityFQN`, latest result Failed). `isHealthy` stays
  `undefined` until that lookup answers — and for good if it fails — so a
  row never shows a green dot nobody confirmed.
- Tier shows the tag leaf (`Tier.Tier1` → `Tier1`).
- Explore jumps, product adaptation: official sends a saved filter through
  the advanced-search tree and a chip rule as a `quickFilter` JSON. This
  console's Explore reads facet params from the URL and accepts a
  `query_filter` string (SearchView passes it through to `searchAssets`),
  so a saved filter travels as `query_filter` JSON and a chip rule travels
  as the facet params its clauses name (`tier.tagFQN` → `tier`,
  `certification.tagLabel.tagFQN` → `certification`). Both land on exactly
  the matches the card counts.
- `sortBy: 'latest'` is a dead config (R-W2G11-2): the summary widget has
  no sort control — only the older widget did, and its `getSortField`
  maps `latest` to the default `updatedAt` desc. A saved `sortBy` is
  carried through on save (the modal merges over the existing config
  instead of replacing it) and otherwise ignored.
- `CuratedAssetsModal` mounts only in edit view (`isEditView`), with
  `AdvancedAssetsFilterField` and `SelectAssetTypeField`. The product has
  no my-data edit view yet (stage D), so the modal is currently
  unreachable — the component and its save-back (`handleSave` writes the
  merged config onto the layout entry and calls `handleSaveLayout`) are
  in place for stage D to wire.
- The modal is mounted beside the card, not inside its default slot:
  `HomeWidgetCard` renders `<slot v-else />`, so a modal in the slot
  unmounts when the card goes empty — including while it is open. No
  empty-state action opens the modal today (the card's empty block
  carries no `actionLabel` and the widget wires no `@empty-action`); the
  move keeps the mount consistent with the Knowledge Center card and so
  a future empty-state edit action can open it.
- `AdvancedAssetsFilterField` deviation: official renders the
  react-awesome-query-builder tree bound to the AdvanceSearchProvider.
  This console has no advanced-search query builder (see
  `catalog/advancedSearch.ts`: the only verified search surface is GET
  /v1/search/query), so the field edits the same `queryFilter` JSON as
  text, validated by the same `isValidElasticsearchQuery`, with the same
  debounced (500 ms) count and Explore link. The saved value's shape is
  unchanged, so a builder can take over this field without migrating any
  saved config. The builder tree itself is a stage-D residual.
- Two-across rows use a plain `@media (min-width: 720px)` breakpoint:
  the product has no Tailwind container queries (R-W2G11-6).

## Consequences

- Saved configs from the persona editor keep working: the filter, the
  resource list and the title are read from the layout entry, and a save
  preserves keys the modal does not edit (including a stale `sortBy`).
- The card's Explore links are real: chip-rule links use the console's
  own facet params; saved-filter links use the `query_filter`
  pass-through added to SearchView in this batch.
- The modal's query-builder tree is the one known gap versus official,
  owned by stage D; the JSON editor keeps the save contract usable in
  the meantime.

## Guard

`src/features/home/widgets/CuratedAssetsWidget.test.ts` and
`src/catalog/curatedAssets.test.ts` cover the source precedence, the
index rule, the health-dot contract, the Explore URLs, the filter
validation, and the layout-entry config lookup.
