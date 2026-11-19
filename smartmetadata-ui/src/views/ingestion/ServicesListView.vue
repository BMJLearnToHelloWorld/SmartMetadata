<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute, useRouter } from 'vue-router';
import {
  Alert,
  Button,
  Col,
  Input,
  Row,
  Skeleton,
  Switch,
  Table,
  Tabs,
  Tooltip,
  message,
  type TableColumnType,
} from 'ant-design-vue';
import type { FilterValue } from 'ant-design-vue/es/table/interface';
import { getServicesOverview, type ServiceHealth, type ServiceSummary } from '@/api/services';
import { getOrchestratorStatus } from '@/api/ingestionPipelines';
import { permissionFlags } from '@/api/permissions';
import { searchServices } from '@/api/serviceSearch';
import { SERVICE_CATEGORIES } from '@/catalog/ingestionTabs';
import ColumnFilter from '@/components/ingestion/ColumnFilter.vue';
import DomainFilterChip from '@/components/ingestion/DomainFilterChip.vue';
import HighlightedText from '@/components/ingestion/HighlightedText.vue';
import ServiceChildOwnersCell from '@/components/ingestion/ServiceChildOwnersCell.vue';
import ServiceLogo from '@/components/ingestion/ServiceLogo.vue';
import DescriptionCell from '@/components/shared/DescriptionCell.vue';
import LimitWrapper from '@/components/shared/LimitWrapper.vue';
import NextPrevious from '@/components/shared/NextPrevious.vue';
import NoDataPlaceholder from '@/components/shared/NoDataPlaceholder.vue';
import PageHeader from '@/components/shared/PageHeader.vue';
import PermissionPlaceholder from '@/components/shared/PermissionPlaceholder.vue';
import { getEntityName } from '@/components/shared/profilePictureUtils';
import {
  KIND_BY_ENTITY_TYPE,
  OVERVIEW_PARAMS,
} from '@/features/home/widgets/usePlatformHealth';
import { SERVICE_TYPES_BY_KIND } from '@/ingestion/connections';
import { startCase } from '@/utils/text';
import { SERVICE_LIST_API } from '@/ingestion/serviceApis';
import { getOptionalFields } from '@/ingestion/serviceCardFields';
import {
  serviceCategoryByKind,
  type ServiceCategoryKind,
} from '@/ingestion/serviceCategories';
import type { ServiceLogoSource } from '@/ingestion/serviceLogos';
import {
  buildServiceQueryFilter,
  filterMetadataOpenMetadata,
  isServiceSearchNumberBased,
} from '@/ingestion/serviceSearch';
import { useCursorPaging } from '@/ingestion/useCursorPaging';
import { useAuthStore } from '@/stores/auth';
import { usePermissionStore } from '@/stores/permissions';
import type { PagingHandlerParams } from '@/utils/pagination';
import type { CatalogService, ServiceKind } from '@/types/ingestion';

const { t } = useI18n();
const router = useRouter();
const route = useRoute();
const auth = useAuthStore();
const permissionStore = usePermissionStore();

/**
 * The `?health=` filter the PlatformHealth widget links with (condition 8):
 * `failing` / `healthy` / `notRun`, the same three buckets the card counts.
 * An unknown value is no filter, never a broken page.
 * ADR:2026-11-08-my-data-services-health-filter
 *
 * Retained this round (deletion D-1 is OUT_OF_SCOPE): the health chips,
 * the `?health=` param, and the kind Tabs below stay exactly as they
 * were. When a health filter is active, or the `all` tab (or an
 * llm/mcp tab) is selected, the page renders the retained aggregate
 * interim; the official single-category content renders only for one
 * of the 11 categories with no health filter.
 */
type HealthFilter = 'failing' | 'healthy' | 'notRun';
const HEALTH_FILTER_TO_SERVICE_HEALTH: Record<HealthFilter, ServiceHealth> = {
  failing: 'failed',
  healthy: 'success',
  notRun: 'notRun',
};
const healthFilter = computed<HealthFilter | undefined>(() => {
  const value = route.query.health;
  return value === 'failing' || value === 'healthy' || value === 'notRun' ? value : undefined;
});
const healthCounts = ref<Record<HealthFilter, number>>({
  failing: 0,
  healthy: 0,
  notRun: 0,
});

