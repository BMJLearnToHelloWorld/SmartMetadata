<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import type { ServiceHealth, ServiceSummary } from '@/api/services';
import { getEntityName } from '@/components/shared/profilePictureUtils';
import LimitWrapper from '@/components/shared/LimitWrapper.vue';
import NoDataPlaceholder from '@/components/shared/NoDataPlaceholder.vue';
import PageHeader from '@/components/shared/PageHeader.vue';
import ServiceChildOwnersCell from '@/components/ingestion/ServiceChildOwnersCell.vue';
import ServiceLogo from '@/components/ingestion/ServiceLogo.vue';
import type { ServiceLogoSource } from '@/ingestion/serviceLogos';
import {
  CATEGORY_DESCRIPTION_KEYS,
  CONNECTION_CATEGORIES,
  HEALTH_FILTER_ORDER,
  HEALTH_LABEL_KEYS,
  LEGACY_HEALTH_ALIASES,
  PAGE_SIZE_OPTIONS,
  categoryOfEntityType,
  isConnectionsCategory,
  isLegacyHealthParam,
  parseCsvParam,
  parseHealthParam,
  type ConnectionsCategory,
} from '@/features/connections/connections';
import ConnectionsFilterDropdown from '@/features/connections/ConnectionsFilterDropdown.vue';
import { useConnectionsData } from '@/features/connections/useConnectionsData';
import { useConnectionsViewMode } from '@/features/connections/useConnectionsViewMode';
import { useAddServiceAction } from '@/features/home/useAddServiceAction';
import { serviceCategoryByKind } from '@/ingestion/serviceCategories';
import { filterUnsupportedServiceType } from '@/ingestion/wizardServiceTypes';
import {
  Button,
  Col,
  Input,
  Pagination,
  Row,
  Skeleton,
  Switch,
  Table,
  Tag,
  type TableColumnType,
} from 'ant-design-vue';
import { SearchOutlined } from '@ant-design/icons-vue';
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute, useRouter, type LocationQueryValue } from 'vue-router';

/**
 * The Connections page (`/connections`, B-7(c)): the aggregate services
 * surface, rebuilt 1:1 from official
 * `components/integration/ConnectionsPage` (pin a3012259ca).
 *
 * - `?category=` drives the tab (default `all`, illegal falls back to
 *   `all`); the left rail is the secondary nav (All Connections + the
 *   11 categories, with faceted counts).
 * - Search is `?search=` (500ms debounce URL write; the list itself
 *   filters on the raw input in client mode, exactly as pin).
 * - Health is a multi-select dropdown of the four precise states
 *   (`?health=` CSV); the widget's legacy single values expand on read
 *   and are rewritten once to the precise values.
 * - Deleted is `?deleted=true`; Clear all clears the two dropdowns but
 *   never the search box.
 * - Grid/list is `?viewMode=` with a stored preference, default grid.
 * - Fetching is overview-driven with the pin's ≤500 client / >500
 *   server dual mode; unknown entity types are dropped, never labelled
 *   `database`.
 */

const { t } = useI18n();
const router = useRouter();
const route = useRoute();

const SEARCH_DEBOUNCE_MS = 500;

const category = computed<ConnectionsCategory>(() => {
  const param = route.query.category;
  const raw = Array.isArray(param) ? param[0] : param;
  return typeof raw === 'string' && isConnectionsCategory(raw) ? raw : 'all';
});

const categoryRow = computed(() =>
  category.value === 'all' ? undefined : serviceCategoryByKind(category.value),
);

const urlSearchTerm = computed(() => {
  const param = route.query.search;
  const raw = Array.isArray(param) ? param[0] : param;
  return typeof raw === 'string' ? raw : '';
});

/** Local input state keeps typing responsive; the URL is the source of truth. */
const searchInput = ref(urlSearchTerm.value);
/** The term last committed to the URL (guard against fighting the debounce). */
const committedSearchTerm = ref(urlSearchTerm.value);
let searchTimer: ReturnType<typeof setTimeout> | undefined;

