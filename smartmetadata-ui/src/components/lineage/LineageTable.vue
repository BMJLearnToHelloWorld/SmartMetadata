<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute, useRouter } from 'vue-router';
import {
  Badge,
  Button,
  Dropdown,
  Menu,
  Space,
  Tag,
  message,
  type TableProps,
} from 'ant-design-vue';
import {
  exportLineageByEntityCountAsync,
  getLineageByEntityCount,
  getLineagePagingData,
  searchLineage,
  type LineageTableDirection,
} from '@/api/lineage';
import { markCsvJobOwned } from '@/api/csvJobs';
import { assetLocation } from '@/catalog/entityRoutes';
import { LIST_PAGE_SIZE_OPTIONS, PAGE_SIZE_BASE } from '@/catalog/servicePaging';
import HighlightedText from '@/components/ingestion/HighlightedText.vue';
import HoverCard from '@/components/shared/HoverCard.vue';
import NoDataPlaceholder from '@/components/shared/NoDataPlaceholder.vue';
import SmTable from '@/components/shared/SmTable.vue';
import { EMPTY_REFERENCE_LIST_TEXT } from '@/utils/columns';
import { resolveLineageTimeRange } from '@/lineage/config';
import {
  buildImpactColumnFilter,
  buildImpactQueryFilter,
  columnLevelNodesFromSearchLineage,
  countImpactDirectionTotals,
  depthOptionsFromPagingInfo,
  lastFqnSegment,
  parseLineageEntityCountResponse,
  parseLineagePaginationInfo,
  parseLineageTableUrlParams,
  type LineageImpactLevel,
  type LineagePaginationInfo,
  type LineageTableColumnRow,
  type LineageTableEntityRef,
  type LineageTableRow,
} from '@/lineage/lineageTable';
import { useLineageStore } from '@/stores/lineage';
import LineageTableDescription from './LineageTableDescription.vue';

/**
 * Server-backed impact analysis — the Vue port of pin
 * `components/LineageTable/LineageTable.tsx` (a3012259ca). Table level
 * fetches `getLineageByEntityCount` (server-paged); column level fetches
 * `getLineageDataByFQN` in one direction and expands its edges into
 * per-column rows. This replaces the client-side BFS `LineageImpactPanel`
 * (D-GRAPH-3): pin has no BFS impact — its impact tab IS this table.
 *
 * Mount contract (for L6's tab wiring): `<LineageTable
 * :entity-type="entityType" :fqn="fqn" />`. The component reads
 * `dir`/`depth`/`currentPage`/`pageSize` from the route query and
 * writes `dir`/`depth`/paging back with `router.replace` (pin's
 * `updateURLParams`); config depths and quick filters come from the
 * shared lineage store, exactly like pin's `useLineageStore`. The
 * search term arrives as a prop from the canvas header (pin's
 * `CustomControls` search bar, debounced there); the table reports its
 * depth options upward (`update:depth-options`) for the header's
 * depth dropdown, and exposes `exportCsv` + `hasRows` for the header's
 * impact-tab CSV item.
 *
 * Header scope: pin's table header is only `extraTableFilters`
 * (`LineageTable.tsx:459-520`) — the direction toggle and the
 * impact-on dropdown. The depth select, search input and CSV export
 * live in the canvas header (`CustomControls`), not here.
 */
const props = withDefaults(
  defineProps<{
    entityType: string;
    fqn: string;
    /** Impact search term from the canvas header (already debounced). */
    searchValue?: string;
  }>(),
  { searchValue: '' },
);

const emit = defineEmits<{
  'update:depth-options': [options: number[]];
}>();

const route = useRoute();
const router = useRouter();
const { t } = useI18n();
const lineageStore = useLineageStore();