const activeKind = ref<string>('all');
const showDeleted = ref(false);
const supportedCategories = computed(() => SERVICE_CATEGORIES.filter((row) => row.supported));

const ELEVEN_KINDS: readonly ServiceCategoryKind[] = [
  'database',
  'dashboard',
  'messaging',
  'pipeline',
  'storage',
  'api',
  'mlmodel',
  'metadata',
  'search',
  'drive',
  'security',
];

const singleKind = computed<ServiceCategoryKind | undefined>(() => {
  if (healthFilter.value) {
    return undefined;
  }
  const kind = activeKind.value as ServiceCategoryKind;
  return ELEVEN_KINDS.includes(kind) ? kind : undefined;
});
const isSingleKindMode = computed(() => singleKind.value !== undefined);
const category = computed(() =>
  singleKind.value ? serviceCategoryByKind(singleKind.value) : undefined,
);

function setHealthFilter(filter: HealthFilter | undefined): void {
  void router.replace({
    name: 'ingestion-services',
    query: filter ? { health: filter } : {},
  });
}

async function loadHealthCounts(): Promise<void> {
  try {
    const overview = await getServicesOverview(OVERVIEW_PARAMS);
    const sum = (health: ServiceHealth): number =>
      Object.values(overview.healthCounts ?? {}).reduce(
        (acc, byHealth) => acc + (byHealth[health] ?? 0),
        0,
      );
    healthCounts.value = {
      failing: sum('failed'),
      healthy: sum('success'),
      notRun: sum('notRun'),
    };
  } catch {
    healthCounts.value = { failing: 0, healthy: 0, notRun: 0 };
  }
}

function openDetail(service: CatalogService): void {
  void router.push({
    name: 'ingestion-service',
    params: { kind: service.kind, id: service.id },
  });
}

function onCategoryChange(key: string): void {
  // A category switch clears the search term and the type filter
  // (pin Services.tsx:150-153); the chrome watcher below resets
  // paging and reloads for the new category.
  activeKind.value = key;
  searchInput.value = '';
  searchTerm.value = '';
  typeFilter.value = [];
}

// ---------------------------------------------------------------------------
// Retained aggregate interim (D-1 / D-16): `all`, llm/mcp, or a health filter.
// ---------------------------------------------------------------------------

const loading = ref(false);
const errorMessage = ref('');
const services = ref<CatalogService[]>([]);

const filteredServices = computed(() =>
  activeKind.value === 'all' ? services.value : services.value.filter((item) => item.kind === activeKind.value),
);

const aggregateColumns = computed<TableColumnType<CatalogService>[]>(() => [
  { title: t('crud.name'), dataIndex: 'name', key: 'name' },
  { title: t('ingestion.services.kind'), dataIndex: 'kind', key: 'kind', width: 120 },
  { title: t('crud.type'), dataIndex: 'serviceType', key: 'serviceType', width: 140 },
  { title: t('crud.fqn'), dataIndex: 'fullyQualifiedName', key: 'fullyQualifiedName' },
]);

