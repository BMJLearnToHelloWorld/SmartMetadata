/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0.
 */
import type { TagAssetsQueryFilter } from '@/catalog/tagAssets';

/**
 * Metric assets tab query builders — pin ports, no product invention.
 *
 * Sources (pin a3012259ca):
 * - getMetricAssetsQueryFilter: utils/MetricEntityUtils/MetricPureUtils.ts:70-76.
 * - getMetricAssetSelectionQueryFilter: MetricPureUtils.ts:78-93, with
 *   EntityType values from enums/entity.enum.ts (METRIC 'metric',
 *   GLOSSARY_TERM 'glossaryTerm', TAG 'tag', DATA_PRODUCT
 *   'dataProduct', TABLE_COLUMN 'tableColumn').
 *
 * The two builders are the metric equivalents of the tag tab's
 * getTagAssetsQueryFilter / getQueryFilterToExcludeTermsAndEntities
 * (catalog/tagAssets.ts): the tab filter targets linked assets by
 * document id, the selection filter excludes them plus the entity
 * types that can never be a metric asset.
 */
export type MetricAssetsQueryFilter = TagAssetsQueryFilter;

/**
 * Entity types the metric asset picker never offers (pin
 * MetricPureUtils.ts:85-89): metrics, glossary terms, tags, data
 * products and table columns are not linkable assets.
 */
export const METRIC_ASSET_SELECTION_EXCLUDED_ENTITY_TYPES = [
  'metric',
  'glossaryTerm',
  'tag',
  'dataProduct',
  'tableColumn',
] as const;

/**
 * Official getMetricAssetsQueryFilter (MetricPureUtils.ts:70-76):
 * linked assets live in the metric's relationship table rather than
 * on the assets' search documents, so the Assets tab targets them by
 * document id (the entity id) instead of a field.
 */
export function getMetricAssetsQueryFilter(assetIds: string[]): MetricAssetsQueryFilter {
  return {
    query: {
      bool: {
        must: [{ ids: { values: assetIds } }],
      },
    },
  };
}

/**
 * Official getMetricAssetSelectionQueryFilter (MetricPureUtils.ts:
 * 78-93): already-linked assets plus the never-offered entity types
 * are excluded from the picker.
 */
export function getMetricAssetSelectionQueryFilter(
  linkedAssetIds: string[],
): MetricAssetsQueryFilter {
  return {
    query: {
      bool: {
        must_not: [
          { ids: { values: linkedAssetIds } },
          ...METRIC_ASSET_SELECTION_EXCLUDED_ENTITY_TYPES.map((entityType) => ({
            term: { entityType },
          })),
        ],
      },
    },
  };
}
