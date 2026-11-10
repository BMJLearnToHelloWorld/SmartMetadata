<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute, useRouter } from 'vue-router';
import {
  Avatar,
  Button,
  Card,
  Checkbox,
  Dropdown,
  Empty,
  Input,
  Menu,
  message,
  Modal,
  Select,
  Skeleton,
  Space,
  Table,
  Tag,
  Typography,
} from 'ant-design-vue';
import {
  buildMetricStatusQueryFilter,
  deleteMetricAsync,
  exportMetricsCsvAsync,
  getMetricAncestorFqns,
  getMetricGroupMetrics,
  getMetricHierarchy,
  getMetricParentIds,
  getMetricSearchPaths,
  listMetrics,
  METRIC_STATUS_VALUES,
  METRIC_TREE_FIELDS,
  type Metric,
  type MetricGroup,
  type MetricHierarchyItem,
} from '@/api/metrics';
import { markCsvJobOwned } from '@/api/csvJobs';
import { searchAssets } from '@/api/search';
import { composeSearchQuery } from '@/catalog/searchQuery';
import PageHeader from '@/components/shared/PageHeader.vue';
import LimitWrapper from '@/components/shared/LimitWrapper.vue';
import MetricCreateDrawer from '@/components/governance/MetricCreateDrawer.vue';
import MetricHealthCell from '@/components/governance/MetricHealthCell.vue';
import {
  getTopmostSelectedMetrics,
  getUnloadedMetricAncestorIds,
  waitForMetricsGone,
  type MetricParentLink,
} from '@/features/metrics/metricBulkDelete';
import { useMetricCreateDrawer } from '@/features/metrics/useMetricCreateDrawer';
import { useBulkEditScopeStore } from '@/stores/bulkEditScope';
import { usePermissionStore } from '@/stores/permissions';
import type { EntityRef, SearchHit, TagRef } from '@/types/api';
import { entityLabel } from '@/features/crud/paging';

/**
 * Official MetricListPage (pages/MetricsPage/MetricListPage) equivalent:
 * tree mode by default, flat search mode once a status filter is set
 * (`isTreeMode = !statusFilter`).
 *
 * Permission gates, per official §1.2 and
 * ADR:2026-11-07-metrics-list-permissions-and-limits — resource `metric`,
 * fail-closed on fetch failure, entries hidden (not disabled) when ungated:
 * - View (ViewBasic || ViewAll): without it the page renders a
 *   no-permission state and sends no list request.
 * - Create (`canCreate`): the create button, wrapped in <LimitWrapper
 *   resource="metric"> (limit fetch failure fails open — the opposite
 *   of the permission failure below).
 * - Import/export (`canEditAll`): the ⋮ actions menu.
 * - Bulk edit (`canEditAll`): the bulk-edit entries.
 * - Bulk delete (`canDelete`): the bulk-bar Delete button.
 * A permission fetch failure renders the no-permission state (fail-closed).
 */
const METRIC_VIEW_STORAGE_KEY = 'metricsList.viewMode.v1';
const METRIC_PAGE_SIZE_STORAGE_KEY = 'metricsList.pageSize.v1';
const METRIC_COLUMN_PREFERENCE_KEY = 'metricList';
const TABLE_PAGE_SIZE_OPTIONS = [15, 25, 50] as const;
const CARD_PAGE_SIZE_OPTIONS = [12, 24, 48] as const;
const METRIC_CHILDREN_PAGE_SIZE = 50;
const MAX_INDENT_DEPTH = 3;
const SEARCH_DEBOUNCE_MS = 500;

type MetricViewMode = 'card' | 'table';
type MetricColumnId =
  | 'description'
  | 'glossary'
  | 'entityStatus'
  | 'health'
  | 'owners'
  | 'tags'
  | 'domains'
  | 'updatedAt';

const ALL_COLUMN_IDS: MetricColumnId[] = [
  'description',
  'glossary',
  'entityStatus',
  'health',
  'owners',
  'tags',
  'domains',
  'updatedAt',
];
const DEFAULT_VISIBLE_COLUMNS: MetricColumnId[] = [
  'description',
  'glossary',
  'entityStatus',
  'health',
  'owners',
];

const STATUS_I18N_KEY: Record<string, string> = {
  Approved: 'approved',
  Archived: 'archived',
  Deprecated: 'deprecated',
  Draft: 'draft',
  'In Review': 'inReview',
  Rejected: 'rejected',
  Unprocessed: 'unprocessed',
};

interface MetricRowData {
  id: string;
  name: string;
  displayName?: string;
  fullyQualifiedName: string;
  description?: string;
  metricType?: string;
  granularity?: string;
  entityStatus?: string;
  childrenCount?: number;
  owners: EntityRef[];
  tags: TagRef[];
  domains: EntityRef[];
  updatedAt?: number;
}

interface MetricRow {
  key: string;
  kind: 'metric' | 'group' | 'loadMore';
  depth: number;
  data?: MetricRowData;
  group?: MetricGroup;
  memberCount?: number;
  loadMore?: {
    scope: 'children' | 'group';
    parentId: string;
    parentFqn: string;
    groupId?: string;
    after?: string;
    remaining: number;
  };
}

function rowDataFromMetric(metric: Metric): MetricRowData {
  return {
    id: metric.id,
    name: metric.name,
    displayName: metric.displayName,
    fullyQualifiedName: metric.fullyQualifiedName,
    description: metric.description,
    metricType: metric.metricType,
    granularity: metric.granularity,
    entityStatus: metric.entityStatus,
    childrenCount: metric.childrenCount,
    owners: metric.owners,
    tags: metric.tags,
    domains: metric.domains,
    updatedAt: undefined,
  };
}

function rowDataFromHit(hit: SearchHit): MetricRowData {
  return {
    id: hit.id ?? hit.fullyQualifiedName,
    name: hit.name,
    displayName: hit.displayName,
    fullyQualifiedName: hit.fullyQualifiedName,
    description: hit.description,
    metricType: hit.metricType,
    granularity: hit.granularity,
    entityStatus: hit.entityStatus,
    childrenCount: hit.childrenCount,
    owners: hit.owners,
    tags: hit.tags,
    domains: hit.domains ?? [],
    updatedAt: hit.updatedAt,
  };
}