async function loadAggregate(): Promise<void> {
  loading.value = true;
  errorMessage.value = '';
  try {
    if (healthFilter.value) {
      // The health buckets come from the server's own tally — the overview
      // endpoint reduces every service's pipelines worst-wins. The page is
      // narrowed by health; the counts in the chips are estate-wide.
      const overview = await getServicesOverview({
        ...OVERVIEW_PARAMS,
        health: [HEALTH_FILTER_TO_SERVICE_HEALTH[healthFilter.value]],
        limit: 100,
      });
      services.value = overview.data.map((summary: ServiceSummary) => ({
        id: summary.id,
        name: summary.name,
        displayName: summary.displayName,
        description: summary.description,
        fullyQualifiedName: summary.fullyQualifiedName,
        kind: KIND_BY_ENTITY_TYPE[summary.entityType] ?? 'database',
        serviceType: summary.serviceType ?? '',
      }));
      return;
    }
    const kinds = supportedCategories.value.map((row) => row.key as ServiceKind);
    const settled = await Promise.allSettled(
      kinds.map((kind) =>
        SERVICE_LIST_API[kind]({ limit: 100, include: showDeleted.value ? 'deleted' : 'non-deleted' }),
      ),
    );
    const pages = settled.map((result) =>
      result.status === 'fulfilled' ? result.value : { data: [] },
    );
    services.value = pages.flatMap((page) => page.data);
    if (settled.every((result) => result.status === 'rejected')) {
      const first = settled.find((item) => item.status === 'rejected') as PromiseRejectedResult;
      throw first.reason instanceof Error ? first.reason : new Error(String(first.reason));
    }
  } catch (error) {
    services.value = [];
    errorMessage.value = error instanceof Error ? error.message : t('crud.loadFailed');
  } finally {
    loading.value = false;
  }
}

// ---------------------------------------------------------------------------
// Official single-category content (pin Services.tsx).
// ---------------------------------------------------------------------------

const {
  paging,
  handlePagingChange,
  currentPage,
  handlePageChange,
  pageSize,
  handlePageSizeChange,
  showPagination,
  pagingCursor,
  resetPaging,
} = useCursorPaging(undefined, [15, 25, 50], {
  storage: window.localStorage,
  userName: () => auth.user?.name,
});

const gateState = ref<'idle' | 'checking' | 'allowed' | 'denied'>('idle');
const canCreate = ref(false);
const airflowChecking = ref(true);
const singleKindServices = ref<CatalogService[]>([]);
const singleKindLoading = ref(false);
const searchInput = ref('');
const searchTerm = ref('');
const typeFilter = ref<string[]>([]);
const viewMode = ref<'table' | 'card'>('table');
let searchTimer: ReturnType<typeof setTimeout> | undefined;
let loadSeq = 0;

const SEARCH_DEBOUNCE_MS = 1000;

watch(searchInput, (value) => {
  if (searchTimer) {
    clearTimeout(searchTimer);
    searchTimer = undefined;
  }
  if (value === '') {
    // Clearing the search applies immediately (pin SearchBar).
    searchTerm.value = '';
    return;
  }
  searchTimer = setTimeout(() => {
    searchTerm.value = value;
  }, SEARCH_DEBOUNCE_MS);
});

onUnmounted(() => {
  if (searchTimer) {
    clearTimeout(searchTimer);
  }
});

const numberBased = computed(() => isServiceSearchNumberBased(searchTerm.value, typeFilter.value));
const isNarrowing = computed(
  () => searchTerm.value !== '' || typeFilter.value.length > 0 || showDeleted.value,
);

const typeFilterOptions = computed(() =>
  singleKind.value
    ? SERVICE_TYPES_BY_KIND[singleKind.value].map((type) => ({ text: startCase(type), value: type }))
    : [],
);

const columns = computed<TableColumnType<CatalogService>[]>(() => [
  {
    title: t('crud.name'),
    dataIndex: 'name',
    key: 'name',
    width: 200,
    sorter: (a, b) => getEntityName(a).localeCompare(getEntityName(b)),
  },
  {
    title: t('crud.description'),
    dataIndex: 'description',
    key: 'description',
    width: 200,
  },
  {
    title: t('crud.type'),
    dataIndex: 'serviceType',
    key: 'serviceType',
    width: 200,
    filters: typeFilterOptions.value,
    filteredValue: typeFilter.value,
    customFilterDropdown: true,
  },
  {
    title: t('crud.owners'),
    dataIndex: 'owners',
    key: 'owners',
    width: 280,
  },
]);

function logoSource(service: CatalogService): ServiceLogoSource {
  return { serviceType: service.serviceType, style: service.style, service };
}

/** Card rows with their optional field resolved once per render. */
const cardServices = computed(() => {
  const kind = singleKind.value;
  return singleKindServices.value.map((service) => ({
    service,
    field: kind ? getOptionalFields(service, kind) : null,
  }));
});

