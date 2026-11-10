/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may
 * not use this file except in compliance with the License. You may obtain
 * a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { computed, ref, watch, type ComputedRef, type Ref } from 'vue';
import { searchAssets } from '@/api/search';
import {
  fetchFailingAssets,
  getModifiedQueryFilterWithSelectedAssets,
} from '@/catalog/curatedAssets';
import { buildCuratedQueryFilter, type CuratedRule } from '@/catalog/curatedRule';
import { useWidgetLoad } from '@/features/home/widgetLoad';
import type { SearchHit } from '@/types/api';

/**
 * The assets matching a curated rule, with a health dot per row — ported
 * from the official framework (`hooks/useCuratedAssets.ts`).
 *
 * ADR:2026-11-08-my-data-curated-assets
 */

export interface CuratedAsset {
  id: string;
  name: string;
  fullyQualifiedName: string;
  entityType: string;
  serviceType?: string;
  tier?: string;
  /**
   * False when a test case on the asset is currently failing. Undefined until
   * that lookup answers — and for good if it fails — so the row shows no
   * health at all rather than a green it never confirmed.
   */
  isHealthy?: boolean;
}

/**
 * Where a Curated Assets card gets its filter.
 *
 * `KnowledgePanel.CuratedAssets` predates this card: the persona editor's
 * `CuratedAssetsModal` saves an advanced filter onto the widget's layout
 * entry, and those saved configs are still out in the wild. A saved filter
 * therefore wins; the chip rule is only the fallback for a widget that has
 * never been configured.
 */
export interface CuratedAssetsSource {
  /** Chip-driven rule, shown as `<field> is <value>` chips on the card. */
  rule: CuratedRule;
  /** Advanced filter JSON saved by the persona editor, if any. */
  queryFilter?: string;
  /** Entity types the saved config restricts to; empty means all data assets. */
  resources?: string[];
}

export interface CuratedAssets {
  assets: ComputedRef<CuratedAsset[]>;
  /** Everything the rule matches, not just the page shown. */
  totalCount: ComputedRef<number>;
  isLoading: Ref<boolean>;
  isError: Ref<boolean>;
  refetch: () => Promise<void>;
}

const PAGE_SIZE = 10;
const TTL_MS = 5 * 60 * 1000;

/** Test cases point at their table through this field; it is lowercased on the index. */
const ORIGIN_ENTITY_FIELD = 'originEntityFQN';

// `Tier.Tier1` reads as noise in a chip; the leaf is what the mock shows.
export function tierLeaf(tagFQN?: string): string | undefined {
  return tagFQN?.split('.').pop();
}

/**
 * A saved filter that fails to parse must not take the card down with it — fall
 * back to the chip rule, which is always renderable.
 */
function parseSavedFilter(queryFilter?: string): Record<string, unknown> | undefined {
  if (!queryFilter) {
    return undefined;
  }
  try {
    return JSON.parse(queryFilter) as Record<string, unknown>;
  } catch {
    return undefined;
  }
}

async function fetchCuratedAssets(source: CuratedAssetsSource): Promise<{
  hits: SearchHit[];
  totalCount: number;
}> {
  const savedFilter = parseSavedFilter(source.queryFilter);

  // The selected entity types narrow the *filter*, not the index. Querying the
  // resources as indices instead drops any type the search index map has no
  // entry for, and loses the entityType aggregation the saved filter is scored
  // against; `dataAsset` (or `all`, which also carries the non-asset types)
  // with an entityType clause is the shape the persona editor has always saved.
  const searchIndex = source.resources?.includes('all') ? 'all' : 'dataAsset';

  const page = await searchAssets('', 0, PAGE_SIZE, {
    index: searchIndex,
    query_filter: JSON.stringify(
      getModifiedQueryFilterWithSelectedAssets(
        savedFilter ?? buildCuratedQueryFilter(source.rule),
        source.resources,
      ),
    ),
  });
  return { hits: page.hits, totalCount: page.total };
}

/** The assets matching a curated rule, with a health dot per row. */
export function useCuratedAssets(source: ComputedRef<CuratedAssetsSource> | Ref<CuratedAssetsSource>): CuratedAssets {
  const sourceKey = computed(() => JSON.stringify(source.value));
  const loaded = useWidgetLoad(
    computed(() => `curated-assets:${sourceKey.value}`),
    () => fetchCuratedAssets(source.value),
    { ttlMs: TTL_MS },
  );

  const failing = ref<Set<string> | undefined>(undefined);

  // Supplementary: a failure here costs the rows their health dot, never the
  // card — so it is neither part of `isLoading` nor of `isError`.
  watch(
    () => loaded.data.value?.hits ?? [],
    async (hits) => {
      failing.value = undefined;
      if (!hits.length) {
        return;
      }
      try {
        failing.value = await fetchFailingAssets(
          hits.map((hit) => hit.fullyQualifiedName),
        );
      } catch {
        failing.value = undefined;
      }
    },
    { immediate: true },
  );

  const assets = computed<CuratedAsset[]>(() =>
    (loaded.data.value?.hits ?? []).map((hit) => ({
      entityType: hit.entityType,
      fullyQualifiedName: hit.fullyQualifiedName,
      id: hit.id ?? hit.fullyQualifiedName,
      isHealthy: failing.value
        ? !failing.value.has(hit.fullyQualifiedName.toLowerCase())
        : undefined,
      name: hit.displayName || hit.name,
      serviceType: hit.serviceType,
      tier: tierLeaf(hit.tier),
    })),
  );

  const totalCount = computed(() => loaded.data.value?.totalCount ?? 0);

  return {
    assets,
    totalCount,
    isLoading: loaded.isLoading,
    isError: loaded.isError,
    refetch: loaded.refetch,
  };
}