function getInitialViewMode(): MetricViewMode {
  try {
    const stored = window.localStorage.getItem(METRIC_VIEW_STORAGE_KEY);
    if (stored === 'card' || stored === 'table') {
      return stored;
    }
  } catch {
    // A denied storage read falls through to the width default.
  }
  return window.matchMedia?.('(max-width: 767px)').matches ? 'card' : 'table';
}

function readPageSizes(): { table: number; card: number } {
  const fallback = { table: TABLE_PAGE_SIZE_OPTIONS[0], card: CARD_PAGE_SIZE_OPTIONS[0] };
  try {
    const parsed = JSON.parse(
      window.localStorage.getItem(METRIC_PAGE_SIZE_STORAGE_KEY) ?? '',
    ) as { table?: unknown; card?: unknown };
    return {
      table: (TABLE_PAGE_SIZE_OPTIONS as readonly number[]).includes(Number(parsed.table))
        ? Number(parsed.table)
        : fallback.table,
      card: (CARD_PAGE_SIZE_OPTIONS as readonly number[]).includes(Number(parsed.card))
        ? Number(parsed.card)
        : fallback.card,
    };
  } catch {
    return fallback;
  }
}

function readVisibleColumns(): MetricColumnId[] {
  try {
    const parsed = JSON.parse(
      window.localStorage.getItem(METRIC_COLUMN_PREFERENCE_KEY) ?? '',
    ) as unknown;
    if (Array.isArray(parsed)) {
      const kept = parsed.filter((item): item is MetricColumnId =>
        (ALL_COLUMN_IDS as string[]).includes(String(item)),
      );
      return kept.length > 0 ? kept : [...DEFAULT_VISIBLE_COLUMNS];
    }
  } catch {
    // Corrupt preferences fall back to the official default columns.
  }
  return [...DEFAULT_VISIBLE_COLUMNS];
}

const { t } = useI18n();
const router = useRouter();
const route = useRoute();
const permissionStore = usePermissionStore();
const scopeStore = useBulkEditScopeStore();

const permState = ref<'loading' | 'ready' | 'denied' | 'error'>('loading');
const permError = ref('');
const resourceOps = ref<Record<string, boolean>>({});
const isAdmin = computed(() => permissionStore.isAdminUser);
const hasView = computed(
  () => isAdmin.value || resourceOps.value.ViewAll === true || resourceOps.value.ViewBasic === true,
);
const canEditAll = computed(() => isAdmin.value || resourceOps.value.EditAll === true);
const canCreate = computed(() => isAdmin.value || resourceOps.value.Create === true);
const canDelete = computed(() => isAdmin.value || resourceOps.value.Delete === true);
const createDrawer = useMetricCreateDrawer();
const isExporting = ref(false);
const deleteDialogOpen = ref(false);
const isDeletingMetrics = ref(false);

const searchText = ref('');
const debouncedSearch = ref('');
const statusFilter = ref('');
const isTreeMode = computed(() => statusFilter.value === '');
const viewMode = ref<MetricViewMode>(getInitialViewMode());
const pageSizes = ref(readPageSizes());
const pageSize = computed(() =>
  viewMode.value === 'card' ? pageSizes.value.card : pageSizes.value.table,
);
const visibleColumns = ref<MetricColumnId[]>(readVisibleColumns());
const page = ref(1);
const total = ref(0);
const totalPages = computed(() => Math.max(1, Math.ceil(total.value / pageSize.value)));
const loading = ref(false);
const errorMessage = ref('');

const topItems = ref<MetricHierarchyItem[]>([]);
const childrenByParent = ref<
  Record<string, { rows: Metric[]; after?: string; total: number }>
>({});
const groupMembers = ref<
  Record<string, { rows: Metric[]; offset: number; total: number }>
>({});
const expandedMetricIds = ref(new Set<string>());
const expandedGroupIds = ref(new Set<string>());
const loadingChildren = ref(new Set<string>());
const loadingGroups = ref(new Set<string>());
const searchPaths = ref<{
  matchIds: Set<string>;
  ancestorIds: Set<string>;
  complete: boolean;
} | null>(null);
const flatHits = ref<SearchHit[]>([]);
const selectedKeys = ref<string[]>([]);
let searchTimer: ReturnType<typeof setTimeout> | undefined;
let highlightDoneFor: string | undefined;
let loadSeq = 0;

const statusOptions = computed(() => [
  { value: '', label: t('metrics.statusAll') },
  ...METRIC_STATUS_VALUES.map((value) => ({
    value,
    label: t(`metrics.status.${STATUS_I18N_KEY[value] ?? value}`),
  })),
]);

const columns = computed(() => {
  const defs: Array<{ title: string; dataIndex: string; key: string }> = [
    { title: t('crud.name'), dataIndex: 'name', key: 'name' },
  ];
  for (const id of ALL_COLUMN_IDS) {
    if (!visibleColumns.value.includes(id)) {
      continue;
    }
    defs.push({ title: t(`metrics.column${id[0]?.toUpperCase()}${id.slice(1)}`), dataIndex: id, key: id });
  }
  return defs;
});

const rowSelection = computed(() => ({
  selectedRowKeys: selectedKeys.value,
  onChange: (keys: unknown) => {
    selectedKeys.value = (keys as string[]).filter((key) => typeof key === 'string');
  },
  getCheckboxProps: (record: MetricRow) => ({ disabled: record.kind !== 'metric' }),
}));

function toggleSelect(data: MetricRowData): void {
  selectedKeys.value = selectedKeys.value.includes(data.id)
    ? selectedKeys.value.filter((key) => key !== data.id)
    : [...selectedKeys.value, data.id];
}

function isRowVisible(data: MetricRowData): boolean {
  if (!debouncedSearch.value || !searchPaths.value?.complete) {
    return true;
  }
  return (
    searchPaths.value.matchIds.has(data.id) || searchPaths.value.ancestorIds.has(data.id)
  );
}