/**
 * `route.query` values arrive as `LocationQueryValue | LocationQueryValue[]`
 * (`string | null`, single or repeated). The CSV parsers below take plain
 * strings, so reduce here at the boundary: drop nulls and empty entries,
 * join repeats with commas — the same CSV shape pin writes and
 * `writeQuery` merges back to.
 */
function queryValues(value: LocationQueryValue | LocationQueryValue[] | undefined): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  const terms = (Array.isArray(value) ? value : [value]).filter(
    (entry): entry is string => typeof entry === 'string' && entry !== '',
  );
  return terms.length > 0 ? terms.join(',') : undefined;
}

const selectedServiceTypes = computed(() => parseCsvParam(queryValues(route.query.serviceType)));
const selectedHealth = computed(() => parseHealthParam(queryValues(route.query.health)));
const showDeleted = computed(() => route.query.deleted === 'true');
const hasFilters = computed(
  () => selectedServiceTypes.value.length > 0 || selectedHealth.value.length > 0,
);
const isNarrowed = computed(
  () => searchInput.value !== '' || hasFilters.value || showDeleted.value,
);

/** Pin `usePaging` reconciles the shared `?pageSize=` URL param to this
 * page's options, defaulting to the first option (12). The global
 * `globalPageSize` preference never applies here: pin only persists sizes
 * on the app-wide 15/25/50 scale, and 12/24/48 are off that scale — so
 * this page reads and writes the URL param only, never the preference. */
function pageSizeFromRoute(): number {
  const param = route.query.pageSize;
  const raw = Array.isArray(param) ? param[0] : param;
  const parsed = typeof raw === 'string' ? Number.parseInt(raw, 10) : Number.NaN;
  return (PAGE_SIZE_OPTIONS as readonly number[]).includes(parsed)
    ? parsed
    : (PAGE_SIZE_OPTIONS[0] as number);
}

const pageSize = ref<number>(pageSizeFromRoute());

const {
  categoryCounts,
  countsLoading,
  healthOptions,
  isCountReady,
  isError,
  isLoading,
  isRefreshing,
  page,
  rows,
  serviceTypeOptions,
  serviceTypesInTab,
  setPage,
  setPageSize,
  sortOrder,
  toggleSortOrder,
  totalConnections,
  totalRows,
} = useConnectionsData({
  category,
  healthStates: selectedHealth,
  pageSize,
  searchTerm: searchInput,
  serviceTypes: selectedServiceTypes,
  showDeleted,
});

const { setViewMode, viewMode } = useConnectionsViewMode();
const { addService, canAddService } = useAddServiceAction(category);

function writeQuery(patch: Record<string, string | undefined>): void {
  const next: Record<string, string> = {};
  for (const [key, value] of Object.entries({ ...route.query, ...patch })) {
    // A repeated parameter (?health=a&health=b) arrives as an array; pin
    // writes every multi-value param as one CSV value, so merge it back to
    // CSV instead of silently dropping all but the first entry.
    const joined = Array.isArray(value)
      ? value
          .filter((entry): entry is string => typeof entry === 'string' && entry !== '')
          .join(',')
      : value;
    if (typeof joined === 'string' && joined !== '') {
      next[key] = joined;
    }
  }
  void router.replace({ query: next });
}

// Follow an external ?pageSize= change (back/forward, deep link); the
// equality guard keeps the write-back in handlePageChange from looping.
watch(
  () => route.query.pageSize,
  () => {
    const next = pageSizeFromRoute();
    if (next !== pageSize.value) {
      pageSize.value = next;
    }
  },
);

function setCsvParam(param: string, values: string[]): void {
  writeQuery({ [param]: values.length > 0 ? values.join(',') : undefined });
}

function handleCategoryChange(next: ConnectionsCategory): void {
  writeQuery({ category: next });
}

function setShowDeleted(next: boolean): void {
  writeQuery({ deleted: next ? 'true' : undefined });
}