async function loadGate(): Promise<void> {
  const row = category.value;
  if (!row) {
    gateState.value = 'idle';
    canCreate.value = false;
    return;
  }
  gateState.value = 'checking';
  try {
    // The raw category segment maps through the official resource
    // table (five segments fall back to the database service);
    // empty or failed permissions fail closed: no view, no fetch.
    const flags = permissionFlags(await permissionStore.getResourcePermission(row.resourceEntity));
    canCreate.value = flags.canCreate;
    gateState.value = flags.hasViewAccess ? 'allowed' : 'denied';
  } catch {
    canCreate.value = false;
    gateState.value = 'denied';
  }
  if (gateState.value === 'allowed') {
    void loadSingleKind();
  }
}

watch(singleKind, () => {
  void loadGate();
});

async function loadSingleKind(): Promise<void> {
  const kind = singleKind.value;
  const row = category.value;
  if (!kind || !row || gateState.value !== 'allowed') {
    return;
  }
  const seq = ++loadSeq;
  singleKindLoading.value = true;
  try {
    const cursor = pagingCursor.value;
    let data: CatalogService[];
    if (numberBased.value) {
      const result = await searchServices(
        {
          searchIndex: row.searchIndex,
          currentPage: currentPage.value,
          limit: pageSize.value,
          queryFilter: buildServiceQueryFilter(searchTerm.value, typeFilter.value),
          deleted: showDeleted.value,
        },
        kind,
      );
      data = result.data;
      if (seq === loadSeq) {
        handlePagingChange({ after: '', before: '', total: result.total });
      }
    } else {
      const page = await SERVICE_LIST_API[kind]({
        limit: pageSize.value,
        after: cursor.cursorType === 'after' ? cursor.cursorValue : undefined,
        before: cursor.cursorType === 'before' ? cursor.cursorValue : undefined,
        include: showDeleted.value ? 'deleted' : 'non-deleted',
        fields: 'owners',
      });
      data = page.data;
      if (seq === loadSeq) {
        handlePagingChange({
          after: page.after ?? '',
          before: page.before ?? '',
          total: page.total ?? 0,
        });
      }
    }
    if (seq === loadSeq) {
      singleKindServices.value = filterMetadataOpenMetadata(data, kind === 'metadata');
    }
  } catch (error) {
    // A failed fetch empties the list, resets paging, and toasts
    // the error (pin Services.tsx:155-218) — it never leaves stale
    // rows on screen.
    if (seq === loadSeq) {
      singleKindServices.value = [];
      handlePagingChange({ after: '', before: '', total: 0 });
      message.error(error instanceof Error ? error.message : t('crud.loadFailed'));
    }
  } finally {
    if (seq === loadSeq) {
      singleKindLoading.value = false;
    }
  }
}

/**
 * Reset paging, then reload. When the URL already sits at page 1
 * with no cursor, the reset changes nothing and the cursor watcher
 * below never fires, so the reload is issued directly; otherwise
 * the cursor watcher fires it once the URL settles.
 */
function resetAndReload(): void {
  const cursor = pagingCursor.value;
  const atStart = !cursor.cursorType && !cursor.cursorValue && cursor.currentPage === '1';
  resetPaging();
  if (atStart) {
    void loadSingleKind();
  }
}

watch(searchTerm, () => {
  if (isSingleKindMode.value) {
    resetAndReload();
  }
});

watch(typeFilter, () => {
  if (isSingleKindMode.value) {
    resetAndReload();
  }
});

watch(pagingCursor, () => {
  if (isSingleKindMode.value) {
    void loadSingleKind();
  }
});

function handleTableChange(
  _pagination: unknown,
  filters: Record<string, FilterValue | null>,
  _sorter: unknown,
  extra: { action: string },
): void {
  if (extra.action !== 'filter') {
    return;
  }
  const next = filters.serviceType;
  typeFilter.value = Array.isArray(next) ? next.map(String) : [];
}

function handlePaging(data: PagingHandlerParams): void {
  if (data.cursorType === 'after') {
    handlePageChange(data.currentPage, { cursorType: 'after', cursorValue: paging.value.after });
  } else if (data.cursorType === 'before') {
    handlePageChange(data.currentPage, { cursorType: 'before', cursorValue: paging.value.before });
  } else {
    handlePageChange(data.currentPage, { cursorType: null });
  }
}