const treeRows = computed<MetricRow[]>(() => {
  const rows: MetricRow[] = [];
  const appendChildren = (parentId: string, parentFqn: string, depth: number): void => {
    const page = childrenByParent.value[parentId];
    if (!page) {
      return;
    }
    for (const child of page.rows) {
      const data = rowDataFromMetric(child);
      if (!isRowVisible(data)) {
        continue;
      }
      rows.push({ key: child.fullyQualifiedName, kind: 'metric', depth, data });
      if (expandedMetricIds.value.has(child.id)) {
        appendChildren(child.id, child.fullyQualifiedName, depth + 1);
      }
    }
    const loaded = page.rows.length;
    if (page.after && page.total > loaded) {
      rows.push({
        key: `load-more:children:${parentId}`,
        kind: 'loadMore',
        depth,
        loadMore: {
          scope: 'children',
          parentId,
          parentFqn,
          after: page.after,
          remaining: page.total - loaded,
        },
      });
    }
  };
  for (const item of topItems.value) {
    if (item.kind === 'metricGroup' && item.group) {
      const group = item.group;
      const members = groupMembers.value[group.id];
      const visibleMembers = (members?.rows ?? []).filter((m) =>
        isRowVisible(rowDataFromMetric(m)),
      );
      if (debouncedSearch.value && searchPaths.value?.complete && visibleMembers.length === 0) {
        continue;
      }
      rows.push({
        key: `group:${group.id}`,
        kind: 'group',
        depth: 0,
        group,
        memberCount: group.metricCount ?? group.metrics?.length ?? 0,
      });
      if (expandedGroupIds.value.has(group.id)) {
        for (const member of visibleMembers) {
          const data = rowDataFromMetric(member);
          rows.push({ key: member.fullyQualifiedName, kind: 'metric', depth: 1, data });
          if (expandedMetricIds.value.has(member.id)) {
            appendChildren(member.id, member.fullyQualifiedName, 2);
          }
        }
        if (members && members.total > members.offset + members.rows.length) {
          rows.push({
            key: `load-more:group:${group.id}`,
            kind: 'loadMore',
            depth: 1,
            loadMore: {
              scope: 'group',
              parentId: group.id,
              parentFqn: '',
              groupId: group.id,
              remaining: members.total - (members.offset + members.rows.length),
            },
          });
        } else if (visibleMembers.length === 0) {
          rows.push({ key: `empty:group:${group.id}`, kind: 'loadMore', depth: 1 });
        }
      }
      continue;
    }
    if (item.kind === 'metric' && item.metric) {
      const data = rowDataFromMetric(item.metric);
      if (!isRowVisible(data)) {
        continue;
      }
      rows.push({ key: item.metric.fullyQualifiedName, kind: 'metric', depth: 0, data });
      if (expandedMetricIds.value.has(item.metric.id)) {
        appendChildren(item.metric.id, item.metric.fullyQualifiedName, 1);
      }
    }
  }
  return rows;
});

const flatRows = computed<MetricRow[]>(() =>
  flatHits.value.map((hit) => ({
    key: hit.fullyQualifiedName,
    kind: 'metric' as const,
    depth: 0,
    data: rowDataFromHit(hit),
  })),
);

const rows = computed(() => (isTreeMode.value ? treeRows.value : flatRows.value));
const metricRows = computed(() => rows.value.filter((row) => row.kind === 'metric'));
const emptyKind = computed(() => {
  if (debouncedSearch.value) {
    return 'search';
  }
  if (statusFilter.value) {
    return 'filter';
  }
  return 'intro';
});

function formatRelativeTime(value?: number): string {
  if (!value) {
    return '—';
  }
  const diff = Date.now() - value;
  if (diff < 60_000) {
    return t('metrics.updatedJustNow');
  }
  if (diff < 3_600_000) {
    return t('metrics.updatedMinutesAgo', { count: Math.floor(diff / 60_000) });
  }
  if (diff < 86_400_000) {
    return t('metrics.updatedHoursAgo', { count: Math.floor(diff / 3_600_000) });
  }
  if (diff < 30 * 86_400_000) {
    return t('metrics.updatedDaysAgo', { count: Math.floor(diff / 86_400_000) });
  }
  return new Date(value).toLocaleDateString();
}

function glossaryTags(tags: TagRef[]): TagRef[] {
  return tags.filter((tag) => tag.source === 'Glossary');
}

function classificationTags(tags: TagRef[]): TagRef[] {
  return tags.filter((tag) => tag.source === 'Classification');
}