function clearFilters(): void {
  // Clears the two dropdowns but deliberately not the search box: the
  // search is typed and visible, so wiping it would discard something
  // the user can see they still want.
  const next: Record<string, string> = {};
  for (const [key, value] of Object.entries(route.query)) {
    if (key !== 'serviceType' && key !== 'health') {
      const joined = Array.isArray(value)
        ? value
            .filter((entry): entry is string => typeof entry === 'string' && entry !== '')
            .join(',')
        : value;
      if (typeof joined === 'string' && joined !== '') {
        next[key] = joined;
      }
    }
  }
  void router.replace({ query: next });
}

function commitSearchTerm(value: string): void {
  committedSearchTerm.value = value;
  writeQuery({ search: value === '' ? undefined : value });
}

watch(searchInput, (value) => {
  if (searchTimer) {
    clearTimeout(searchTimer);
    searchTimer = undefined;
  }
  if (value === '') {
    // Clearing the search applies immediately (pin SearchBar).
    commitSearchTerm('');
    return;
  }
  searchTimer = setTimeout(() => commitSearchTerm(value), SEARCH_DEBOUNCE_MS);
});

// Follow the URL when it changes from outside the input — browser
// back/forward, or a link into an already-filtered view. Guarded on the
// committed term so it cannot fight the debounce and undo typing.
watch(urlSearchTerm, (value) => {
  if (value !== committedSearchTerm.value) {
    if (searchTimer) {
      clearTimeout(searchTimer);
      searchTimer = undefined;
    }
    searchInput.value = value;
    committedSearchTerm.value = value;
  }
});

// The landing Platform Health widget still deep-links
// ?health=failing|healthy|notRun. Rewrite those to the precise states
// once, so the rest of the page deals with one vocabulary.
const rawHealthParam = computed(() => {
  const param = route.query.health;
  const raw = Array.isArray(param) ? param[0] : param;
  return typeof raw === 'string' ? raw : null;
});
watch(
  rawHealthParam,
  (value) => {
    if (value && isLegacyHealthParam(value)) {
      setCsvParam('health', [...LEGACY_HEALTH_ALIASES[value]]);
    }
  },
  { immediate: true },
);

// Drop a selected connector the current tab has no services for, rather
// than silently showing an empty list. Keyed on the tab's connectors
// ignoring the search term: pruning against the search-narrowed list
// would delete the selection as soon as a search excluded it.
const tabServiceTypeKey = computed(() => serviceTypesInTab.value.join(','));
const selectedServiceTypeKey = computed(() => selectedServiceTypes.value.join(','));
watch([tabServiceTypeKey, selectedServiceTypeKey], ([tabKey, selectedKey]) => {
  const available = tabKey ? tabKey.split(',') : [];
  const selected = selectedKey ? selectedKey.split(',') : [];
  const pruned = selected.filter((value) => available.includes(value));
  if (available.length > 0 && pruned.length !== selected.length) {
    setCsvParam('serviceType', pruned);
  }
});

// Scrolling belongs to the results, so switching tab or page has to
// return it to the top — otherwise a new, shorter list opens part-way
// down with no indication why.
const scrollContainerRef = ref<HTMLElement | null>(null);
watch([category, page, searchInput, selectedServiceTypeKey, showDeleted], () => {
  if (scrollContainerRef.value) {
    scrollContainerRef.value.scrollTop = 0;
  }
});

const title = computed(() =>
  category.value === 'all'
    ? t('connections.allConnections')
    : t(categoryRow.value?.titleKey ?? 'connections.title'),
);
const subtitle = computed(() => {
  if (category.value === 'all') {
    return t('connections.allDescription');
  }
  const descriptionKey = CATEGORY_DESCRIPTION_KEYS[category.value];
  if (descriptionKey) {
    return t(descriptionKey);
  }
  return t('connections.serviceTypeDescription', {
    serviceType: t(categoryRow.value?.titleKey ?? 'connections.title'),
  });
});

