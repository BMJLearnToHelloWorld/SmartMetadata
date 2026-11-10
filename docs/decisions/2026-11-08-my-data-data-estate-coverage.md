# My-data DataEstate: DI charts plus a live connector split; no coverage block without AI mode

- **Status:** Accepted
- **Revisions:** v1 2026-11-08 (initial)
- **Deciders:** Bai
- **Guard:** `useDataEstate.test.ts`, `DataEstateWidget.test.ts`, `TotalDataAssetsWidget.test.ts`
- **Related:** Wave 2 G-11 B/C, `wave2/REVIEW-W2-G11-BC.md` condition 11, official `hooks/useDataEstate.ts`, `hooks/useTotalDataAssets.ts`, `components/MyData/Widgets/DataEstateWidget/`, `components/MyData/Widgets/TotalDataAssetsWidget/`

## Context

Official reads the `total_data_assets` and
`percentage_of_data_asset_with_description` system charts for both cards
(one shared query keyed by window), plus a live `serviceType` terms
aggregation for the connector split — deliberately not the chart, which
groups by entity type. Data Insights has no rows until its pipeline has
run, so both cards fall back to live counts: the estate total falls back
to the live connector sum, the type split to a live `entityType`
aggregation shaped as one chart day. Coverage is asset-weighted (a plain
sum of per-type percentages put 240% on the card); the coverage block
itself renders only in AI mode.

## Decision

- `useDataEstate` / `useTotalDataAssets` share one
  `data-estate-charts-<windowDays>` cache key through `useWidgetLoad`,
  so the page asks Data Insights once per window, not once per card.
  Both reads are strict: a 4xx surfaces instead of silently becoming
  "no data".
- Windows: DataEstate [7, 30, 90] default 7; TotalDataAssets [7, 14, 30]
  default 7. `TotalRangeDays` widens to `7 | 14 | 30 | 90` to cover both.
- The connector split comes from `postAggregateFieldOptions` on the
  data-asset index (`serviceType`, size 1000), top 6 named, the tail
  folded into one `__other__` entry. The live type split filters to the
  chart's population (tag, glossaryTerm, testCaseResult and
  testCaseResolutionStatus excluded) so the total does not drop the day
  the chart starts returning rows.
- **D-1 (Bai 2026-11-08): the description-coverage block is NOT rendered
  this batch.** Official renders it only in AI mode; the product has no
  AI-mode runtime switch. The coverage figures are still computed
  (asset-weighted mean, never a plain sum) in `deriveEstate` so the
  computation is not lost — it is a residual until the product gains an
  AI-mode switch. Classic mode gets the estate's size and shape.
- TotalDataAssets' product-owned donut is replaced by official's
  ShareBar + rows (swatch, name, share, count, delta).

## Consequences

- A window switch keeps the previous figures on screen (the cache key
  changes; the previous key's data is dropped only for the new key's
  load, and the card shows its skeleton while loading).
- The live connector sum is a floor, not the same figure: it leaves out
  assets with no service (glossary terms and the like).
- If the product gains an AI-mode runtime switch, the coverage block
  renders behind it in the same change; this record is revised then.
