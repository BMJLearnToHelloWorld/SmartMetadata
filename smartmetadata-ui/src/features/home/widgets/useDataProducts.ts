/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may
 * not use this file except in compliance with the License. You may obtain
 * a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { computed, type ComputedRef, type Ref } from 'vue';
import { getAllDataProductsWithAssetsCount } from '@/api/dataProducts';
import { mapAggregateBuckets, postAggregateFieldOptions } from '@/api/search';
import {
  emptyFqnsOf,
  fetchOverviewPage,
  fetchUnownedCount,
  type OverviewFilter,
  type OverviewOrder,
} from '@/catalog/domainOverview';
import { useWidgetLoad } from '@/features/home/widgetLoad';
import type { SearchHit } from '@/types/api';

/**
 * Data products with their domain, owner and asset count, and the size of
 * each ownership bucket. Ported from the official framework
 * (`hooks/useDataProducts.ts`).
 *
 * Asset counts come from `/dataProducts/assets/counts`: the data-product
 * search document deliberately leaves `assets` out, so reading a length
 * off it put every product at zero. The map is one request for the whole
 * estate — the source the OSS Data Products widget uses — and, since it
 * lists every product, it also gives the total and the "empty" bucket.
 *
 * ADR:2026-11-08-my-data-domains-data-products
 */

const TTL_MS = 5 * 60 * 1000;
const DOMAIN_FIELD = 'domains.fullyQualifiedName';

export interface DataProductSummary {
  id: string;
  name: string;
  fullyQualifiedName: string;
  domainName?: string;
  /** Every owner, users and teams alike; empty when the product has none. */
  owners: SearchHit['owners'];
  assetCount: number;
  /** Only ever compared, never formatted — so the epoch unit does not matter. */
  updatedAt: number;
}

export interface DataProductsOverview {
  /** The page for the selected bucket. */
  products: ComputedRef<DataProductSummary[]>;
  /** Every data product, from the asset-count map. */
  totalCount: ComputedRef<number>;
  /** Estate-wide, from a count query rather than the page in hand. */
  unownedCount: ComputedRef<number>;
  /** Estate-wide, from the asset-count map. */
  emptyCount: ComputedRef<number>;
  /** Domains holding at least one data product, across the estate. */
  domainCount: ComputedRef<number>;
  /** First load only — a bucket switch keeps the previous rows on screen. */
  isLoading: ComputedRef<boolean>;
  isFetching: ComputedRef<boolean>;
  isError: ComputedRef<boolean>;
  refetch: () => Promise<void>;
}

/** Distinct domains across every data product — a terms aggregation, not a page. */
async function fetchDomainCount(): Promise<number> {
  const response = await postAggregateFieldOptions({
    deleted: false,
    fieldName: DOMAIN_FIELD,
    index: 'dataProduct',
    size: 1000,
  });
  return mapAggregateBuckets(response, DOMAIN_FIELD).length;
}

export function useDataProducts(
  filter: ComputedRef<OverviewFilter> | Ref<OverviewFilter>,
  order: ComputedRef<OverviewOrder> | Ref<OverviewOrder>,
): DataProductsOverview {
  const countsQuery = useWidgetLoad(
    'data-products-overview:counts',
    getAllDataProductsWithAssetsCount,
    { ttlMs: TTL_MS },
  );
  const unownedQuery = useWidgetLoad(
    'data-products-overview:unowned',
    () => fetchUnownedCount('dataProduct'),
    { ttlMs: TTL_MS },
  );
  const domainsQuery = useWidgetLoad('data-products-overview:domains', fetchDomainCount, {
    ttlMs: TTL_MS,
  });

  const counts = computed(() => countsQuery.data.value);
  const emptyFqns = computed(() => emptyFqnsOf(counts.value ?? {}));
  const needsCounts = computed(() => filter.value === 'empty');

  const listQuery = useWidgetLoad(
    computed(
      () =>
        `data-products-overview:list:${filter.value}:${order.value}:${
          needsCounts.value ? emptyFqns.value.slice(0, 50).join(',') : ''
        }`,
    ),
    () => fetchOverviewPage('dataProduct', filter.value, emptyFqns.value, order.value),
    {
      ttlMs: TTL_MS,
      // "Empty" is resolved through the count map, so it waits for it.
      enabled: computed(() => !needsCounts.value || Boolean(counts.value)),
    },
  );

  const queries = [countsQuery, unownedQuery, domainsQuery, listQuery];

  const products = computed<DataProductSummary[]>(() =>
    (listQuery.data.value?.sources ?? []).map((source) => ({
      assetCount: counts.value?.[source.fullyQualifiedName] ?? 0,
      domainName: source.domains?.length
        ? source.domains[0].displayName || source.domains[0].name
        : undefined,
      fullyQualifiedName: source.fullyQualifiedName,
      id: source.id ?? source.fullyQualifiedName,
      name: source.displayName || source.name,
      owners: source.owners ?? [],
      updatedAt: source.updatedAt ?? 0,
    })),
  );

  return {
    domainCount: computed(() => domainsQuery.data.value ?? 0),
    emptyCount: computed(() => emptyFqns.value.length),
    isError: computed(() => queries.some((query) => query.isError.value)),
    isFetching: computed(() => queries.some((query) => query.isFetching.value)),
    isLoading: computed(() => queries.some((query) => query.isLoading.value)),
    products,
    refetch: async () => {
      await Promise.all(queries.map((query) => query.refetch()));
    },
    totalCount: computed(() => Object.keys(counts.value ?? {}).length),
    unownedCount: computed(() => unownedQuery.data.value ?? 0),
  };
}