const healthFilterOptions = computed(() => {
  const counts = new Map(healthOptions.value.map((option) => [option.value, option.count]));
  return HEALTH_FILTER_ORDER.map((state) => ({
    count: counts.get(state) ?? 0,
    label: t(HEALTH_LABEL_KEYS[state]),
    value: state,
  }));
});

const serviceTypeFilterOptions = computed(() => {
  // Pin filters the deployed options through filterUnsupportedServiceType
  // (ConnectionsListView.tsx:274): only connectors that are actually
  // deployed AND supported are offered. The product table is identical to
  // pin's default unSupportedServices list (wizardServiceTypes.ts:98).
  const deployed = filterUnsupportedServiceType(
    serviceTypeOptions.value.map((option) => option.value),
  );
  return serviceTypeOptions.value
    .filter((option) => deployed.includes(option.value))
    .map((option) => ({
      count: option.count,
      label: option.value,
      value: option.value,
    }));
});

const emptyState = computed(() =>
  category.value === 'all'
    ? {
        description: t('connections.emptyAllDescription'),
        title: t('connections.emptyAllTitle'),
      }
    : {
        description: t(categoryRow.value?.emptyDescriptionKey ?? 'connections.emptyAllDescription'),
        title: t(categoryRow.value?.emptyTitleKey ?? 'connections.emptyAllTitle'),
      },
);

function openService(service: ServiceSummary): void {
  const kind = categoryOfEntityType(service.entityType);
  if (!kind) {
    return;
  }
  void router.push({
    name: 'ingestion-service',
    params: { kind, id: service.id },
  });
}

function logoSource(service: ServiceSummary): ServiceLogoSource {
  // ServiceSummary (overview rows) carries no `style`, so there is no
  // service iconURL to forward — `ServiceLogoSource.service` only accepts
  // `{ style?: { iconURL?: string } }`. The logo resolves from the service
  // type alone, as in the other overview call sites (`{ serviceType }`).
  return { serviceType: service.serviceType };
}

const columns = computed<TableColumnType<ServiceSummary>[]>(() => {
  // Pin column labels: label.connector / label.owner. The product has
  // label.owner; there is no label.connector key, so the connector label
  // lives under connections.connector (pin wording).
  const base: TableColumnType<ServiceSummary>[] = [
    {
      title: t('crud.name'),
      dataIndex: 'name',
      key: 'name',
      sorter: true,
      sortOrder: sortOrder.value === 'asc' ? 'ascend' : 'descend',
    },
    { title: t('connections.connector'), dataIndex: 'serviceType', key: 'serviceType' },
  ];
  if (category.value === 'all') {
    base.push({ title: t('connections.category'), dataIndex: 'category', key: 'category' });
  }
  base.push(
    { title: t('label.owner'), dataIndex: 'owners', key: 'owners' },
    { title: t('connections.tags'), dataIndex: 'tags', key: 'tags' },
  );
  return base;
});

function handleTableChange(
  _pagination: unknown,
  _filters: unknown,
  sorter: unknown,
): void {
  const order = (sorter as { order?: string | null } | null)?.order;
  // antd cycles ascend → descend → null; pin's controlled sortDescriptor
  // only knows ascending/descending, so every click toggles — map the
  // unsorted third click back to 'asc' instead of ignoring it.
  const next = order === 'descend' ? 'desc' : 'asc';
  if (next !== sortOrder.value) {
    toggleSortOrder();
  }
}

function customRow(record: ServiceSummary) {
  return {
    onClick: () => openService(record),
  };
}

function handlePageChange(nextPage: number, nextPageSize?: number): void {
  if (nextPageSize !== undefined && nextPageSize !== pageSize.value) {
    setPageSize(nextPageSize);
    setPage(1);
    writeQuery({ pageSize: String(nextPageSize) });
    return;
  }
  setPage(nextPage);
}
</script>