function handleAddServiceClick(): void {
  const row = category.value;
  if (!row) {
    return;
  }
  // Interim until the R-10 category-level wizard URL lands: the
  // category travels as a query param the wizard reads.
  void router.push({ name: 'ingestion-service-add', query: { category: row.segment } });
}

function loadForMode(): void {
  if (isSingleKindMode.value) {
    resetAndReload();
  } else {
    void loadAggregate();
  }
}

watch([activeKind, healthFilter, showDeleted], () => {
  loadForMode();
});

onMounted(() => {
  void loadHealthCounts();
  void loadGate();
  loadForMode();
  getOrchestratorStatus()
    .catch(() => null)
    .finally(() => {
      airflowChecking.value = false;
    });
});
</script>

<template>
  <div data-tour-step="services" data-tour-page>
    <!-- Retained chrome (D-1 / D-16): health chips + kind tabs. -->
    <div class="services-list__health" data-testid="services-health-filter" role="group" :aria-label="t('ingestion.services.health')">
      <button
        type="button"
        class="services-list__health-chip"
        :class="{ 'services-list__health-chip--active': !healthFilter }"
        :aria-pressed="!healthFilter"
        data-testid="services-health-all"
        @click="setHealthFilter(undefined)"
      >
        {{ t('ingestion.services.allServices') }}
      </button>
      <button
        v-for="option in (['failing', 'healthy', 'notRun'] as const)"
        :key="option"
        type="button"
        class="services-list__health-chip"
        :class="{ 'services-list__health-chip--active': healthFilter === option }"
        :aria-pressed="healthFilter === option"
        :data-testid="`services-health-${option}`"
        @click="setHealthFilter(option)"
      >
        {{ t(`ingestion.services.health${option[0].toUpperCase()}${option.slice(1)}`) }} · {{ healthCounts[option] }}
      </button>
    </div>
    <Tabs :active-key="activeKind" data-testid="services-kind-tabs" @change="(key) => onCategoryChange(String(key))">
      <Tabs.TabPane key="all" :tab="t('ingestion.services.allKinds')" />
      <Tabs.TabPane
        v-for="row in supportedCategories"
        :key="row.key"
        :tab="t(row.labelKey)"
      />
    </Tabs>

    <template v-if="isSingleKindMode && category">
      <div v-if="gateState === 'checking'" class="services-list__gate-loading">
        <Skeleton active />
      </div>
      <PermissionPlaceholder
        v-else-if="gateState === 'denied'"
        :permission-value="t('settings.services.viewEntity', { entity: startCase(category.enumValue) })"
      />
      <template v-else-if="gateState === 'allowed'">
        <div class="services-list__header-row">
          <PageHeader
            :header="t(category.headerKey)"
            :sub-header="t(category.subHeaderKey)"
            learning-page-id="services"
          />
          <div class="services-list__add">
            <Skeleton.Button v-if="airflowChecking" active size="default" />
            <Tooltip
              v-else
              placement="left"
              :title="
                canCreate
                  ? t('settings.services.addEntity', { entity: t('settings.services.service') })
                  : t('message.no-permission-for-action')
              "
            >
              <span>
                <LimitWrapper v-if="canCreate" resource="dataAssets">
                  <Button type="primary" data-testid="add-service-button" @click="handleAddServiceClick">
                    {{ t('settings.services.addNewEntity', { entity: t('settings.services.service') }) }}
                  </Button>
                </LimitWrapper>
              </span>
            </Tooltip>
          </div>
        </div>
        <DomainFilterChip />

        <Row :gutter="16" class="services-list__toolbar">
          <Col :span="10">
            <Input
              v-model:value="searchInput"
              allow-clear
              :placeholder="t('settings.services.searchEntity', { entity: t(category.headerKey) })"
              data-testid="services-search"
            />
          </Col>
          <Col :span="14" class="services-list__toolbar-right">
            <div class="services-list__view-toggle" role="group">
              <Button
                size="small"
                :type="viewMode === 'table' ? 'primary' : 'default'"
                data-testid="services-view-table"
                @click="viewMode = 'table'"
              >
                {{ t('settings.services.view.table') }}
              </Button>
              <Button
                size="small"
                :type="viewMode === 'card' ? 'primary' : 'default'"
                data-testid="services-view-card"
                @click="viewMode = 'card'"
              >
                {{ t('settings.services.view.card') }}
              </Button>
            </div>
            <div class="services-list__show-deleted">
              <Switch v-model:checked="showDeleted" data-testid="show-deleted-switch" />
              <span>{{ t('crud.deleted') }}</span>
            </div>
          </Col>
        </Row>

        <template v-if="!singleKindLoading && singleKindServices.length === 0">
          <div v-if="isNarrowing" class="services-list__narrowed-empty">
            <NoDataPlaceholder test-id="no-data-placeholder" />
          </div>
          <div v-else class="services-list__empty" data-testid="services-empty-placeholder">
            <NoDataPlaceholder
              :title="t(category.emptyTitleKey)"
              :description="t(category.emptyDescriptionKey)"
            >
              <template #icon>
                <ServiceLogo :default-kind="category.kind" :size="48" test-id="services-empty-icon" />
              </template>
              <template v-if="canCreate" #footer>
                <LimitWrapper resource="dataAssets">
                  <Button type="primary" data-testid="add-placeholder-button" @click="handleAddServiceClick">
                    {{ t('settings.services.addNewEntity', { entity: t('settings.services.service') }) }}
                  </Button>
                </LimitWrapper>
              </template>
            </NoDataPlaceholder>
          </div>
        </template>

        <template v-else>
          <Table
            v-if="viewMode === 'table'"
            :columns="columns"
            :data-source="singleKindServices"
            :loading="singleKindLoading"
            :pagination="false"
            row-key="fullyQualifiedName"
            data-testid="services-table"
            @change="handleTableChange"
          >
            <template #customFilterDropdown="{ setSelectedKeys, selectedKeys, confirm }">
              <ColumnFilter
                :options="typeFilterOptions"
                :selected-values="(selectedKeys as string[])"
                :confirm="confirm"
                @change="setSelectedKeys($event)"
              />
            </template>
            <template #bodyCell="{ column, record }">
              <template v-if="column.key === 'name'">
                <div class="services-list__name-cell">
                  <ServiceLogo :source="logoSource(record as CatalogService)" :size="24" />
                  <a
                    href="#"
                    :data-testid="`service-name-${(record as CatalogService).name}`"
                    @click.prevent="openDetail(record as CatalogService)"
                  >
                    <HighlightedText
                      :text="getEntityName(record as CatalogService)"
                      :search-text="searchTerm"
                    />
                  </a>
                </div>
              </template>
              <template v-else-if="column.key === 'description'">
                <div class="services-list__description-cell">
                  <HighlightedText
                    v-if="searchTerm && (record as CatalogService).description"
                    :text="(record as CatalogService).description ?? ''"
                    :search-text="searchTerm"
                  />
                  <DescriptionCell
                    v-else
                    :markdown="(record as CatalogService).description ?? ''"
                  />
                </div>
              </template>
              <template v-else-if="column.key === 'serviceType'">
                <HighlightedText
                  :text="(record as CatalogService).serviceType"
                  :search-text="searchTerm"
                />
              </template>
              <template v-else-if="column.key === 'owners'">
                <ServiceChildOwnersCell :owners="(record as CatalogService).owners ?? []" />
              </template>
            </template>
          </Table>

          <Row v-else :gutter="[16, 16]">
            <Col
              v-for="entry in cardServices"
              :key="entry.service.fullyQualifiedName"
              :xs="24"
              :lg="8"
              :xl="6"
            >
              <div class="services-list__card">
                <div class="services-list__card-head">
                  <ServiceLogo :source="logoSource(entry.service)" :size="28" />
                  <a
                    href="#"
                    :data-testid="`service-name-${entry.service.name}`"
                    @click.prevent="openDetail(entry.service)"
                  >
                    {{ getEntityName(entry.service) }}
                  </a>
                </div>
                <div class="services-list__description-cell" data-testid="service-description">
                  <HighlightedText
                    v-if="searchTerm && entry.service.description"
                    :text="entry.service.description"
                    :search-text="searchTerm"
                  />
                  <DescriptionCell v-else :markdown="entry.service.description ?? ''" />
                </div>
                <div v-if="entry.field" :data-testid="entry.field.testId">
                  <span>{{ t(entry.field.labelKey) }}:</span>
                  {{ entry.field.value }}
                </div>
                <div class="services-list__card-type">
                  <span>{{ t('crud.type') }}:</span>
                  {{ entry.service.serviceType }}
                </div>
              </div>
            </Col>
          </Row>

          <NextPrevious
            v-if="showPagination"
            :paging="paging"
            :paging-handler="handlePaging"
            :page-size="pageSize"
            :current-page="currentPage"
            :is-number-based="numberBased"
            :is-loading="singleKindLoading"
            :page-size-options="[15, 25, 50]"
            :on-show-size-change="handlePageSizeChange"
          />
        </template>
      </template>
    </template>

    <!-- Retained aggregate interim. -->
    <template v-else>
      <div class="services-list__aggregate-head">
        <div>
          <h1>{{ t('ingestion.services.title') }}</h1>
          <p>{{ t('ingestion.services.lead') }}</p>
        </div>
        <Button type="primary" data-testid="create-service-wizard" @click="router.push({ name: 'ingestion-service-add' })">
          {{ t('ingestion.services.createWizard') }}
        </Button>
      </div>
      <div class="services-list__show-deleted">
        <Switch
          v-model:checked="showDeleted"
          data-testid="services-show-deleted"
          :aria-label="t('ingestion.services.showDeleted')"
        />
        <span>{{ t('ingestion.services.showDeleted') }}</span>
      </div>
      <Alert v-if="errorMessage" type="error" :message="errorMessage" show-icon class="services-list__error" />
      <Table
        :columns="aggregateColumns"
        :data-source="filteredServices"
        :loading="loading"
        :pagination="false"
        row-key="id"
        data-testid="services-table"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'name'">
            <a
              href="#"
              :data-testid="`service-row-${(record as CatalogService).id}`"
              @click.prevent="openDetail(record as CatalogService)"
            >
              {{ getEntityName(record as CatalogService) }}
            </a>
          </template>
        </template>
      </Table>
    </template>
  </div>
