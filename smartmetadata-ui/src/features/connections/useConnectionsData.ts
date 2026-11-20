/**
 * Copyright 2026 SmartMetadata authors.
 * Licensed under the Apache License, Version 2.0.
 */
import {
  getServicesOverview,
  type ServiceHealth,
  type ServicesOverview,
  type ServiceSummary,
} from '@/api/services';
import { OVERVIEW_PARAMS } from '@/features/home/widgets/usePlatformHealth';
import { computed, ref, watch, type Ref } from 'vue';
import {
  CATEGORY_TO_ENTITY_TYPE,
  CONNECTIONS_ENTITY_TYPES,
  SERVICES_ESTATE_LIMIT,
  categoryOfEntityType,
  type ConnectionsCategory,
} from './connections';

/**
 * Backs the Connections page off `GET /v1/services/overview`, mirroring
 * official `useConnectionsData` (pin a3012259ca).
 *
 * Below SERVICES_ESTATE_LIMIT services the whole estate arrives in one
 * request and every subsequent interaction — tab, connector filter,
 * health filter, search, sort, paging — is a memo over it, costing no
 * network at all. Above it the same endpoint serves a page at a time
 * and those filters go back to the server. The mode is derived from
 * the estate response's own `total`, which is universe-wide, so
 * `total <= limit` is exactly "this response already holds everything".
 *
 * Every count is faceted in client mode: it reflects each filter
 * *except* the one it describes. Server mode keeps the endpoint's
 * unfaceted maps (faceting them would need a query per combination).
 *
 * Product note: rows whose entity type has no Connections tab are
 * dropped here (pin drops them only in the grid and in the category
 * counts, and shows them in the table with a fallback label). The
 * estate query already restricts `entityType` to the eleven tabbed
 * types, so an unknown row can only arrive from a server that returns
 * something outside the requested set; dropping it in both views keeps
 * the page, the title count and the pagination total in agreement.
 * 代价：服务端若返回过滤外类型，pin list 表会显示一行（类别栏为 Service），产品直接隐藏；触发条件为服务端违背 entityType 过滤，实践中仅为防御分支。
 */

export interface ConnectionsFilterOption {
  value: string;
  count: number;
}

export interface UseConnectionsDataArgs {
  category: Ref<ConnectionsCategory>;
  /** Committed search term (the caller debounces the URL write). */
  searchTerm: Ref<string>;
  serviceTypes: Ref<string[]>;
  healthStates: Ref<ServiceHealth[]>;
  /** Show soft-deleted services instead of live ones. */
  showDeleted: Ref<boolean>;
  pageSize: Ref<number>;
}

/** How long the server-mode query waits after the last keystroke. */
const SERVER_SEARCH_DEBOUNCE_MS = 500;

/** An empty selection means "no filter", never "match nothing". */
function matchesSelection<T>(selected: T[], value: T | undefined): boolean {
  return selected.length === 0 || (value !== undefined && selected.includes(value));
}

function matchesTerm(row: ServiceSummary, term: string): boolean {
  const needle = term.trim().toLowerCase();
  return (
    needle === '' ||
    row.name.toLowerCase().includes(needle) ||
    (row.displayName ?? '').toLowerCase().includes(needle)
  );
}

function byValue(first: ConnectionsFilterOption, second: ConnectionsFilterOption): number {
  return first.value.localeCompare(second.value);
}

/** Flattens a per-entity-type count map into one option list for the scopes given. */
function toFilterOptions(
  nested: Record<string, Record<string, number>> | undefined,
  entityTypes: string[],
): ConnectionsFilterOption[] {
  const totals = new Map<string, number>();
  for (const entityType of entityTypes) {
    for (const [value, count] of Object.entries(nested?.[entityType] ?? {})) {
      totals.set(value, (totals.get(value) ?? 0) + count);
    }
  }
  return [...totals.entries()]
    .map(([value, count]) => ({ count, value }))
    .sort(byValue);
}

function tallyBy(
  rows: ServiceSummary[],
  pick: (row: ServiceSummary) => string | undefined,
): ConnectionsFilterOption[] {
  const totals = new Map<string, number>();
  for (const row of rows) {
    const value = pick(row);
    if (value !== undefined) {
      totals.set(value, (totals.get(value) ?? 0) + 1);
    }
  }
  return [...totals.entries()]
    .map(([value, count]) => ({ count, value }))
    .sort(byValue);
}

function toCategoryCounts(counts: Record<string, number> | undefined): Partial<Record<string, number>> {
  const result: Partial<Record<string, number>> = {};
  for (const [entityType, count] of Object.entries(counts ?? {})) {
    const category = categoryOfEntityType(entityType);
    if (category) {
      result[category] = count;
    }
  }
  return result;
}