<template>
  <div data-tour-step="services" data-tour-page>
    <div class="connections__header-row">
      <PageHeader :header="t('connections.title')" :sub-header="t('connections.subtitle')" />
      <div class="connections__header-actions">
        <Input
          v-model:value="searchInput"
          allow-clear
          :placeholder="t('connections.searchPlaceholder')"
          data-testid="search-connections-input"
          class="connections__search"
        />
        <LimitWrapper v-if="canAddService" resource="dataAssets">
          <Button type="primary" data-testid="connections-add-service" @click="addService">
            {{ t('settings.services.addNewEntity', { entity: t('settings.services.service') }) }}
          </Button>
        </LimitWrapper>
      </div>
    </div>

    <div class="connections__browse" data-testid="connections-browse-view">
      <nav class="connections__nav" aria-label="connections-nav">
        <button
          type="button"
          class="connections__nav-item"
          :class="{ 'connections__nav-item--active': category === 'all' }"
          data-testid="connections-nav-all"
          @click="handleCategoryChange('all')"
        >
          <SearchOutlined />
          <span>{{ t('connections.allConnections') }}</span>
          <span v-if="!countsLoading" class="connections__nav-count">{{ totalConnections }}</span>
          <Skeleton v-else :paragraph="false" active class="connections__nav-skeleton" />
        </button>
        <div class="connections__nav-group">{{ t('connections.browseByCategory') }}</div>
        <button
          v-for="kind in CONNECTION_CATEGORIES"
          :key="kind"
          type="button"
          class="connections__nav-item"
          :class="{ 'connections__nav-item--active': category === kind }"
          :data-testid="`connections-nav-${kind}`"
          @click="handleCategoryChange(kind)"
        >
          <ServiceLogo :default-kind="kind" :size="20" :test-id="`connections-nav-icon-${kind}`" />
          <span>{{ t(serviceCategoryByKind(kind)?.titleKey ?? 'connections.title') }}</span>
          <span v-if="!countsLoading" class="connections__nav-count">{{
            categoryCounts[kind] ?? 0
          }}</span>
          <Skeleton v-else :paragraph="false" active class="connections__nav-skeleton" />
        </button>
      </nav>

      <main class="connections__main">
        <div class="connections__title-row">
          <h1 data-testid="connections-page-title">
            {{ isCountReady ? `${title} (${totalRows})` : title }}
          </h1>
          <p data-testid="connections-page-subtitle">{{ subtitle }}</p>
        </div>

        <div class="connections__filter-row" data-testid="connections-filter-row">
          <ConnectionsFilterDropdown
            :model-value="selectedServiceTypes"
            :options="serviceTypeFilterOptions"
            :fallback-label="t('connections.allServiceTypes')"
            searchable
            test-id="connections-service-type-filter"
            @update:model-value="(values) => setCsvParam('serviceType', values)"
          />
          <ConnectionsFilterDropdown
            :model-value="selectedHealth"
            :options="healthFilterOptions"
            :fallback-label="t('connections.allStatuses')"
            test-id="connections-health-filter"
            @update:model-value="(values) => setCsvParam('health', values as ServiceHealth[])"
          />
          <Button
            v-if="hasFilters"
            type="link"
            data-testid="connections-clear-filters"
            @click="clearFilters"
          >
            {{ t('connections.clearAll') }}
          </Button>
          <div class="connections__filter-right">
            <div class="connections__show-deleted">
              <Switch
                :checked="showDeleted"
                data-testid="connections-show-deleted"
                :aria-label="t('connections.deleted')"
                @change="(checked) => setShowDeleted(Boolean(checked))"
              />
              <span>{{ t('connections.deleted') }}</span>
            </div>
            <div class="connections__view-toggle" role="group">
              <Button
                size="small"
                :type="viewMode === 'grid' ? 'primary' : 'default'"
                data-testid="grid-view-toggle"
                :aria-label="t('connections.gridView')"
                @click="setViewMode('grid')"
              >
                {{ t('connections.gridView') }}
              </Button>
              <Button
                size="small"
                :type="viewMode === 'list' ? 'primary' : 'default'"
                data-testid="list-view-toggle"
                :aria-label="t('connections.listView')"
                @click="setViewMode('list')"
              >
                {{ t('connections.listView') }}
              </Button>
            </div>
          </div>
        </div>

        <div
          ref="scrollContainerRef"
          class="connections__results"
          data-testid="connections-scroll-container"
        >
          <div v-if="isLoading" class="connections__loading">
            <Skeleton active />
          </div>
          <div v-else-if="isError" class="connections__empty" data-testid="connections-list-error-wrapper">
            <NoDataPlaceholder
              :title="t('message.something-went-wrong')"
              test-id="connections-list-error"
            />
          </div>
          <div
            v-else-if="rows.length === 0"
            class="connections__empty"
            data-testid="connections-list-empty-wrapper"
          >
            <NoDataPlaceholder
              :title="
                isNarrowed
                  ? t('message.no-data-available-for-selected-filter')
                  : emptyState.title
              "
              :description="isNarrowed ? undefined : emptyState.description"
              test-id="connections-list-empty"
            >
              <template v-if="canAddService" #footer>
                <LimitWrapper resource="dataAssets">
                  <Button type="primary" data-testid="connections-list-empty-add-service" @click="addService">
                    {{ t('settings.services.addNewEntity', { entity: t('settings.services.service') }) }}
                  </Button>
                </LimitWrapper>
              </template>
            </NoDataPlaceholder>
          </div>
          <div
            v-else
            :aria-busy="isRefreshing"
            class="connections__results-body"
            data-testid="connections-results"
          >
            <div v-if="viewMode === 'list'" data-testid="connections-list-view">
              <Table
                :columns="columns"
                :data-source="rows"
                :loading="isRefreshing"
                :pagination="false"
                :custom-row="customRow"
                row-key="id"
                data-testid="connections-list-table"
                @change="handleTableChange"
              >
                <template #bodyCell="{ column, record }">
                  <template v-if="column.key === 'name'">
                    <div class="connections__name-cell">
                      <ServiceLogo :source="logoSource(record as ServiceSummary)" :size="24" />
                      <a
                        href="#"
                        :data-testid="`connections-list-row-${(record as ServiceSummary).name}`"
                        @click.prevent="openService(record as ServiceSummary)"
                      >
                        {{ getEntityName(record as ServiceSummary) }}
                      </a>
                    </div>
                  </template>
                  <template v-else-if="column.key === 'serviceType'">
                    {{ (record as ServiceSummary).serviceType }}
                  </template>
                  <template v-else-if="column.key === 'category'">
                    {{
                      t(
                        serviceCategoryByKind(
                          categoryOfEntityType((record as ServiceSummary).entityType) ?? 'database',
                        )?.titleKey ?? 'connections.title',
                      )
                    }}
                  </template>
                  <template v-else-if="column.key === 'owners'">
                    <ServiceChildOwnersCell :owners="(record as ServiceSummary).owners ?? []" />
                  </template>
                  <template v-else-if="column.key === 'tags'">
                    <span>
                      <Tag
                        v-for="tag in ((record as ServiceSummary).tags ?? []).slice(0, 2)"
                        :key="tag.id ?? tag.name"
                      >
                        {{ tag.displayName ?? tag.name }}
                      </Tag>
                      <span v-if="((record as ServiceSummary).tags ?? []).length > 2">
                        +{{ ((record as ServiceSummary).tags ?? []).length - 2 }}
                      </span>
                    </span>
                  </template>
                </template>
              </Table>
            </div>
            <Row v-else :gutter="[16, 16]" data-testid="connections-grid-view">
              <Col
                v-for="service in rows"
                :key="service.id"
                :xs="24"
                :lg="8"
                :xl="6"
              >
                <div
                  class="connections__card"
                  role="button"
                  tabindex="0"
                  :data-testid="`connections-grid-card-${service.name}`"
                  @click="openService(service)"
                  @keydown.enter="openService(service)"
                >
                  <div class="connections__card-head">
                    <ServiceLogo :source="logoSource(service)" :size="28" />
                    <span>{{ getEntityName(service) }}</span>
                  </div>
                  <div v-if="category === 'all'" class="connections__card-category">
                    {{
                      t(
                        serviceCategoryByKind(
                          categoryOfEntityType(service.entityType) ?? 'database',
                        )?.titleKey ?? 'connections.title',
                      )
                    }}
                  </div>
                  <div class="connections__card-type">
                    <span>{{ t('crud.type') }}:</span>
                    {{ service.serviceType }}
                  </div>
                  <div class="connections__card-owners">
                    <ServiceChildOwnersCell :owners="service.owners ?? []" />
                  </div>
                  <div class="connections__card-tags">
                    <Tag
                      v-for="tag in (service.tags ?? []).slice(0, 2)"
                      :key="tag.id ?? tag.name"
                    >
                      {{ tag.displayName ?? tag.name }}
                    </Tag>
                  </div>
                </div>
              </Col>
            </Row>

            <Pagination
              v-if="totalRows > 0"
              :current="page"
              :page-size="pageSize"
              :page-size-options="PAGE_SIZE_OPTIONS.map(String)"
              :total="totalRows"
              :show-size-changer="true"
              data-testid="connections-pagination"
              @change="handlePageChange"
              @show-size-change="handlePageChange"
            />
          </div>
        </div>
      </main>
    </div>
  </div>
