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
import { getAllDomainsWithAssetsCount } from '@/api/domains';
import {
  ROOT_DOMAIN_CLAUSE,
  emptyFqnsOf,
  fetchOverviewPage,
  fetchUnownedCount,
  type OverviewFilter,
} from '@/catalog/domainOverview';
import { useWidgetLoad } from '@/features/home/widgetLoad';
import type { SearchHit } from '@/types/api';

/**
 * Top-level domains with their asset counts, and the size of each ownership
 * bucket — scoped as the Domains page is, so the two agree. Ported from the
 * official framework (`hooks/useDomainOverview.ts`).
 *
 * ADR:2026-11-08-my-data-domains-data-products
 */

const TTL_MS = 5 * 60 * 1000;

export interface DomainSummary {
  id: string;
  name: string;
  fullyQualifiedName: string;
  /** Every owner, users and teams alike; empty when the domain has none. */
  owners: SearchHit['owners'];
  assetCount: number;
}

export interface DomainOverview {
  /** The page for the selected bucket. */
  domains: ComputedRef<DomainSummary[]>;
  /** Every domain, not just the page rendered. */
  totalCount: ComputedRef<number>;
  /** Estate-wide, from a count query rather than the page in hand. */
  unownedCount: ComputedRef<number>;
  /** Estate-wide, from the asset-count map. */
  emptyCount: ComputedRef<number>;
  /** First load only — a bucket switch keeps the previous rows on screen. */
  isLoading: ComputedRef<boolean>;
  isFetching: ComputedRef<boolean>;
  isError: ComputedRef<boolean>;
  refetch: () => Promise<void>;
}

/** A domain FQN with no parent segment, e.g. `Finance`, not `Finance.Payroll`. */
function isRootDomainFqn(fqn: string): boolean {
  return fqn.split('.').length === 1;
}

export function useDomainOverview(
  filter: ComputedRef<OverviewFilter> | Ref<OverviewFilter>,
): DomainOverview {
  const countsQuery = useWidgetLoad('domain-overview:counts', getAllDomainsWithAssetsCount, {
    ttlMs: TTL_MS,
  });
  const unownedQuery = useWidgetLoad(
    'domain-overview:unowned',
    () => fetchUnownedCount('domain', ROOT_DOMAIN_CLAUSE),
    { ttlMs: TTL_MS },
  );

  // The map lists every domain; only the roots are the card's.
  const counts = computed(() => {
    const data = countsQuery.data.value;
    if (!data) {
      return undefined;
    }
    return Object.fromEntries(
      Object.entries(data).filter(([fqn]) => isRootDomainFqn(fqn)),
    );
  });
  const emptyFqns = computed(() => emptyFqnsOf(counts.value ?? {}));
  const needsCounts = computed(() => filter.value === 'empty');

  const listQuery = useWidgetLoad(
    computed(
      () =>
        `domain-overview:list:${filter.value}:${
          needsCounts.value ? emptyFqns.value.slice(0, 50).join(',') : ''
        }`,
    ),
    () => fetchOverviewPage('domain', filter.value, emptyFqns.value, 'name', ROOT_DOMAIN_CLAUSE),
    {
      ttlMs: TTL_MS,
      // "Empty" is resolved through the count map, so it waits for it.
      enabled: computed(() => !needsCounts.value || Boolean(counts.value)),
    },
  );

  const queries = [countsQuery, unownedQuery, listQuery];

  const domains = computed<DomainSummary[]>(() =>
    (listQuery.data.value?.sources ?? []).map((source) => ({
      assetCount: counts.value?.[source.fullyQualifiedName ?? ''] ?? 0,
      fullyQualifiedName: source.fullyQualifiedName ?? '',
      id: source.id ?? source.fullyQualifiedName ?? '',
      name: source.displayName || source.name,
      owners: source.owners ?? [],
    })),
  );

  return {
    domains,
    emptyCount: computed(() => emptyFqns.value.length),
    isError: computed(() => queries.some((query) => query.isError.value)),
    isFetching: computed(() => queries.some((query) => query.isFetching.value)),
    isLoading: computed(() => queries.some((query) => query.isLoading.value)),
    refetch: async () => {
      await Promise.all(queries.map((query) => query.refetch()));
    },
    totalCount: computed(() => Object.keys(counts.value ?? {}).length),
    unownedCount: computed(() => unownedQuery.data.value ?? 0),
  };
}