const level = ref<LineageImpactLevel>('table');
/** Search term from the canvas header (debounced there, 300ms). */
const searchValue = computed(() => props.searchValue ?? '');
const loading = ref(false);
const exporting = ref(false);
const tableRows = ref<LineageTableRow[]>([]);
const columnRows = ref<LineageTableColumnRow[]>([]);
const pagingInfo = ref<LineagePaginationInfo | null>(null);
/** Pin's `paginationInfoKeyRef`: pagination info is re-requested only when the fetch shape changes. */
const paginationInfoKey = ref<string | null>(null);

const urlParams = computed(() =>
  parseLineageTableUrlParams(route.query, lineageStore.config.upstreamDepth, lineageStore.config.downstreamDepth),
);
const direction = computed(() => urlParams.value.direction);
const nodeDepth = computed(() => urlParams.value.nodeDepth);
const currentPage = ref(urlParams.value.currentPage);
const pageSize = ref(urlParams.value.pageSize);

const queryFilter = computed(() =>
  buildImpactQueryFilter(lineageStore.quickFilters, searchValue.value, level.value),
);
const columnFilter = computed(() =>
  buildImpactColumnFilter(lineageStore.quickFilters, searchValue.value, level.value),
);

/** Pin's direction counts: table level from paging info, column level from the fetched rows. */
const total = computed(() => {
  if (level.value === 'column') {
    return columnRows.value.length;
  }
  const totals = countImpactDirectionTotals(pagingInfo.value, nodeDepth.value);
  return direction.value === 'Upstream' ? totals.upstreamCount : totals.downstreamCount;
});

/** Pin's `nodeDepthOptions` from paging info; the current depth alone when none is known yet. */
const depthOptions = computed(() => {
  const options = depthOptionsFromPagingInfo(pagingInfo.value, direction.value);
  const values = options.length > 0 ? options : [nodeDepth.value];
  return values.map((depth) => ({ value: depth, label: String(depth) }));
});

/** The canvas header owns the depth dropdown; it needs these options. */
watch(
  depthOptions,
  (options) => {
    emit(
      'update:depth-options',
      options.map((option) => option.value),
    );
  },
  { immediate: true },
);

const displayedColumnRows = computed(() =>
  columnRows.value.slice((currentPage.value - 1) * pageSize.value, currentPage.value * pageSize.value),
);
const displayedRows = computed(() => (level.value === 'table' ? tableRows.value : displayedColumnRows.value));
const hasRows = computed(() =>
  level.value === 'table' ? tableRows.value.length > 0 : columnRows.value.length > 0,
);

const tableColumns = computed(() => [
  { title: t('crud.name'), dataIndex: 'name', key: 'name' },
  { title: t('lineage.impactNodeDepth'), dataIndex: 'nodeDepth', key: 'nodeDepth' },
  { title: t('lineage.impactDescription'), dataIndex: 'description', key: 'description' },
  { title: t('lineage.impactDomains'), dataIndex: 'domains', key: 'domains' },
  { title: t('lineage.impactOwners'), dataIndex: 'owners', key: 'owners' },
  { title: t('lineage.impactTier'), dataIndex: 'tier', key: 'tier' },
  { title: t('lineage.impactTags'), dataIndex: 'tags', key: 'tags' },
  { title: t('lineage.impactGlossaryTerms'), dataIndex: 'tags', key: 'glossaryTerms' },
]);

const columnImpactColumns = computed(() => [
  { title: t('lineage.impactSource'), dataIndex: 'fromEntity', key: 'fromEntity' },
  { title: t('lineage.impactSourceColumns'), dataIndex: 'fromColumn', key: 'fromColumn' },
  { title: t('lineage.impactImpacted'), dataIndex: 'toEntity', key: 'toEntity' },
  { title: t('lineage.impactImpactedColumns'), dataIndex: 'toColumn', key: 'toColumn' },
  ...tableColumns.value.slice(1),
]);

const columns = computed(() => (level.value === 'table' ? tableColumns.value : columnImpactColumns.value));

function writeQuery(next: Record<string, string>): void {
  void router.replace({ query: { ...route.query, ...next } }).catch(() => undefined);
}