function countByCategory(rows: ServiceSummary[]): Partial<Record<string, number>> {
  const result: Partial<Record<string, number>> = {};
  for (const row of rows) {
    const category = categoryOfEntityType(row.entityType);
    if (category) {
      result[category] = (result[category] ?? 0) + 1;
    }
  }
  return result;
}

export function useConnectionsData(args: UseConnectionsDataArgs) {
  const { category, searchTerm, serviceTypes, healthStates, showDeleted, pageSize } = args;

  const page = ref(1);
  const sortOrder = ref<'asc' | 'desc'>('asc');

  const estate = ref<ServicesOverview | undefined>(undefined);
  const estateFetching = ref(false);
  const estateLoaded = ref(false);
  /** Settles on success or failure: a failed fetch is an error state, never an endless load. */
  const estateSettled = ref(false);
  const estateError = ref(false);
  let estateSeq = 0;

  const pageData = ref<ServicesOverview | undefined>(undefined);
  const pageFetching = ref(false);
  const pageLoaded = ref(false);
  const pageSettled = ref(false);
  const pageError = ref(false);
  let pageSeq = 0;

  const include = computed(() => (showDeleted.value ? 'deleted' : 'non-deleted'));

  async function loadEstate(): Promise<void> {
    const seq = ++estateSeq;
    estateFetching.value = true;
    try {
      const response = await getServicesOverview({
        ...OVERVIEW_PARAMS,
        include: include.value,
        limit: SERVICES_ESTATE_LIMIT,
      });
      if (seq !== estateSeq) {
        return;
      }
      estate.value = response;
      estateError.value = false;
      estateLoaded.value = true;
    } catch {
      if (seq !== estateSeq) {
        return;
      }
      estateError.value = true;
    } finally {
      if (seq === estateSeq) {
        estateFetching.value = false;
        estateSettled.value = true;
      }
    }
  }

  // The estate request carries no `q`: it is the unsearched view in both modes.
  watch(showDeleted, () => void loadEstate(), { immediate: true });

  const isClientMode = computed(() => (estate.value?.total ?? 0) <= SERVICES_ESTATE_LIMIT);

  // Only the server query is debounced. Client-side filtering runs over
  // an in-memory list bounded by the estate limit, so delaying it buys
  // nothing and costs the user a lag between typing and seeing results.
  const serverSearchTerm = ref(searchTerm.value.trim());
  watch(
    searchTerm,
    (term, _old, onCleanup) => {
      const timer = setTimeout(() => {
        serverSearchTerm.value = term.trim();
      }, SERVER_SEARCH_DEBOUNCE_MS);
      onCleanup(() => clearTimeout(timer));
    },
  );

  async function loadPage(): Promise<void> {
    if (isClientMode.value || !estateLoaded.value) {
      return;
    }
    const seq = ++pageSeq;
    pageFetching.value = true;
    try {
      const response = await getServicesOverview({
        entityType: [...CONNECTIONS_ENTITY_TYPES],
        excludeProvider: 'system',
        health: healthStates.value.length > 0 ? [...healthStates.value] : undefined,
        include: include.value,
        includeHealth: true,
        limit: pageSize.value,
        listEntityType:
          category.value === 'all' ? undefined : [CATEGORY_TO_ENTITY_TYPE[category.value]],
        offset: (page.value - 1) * pageSize.value,
        q: serverSearchTerm.value || undefined,
        serviceType: serviceTypes.value.length > 0 ? [...serviceTypes.value] : undefined,
        sortOrder: sortOrder.value,
      });
      if (seq !== pageSeq) {
        return;
      }
      pageData.value = response;
      pageError.value = false;
      pageLoaded.value = true;
    } catch {
      if (seq !== pageSeq) {
        return;
      }
      pageError.value = true;
    } finally {
      if (seq === pageSeq) {
        pageFetching.value = false;
        pageSettled.value = true;
      }
    }
  }

  watch(
    [
      isClientMode,
      page,
      pageSize,
      serverSearchTerm,
      category,
      serviceTypes,
      healthStates,
      showDeleted,
      sortOrder,
    ],
    () => void loadPage(),
    { immediate: true },
  );

  // Any change to what is being queried invalidates the current page
  // number. Sort order is deliberately absent — reordering does not
  // change which rows match.
  const queryKey = computed(
    () =>
      [
        category.value,
        String(showDeleted.value),
        searchTerm.value.trim(),
        [...serviceTypes.value].sort().join(','),
        [...healthStates.value].sort().join(','),
      ].join(' '),
  );
  watch(queryKey, () => {
    page.value = 1;
  });

  const knownRows = (rows: ServiceSummary[]): ServiceSummary[] =>
    rows.filter((row) => categoryOfEntityType(row.entityType) !== undefined);

  const estateRows = computed(() => knownRows(estate.value?.data ?? []));

  const searchScoped = computed(() =>
    estateRows.value.filter((row) => matchesTerm(row, searchTerm.value)),
  );

  const optionScoped = computed(() =>
    category.value === 'all'
      ? searchScoped.value
      : searchScoped.value.filter(
          (row) => categoryOfEntityType(row.entityType) === category.value,
        ),
  );

  // The tab's rows narrowed by one selector each, so the other
  // selector's counts can be taken from them.
  const healthFacet = computed(() =>
    optionScoped.value.filter((row) => matchesSelection(serviceTypes.value, row.serviceType)),
  );
  const connectorFacet = computed(() =>
    optionScoped.value.filter((row) => matchesSelection(healthStates.value, row.health)),
  );

  // Both selectors applied, minus the tab — what the sidebar badges count.
  const filteredIgnoringTab = computed(() =>
    searchScoped.value.filter(
      (row) =>
        matchesSelection(serviceTypes.value, row.serviceType) &&
        matchesSelection(healthStates.value, row.health),
    ),
  );

  const visible = computed(() => {
    const scoped = optionScoped.value.filter(
      (row) =>
        matchesSelection(serviceTypes.value, row.serviceType) &&
        matchesSelection(healthStates.value, row.health),
    );
    // The endpoint returns a total (name, id) order, so descending is a
    // reverse rather than a re-sort.
    return sortOrder.value === 'asc' ? scoped : [...scoped].reverse();
  });

  const activeResponse = computed(() =>
    isClientMode.value ? estate.value : pageData.value,
  );

  const optionEntityTypes = computed(() =>
    category.value === 'all'
      ? [...CONNECTIONS_ENTITY_TYPES]
      : [CATEGORY_TO_ENTITY_TYPE[category.value]],
  );

  const rows = computed(() =>
    isClientMode.value
      ? visible.value.slice((page.value - 1) * pageSize.value, page.value * pageSize.value)
      : knownRows(pageData.value?.data ?? []),
  );

  const serviceTypeOptions = computed(() =>
    isClientMode.value
      ? tallyBy(connectorFacet.value, (row) => row.serviceType)
      : toFilterOptions(activeResponse.value?.serviceTypeCounts, optionEntityTypes.value),
  );

  const healthOptions = computed(() =>
    isClientMode.value
      ? tallyBy(healthFacet.value, (row) => row.health)
      : toFilterOptions(activeResponse.value?.healthCounts, optionEntityTypes.value),
  );

  // Connectors present on this tab regardless of the search term.
  // serviceTypeOptions is search-narrowed on purpose, but pruning
  // against it would delete a selected connector the moment a search
  // excluded it, and clearing the search would not bring it back.
  const serviceTypesInTab = computed(() =>
    toFilterOptions(estate.value?.serviceTypeCounts, optionEntityTypes.value).map(
      (option) => option.value,
    ),
  );

  const totalRows = computed(() =>
    isClientMode.value
      ? visible.value.length
      : (pageData.value?.paging?.total ?? pageData.value?.total ?? 0),
  );

  const categoryCounts = computed(() =>
    isClientMode.value
      ? countByCategory(filteredIgnoringTab.value)
      : toCategoryCounts(activeResponse.value?.counts),
  );

  const estateTotal = computed(() => estate.value?.total ?? 0);

  const totalConnections = computed(() =>
    isClientMode.value ? filteredIgnoringTab.value.length : (activeResponse.value?.total ?? 0),
  );

  const isLoading = computed(() =>
    isClientMode.value ? !estateSettled.value : !pageSettled.value,
  );
  const isError = computed(() =>
    isClientMode.value ? estateError.value : estateError.value || pageError.value,
  );
  const isRefreshing = computed(() =>
    isClientMode.value
      ? estateFetching.value && estateLoaded.value
      : pageFetching.value && pageLoaded.value,
  );
  const isCountReady = computed(() =>
    isClientMode.value ? estateLoaded.value : pageLoaded.value && !pageFetching.value,
  );

  function setPage(nextPage: number): void {
    page.value = nextPage;
  }

  function setPageSize(nextPageSize: number): void {
    pageSize.value = nextPageSize;
  }

  function toggleSortOrder(): void {
    sortOrder.value = sortOrder.value === 'asc' ? 'desc' : 'asc';
  }

  return {
    categoryCounts,
    // Pin countsLoading is estate.isPending: the skeleton runs only while
    // the estate is in flight, never after it settles — a failed estate
    // shows 0 counts instead of a permanent skeleton.
    countsLoading: computed(() => !estateSettled.value),
    estateTotal,
    healthOptions,
    isCountReady,
    isError,
    isLoading,
    isRefreshing,
    page,
    pageSize,
    rows,
    serviceTypeOptions,
    serviceTypesInTab,
    setPage,
    setPageSize,
    sortOrder,
    toggleSortOrder,
    totalConnections,
    totalRows,
  };
}