</template>

<style scoped>
.connections__header-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 12px;
}

.connections__header-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}

.connections__search {
  width: 280px;
}

.connections__browse {
  display: flex;
  gap: 16px;
}

.connections__nav {
  display: flex;
  flex-direction: column;
  gap: 4px;
  width: 240px;
  flex-shrink: 0;
}

.connections__nav-item {
  display: flex;
  align-items: center;
  gap: 8px;
  border: 1px solid transparent;
  border-radius: var(--sm-border-radius);
  background: transparent;
  cursor: pointer;
  padding: 8px 12px;
  text-align: left;
  font-size: 14px;
}

.connections__nav-item--active {
  border-color: var(--sm-border-color);
  background: var(--sm-bg-container);
  font-weight: 600;
}

.connections__nav-count {
  margin-left: auto;
  font-size: 12px;
  color: var(--sm-text-secondary);
}

.connections__nav-skeleton {
  margin-left: auto;
  width: 24px;
}

.connections__nav-group {
  margin-top: 12px;
  padding: 0 12px;
  font-size: 12px;
  font-weight: 600;
  color: var(--sm-text-secondary);
}

.connections__main {
  display: flex;
  flex-direction: column;
  min-width: 0;
  flex: 1;
}

.connections__title-row h1 {
  margin: 0;
  font-size: 18px;
}

.connections__title-row p {
  margin: 4px 0 0 8px;
  color: var(--sm-text-secondary);
}

.connections__filter-row {
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 16px 0;
  min-height: 40px;
}

.connections__filter-right {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-left: auto;
}

.connections__show-deleted {
  display: flex;
  align-items: center;
  gap: 8px;
}

.connections__view-toggle {
  display: inline-flex;
  gap: 4px;
}

.connections__results {
  min-height: 0;
  flex: 1;
  overflow-y: auto;
}

.connections__results-body {
  transition: opacity 0.15s;
}

.connections__results-body[aria-busy='true'] {
  opacity: 0.6;
}

.connections__empty {
  position: relative;
  min-height: 400px;
}

.connections__loading {
  padding: 24px 0;
}

.connections__name-cell {
  display: flex;
  align-items: center;
  gap: 8px;
}

.connections__card {
  border: 1px solid var(--sm-border-color);
  border-radius: var(--sm-border-radius);
  background: var(--sm-bg-container);
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  height: 100%;
  cursor: pointer;
}

.connections__card-head {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 600;
}

.connections__card-type,
.connections__card-category {
  display: flex;
  gap: 4px;
}
</style>