</template>

<style scoped>
.services-list__health {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 12px;
}

.services-list__health-chip {
  border: 1px solid var(--sm-border-color);
  border-radius: 999px;
  background: var(--sm-bg-container);
  cursor: pointer;
  padding: 4px 12px;
  font-size: 12px;
}

.services-list__health-chip--active {
  border-color: var(--sm-color-primary);
  color: var(--sm-color-primary);
  font-weight: 600;
}

.services-list__header-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 12px;
}

.services-list__toolbar {
  margin-top: 12px;
  margin-bottom: 12px;
}

.services-list__toolbar-right {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 16px;
}

.services-list__view-toggle {
  display: inline-flex;
  gap: 4px;
}

.services-list__show-deleted {
  display: flex;
  align-items: center;
  gap: 8px;
}

.services-list__name-cell {
  display: flex;
  align-items: center;
  gap: 8px;
}

.services-list__description-cell {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  word-break: break-all;
}

.services-list__narrowed-empty {
  position: relative;
  min-height: 240px;
}

.services-list__empty {
  position: relative;
  min-height: 400px;
}

.services-list__card {
  border: 1px solid var(--sm-border-color);
  border-radius: var(--sm-border-radius);
  background: var(--sm-bg-container);
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  height: 100%;
}

.services-list__card-head {
  display: flex;
  align-items: center;
  gap: 8px;
}

.services-list__card-type {
  display: flex;
  gap: 4px;
}

.services-list__aggregate-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 12px;
}

.services-list__error {
  margin-bottom: 12px;
}

.services-list__gate-loading {
  padding: 24px 0;
}
</style>