function ownerInitials(owner: EntityRef): string {
  const label = owner.displayName || owner.name || '';
  return label
    .split(/[\s.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

function openMetric(data: MetricRowData): void {
  void router.push({ name: 'governance-metric', params: { fqn: data.fullyQualifiedName } });
}

async function checkPermission(): Promise<void> {
  permState.value = 'loading';
  permError.value = '';
  try {
    // Fail-closed: a permission fetch failure renders the
    // no-permission state and sends no list request.
    resourceOps.value = await permissionStore.getResourcePermission('metric');
    permState.value = hasView.value ? 'ready' : 'denied';
  } catch (error) {
    permError.value = error instanceof Error ? error.message : t('metrics.loadFailed');
    permState.value = 'error';
  }
}

async function retryPermission(): Promise<void> {
  await checkPermission();
  if (permState.value === 'ready') {
    await load();
  }
}

async function loadGroupMembers(groupId: string, offset = 0): Promise<void> {
  if (loadingGroups.value.has(groupId)) {
    return;
  }
  loadingGroups.value = new Set([...loadingGroups.value, groupId]);
  try {
    const page = await getMetricGroupMetrics(groupId, {
      limit: pageSize.value,
      offset,
      rootOnly: true,
    });
    const existing = offset === 0 ? [] : (groupMembers.value[groupId]?.rows ?? []);
    groupMembers.value = {
      ...groupMembers.value,
      [groupId]: { rows: [...existing, ...page.data], offset, total: page.total ?? page.data.length },
    };
  } catch {
    // A failed group load leaves the group expanded but memberless
    // (the empty-group line); it must not fail the whole tree.
  } finally {
    const next = new Set(loadingGroups.value);
    next.delete(groupId);
    loadingGroups.value = next;
  }
}

async function loadChildren(parentId: string, parentFqn: string): Promise<void> {
  if (loadingChildren.value.has(parentId)) {
    return;
  }
  loadingChildren.value = new Set([...loadingChildren.value, parentId]);
  try {
    const existing = childrenByParent.value[parentId];
    const page = await listMetrics({
      parent: parentFqn,
      fields: METRIC_TREE_FIELDS,
      limit: METRIC_CHILDREN_PAGE_SIZE,
      after: existing?.after,
    });
    childrenByParent.value = {
      ...childrenByParent.value,
      [parentId]: {
        rows: [...(existing?.rows ?? []), ...page.data],
        after: page.after,
        total: page.total ?? page.data.length,
      },
    };
  } catch {
    // A failed child load leaves the parent expanded but childless;
    // it must not fail the whole tree.
  } finally {
    const next = new Set(loadingChildren.value);
    next.delete(parentId);
    loadingChildren.value = next;
  }
}

async function expandAncestorIds(): Promise<void> {
  const paths = searchPaths.value;
  if (!paths) {
    return;
  }
  for (let round = 0; round < 6; round += 1) {
    let expandedAny = false;
    for (const row of metricRows.value) {
      if (!row.data || !paths.ancestorIds.has(row.data.id)) {
        continue;
      }
      if ((row.data.childrenCount ?? 0) <= 0 || expandedMetricIds.value.has(row.data.id)) {
        continue;
      }
      expandedMetricIds.value = new Set([...expandedMetricIds.value, row.data.id]);
      expandedAny = true;
      await loadChildren(row.data.id, row.data.fullyQualifiedName);
    }
    if (!expandedAny) {
      break;
    }
  }
}

async function loadTree(): Promise<void> {
  const hierarchy = await getMetricHierarchy({
    limit: pageSize.value,
    offset: (page.value - 1) * pageSize.value,
    q: debouncedSearch.value || undefined,
  });
  topItems.value = hierarchy.data;
  total.value = hierarchy.total ?? hierarchy.data.length;
  searchPaths.value = null;
  if (debouncedSearch.value) {
    try {
      searchPaths.value = await getMetricSearchPaths(debouncedSearch.value);
    } catch {
      // An incomplete path walk shows children unfiltered (official
      // getMetricSearchPaths `complete` contract); a failed walk is
      // the same as an incomplete one, never a list error.
      searchPaths.value = null;
    }
  }
  const groups = hierarchy.data.flatMap((item) =>
    item.kind === 'metricGroup' && item.group ? [item.group] : [],
  );
  expandedGroupIds.value = new Set(groups.map((group) => group.id));
  await Promise.all(groups.map((group) => loadGroupMembers(group.id, 0)));
  await expandAncestorIds();
}

async function loadFlat(): Promise<void> {
  const result = await searchAssets(
    composeSearchQuery(debouncedSearch.value, { entityType: ['metric'] }),
    (page.value - 1) * pageSize.value,
    pageSize.value,
    statusFilter.value
      ? { query_filter: buildMetricStatusQueryFilter(statusFilter.value) }
      : {},
  );
  flatHits.value = result.hits;
  total.value = result.total;
}

async function load(): Promise<void> {
  if (permState.value !== 'ready') {
    return;
  }
  // A filter/page change while a load is in flight starts a new load;
  // the stale one must not overwrite the fresh rows when it lands.
  const token = ++loadSeq;
  loading.value = true;
  errorMessage.value = '';
  try {
    if (isTreeMode.value) {
      await loadTree();
    } else {
      await loadFlat();
    }
    if (token !== loadSeq) {
      return;
    }
  } catch (error) {
    if (token !== loadSeq) {
      return;
    }
    errorMessage.value = error instanceof Error ? error.message : t('crud.loadFailed');
    topItems.value = [];
    flatHits.value = [];
    total.value = 0;
  } finally {
    if (token === loadSeq) {
      loading.value = false;
      await nextTick();
      await applyHighlight();
    }
  }
}

async function expandByFqn(fqn: string): Promise<void> {
  const row = metricRows.value.find((candidate) => candidate.data?.fullyQualifiedName === fqn);
  if (!row?.data || (row.data.childrenCount ?? 0) <= 0) {
    return;
  }
  if (!expandedMetricIds.value.has(row.data.id)) {
    expandedMetricIds.value = new Set([...expandedMetricIds.value, row.data.id]);
    await loadChildren(row.data.id, row.data.fullyQualifiedName);
  }
}

async function applyHighlight(): Promise<void> {
  const raw = route.query.highlight;
  const fqn = typeof raw === 'string' ? raw : Array.isArray(raw) ? raw[0] : undefined;
  if (!fqn || highlightDoneFor === fqn || loading.value) {
    return;
  }
  if (isTreeMode.value) {
    // The highlighted row cannot scroll into view until its ancestor
    // chain is expanded; ancestors come root-first.
    const ancestors = await getMetricAncestorFqns(fqn);
    for (const ancestorFqn of ancestors) {
      await expandByFqn(ancestorFqn);
    }
    await nextTick();
  }
  const row = document.querySelector(`[data-metric-fqn="${fqn}"]`);
  row?.scrollIntoView({ block: 'center' });
  highlightDoneFor = fqn;
}

function toggleMetric(row: MetricRow): void {
  if (!row.data || (row.data.childrenCount ?? 0) <= 0) {
    return;
  }
  if (expandedMetricIds.value.has(row.data.id)) {
    const next = new Set(expandedMetricIds.value);
    next.delete(row.data.id);
    expandedMetricIds.value = next;
    return;
  }
  expandedMetricIds.value = new Set([...expandedMetricIds.value, row.data.id]);
  if (!childrenByParent.value[row.data.id]) {
    void loadChildren(row.data.id, row.data.fullyQualifiedName);
  }
}

function toggleGroup(groupId: string): void {
  if (expandedGroupIds.value.has(groupId)) {
    const next = new Set(expandedGroupIds.value);
    next.delete(groupId);
    expandedGroupIds.value = next;
    return;
  }
  expandedGroupIds.value = new Set([...expandedGroupIds.value, groupId]);
  if (!groupMembers.value[groupId]) {
    void loadGroupMembers(groupId, 0);
  }
}

async function onLoadMore(row: MetricRow): Promise<void> {
  if (!row.loadMore) {
    return;
  }
  if (row.loadMore.scope === 'children') {
    await loadChildren(row.loadMore.parentId, row.loadMore.parentFqn);
    return;
  }
  const groupId = row.loadMore.groupId;
  if (!groupId) {
    return;
  }
  const members = groupMembers.value[groupId];
  await loadGroupMembers(groupId, (members?.offset ?? 0) + (members?.rows.length ?? 0));
}

function setViewMode(mode: MetricViewMode): void {
  if (viewMode.value === mode) {
    return;
  }
  viewMode.value = mode;
  page.value = 1;
  try {
    window.localStorage.setItem(METRIC_VIEW_STORAGE_KEY, mode);
  } catch {
    // A denied storage write leaves the in-memory mode in place.
  }
}

function setPageSize(size: number): void {
  const options = viewMode.value === 'card' ? CARD_PAGE_SIZE_OPTIONS : TABLE_PAGE_SIZE_OPTIONS;
  if (!(options as readonly number[]).includes(size)) {
    return;
  }
  pageSizes.value = { ...pageSizes.value, [viewMode.value]: size };
  page.value = 1;
  try {
    window.localStorage.setItem(METRIC_PAGE_SIZE_STORAGE_KEY, JSON.stringify(pageSizes.value));
  } catch {
    // A denied storage write leaves the in-memory size in place.
  }
}

function toggleColumn(id: MetricColumnId): void {
  const next = visibleColumns.value.includes(id)
    ? visibleColumns.value.filter((column) => column !== id)
    : [...ALL_COLUMN_IDS.filter((column) => visibleColumns.value.includes(column) || column === id)];
  visibleColumns.value = next;
  try {
    window.localStorage.setItem(METRIC_COLUMN_PREFERENCE_KEY, JSON.stringify(next));
  } catch {
    // A denied storage write leaves the in-memory columns in place.
  }
}

function onBulkEdit(): void {
  const filters = {
    searchText: debouncedSearch.value || undefined,
    statusFilter: statusFilter.value || undefined,
  };
  const selected = metricRows.value.filter(
    (row) => row.data && selectedKeys.value.includes(row.data.id),
  );
  if (selected.length > 0) {
    scopeStore.setScope({
      mode: 'selected',
      metricIds: selected.map((row) => row.data?.id ?? '').filter(Boolean),
      metricNames: selected.map((row) => row.data?.name ?? ''),
      filters,
    });
  } else {
    scopeStore.setScope({ mode: 'filtered', filters });
  }
  void router.push({ name: 'bulk-edit', params: { entityType: 'metric', fqn: '*' } });
}

/**
 * Flat parent-link list for the bulk-delete helpers (condition 16):
 * every loaded metric with its direct parent id, from the tree data
 * in tree mode and from the search hits' `_source.parent` in flat
 * mode. Group members and lazily loaded children are included — a
 * selected child must resolve its parent even when the parent row
 * sits in another branch of the page.
 */
function metricParentLinks(): MetricParentLink[] {
  const links: MetricParentLink[] = [];
  const seen = new Set<string>();
  const add = (id: string, parentId: string | undefined, fqn: string): void => {
    if (!id || seen.has(id)) {
      return;
    }
    seen.add(id);
    links.push({ id, parentId, fullyQualifiedName: fqn });
  };
  if (isTreeMode.value) {
    for (const item of topItems.value) {
      if (item.kind === 'metric' && item.metric) {
        add(item.metric.id, item.metric.parent?.id, item.metric.fullyQualifiedName);
      }
    }
    for (const members of Object.values(groupMembers.value)) {
      for (const member of members.rows) {
        add(member.id, member.parent?.id, member.fullyQualifiedName);
      }
    }
    for (const children of Object.values(childrenByParent.value)) {
      for (const child of children.rows) {
        add(child.id, child.parent?.id, child.fullyQualifiedName);
      }
    }
  } else {
    for (const hit of flatHits.value) {
      add(hit.id ?? hit.fullyQualifiedName, hit.parent?.id, hit.fullyQualifiedName);
    }
  }
  return links;
}

/** Official resetHierarchy: drop the loaded tree state, then reload. */
function resetHierarchy(): void {
  childrenByParent.value = {};
  groupMembers.value = {};
  expandedMetricIds.value = new Set();
  expandedGroupIds.value = new Set();
  searchPaths.value = null;
  void load();
}

/**
 * Official handleExport (MetricListPage.tsx): async export of the whole
 * collection (`*`), then claim the job for the CSV jobs tray so it
 * surfaces even if it finishes before the tray's first fetch. The
 * export call itself dispatches the tray refresh event. The menu item
 * is disabled while an export is in flight; a failure toasts.
 */
async function onExport(): Promise<void> {
  if (isExporting.value) {
    return;
  }
  isExporting.value = true;
  try {
    const job = await exportMetricsCsvAsync('*');
    markCsvJobOwned(job.jobId);
  } catch (error) {
    message.error(error instanceof Error ? error.message : t('crud.loadFailed'));
  } finally {
    isExporting.value = false;
  }
}

/** Official handleImport: navigate to the bulk-import wizard for metrics. */
function onImport(): void {
  void router.push({ name: 'bulk-import', params: { entityType: 'metric', fqn: '*' } });
}

/**
 * Official handleBulkDelete (MetricListPage.tsx), with the product's
 * bounded re-read in place of the AsyncDeleteProvider refresh
 * (ADR:2026-11-08-metric-bulk-delete-bounded-reread): confirm → only
 * the topmost selected metrics are submitted, each with
 * `recursive=true` → success toast counts ALL selected metrics, not
 * just the topmost → clear selection, close the dialog, back to page
 * 1, then re-read until the deleted metrics are gone and reload.
 * Any submit failure toasts and changes nothing: the selection, the
 * dialog, and the page all stay where they were.
 */
async function confirmBulkDelete(): Promise<void> {
  if (isDeletingMetrics.value) {
    return;
  }
  const selectedIds = [...selectedKeys.value];
  if (selectedIds.length === 0) {
    return;
  }
  isDeletingMetrics.value = true;
  try {
    const links = metricParentLinks();
    const unloadedAncestorIds = getUnloadedMetricAncestorIds(links, selectedIds);
    const extraParentIds =
      unloadedAncestorIds.length > 0
        ? await getMetricParentIds(unloadedAncestorIds).catch(() => undefined)
        : undefined;
    const topmost = getTopmostSelectedMetrics(links, selectedIds, extraParentIds);
    await Promise.all(topmost.map(({ id }) => deleteMetricAsync(id, true)));
    message.success(t('metrics.asyncBulkDeleteSubmitted', { count: selectedIds.length }));
    selectedKeys.value = [];
    deleteDialogOpen.value = false;
    page.value = 1;
    const topFqns = topmost
      .map((metric) => metric.fullyQualifiedName ?? '')
      .filter((fqn) => fqn.length > 0);
    const allGone = await waitForMetricsGone(topFqns);
    if (!allGone) {
      message.warning(t('metrics.bulkDeletePartialTimeout'));
    }
    resetHierarchy();
  } catch (error) {
    message.error(error instanceof Error ? error.message : t('crud.deleteFailed'));
  } finally {
    isDeletingMetrics.value = false;
  }
}

/** Create drawer success: the new metric's detail page is the landing spot. */
function onMetricCreated(fqn: string): void {
  void router.push({ name: 'governance-metric', params: { fqn } });
}

function onRefresh(): void {
  page.value = 1;
  void load();
}

function onNext(): void {
  if (page.value < totalPages.value) {
    page.value += 1;
  }
}

function onPrev(): void {
  if (page.value > 1) {
    page.value -= 1;
  }
}

watch(searchText, (value) => {
  window.clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    debouncedSearch.value = value;
  }, SEARCH_DEBOUNCE_MS);
});

watch(
  () => [debouncedSearch.value, statusFilter.value, page.value, pageSize.value],
  () => {
    if (permState.value === 'ready') {
      void load();
    }
  },
);

watch([debouncedSearch, statusFilter], () => {
  page.value = 1;
});

onMounted(async () => {
  await checkPermission();
  if (permState.value === 'ready') {
    await load();
  }
});

onUnmounted(() => {
  window.clearTimeout(searchTimer);
});
</script>

<template>
  <div class="metrics-list">
    <PageHeader :header="t('metrics.title')" :sub-header="t('metrics.lead')" test-id="metrics-list" />
    <div v-if="permState === 'loading'" data-testid="metrics-permission-loading">
      <Skeleton :active="true" :paragraph="{ rows: 4 }" />
    </div>
    <div v-else-if="permState === 'denied'" data-testid="metrics-no-permission">
      <Empty :description="t('metrics.noPermission')" />
    </div>
    <div v-else-if="permState === 'error'" data-testid="metrics-permission-error">
      <Empty :description="permError || t('metrics.loadFailed')">
        <Button type="primary" data-testid="metrics-permission-retry" @click="retryPermission">
          {{ t('shared.retry') }}
        </Button>
      </Empty>
    </div>
    <template v-else>
      <Space wrap class="metrics-list__toolbar">
        <LimitWrapper
          v-if="canCreate"
          resource="metric"
          v-slot="{ limitReached }"
        >
          <Button
            type="primary"
            data-testid="create-metric"
            :disabled="limitReached"
            @click="createDrawer.openDrawer()"
          >
            {{ t('metrics.createButton') }}
          </Button>
        </LimitWrapper>
        <Dropdown v-if="canEditAll" :trigger="['click']">
          <Button data-testid="metrics-actions-menu" :aria-label="t('crud.moreActions')">
            ⋮
          </Button>
          <template #overlay>
            <Menu>
              <Menu.Item
                key="export"
                :disabled="isExporting"
                data-testid="metrics-export"
                @click="onExport"
              >
                {{ t('metrics.export') }}
              </Menu.Item>
              <Menu.Item key="import" data-testid="metrics-import" @click="onImport">
                {{ t('metrics.import') }}
              </Menu.Item>
            </Menu>
          </template>
        </Dropdown>
        <Input.Search
          v-model:value="searchText"
          :placeholder="t('metrics.searchPlaceholder')"
          allow-clear
          data-testid="metric-search"
          style="width: 280px"
        />
        <Select
          v-model:value="statusFilter"
          :options="statusOptions"
          data-testid="metric-status-filter"
          style="width: 180px"
        />
        <Space>
          <Button
            data-testid="metric-table-view-button"
            :type="viewMode === 'table' ? 'primary' : 'default'"
            @click="setViewMode('table')"
          >
            {{ t('metrics.viewTable') }}
          </Button>
          <Button
            data-testid="metric-card-view-button"
            :type="viewMode === 'card' ? 'primary' : 'default'"
            @click="setViewMode('card')"
          >
            {{ t('metrics.viewCard') }}
          </Button>
        </Space>
        <Dropdown v-if="viewMode === 'table'" :trigger="['click']">
          <Button data-testid="metrics-customize-columns">
            {{ t('metrics.customizeColumns') }}
          </Button>
          <template #overlay>
            <Menu>
              <Menu.Item
                v-for="id in ALL_COLUMN_IDS"
                :key="id"
                :data-testid="`metrics-column-toggle-${id}`"
                @click="toggleColumn(id)"
              >
                <Checkbox :checked="visibleColumns.includes(id)">
                  {{ t(`metrics.column${id[0]?.toUpperCase()}${id.slice(1)}`) }}
                </Checkbox>
              </Menu.Item>
            </Menu>
          </template>
        </Dropdown>
        <Button
          v-if="canEditAll"
          data-testid="metrics-bulk-edit-button"
          @click="onBulkEdit"
        >
          {{ t('metrics.bulkEditAll') }}
        </Button>
        <Button data-testid="metrics-refresh" @click="onRefresh">{{ t('crud.refresh') }}</Button>
      </Space>

      <div v-if="selectedKeys.length > 0" class="metrics-list__bulk-bar" data-testid="metrics-bulk-bar">
        <Typography.Text>
          {{ t('metrics.selectedCount', { count: selectedKeys.length }) }}
        </Typography.Text>
        <Button type="link" data-testid="metrics-clear-selection" @click="selectedKeys = []">
          {{ t('metrics.clearSelection') }}
        </Button>
        <Button
          v-if="canEditAll"
          type="primary"
          data-testid="metrics-bulk-edit-selected-button"
          @click="onBulkEdit"
        >
          {{ t('metrics.bulkEditSelected', { count: selectedKeys.length }) }}
        </Button>
        <Button
          v-if="canDelete"
          danger
          data-testid="metrics-bulk-delete-button"
          @click="deleteDialogOpen = true"
        >
          {{ t('crud.delete') }}
        </Button>
      </div>

      <div v-if="loading" data-testid="metrics-loading">
        <Skeleton :active="true" :paragraph="{ rows: 4 }" />
      </div>
      <div v-else-if="errorMessage" data-testid="metrics-error">
        <Empty :description="errorMessage">
          <Button type="primary" data-testid="metrics-retry" @click="load">
            {{ t('shared.retry') }}
          </Button>
        </Empty>
      </div>
      <div v-else-if="rows.length === 0">
        <div v-if="emptyKind === 'intro'" data-testid="metrics-empty-intro">
          <Empty :description="t('metrics.empty')">
            <div class="metrics-list__intro">
              <div>
                <Typography.Title :level="5">{{ t('metrics.emptyDefineTitle') }}</Typography.Title>
                <Typography.Text>{{ t('metrics.emptyDefineText') }}</Typography.Text>
              </div>
              <div>
                <Typography.Title :level="5">{{ t('metrics.emptyActionTitle') }}</Typography.Title>
                <Typography.Text>{{ t('metrics.emptyActionText') }}</Typography.Text>
              </div>
              <div>
                <Typography.Title :level="5">{{ t('metrics.emptyOwnerTitle') }}</Typography.Title>
                <Typography.Text>{{ t('metrics.emptyOwnerText') }}</Typography.Text>
              </div>
            </div>
            <LimitWrapper
              v-if="canCreate"
              resource="metric"
              v-slot="{ limitReached }"
            >
              <Button
                type="primary"
                data-testid="metrics-empty-new-metric"
                :disabled="limitReached"
                style="margin-top: 16px"
                @click="createDrawer.openDrawer()"
              >
                {{ t('metrics.newMetric') }}
              </Button>
            </LimitWrapper>
          </Empty>
        </div>
        <Empty
          v-else-if="emptyKind === 'search'"
          data-testid="metrics-empty-search"
          :description="t('metrics.emptySearch')"
        />
        <Empty
          v-else
          data-testid="metrics-empty-filter"
          :description="t('metrics.emptyFilter')"
        />
      </div>
      <template v-else-if="viewMode === 'table'">
        <Table
          :columns="columns"
          :data-source="rows"
          row-key="key"
          :row-selection="rowSelection"
          :pagination="false"
          size="small"
          data-testid="metrics-table"
          :custom-row="
            (record) => ({
              'data-metric-fqn': record.data?.fullyQualifiedName ?? undefined,
              onClick: () => {
                if (record.data) {
                  openMetric(record.data);
                }
              },
            })
          "
        >
          <template #bodyCell="{ column, record }">
            <template v-if="column.key === 'name'">
              <div
                class="metrics-list__name"
                :data-metric-fqn="record.data?.fullyQualifiedName ?? undefined"
                :style="{ paddingLeft: `${Math.min(record.depth, MAX_INDENT_DEPTH) * 16}px` }"
              >
                <template v-if="record.kind === 'group' && record.group">
                  <Button
                    type="text"
                    size="small"
                    :data-testid="`metric-group-toggle-${record.group.id}`"
                    @click.stop="toggleGroup(record.group.id)"
                  >
                    {{ expandedGroupIds.has(record.group.id) ? '▾' : '▸' }}
                  </Button>
                  <strong>{{ record.group.displayName || record.group.name }}</strong>
                  <Typography.Text type="secondary">
                    {{
                      t('metrics.groupMembers', { count: record.memberCount ?? 0 })
                    }}
                  </Typography.Text>
                </template>
                <template v-else-if="record.kind === 'loadMore'">
                  <Button
                    v-if="record.loadMore"
                    type="link"
                    size="small"
                    :data-testid="`metric-load-more-${record.key}`"
                    @click.stop="onLoadMore(record as MetricRow)"
                  >
                    {{ t('metrics.loadMore', { count: record.loadMore.remaining }) }}
                  </Button>
                  <Typography.Text v-else type="secondary">
                    {{ t('metrics.emptyGroup') }}
                  </Typography.Text>
                </template>
                <template v-else-if="record.data">
                  <Button
                    v-if="(record.data.childrenCount ?? 0) > 0"
                    type="text"
                    size="small"
                    :data-testid="`metric-expand-${record.data.fullyQualifiedName}`"
                    @click.stop="toggleMetric(record as MetricRow)"
                  >
                    {{ expandedMetricIds.has(record.data.id) ? '▾' : '▸' }}
                  </Button>
                  <a
                    href="#"
                    :data-testid="`metric-row-${record.data.fullyQualifiedName}`"
                    @click.stop.prevent="openMetric(record.data)"
                  >
                    {{ entityLabel(record.data) }}
                  </a>
                  <Tag v-if="record.data.metricType" color="blue">
                    {{ record.data.metricType }}
                  </Tag>
                  <Typography.Text v-if="record.data.granularity" type="secondary">
                    {{ record.data.granularity }}
                  </Typography.Text>
                  <Typography.Text
                    v-if="(record.data.childrenCount ?? 0) > 0"
                    type="secondary"
                  >
                    {{ t('metrics.variants', { count: record.data.childrenCount }) }}
                  </Typography.Text>
                </template>
              </div>
            </template>
            <template v-else-if="column.key === 'description' && record.data">
              <div class="metrics-list__desc">{{ record.data.description || '—' }}</div>
            </template>
            <template v-else-if="column.key === 'glossary' && record.data">
              <Space wrap size="small">
                <Tag v-for="tag in glossaryTags(record.data.tags)" :key="tag.tagFQN">
                  {{ tag.name }}
                </Tag>
                <span v-if="glossaryTags(record.data.tags).length === 0">—</span>
              </Space>
            </template>
            <template v-else-if="column.key === 'entityStatus' && record.data">
              <Tag v-if="record.data.entityStatus">
                {{ t(`metrics.status.${STATUS_I18N_KEY[record.data.entityStatus] ?? ''}`) }}
              </Tag>
              <span v-else>—</span>
            </template>
            <template v-else-if="column.key === 'health' && record.data">
              <MetricHealthCell :metric-id="record.data.id" />
            </template>
            <template v-else-if="column.key === 'owners' && record.data">
              <Space size="small">
                <Avatar
                  v-for="owner in record.data.owners.slice(0, 3)"
                  :key="owner.id ?? owner.name"
                  size="small"
                  :title="owner.displayName || owner.name"
                >
                  {{ ownerInitials(owner) }}
                </Avatar>
                <span v-if="record.data.owners.length > 3">
                  +{{ record.data.owners.length - 3 }}
                </span>
                <span v-if="record.data.owners.length === 0">—</span>
              </Space>
            </template>
            <template v-else-if="column.key === 'tags' && record.data">
              <Space wrap size="small">
                <Tag v-for="tag in classificationTags(record.data.tags)" :key="tag.tagFQN">
                  {{ tag.name }}
                </Tag>
                <span v-if="classificationTags(record.data.tags).length === 0">—</span>
              </Space>
            </template>
            <template v-else-if="column.key === 'domains' && record.data">
              {{ record.data.domains.map((d: EntityRef) => d.displayName || d.name).join(', ') || '—' }}
            </template>
            <template v-else-if="column.key === 'updatedAt' && record.data">
              {{ formatRelativeTime(record.data.updatedAt) }}
            </template>
          </template>
        </Table>
      </template>
      <div v-else class="metrics-list__cards">
        <template v-for="row in rows" :key="row.key">
          <Card
            v-if="row.kind === 'group' && row.group"
            size="small"
            class="metrics-list__card metrics-list__card--group"
          >
            <strong>{{ row.group.displayName || row.group.name }}</strong>
            <Typography.Text type="secondary">
              {{ t('metrics.groupMembers', { count: row.memberCount ?? 0 }) }}
            </Typography.Text>
          </Card>
          <Button
            v-else-if="row.kind === 'loadMore' && row.loadMore"
            type="link"
            :data-testid="`metric-load-more-${row.key}`"
            @click="onLoadMore(row)"
          >
            {{ t('metrics.loadMore', { count: row.loadMore.remaining }) }}
          </Button>
          <Card
            v-else-if="row.kind === 'metric' && row.data"
            size="small"
            class="metrics-list__card"
            :data-metric-fqn="row.data.fullyQualifiedName"
            :style="{ marginLeft: `${Math.min(row.depth, MAX_INDENT_DEPTH) * 16}px` }"
            hoverable
            @click="openMetric(row.data)"
          >
            <div class="metrics-list__card-head">
              <Checkbox
                :checked="selectedKeys.includes(row.data.id)"
                :data-testid="`metric-select-${row.data.fullyQualifiedName}`"
                @click.stop
                @change="toggleSelect(row.data)"
              />
              <a
                href="#"
                :data-testid="`metric-row-${row.data.fullyQualifiedName}`"
                @click.stop.prevent="openMetric(row.data)"
              >
                {{ entityLabel(row.data) }}
              </a>
              <Tag v-if="row.data.metricType" color="blue">{{ row.data.metricType }}</Tag>
            </div>
            <div v-if="visibleColumns.includes('description')" class="metrics-list__desc">
              {{ row.data.description || '—' }}
            </div>
            <div v-if="visibleColumns.includes('entityStatus') && row.data.entityStatus">
              <Tag>
                {{ t(`metrics.status.${STATUS_I18N_KEY[row.data.entityStatus] ?? ''}`) }}
              </Tag>
            </div>
            <div v-if="visibleColumns.includes('health')">
              <MetricHealthCell :metric-id="row.data.id" />
            </div>
            <div v-if="visibleColumns.includes('owners') && row.data.owners.length > 0">
              <Space size="small">
                <Avatar
                  v-for="owner in row.data.owners.slice(0, 3)"
                  :key="owner.id ?? owner.name"
                  size="small"
                  :title="owner.displayName || owner.name"
                >
                  {{ ownerInitials(owner) }}
                </Avatar>
                <span v-if="row.data.owners.length > 3">+{{ row.data.owners.length - 3 }}</span>
              </Space>
            </div>
            <div v-if="visibleColumns.includes('updatedAt')">
              {{ formatRelativeTime(row.data.updatedAt) }}
            </div>
          </Card>
        </template>
      </div>

      <div class="metrics-list__footer">
        <Typography.Text type="secondary" data-testid="metrics-count">
          {{ t('crud.shownOf', { shown: rows.length, total }) }}
        </Typography.Text>
        <Space>
          <Button data-testid="metrics-prev" :disabled="page <= 1" @click="onPrev">
            {{ t('crud.previous') }}
          </Button>
          <Typography.Text data-testid="metrics-page">
            {{ t('metrics.pageOf', { page, pages: totalPages }) }}
          </Typography.Text>
          <Button data-testid="metrics-next" :disabled="page >= totalPages" @click="onNext">
            {{ t('crud.next') }}
          </Button>
          <Select
            :value="pageSize"
            :options="
              (viewMode === 'card' ? CARD_PAGE_SIZE_OPTIONS : TABLE_PAGE_SIZE_OPTIONS).map(
                (size) => ({ value: size, label: String(size) }),
              )
            "
            data-testid="metrics-page-size"
            style="width: 90px"
            @change="(size) => setPageSize(Number(size))"
          />
        </Space>
      </div>

      <Modal
        :open="deleteDialogOpen"
        :title="t('metrics.deleteSelectedTitle')"
        :mask-closable="true"
        :closable="true"
        data-testid="metrics-delete-dialog"
        @cancel="deleteDialogOpen = false"
      >
        <Typography.Text>{{ t('metrics.deleteSelectedWarning') }}</Typography.Text>
        <template #footer>
          <Button data-testid="metrics-delete-cancel" @click="deleteDialogOpen = false">
            {{ t('crud.cancel') }}
          </Button>
          <Button
            type="primary"
            danger
            data-testid="metrics-delete-confirm"
            :loading="isDeletingMetrics"
            @click="confirmBulkDelete"
          >
            {{ t('crud.delete') }}
          </Button>
        </template>
      </Modal>

      <MetricCreateDrawer
        v-model:open="createDrawer.open"
        :parent-metric-fqn="createDrawer.parentMetricFqn"
        @created="onMetricCreated"
      />
    </template>
  </div>
</template>

<style scoped>
.metrics-list__toolbar {
  margin: 16px 0;
}

.metrics-list__bulk-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
}

.metrics-list__desc {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 320px;
}

.metrics-list__intro {
  display: flex;
  flex-direction: column;
  gap: 12px;
  text-align: left;
  max-width: 560px;
  margin: 0 auto;
}

.metrics-list__cards {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.metrics-list__card--group {
  background: var(--sm-table-header-bg);
}

.metrics-list__card-head {
  display: flex;
  align-items: center;
  gap: 8px;
}

.metrics-list__footer {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  align-items: center;
  flex-wrap: wrap;
  margin-top: 16px;
}
</style>