function writePagingToUrl(): void {
  writeQuery({ currentPage: String(currentPage.value), pageSize: String(pageSize.value) });
}

function resetPage(): void {
  if (currentPage.value === 1) {
    return;
  }
  currentPage.value = 1;
  writePagingToUrl();
}

// Any narrowing/widening of the result set (search term, quick filter,
// or node-depth change) must re-fetch starting from page 1, otherwise
// a stale currentPage can request a `from` offset past the narrowed
// result count and render an empty table (pin LineageTable.tsx).
const previousNodeDepth = ref(nodeDepth.value);
watch(nodeDepth, (next) => {
  if (previousNodeDepth.value === next) {
    return;
  }
  previousNodeDepth.value = next;
  resetPage();
});

// Back/forward navigation (or an external URL edit) re-syncs paging;
// writes from this component already carry the same values, so the
// guards make the sync a no-op on its own writes.
watch(urlParams, (next) => {
  if (next.currentPage !== currentPage.value) {
    currentPage.value = next.currentPage;
  }
  if (next.pageSize !== pageSize.value) {
    pageSize.value = next.pageSize;
  }
});

watch(searchValue, () => resetPage());

async function loadTableLevel(): Promise<void> {
  const paginationKey = JSON.stringify({
    fqn: props.fqn,
    entityType: props.entityType,
    upstreamDepth: lineageStore.config.upstreamDepth,
    downstreamDepth: lineageStore.config.downstreamDepth,
    queryFilter: queryFilter.value,
    direction: direction.value,
    columnFilter: columnFilter.value,
  });
  const shouldIncludePaginationInfo = paginationInfoKey.value !== paginationKey;
  const payload = await getLineageByEntityCount({
    fqn: props.fqn,
    entityType: props.entityType,
    direction: direction.value,
    nodeDepth: nodeDepth.value,
    maxDepth: nodeDepth.value,
    upstreamDepth: lineageStore.config.upstreamDepth,
    downstreamDepth: lineageStore.config.downstreamDepth,
    from: (currentPage.value - 1) * pageSize.value,
    size: pageSize.value,
    ...(queryFilter.value ? { queryFilter: queryFilter.value } : {}),
    ...(columnFilter.value ? { columnFilter: columnFilter.value } : {}),
    includePaginationInfo: shouldIncludePaginationInfo,
  });
  const result = parseLineageEntityCountResponse(payload, props.fqn);
  if (shouldIncludePaginationInfo) {
    if (result.paginationInfo) {
      pagingInfo.value = result.paginationInfo;
      paginationInfoKey.value = paginationKey;
    } else {
      // The count endpoint may omit pagination info; recover it from
      // the dedicated endpoint instead of rendering empty depth
      // options and zero direction counts. A failure leaves the key
      // unset so the next fetch retries.
      try {
        const info = parseLineagePaginationInfo(
          await getLineagePagingData({
            fqn: props.fqn,
            upstreamDepth: lineageStore.config.upstreamDepth,
            downstreamDepth: lineageStore.config.downstreamDepth,
            entityType: props.entityType,
            ...(queryFilter.value ? { queryFilter: queryFilter.value } : {}),
          }),
        );
        pagingInfo.value = info;
        paginationInfoKey.value = info ? paginationKey : null;
      } catch {
        pagingInfo.value = null;
        paginationInfoKey.value = null;
      }
    }
  }
  tableRows.value = result.rows;
}

async function loadColumnLevel(): Promise<void> {
  const payload = await searchLineage({
    entityType: props.entityType,
    fqn: props.fqn,
    upstreamDepth: direction.value === 'Upstream' ? nodeDepth.value : 0,
    downstreamDepth: direction.value === 'Downstream' ? nodeDepth.value : 0,
    direction: direction.value,
    size: lineageStore.config.nodesPerLayer,
    ...(queryFilter.value ? { queryFilter: queryFilter.value } : {}),
    ...(columnFilter.value ? { columnFilter: columnFilter.value } : {}),
  });
  columnRows.value = columnLevelNodesFromSearchLineage(payload, direction.value);
}

async function load(): Promise<void> {
  loading.value = true;
  try {
    if (level.value === 'column') {
      await loadColumnLevel();
    } else {
      await loadTableLevel();
    }
  } catch (error) {
    // Pin shows an error toast and clears the rows; the paging-info
    // key resets at table level so the next fetch re-requests it.
    message.error(error instanceof Error ? error.message : t('lineage.loadFailed'));
    tableRows.value = [];
    columnRows.value = [];
    if (level.value === 'table') {
      paginationInfoKey.value = null;
      pagingInfo.value = null;
    }
  } finally {
    loading.value = false;
  }
}

const fetchKey = computed(() =>
  JSON.stringify({
    fqn: props.fqn,
    entityType: props.entityType,
    direction: direction.value,
    nodeDepth: nodeDepth.value,
    level: level.value,
    queryFilter: queryFilter.value,
    columnFilter: columnFilter.value,
    currentPage: currentPage.value,
    pageSize: pageSize.value,
    upstreamDepth: lineageStore.config.upstreamDepth,
    downstreamDepth: lineageStore.config.downstreamDepth,
  }),
);

watch(fetchKey, () => {
  void load();
}, { immediate: true });

function onDirectionChange(next: LineageTableDirection): void {
  if (next === direction.value) {
    return;
  }
  currentPage.value = 1;
  writeQuery({
    dir: next,
    depth: String(next === 'Upstream' ? lineageStore.config.upstreamDepth : lineageStore.config.downstreamDepth),
    currentPage: '1',
  });
}

function onLevelChange(next: LineageImpactLevel): void {
  if (next === level.value) {
    return;
  }
  level.value = next;
  // Pin clears the quick-filter values on a level switch: the column
  // filter keys mean different things per level.
  lineageStore.setQuickFilters([]);
  currentPage.value = 1;
  writePagingToUrl();
}

type TableChangePagination = Parameters<NonNullable<TableProps['onChange']>>[0];

function onTableChange(pagination: TableChangePagination): void {
  const nextPage = pagination.current ?? 1;
  const nextSize = pagination.pageSize ?? PAGE_SIZE_BASE;
  if (nextPage === currentPage.value && nextSize === pageSize.value) {
    return;
  }
  currentPage.value = nextPage;
  pageSize.value = nextSize;
  writePagingToUrl();
}

/** Pin's impact-mode export: CSV only, via `exportLineageByEntityCountAsync` (CustomControls `handleImpactAnalysisExport`). */
async function onExportCsv(): Promise<void> {
  exporting.value = true;
  try {
    const range = resolveLineageTimeRange(lineageStore.config);
    const { jobId } = await exportLineageByEntityCountAsync({
      fqn: props.fqn,
      entityType: props.entityType,
      direction: direction.value,
      nodeDepth: nodeDepth.value,
      maxDepth: nodeDepth.value,
      ...(queryFilter.value ? { queryFilter: queryFilter.value } : {}),
      ...(range.startTime !== undefined ? { startTime: range.startTime } : {}),
      ...(range.endTime !== undefined ? { endTime: range.endTime } : {}),
    });
    if (jobId) {
      markCsvJobOwned(jobId);
    }
  } catch (error) {
    message.error(error instanceof Error ? error.message : t('lineage.loadFailed'));
  } finally {
    exporting.value = false;
  }
}

function asTableRow(record: unknown): LineageTableRow {
  return record as LineageTableRow;
}

function asColumnRow(record: unknown): LineageTableColumnRow {
  return record as LineageTableColumnRow;
}

function entityLink(ref: LineageTableEntityRef): string {
  return lastFqnSegment(ref.fullyQualifiedName);
}

/** The canvas header's impact-tab CSV item calls through here. */
defineExpose({ exportCsv: onExportCsv, hasRows });
</script>

<template>
  <div data-testid="lineage-card-table">
    <Space wrap align="center" class="lineage-table__header">
      <Space.Compact>
        <Button
          data-testid="lineage-impact-upstream"
          :type="direction === 'Upstream' ? 'primary' : 'default'"
          @click="() => onDirectionChange('Upstream')"
        >
          {{ t('lineage.impactUpstream') }}
          <Badge v-if="direction === 'Upstream'" :count="total" size="small" :show-zero="false" />
        </Button>
        <Button
          data-testid="lineage-impact-downstream"
          :type="direction === 'Downstream' ? 'primary' : 'default'"
          @click="() => onDirectionChange('Downstream')"
        >
          {{ t('lineage.impactDownstream') }}
          <Badge v-if="direction === 'Downstream'" :count="total" size="small" :show-zero="false" />
        </Button>
      </Space.Compact>
      <Dropdown :trigger="['click']">
        <Button data-testid="impact-on-dropdown">
          {{ t('lineage.impactOn', { area: t(level === 'table' ? 'lineage.impactTableLevel' : 'lineage.impactColumnLevel') }) }}
        </Button>
        <template #overlay>
          <Menu>
            <Menu.Item key="table" data-testid="impact-on-table" @click="() => onLevelChange('table')">
              {{ t('lineage.impactTableLevel') }}
            </Menu.Item>
            <Menu.Item key="column" data-testid="impact-on-column" @click="() => onLevelChange('column')">
              {{ t('lineage.impactColumnLevel') }}
            </Menu.Item>
          </Menu>
        </template>
      </Dropdown>
    </Space>
    <NoDataPlaceholder
      v-if="!loading && displayedRows.length === 0"
      test-id="no-data-placeholder"
      :description="t('lineage.impactEmpty')"
    />
    <SmTable
      v-else
      :columns="columns"
      :data-source="displayedRows"
      :row-key="level === 'table' ? 'fullyQualifiedName' : 'docId'"
      :loading="loading"
      :pagination="{
        current: currentPage,
        pageSize,
        total,
        showSizeChanger: true,
        pageSizeOptions: LIST_PAGE_SIZE_OPTIONS.map(String),
      }"
      :on-change="onTableChange"
      test-id="lineage-impact-table"
    >
      <template #bodyCell="{ column, record }">
        <template v-if="column.key === 'name'">
          <HoverCard>
            <RouterLink
              :to="assetLocation(asTableRow(record).entityType, asTableRow(record).fullyQualifiedName)"
              data-testid="impact-name-link"
            >
              <HighlightedText
                :text="asTableRow(record).displayName || asTableRow(record).name"
                :search-text="searchValue"
              />
            </RouterLink>
            <template #content>
              <div>{{ asTableRow(record).displayName || asTableRow(record).name }}</div>
              <div>{{ asTableRow(record).entityType }} · {{ asTableRow(record).fullyQualifiedName }}</div>
            </template>
          </HoverCard>
        </template>
        <template v-else-if="column.key === 'nodeDepth'">
          {{ Math.abs(level === 'table' ? asTableRow(record).nodeDepth : asColumnRow(record).nodeDepth) }}
        </template>
        <template v-else-if="column.key === 'description'">
          <LineageTableDescription
            v-if="level === 'table'"
            :description="asTableRow(record).description"
            :entity-path="assetLocation(asTableRow(record).entityType, asTableRow(record).fullyQualifiedName)"
          />
          <LineageTableDescription v-else :description="asColumnRow(record).description" />
        </template>
        <template v-else-if="column.key === 'domains'">
          <template v-if="(level === 'table' ? asTableRow(record).domains : asColumnRow(record).domains).length === 0">
            <span>{{ EMPTY_REFERENCE_LIST_TEXT }}</span>
          </template>
          <template v-else>
            <span
              v-for="domain in (level === 'table' ? asTableRow(record).domains : asColumnRow(record).domains)"
              :key="domain.id || domain.fullyQualifiedName"
            >
              {{ domain.displayName || domain.name }}
            </span>
          </template>
        </template>
        <template v-else-if="column.key === 'owners'">
          <template v-if="(level === 'table' ? asTableRow(record).owners : asColumnRow(record).owners).length === 0">
            <span>{{ EMPTY_REFERENCE_LIST_TEXT }}</span>
          </template>
          <template v-else>
            <span
              v-for="owner in (level === 'table' ? asTableRow(record).owners : asColumnRow(record).owners)"
              :key="owner.id || owner.fullyQualifiedName"
            >
              {{ owner.displayName || owner.name }}
            </span>
          </template>
        </template>
        <template v-else-if="column.key === 'tier'">
          <span v-if="!(level === 'table' ? asTableRow(record).tier : asColumnRow(record).tier)">
            {{ EMPTY_REFERENCE_LIST_TEXT }}
          </span>
          <Tag v-else>{{ level === 'table' ? asTableRow(record).tier : asColumnRow(record).tier }}</Tag>
        </template>
        <template v-else-if="column.key === 'tags'">
          <template v-if="(level === 'table' ? asTableRow(record).tags : asColumnRow(record).tags).length === 0">
            <span>{{ EMPTY_REFERENCE_LIST_TEXT }}</span>
          </template>
          <template v-else>
            <Tag
              v-for="tag in (level === 'table' ? asTableRow(record).tags : asColumnRow(record).tags)"
              :key="tag.tagFQN"
            >
              {{ tag.name || tag.tagFQN }}
            </Tag>
          </template>
        </template>
        <template v-else-if="column.key === 'glossaryTerms'">
          <template v-if="(level === 'table' ? asTableRow(record).glossaryTerms : asColumnRow(record).glossaryTerms).length === 0">
            <span>{{ EMPTY_REFERENCE_LIST_TEXT }}</span>
          </template>
          <template v-else>
            <Tag
              v-for="tag in (level === 'table' ? asTableRow(record).glossaryTerms : asColumnRow(record).glossaryTerms)"
              :key="tag.tagFQN"
            >
              {{ tag.name || tag.tagFQN }}
            </Tag>
          </template>
        </template>
        <template v-else-if="column.key === 'fromEntity'">
          <RouterLink
            :to="assetLocation(asColumnRow(record).fromEntity.type, asColumnRow(record).fromEntity.fullyQualifiedName)"
          >
            <HighlightedText :text="entityLink(asColumnRow(record).fromEntity)" :search-text="searchValue" />
          </RouterLink>
        </template>
        <template v-else-if="column.key === 'toEntity'">
          <RouterLink
            :to="assetLocation(asColumnRow(record).toEntity.type, asColumnRow(record).toEntity.fullyQualifiedName)"
          >
            <HighlightedText :text="entityLink(asColumnRow(record).toEntity)" :search-text="searchValue" />
          </RouterLink>
        </template>
        <template v-else-if="column.key === 'fromColumn'">
          <span v-if="!asColumnRow(record).fromColumn">{{ EMPTY_REFERENCE_LIST_TEXT }}</span>
          <HighlightedText
            v-else
            :text="lastFqnSegment(asColumnRow(record).fromColumn ?? '')"
            :search-text="searchValue"
          />
        </template>
        <template v-else-if="column.key === 'toColumn'">
          <span v-if="!asColumnRow(record).toColumn">{{ EMPTY_REFERENCE_LIST_TEXT }}</span>
          <HighlightedText
            v-else
            :text="lastFqnSegment(asColumnRow(record).toColumn ?? '')"
            :search-text="searchValue"
          />
        </template>
      </template>
    </SmTable>
  </div>
</template>

<style scoped>
.lineage-table__header {
  margin-bottom: 12px;
}
</style>
