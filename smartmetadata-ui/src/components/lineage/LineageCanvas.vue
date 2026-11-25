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
  Dropdown,
  Empty,
  Input,
  Menu,
  Select,
  Space,
  Spin,
  Tooltip,
  Typography,
  message,
} from 'ant-design-vue';
import type { SelectValue } from 'ant-design-vue/es/select';
import {
  DownloadOutlined,
  FilterOutlined,
  FullscreenOutlined,
  SettingOutlined,
} from '@ant-design/icons-vue';
import { apiRequest } from '@/api/client';
import {
  deleteEntityLineageByName,
  exportLineageAsync,
  getDataQualityLineage,
  putEntityLineage,
  searchLineage,
} from '@/api/lineage';
import { markCsvJobOwned, notifyCsvJobsRefresh } from '@/api/csvJobs';
import { isDetailWired, lineageLocation, resolveDetailEndpoint } from '@/catalog/entityRoutes';
import { highlightForColumn } from '@/lineage/columnPorts';
import {
  collapseLineageModel,
  dqHighlight,
  extractDqNodeIds,
  isLineageEmpty,
  mapSearchLineage,
  mergeLineageModels,
  type LineageGraphModel,
  type LineageGraphNode,
} from '@/lineage/graphModel';
import { impactEntityRows } from '@/lineage/impact';
import type { LineageCanvasConfig, LineageLayer } from '@/lineage/config';
import { resolveLineageTimeRange } from '@/lineage/config';
import { getDeleteKeyAction } from '@/lineage/deleteKey';
import {
  getLineageEditColumnPair,
  removeColumnLineageEdge,
  saveLineageEdge,
} from '@/lineage/edgeMutations';
import {
  isLineageServiceEntityType,
  parseLineageEntityContext,
  resolvePlatformViewFetchArgs,
  type LineageEntityContext,
  type LineagePlatformView,
} from '@/lineage/layers';
import { buildLineageQueryFilter } from '@/lineage/quickFilters';
import { isImpactAnalysisMode, parseLineageTableUrlParams } from '@/lineage/lineageTable';
import { useLineageStore } from '@/stores/lineage';
import { useShellConfigStore } from '@/stores/shellConfig';
import DetailTabs from '@/components/shared/DetailTabs.vue';
import PageHeader from '@/components/shared/PageHeader.vue';
import AddLineagePopover, { type AddLineageSubmission } from './AddLineagePopover.vue';
import LineageConfigModal from './LineageConfigModal.vue';
import LineageEntityDrawer from './LineageEntityDrawer.vue';
import LineageGraph, { type LineageEdgeSelection } from './LineageGraph.vue';
import LineageNodeDeleteModal from './LineageNodeDeleteModal.vue';
import LineageQuickFilters from './LineageQuickFilters.vue';
import LineageSearchSelect from './LineageSearchSelect.vue';
import LineageTable from './LineageTable.vue';
import LineageTimeFilter from './LineageTimeFilter.vue';

const props = withDefaults(
  defineProps<{
    entityType?: string;
    fqn?: string;
    variant?: 'page' | 'tab';
    /** The unified lineage page renders its own header; tabs keep this one. */
    showHeader?: boolean;
    /**
     * Pin `hasEditAccess` (useEntityPermissions → canEditLineage), passed
     * down by the lineage page and by the detail views (tab variant).
     * Defaults to true: a caller that passes no permission keeps the
     * current behaviour instead of silently disabling editing there.
     */
    hasEditAccess?: boolean;
  }>(),
  { entityType: '', fqn: '', variant: 'page', showHeader: true, hasEditAccess: true },
);

const router = useRouter();
const route = useRoute();
const { t } = useI18n();
const loading = ref(false);
const writing = ref(false);
const errorMessage = ref('');
/**
 * Transient edit-denial notice. Inline like errorMessage, but a separate
 * ref on purpose: errorMessage gates the graph's v-if, and a denied
 * connect must not unmount the graph (it would also drop the graph's
 * event bindings, so a following delete-node intent could never land).
 */
const denialMessage = ref('');
const graph = ref<LineageGraphModel | null>(null);
const highlightedColumnFqns = ref<string[]>([]);
const highlightedNodeIds = ref<string[]>([]);
const highlightedEdgeIds = ref<string[]>([]);
const expandedUpstreamIds = ref<string[]>([]);
const expandedDownstreamIds = ref<string[]>([]);
/** Raw DQ node ids from the last DQ fetch; the highlight derives from the live graph. */
const dqIds = ref<string[]>([]);

const dqHighlightResult = computed(() =>
  graph.value ? dqHighlight(graph.value, dqIds.value) : { nodeIds: [], edgeIds: [] },
);

const center = computed(() => graph.value?.nodes.find((node) => node.isCenter));
const empty = computed(() => (graph.value ? isLineageEmpty(graph.value) : false));

/** PNG export names the graph after the focus entity. */
const exportIdentity = computed(() => ({ entityType: props.entityType, fqn: props.fqn }));

const lineageStore = useLineageStore();
const shellConfig = useShellConfigStore();

/**
 * Pin's depth editor is the config modal (store): the fetch depths read
 * the store directly, like pin's directional config depth. The old
 * local depth refs + header steppers are gone with the steppers.
 */
const upstreamDepth = computed(() => lineageStore.config.upstreamDepth);
const downstreamDepth = computed(() => lineageStore.config.downstreamDepth);

/** Focus entity context for the Layers panel (service/domains/data products). */
const entityContext = ref<LineageEntityContext | undefined>();
/** Last node/edge selected on the graph (drives Delete/Backspace). */
const selectedNode = ref<LineageGraphNode | undefined>();
const selectedEdge = ref<LineageEdgeSelection | undefined>();
/** Node pending delete confirmation (pin LineageNodeDeleteModal). */
const nodePendingDelete = ref<LineageGraphNode | undefined>();
const isDeletingNode = ref(false);
/** Edge pending delete confirmation (entity edge or one column mapping). */
const edgePendingDelete = ref<LineageEdgeSelection | undefined>();
const isDeletingEdge = ref(false);
/** Add-lineage edit request (pin AddLineagePopover `request`). */
const editRequest = ref<
  { node: LineageGraphNode; direction: 'upstream' | 'downstream'; columnFqn?: string } | undefined
>();
const isCreatingEdge = ref(false);
const exportingCsv = ref(false);

/**
 * Pin `EntityLineageCanvas canEdit = hasEditAccess && !deleted &&
 * platformView === None && !SERVICE_TYPES.includes(entityType)`. The
 * product canvas has no `deleted` input (the entity loaded, so it is
 * not deleted); L6 records the tab-variant wiring. The platform-view
 * clause matters: a container view is read-only, like pin's.
 */
const canEdit = computed(
  () =>
    props.hasEditAccess &&
    lineageStore.platformView === 'None' &&
    !isLineageServiceEntityType(props.entityType),
);

/**
 * Effective overlays: the Layers panel's `activeLayer` OR the session
 * layer (settings default / config modal). Pin has one source
 * (activeLayer, seeded from settings); the product keeps both — the
 * session layer is the settings default the canvas already honored in
 * L2, the panel is the per-view override. The panel shows this list,
 * and unchecking a settings-seeded overlay clears the session layer
 * too (see onChangeActiveLayer).
 */
const effectiveLayers = computed((): LineageLayer[] => {
  const layers = [...lineageStore.activeLayer];
  const sessionLayer = lineageStore.config.layer;
  if ((sessionLayer === 'ColumnLevelLineage' || sessionLayer === 'DataObservability') && !layers.includes(sessionLayer)) {
    layers.push(sessionLayer);
  }
  return layers;
});

const columnOverlay = computed(() => effectiveLayers.value.includes('ColumnLevelLineage'));
const dqEnabled = computed(() => effectiveLayers.value.includes('DataObservability'));

/** Current fetch focus: the container entity on a platform view, else the focus asset. */
const currentFocus = computed((): { entityType: string; fqn: string } => {
  if (lineageStore.platformView !== 'None') {
    const args = resolvePlatformViewFetchArgs(lineageStore.platformView, entityContext.value);
    if (args) {
      return { entityType: args.type, fqn: args.fqn };
    }
  }
  return { entityType: props.entityType, fqn: props.fqn };
});


const configModalOpen = ref(false);
const activeView = ref(isImpactAnalysisMode(route.query) ? 'impact' : 'diagram');

/**
 * D-TAB-1 (lineage batch L6): pin reads and writes the view mode in its
 * SHARED lineage surface, with no page/tab split — the Lineage provider
 * reads `?mode` from the URL (Lineage.tsx:687 `searchData.mode`,
 * :930 skips the graph fetch in impact mode) and the shared controls
 * render the lineage/impact tabs and write the param back
 * (CustomControls.component.tsx:233-236 read, :259-270 handleTabChange
 * writes `params['mode'] = key`). Both variants mirror that round-trip
 * here. Pin has exactly two tabs; the product-only `table` view is
 * deleted (pin's Impact tab itself is the LineageTable).
 */
const LINEAGE_MODE_PARAM = 'mode';
const LINEAGE_IMPACT_MODE = 'impact_analysis';

function modeViewFromRoute(): 'impact' | 'diagram' {
  return route.query[LINEAGE_MODE_PARAM] === LINEAGE_IMPACT_MODE ? 'impact' : 'diagram';
}

watch(
  () => route.query[LINEAGE_MODE_PARAM],
  () => {
    activeView.value = modeViewFromRoute();
  },
);

function onViewChange(key: string): void {
  activeView.value = key;
  const query = { ...route.query };
  if (key === 'impact') {
    if (query[LINEAGE_MODE_PARAM] !== LINEAGE_IMPACT_MODE) {
      query[LINEAGE_MODE_PARAM] = LINEAGE_IMPACT_MODE;
      void router.replace({ query }).catch(() => undefined);
    }
  } else if (query[LINEAGE_MODE_PARAM] !== undefined) {
    delete query[LINEAGE_MODE_PARAM];
    void router.replace({ query }).catch(() => undefined);
  }
  if (key !== 'impact') {
    impactSearchInput.value = '';
    impactSearchValue.value = '';
  }
}

/** Mirrors the export panel's png-available rule so the page button agrees with it. */
const canExportPng = computed(
  () => Boolean(graph.value && !empty.value && !errorMessage.value && activeView.value === 'diagram'),
);

// Ref to the mounted LineageGraph (diagram view only); the header
// export/search actions call through here so no document.querySelector
// is needed to find the flow.
const graphRef = ref<{
  exportPng: (entityType: string, fqn: string) => Promise<void>;
  centerOnNode: (nodeId: string) => boolean;
} | null>(null);

async function onExportPng(): Promise<void> {
  const graphApi = graphRef.value;
  if (!graphApi) {
    message.error(t('lineage.exportPngNoGraph'));
    return;
  }
  try {
    await graphApi.exportPng(exportIdentity.value.entityType, exportIdentity.value.fqn);
  } catch {
    message.error(t('lineage.exportPngFailed'));
  }
}

/**
 * Page-level actions (pin PlatformLineage's export + config buttons),
 * exposed so the unified page owns the buttons while the canvas keeps
 * the single modal and the graph it exports.
 */
function openConfig(): void {
  configModalOpen.value = true;
}

defineExpose({ exportPng: onExportPng, openConfig, canExportPng });

const viewTabs = computed(() => [
  { key: 'diagram', label: t('lineage.viewDiagram') },
  { key: 'impact', label: t('lineage.viewImpact') },
]);

/**
 * The CSV export's disabled rule, carried over from the deleted
 * LineageExportPanel: rows are the center entity plus the impact
 * rows in both directions; the CSV button is disabled when there is
 * nothing to export.
 */
const exportRowsCount = computed(() => {
  if (!graph.value) {
    return 0;
  }
  const centerRow = graph.value.nodes.some((node) => node.id === graph.value?.centerId) ? 1 : 0;
  return (
    centerRow +
    impactEntityRows(graph.value, 'upstream').length +
    impactEntityRows(graph.value, 'downstream').length
  );
});

function applyShellDefaults(): void {
  const settings = shellConfig.lineageSettings;
  if (!settings) {
    return;
  }
  lineageStore.applyDefaults({
    upstreamDepth: settings.upstreamDepth,
    downstreamDepth: settings.downstreamDepth,
    layer: settings.lineageLayer,
    pipelineViewMode: settings.pipelineViewMode,
  });
}

function onConfigSave(next: LineageCanvasConfig): void {
  configModalOpen.value = false;
  const previousLayer = lineageStore.config.layer;
  lineageStore.update(next);
  // Pin's `defaultLineageConfig` effect re-seeds the overlay when the
  // settings layer changes; the config modal is the product's settings
  // path, so a layer change here re-seeds the panel the same way.
  if (next.layer !== previousLayer) {
    lineageStore.setActiveLayer(next.layer === 'EntityLineage' ? [] : [next.layer]);
  }
}

watch(
  () => shellConfig.lineageSettings,
  () => applyShellDefaults(),
  { immediate: true },
);

/**
 * Pin `CustomControls.component.tsx:535-595` (header) + `:460-535`
 * (filter expansion): the filters button opens an expansion holding
 * the depth dropdown (impact tab only), the quick filters and a single
 * Clear all; the time filter and quick filters are no longer always
 * visible. Pin's filter-open side effect — forcing fullscreen — is
 * deliberately not ported: the expansion renders inline with room, so
 * forcing the view fullscreen would only hide the canvas.
 */
const filtersOpen = ref(false);
const hasQuickFilterValues = computed(() => lineageStore.quickFilters.length > 0);

/** Pin `Lineage.tsx:561-566`: fullscreen is a URL param (`fullscreen=true`). */
const LINEAGE_FULLSCREEN_PARAM = 'fullscreen';
const isFullscreen = computed(() => route.query[LINEAGE_FULLSCREEN_PARAM] === 'true');

function toggleFullscreen(): void {
  const query = { ...route.query };
  if (isFullscreen.value) {
    delete query[LINEAGE_FULLSCREEN_PARAM];
  } else {
    query[LINEAGE_FULLSCREEN_PARAM] = 'true';
  }
  void router.replace({ query }).catch(() => undefined);
}

/**
 * Impact-tab search, owned by the canvas (pin `CustomControls`
 * renders the impact `Searchbar` in the header, 300ms debounce, and
 * the table unmounts on tab switch so the search resets with it).
 * The input is debounced into `impactSearchValue`, passed to the
 * table as a prop; leaving the impact tab clears both.
 */
const impactSearchInput = ref('');
const impactSearchValue = ref('');
let impactSearchTimer: number | undefined;

watch(impactSearchInput, (value) => {
  window.clearTimeout(impactSearchTimer);
  impactSearchTimer = window.setTimeout(() => {
    impactSearchValue.value = value;
  }, 300);
});

/** Depth options the table reports, for the header depth dropdown. */
const impactDepthOptions = ref<number[]>([]);
const impactNodeDepth = computed(
  () => parseLineageTableUrlParams(route.query, upstreamDepth.value, downstreamDepth.value).nodeDepth,
);

function onImpactDepthChange(value: SelectValue): void {
  // The depth options are numbers; normalise the antd SelectValue
  // (RawValue | LabeledValue) the same way MetricCreateDrawer does.
  const raw =
    typeof value === 'object' && value !== null && !Array.isArray(value)
      ? value.value
      : value;
  const depth = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isFinite(depth)) {
    return;
  }
  const query = { ...route.query, depth: String(depth), currentPage: '1' };
  void router.replace({ query }).catch(() => undefined);
}

function onClearAllFilters(): void {
  lineageStore.setQuickFilters([]);
  // Pin's `onPageReset` on the impact tab: a filter change resets the
  // table to page 1.
  if (activeView.value === 'impact') {
    const query = { ...route.query, currentPage: '1' };
    void router.replace({ query }).catch(() => undefined);
  }
}

/**
 * The export dropdown mirrors pin `CustomControls.handleExportClick`
 * option sets: the lineage tab offers PNG + CSV, the impact tab CSV
 * only (invoked on the table through its ref). The PNG item follows
 * `canExportPng`; the CSV items follow the row counts.
 */
const tableRef = ref<{ exportCsv: () => Promise<void>; hasRows: boolean } | null>(null);

const exportMenuItems = computed(() => {
  if (activeView.value === 'impact') {
    return [
      {
        key: 'csv',
        label: t('lineage.exportCsv'),
        disabled: !(tableRef.value?.hasRows ?? false),
      },
    ];
  }
  return [
    { key: 'png', label: t('lineage.exportPng'), disabled: !canExportPng.value },
    { key: 'csv', label: t('lineage.exportCsv'), disabled: exportRowsCount.value === 0 },
  ];
});

async function onExportMenuClick(payload: { key: string | number }): Promise<void> {
  if (payload.key === 'png') {
    await onExportPng();
    return;
  }
  if (activeView.value === 'impact') {
    await tableRef.value?.exportCsv();
    return;
  }
  await onExportCsv();
}

/** Node detail drawer (pin `LineageOverlays`: 576px Slideout). */
const drawerNode = ref<LineageGraphNode | undefined>();

function onOpenNode(node: LineageGraphNode): void {
  drawerNode.value = node;
}

/**
 * Pin `LineageSearchSelect` selection: a node opens the drawer and is
 * centered on the canvas; a column is highlighted (its from-columns
 * come from the graph's column mappings).
 */
function onSearchSelectNode(node: LineageGraphNode): void {
  drawerNode.value = node;
  graphRef.value?.centerOnNode(node.id);
}

function onSearchSelectColumn(columnFqn: string): void {
  if (!graph.value || !columnFqn) {
    return;
  }
  const fromColumns = (graph.value.columnMappings ?? [])
    .filter((mapping) => mapping.toColumn === columnFqn)
    .flatMap((mapping) => mapping.fromColumns);
  const next = highlightForColumn(graph.value, columnFqn);
  highlightedColumnFqns.value = [columnFqn, ...fromColumns];
  highlightedNodeIds.value = next.nodeIds;
  highlightedEdgeIds.value = next.edgeIds;
}


function clearHighlight(): void {
  highlightedColumnFqns.value = [];
  highlightedNodeIds.value = [];
  highlightedEdgeIds.value = [];
}

const LINEAGE_START_TIME_PARAM = 'lineageStartTime';
const LINEAGE_END_TIME_PARAM = 'lineageEndTime';

function parseEpochParam(value: unknown): number | undefined {
  const raw = Array.isArray(value) ? value[0] : value;
  if (typeof raw !== 'string') {
    return undefined;
  }
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : undefined;
}

function dateString(millis: number): string {
  const date = new Date(millis);
  const pad = (value: number): string => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/**
 * Seed the time filter from the URL before the first fetch, mirroring pin
 * Lineage.tsx:575-580 (`LINEAGE_START_TIME_PARAM` / `LINEAGE_END_TIME_PARAM`
 * epoch millis). Both params → custom range; end-only → point in time;
 * start-only → custom range ending today (pin keeps a raw open-ended range,
 * which the product's preset model cannot represent).
 */
function seedTimeFilterFromRoute(): void {
  const start = parseEpochParam(route.query[LINEAGE_START_TIME_PARAM]);
  const end = parseEpochParam(route.query[LINEAGE_END_TIME_PARAM]);
  if (start === undefined && end === undefined) {
    return;
  }
  if (start !== undefined && end !== undefined) {
    lineageStore.update({
      timePreset: 'customRange',
      customStartDate: dateString(start),
      customEndDate: dateString(end),
    });
  } else if (end !== undefined) {
    lineageStore.update({ timePreset: 'pointInTime', pointDate: dateString(end) });
  } else if (start !== undefined) {
    lineageStore.update({
      timePreset: 'customRange',
      customStartDate: dateString(start),
      customEndDate: dateString(Date.now()),
    });
  }
}

/**
 * Write the resolved time range back to the URL (replace, other query
 * params preserved), mirroring pin Lineage.tsx:585-616. No-op when the URL
 * already carries the range, so no navigation loop is possible.
 */
function writeTimeFilterToRoute(): void {
  const range = resolveLineageTimeRange(lineageStore.config);
  const query = { ...route.query };
  const nextStart = range.startTime?.toString();
  const nextEnd = range.endTime?.toString();
  if (query[LINEAGE_START_TIME_PARAM] === nextStart && query[LINEAGE_END_TIME_PARAM] === nextEnd) {
    return;
  }
  if (nextStart === undefined) {
    delete query[LINEAGE_START_TIME_PARAM];
  } else {
    query[LINEAGE_START_TIME_PARAM] = nextStart;
  }
  if (nextEnd === undefined) {
    delete query[LINEAGE_END_TIME_PARAM];
  } else {
    query[LINEAGE_END_TIME_PARAM] = nextEnd;
  }
  void router.replace({ query }).catch(() => undefined);
}

watch(
  () => resolveLineageTimeRange(lineageStore.config),
  () => writeTimeFilterToRoute(),
);

/**
 * DQ lineage fetch, mirroring pin Lineage.tsx:775-790 + 2133-2137: fetched
 * when the DataObservability layer is active (pin `isDQEnabled`), with the
 * current query filter. A failure is swallowed (pin sets the DQ lineage to
 * undefined) so a DQ failure never fails the graph. The focus is the
 * container entity on a platform view, like the main fetch.
 */
async function loadDqLineage(queryFilter: string): Promise<void> {
  dqIds.value = [];
  if (!dqEnabled.value || !graph.value) {
    return;
  }
  try {
    const payload = await getDataQualityLineage({
      fqn: currentFocus.value.fqn,
      upstreamDepth: upstreamDepth.value,
      ...(queryFilter ? { queryFilter } : {}),
    });
    dqIds.value = extractDqNodeIds(payload);
  } catch {
    dqIds.value = [];
  }
}

async function load(): Promise<void> {
  // A platform view with no resolvable container (no service/domains/data
  // products on the entity) cannot fetch: pin `resolvePlatformViewEntity`
  // has no target either. Error + revert to the focus view instead of
  // fetching the wrong entity or blanking the graph.
  if (lineageStore.platformView !== 'None' && !resolvePlatformViewFetchArgs(lineageStore.platformView, entityContext.value)) {
    message.error(t('lineage.platformViewUnavailable'));
    lineageStore.setPlatformView('None');
    return;
  }
  loading.value = true;
  errorMessage.value = '';
  denialMessage.value = '';
  graph.value = null;
  dqIds.value = [];
  clearHighlight();
  try {
    // The graph is search-backed, like the official lineage page
    // (rest/lineageAPI.ts getLineageDataByFQN → /v1/lineage/getLineage):
    // the traversal GET accepts no time params, so a time-filtered graph
    // can only come from the search endpoint. The time preset is part of
    // the reload key below; all-time sends no time params. A search
    // failure is shown, never silently replaced by an unfiltered
    // traversal fetch (that would present unfiltered data as filtered).
    // Pin sends query_filter: '' when no quick filter is set; the product
    // omits the param instead (absent means unfiltered on the server).
    const range = resolveLineageTimeRange(lineageStore.config);
    const queryFilter = buildLineageQueryFilter(lineageStore.quickFilters);
    const focus = currentFocus.value;
    const payload = await searchLineage({
      entityType: focus.entityType,
      fqn: focus.fqn,
      upstreamDepth: upstreamDepth.value,
      downstreamDepth: downstreamDepth.value,
      size: lineageStore.config.nodesPerLayer,
      ...(queryFilter ? { queryFilter } : {}),
      ...(range.startTime !== undefined ? { startTime: range.startTime } : {}),
      ...(range.endTime !== undefined ? { endTime: range.endTime } : {}),
    });
    graph.value = mapSearchLineage(payload, focus.fqn);
    await loadDqLineage(queryFilter);
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : t('lineage.loadFailed');
  } finally {
    loading.value = false;
  }
}

function openFullPage(): void {
  void router.push(lineageLocation(props.entityType, props.fqn));
}

async function onConnectEdge(payload: { from: LineageGraphNode; to: LineageGraphNode }): Promise<void> {
  // Pin `EntityLineageCanvas onConnect`: the canvas is read-only without
  // edit access (L1's guard, same wording). Drag-connect is already
  // disabled in the graph when !canEdit; this is the fail-closed second
  // check for programmatic connects. The denial surfaces inline (L1's
  // tested behavior), not as a toast, so the page shows it in place —
  // through `denialMessage`, not `errorMessage` (see its declaration).
  if (!canEdit.value) {
    denialMessage.value = t('lineage.editForbidden');
    return;
  }
  denialMessage.value = '';
  writing.value = true;
  errorMessage.value = '';
  try {
    await putEntityLineage({
      fromType: payload.from.entityType,
      fromFqn: payload.from.fullyQualifiedName,
      toType: payload.to.entityType,
      toFqn: payload.to.fullyQualifiedName,
    });
    await load();
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : t('lineage.writeFailed');
  } finally {
    writing.value = false;
  }
}

/**
 * Focus-entity context for the Layers panel (pin `getAssetLayerKeys`):
 * service + domains + data products, fetched once per entity from the
 * detail endpoint. A failure is swallowed — the panel then offers only
 * the always-available keys (overlays + Service view), never fails the
 * graph.
 */
async function loadEntityContext(): Promise<void> {
  entityContext.value = undefined;
  const endpoint = resolveDetailEndpoint(props.entityType, props.fqn);
  if (!endpoint) {
    return;
  }
  try {
    const payload = await apiRequest<unknown>(endpoint.path, {
      query: { fields: 'domains,dataProducts,service' },
    });
    entityContext.value = parseLineageEntityContext(payload);
  } catch {
    entityContext.value = undefined;
  }
}

function onChangeActiveLayer(layers: LineageLayer[]): void {
  lineageStore.setActiveLayer(layers);
  // Unchecking a settings-seeded overlay clears the session layer too,
  // so the overlay stays off (the panel shows the effective list).
  const sessionLayer = lineageStore.config.layer;
  if (
    (sessionLayer === 'ColumnLevelLineage' || sessionLayer === 'DataObservability') &&
    !layers.includes(sessionLayer)
  ) {
    lineageStore.update({ layer: 'EntityLineage' });
  }
}

function onChangePlatformView(view: LineagePlatformView): void {
  lineageStore.setPlatformView(view);
  // Pin `onPlatformViewChange`: a platform view clears the overlays.
  if (view !== 'None') {
    lineageStore.setActiveLayer([]);
  }
}

/**
 * Edge-delete modal endpoints. Computeds, not inline template lookups:
 * narrowing from `v-if="edgePendingDelete"` does not survive into the
 * arrow-function closures vue-tsc checks.
 */
const pendingEdgeFrom = computed(() => {
  const selection = edgePendingDelete.value;
  if (!selection || !graph.value) {
    return '';
  }
  return (
    graph.value.nodes.find((node) => node.id === selection.edge.source)?.displayName ??
    selection.edge.source
  );
});

const pendingEdgeTo = computed(() => {
  const selection = edgePendingDelete.value;
  if (!selection || !graph.value) {
    return '';
  }
  return (
    graph.value.nodes.find((node) => node.id === selection.edge.target)?.displayName ??
    selection.edge.target
  );
});

/** Pin `removeNodeHandler`: DELETE every connected entity edge by name. */
async function confirmNodeDelete(): Promise<void> {
  const node = nodePendingDelete.value;
  if (!node || !graph.value) {
    return;
  }
  if (!canEdit.value) {
    message.error(t('lineage.editForbidden'));
    return;
  }
  isDeletingNode.value = true;
  try {
    const connected = graph.value.edges.filter(
      (edge) => edge.source === node.id || edge.target === node.id,
    );
    let deleted = 0;
    let failed = false;
    for (const edge of connected) {
      const from = graph.value.nodes.find((item) => item.id === edge.source);
      const to = graph.value.nodes.find((item) => item.id === edge.target);
      if (!from || !to) {
        failed = true;
        continue;
      }
      try {
        await deleteEntityLineageByName({
          fromType: from.entityType,
          fromFqn: from.fullyQualifiedName,
          toType: to.entityType,
          toFqn: to.fullyQualifiedName,
        });
        deleted += 1;
      } catch {
        failed = true;
      }
    }
    if (connected.length > 0 && deleted === 0) {
      message.error(t('lineage.deleteFailed'));
      return;
    }
    if (failed) {
      message.error(t('lineage.deleteFailed'));
    }
    nodePendingDelete.value = undefined;
    selectedNode.value = undefined;
    await load();
  } finally {
    isDeletingNode.value = false;
  }
}

/** Pin `removeLineageHandler` / `removeColumnEdge` (edgeMutations.ts). */
async function confirmEdgeDelete(): Promise<void> {
  const selection = edgePendingDelete.value;
  if (!selection || !graph.value) {
    return;
  }
  if (!canEdit.value) {
    message.error(t('lineage.editForbidden'));
    return;
  }
  const from = graph.value.nodes.find((node) => node.id === selection.edge.source);
  const to = graph.value.nodes.find((node) => node.id === selection.edge.target);
  if (!from || !to) {
    message.error(t('lineage.deleteFailed'));
    return;
  }
  isDeletingEdge.value = true;
  try {
    let removed: boolean;
    if (selection.isColumnEdge) {
      if (!selection.sourceHandle || !selection.targetHandle) {
        message.error(t('lineage.deleteFailed'));
        return;
      }
      removed = await removeColumnLineageEdge(
        {
          fromType: from.entityType,
          fromFqn: from.fullyQualifiedName,
          toType: to.entityType,
          toFqn: to.fullyQualifiedName,
          fromId: selection.edge.source,
          toId: selection.edge.target,
        },
        { fromColumn: selection.sourceHandle, toColumn: selection.targetHandle },
      );
    } else {
      await deleteEntityLineageByName({
        fromType: from.entityType,
        fromFqn: from.fullyQualifiedName,
        toType: to.entityType,
        toFqn: to.fullyQualifiedName,
      });
      removed = true;
    }
    if (!removed) {
      message.error(t('lineage.deleteFailed'));
      return;
    }
    edgePendingDelete.value = undefined;
    selectedEdge.value = undefined;
    await load();
  } catch {
    message.error(t('lineage.deleteFailed'));
  } finally {
    isDeletingEdge.value = false;
  }
}

/** Pin `AddLineagePopover onSave` → `saveLineageEdge`, then refetch. */
async function onAddLineageSubmit(submission: AddLineageSubmission): Promise<void> {
  const request = editRequest.value;
  if (!request || !canEdit.value) {
    return;
  }
  const current = request.node;
  const pair = getLineageEditColumnPair(
    request.direction === 'upstream',
    request.columnFqn,
    submission.columnFqn,
  );
  isCreatingEdge.value = true;
  try {
    const saved =
      request.direction === 'upstream'
        ? await saveLineageEdge(
            {
              fromType: submission.entity.entityType,
              fromFqn: submission.entity.fqn,
              toType: current.entityType,
              toFqn: current.fullyQualifiedName,
              ...(submission.entity.id ? { fromId: submission.entity.id } : {}),
              toId: current.id,
            },
            pair,
          )
        : await saveLineageEdge(
            {
              fromType: current.entityType,
              fromFqn: current.fullyQualifiedName,
              toType: submission.entity.entityType,
              toFqn: submission.entity.fqn,
              fromId: current.id,
              ...(submission.entity.id ? { toId: submission.entity.id } : {}),
            },
            pair,
          );
    if (saved) {
      editRequest.value = undefined;
      await load();
    } else {
      message.error(t('lineage.addLineageFailed'));
    }
  } catch {
    message.error(t('lineage.addLineageFailed'));
  } finally {
    isCreatingEdge.value = false;
  }
}

/**
 * Pin `exportHandler`: async CSV via `exportLineageAsync`; the file is
 * downloaded from the CSV jobs tray, so the job is registered there
 * (same pattern as the metrics export) and a success toast is shown.
 */
async function onExportCsv(): Promise<void> {
  if (exportingCsv.value) {
    return;
  }
  exportingCsv.value = true;
  try {
    const range = resolveLineageTimeRange(lineageStore.config);
    const queryFilter = buildLineageQueryFilter(lineageStore.quickFilters);
    const focus = currentFocus.value;
    const job = await exportLineageAsync({
      fqn: focus.fqn,
      entityType: focus.entityType,
      upstreamDepth: upstreamDepth.value,
      downstreamDepth: downstreamDepth.value,
      ...(queryFilter ? { queryFilter } : {}),
      ...(range.startTime !== undefined ? { startTime: range.startTime } : {}),
      ...(range.endTime !== undefined ? { endTime: range.endTime } : {}),
    });
    if (job.jobId) {
      markCsvJobOwned(job.jobId);
    }
    notifyCsvJobsRefresh();
    message.success(t('lineage.exportCsvStarted'));
  } catch {
    message.error(t('lineage.exportCsvFailed'));
  } finally {
    exportingCsv.value = false;
  }
}

function onKeyDown(event: KeyboardEvent): void {
  // Never while a delete confirmation or the add-lineage popover is
  // open — those own their keys (pin guards the same way via focus).
  if (nodePendingDelete.value || edgePendingDelete.value || editRequest.value) {
    return;
  }
  const action = getDeleteKeyAction(event, {
    canEdit: canEdit.value,
    hasSelectedNode: Boolean(selectedNode.value && !selectedNode.value.isCenter),
    hasSelectedEdge: Boolean(selectedEdge.value),
  });
  if (!action) {
    return;
  }
  event.preventDefault();
  if (action === 'node' && selectedNode.value) {
    nodePendingDelete.value = selectedNode.value;
    return;
  }
  if (selectedEdge.value) {
    edgePendingDelete.value = selectedEdge.value;
  }
}

onMounted(() => window.addEventListener('keydown', onKeyDown));
onUnmounted(() => {
  window.removeEventListener('keydown', onKeyDown);
  window.clearTimeout(impactSearchTimer);
});

/**
 * Load-on-expand, mirroring pin `loadChildNodesHandler` (Lineage.tsx:
 * 1083-1160): one directional level via the `getLineage/{direction}`
 * endpoint (requested direction depth 1, other direction 0), merged into
 * the current graph. The node is marked expanded only on success, so a
 * failed expand can be retried.
 */
async function onExpandChildren(payload: {
  node: LineageGraphNode;
  direction: 'upstream' | 'downstream';
}): Promise<void> {
  if (!graph.value || !payload.node.entityType || !payload.node.fullyQualifiedName) {
    return;
  }
  const queryFilter = buildLineageQueryFilter(lineageStore.quickFilters);
  const range = resolveLineageTimeRange(lineageStore.config);
  writing.value = true;
  try {
    const result = await searchLineage({
      entityType: payload.node.entityType,
      fqn: payload.node.fullyQualifiedName,
      upstreamDepth: payload.direction === 'upstream' ? 1 : 0,
      downstreamDepth: payload.direction === 'downstream' ? 1 : 0,
      direction: payload.direction === 'upstream' ? 'Upstream' : 'Downstream',
      size: lineageStore.config.nodesPerLayer,
      ...(queryFilter ? { queryFilter } : {}),
      ...(range.startTime !== undefined ? { startTime: range.startTime } : {}),
      ...(range.endTime !== undefined ? { endTime: range.endTime } : {}),
    });
    const extra = mapSearchLineage(result, payload.node.fullyQualifiedName);
    graph.value = mergeLineageModels(graph.value, extra);
    if (payload.direction === 'upstream') {
      expandedUpstreamIds.value = [...expandedUpstreamIds.value, payload.node.id];
    } else {
      expandedDownstreamIds.value = [...expandedDownstreamIds.value, payload.node.id];
    }
    await loadDqLineage(queryFilter);
  } catch {
    message.error(t('lineage.loadFailed'));
  } finally {
    writing.value = false;
  }
}

/**
 * Collapse, mirroring pin `onNodeCollapse` (Lineage.tsx:1968-2015): the
 * direction-connected nodes/edges are removed and the node is marked
 * unexpanded, so it can be expanded again.
 */
function onCollapseChildren(payload: {
  node: LineageGraphNode;
  direction: 'upstream' | 'downstream';
}): void {
  if (!graph.value) {
    return;
  }
  graph.value = collapseLineageModel(graph.value, payload.node.id, payload.direction);
  if (payload.direction === 'upstream') {
    expandedUpstreamIds.value = expandedUpstreamIds.value.filter((id) => id !== payload.node.id);
  } else {
    expandedDownstreamIds.value = expandedDownstreamIds.value.filter((id) => id !== payload.node.id);
  }
}

// The URL seeds the time filter before the first fetch, so the first load
// already carries the saved range (pin Lineage.tsx:575-580).
seedTimeFilterFromRoute();

watch(
  () => [
    props.entityType,
    props.fqn,
    upstreamDepth.value,
    downstreamDepth.value,
    lineageStore.config.layer,
    lineageStore.activeLayer,
    lineageStore.platformView,
    lineageStore.quickFilters,
    lineageStore.config.timePreset,
    lineageStore.config.customStartDate,
    lineageStore.config.customEndDate,
    lineageStore.config.pointDate,
  ],
  () => {
    void load();
  },
  { immediate: true },
);

// Entity context is fetched after the first graph load (the context is
// only panel gating; it must never delay or reorder the first fetch).
watch(
  () => [props.entityType, props.fqn],
  () => {
    void loadEntityContext();
  },
  { immediate: true },
);
</script>

<template>
  <Spin :spinning="loading || writing">
    <Space direction="vertical" size="middle" class="lineage-canvas">
      <div v-if="variant === 'page' && showHeader">
        <PageHeader :header="t('lineage.title')" :sub-header="t('lineage.graphLead', { type: entityType, fqn })" test-id="lineage" />
      </div>
      <Typography.Paragraph v-else type="secondary">
        {{ t('lineage.tabLead', { type: entityType, fqn }) }}
      </Typography.Paragraph>
      <!--
        Pin `CustomControls.component.tsx:535-595` (header row): left —
        filters button + entity search; right — Lineage/Impact tabs,
        time filter, export icon button, config gear, fullscreen icon
        button. The diagram tab's search is the node search
        (`LineageSearchSelect`); the impact tab's is the table search.
        The open-full-page link is product tab/page navigation glue with
        no pin equivalent, kept after the fullscreen button.
      -->
      <Space wrap align="center" class="lineage-canvas__header">
        <Tooltip :title="t('lineage.filters')">
          <Button
            data-testid="filters-button"
            :type="filtersOpen ? 'primary' : 'default'"
            :aria-label="t('lineage.filters')"
            :aria-pressed="filtersOpen ? 'true' : 'false'"
            @click="filtersOpen = !filtersOpen"
          >
            <template #icon><FilterOutlined /></template>
          </Button>
        </Tooltip>
        <LineageSearchSelect
          v-if="activeView === 'diagram' && graph"
          :nodes="graph.nodes"
          @select-node="onSearchSelectNode"
          @select-column="onSearchSelectColumn"
        />
        <Input
          v-else-if="activeView === 'impact'"
          v-model:value="impactSearchInput"
          data-testid="lineage-impact-search"
          :placeholder="t('lineage.impactSearch')"
          allow-clear
        />
        <DetailTabs
          :tabs="viewTabs"
          :active-key="activeView"
          test-id="lineage-view-tabs"
          @change="onViewChange"
        />
        <LineageTimeFilter
          :value="lineageStore.config.timePreset"
          :custom-start-date="lineageStore.config.customStartDate"
          :custom-end-date="lineageStore.config.customEndDate"
          :point-date="lineageStore.config.pointDate"
          @change="(preset) => lineageStore.update({ timePreset: preset })"
          @apply-custom="(dates) => lineageStore.update({ timePreset: 'customRange', customStartDate: dates.startDate, customEndDate: dates.endDate })"
          @apply-point="(date) => lineageStore.update({ timePreset: 'pointInTime', pointDate: date })"
        />
        <Dropdown :trigger="['click']">
          <Tooltip :title="t('lineage.export')">
            <Button data-testid="export-button" :aria-label="t('lineage.export')">
              <template #icon><DownloadOutlined /></template>
            </Button>
          </Tooltip>
          <template #overlay>
            <Menu :items="exportMenuItems" @click="onExportMenuClick" />
          </template>
        </Dropdown>
        <Tooltip :title="t('lineage.config')">
          <Button
            data-testid="lineage-config"
            :aria-label="t('lineage.config')"
            @click="configModalOpen = true"
          >
            <template #icon><SettingOutlined /></template>
          </Button>
        </Tooltip>
        <Tooltip :title="isFullscreen ? t('lineage.exitFullscreen') : t('lineage.fullscreen')">
          <Button
            data-testid="lineage-fullscreen"
            :aria-label="isFullscreen ? t('lineage.exitFullscreen') : t('lineage.fullscreen')"
            @click="toggleFullscreen"
          >
            <template #icon><FullscreenOutlined /></template>
          </Button>
        </Tooltip>
        <Button
          v-if="variant === 'tab'"
          data-testid="lineage-open-full-page"
          type="link"
          @click="openFullPage"
        >
          {{ t('lineage.openFullPage') }}
        </Button>
      </Space>
      <!--
        Pin `CustomControls.component.tsx:460-535` (filter expansion):
        depth dropdown (impact tab only) + quick filters + a single
        Clear all. The time filter and quick filters no longer sit
        always visible below the header.
      -->
      <div v-if="filtersOpen" class="lineage-canvas__filters" data-testid="lineage-filters-section">
        <Select
          v-if="activeView === 'impact'"
          :value="impactNodeDepth"
          data-testid="lineage-impact-depth-select"
          :options="
            impactDepthOptions.map((depth) => ({
              value: depth,
              label: `${t('lineage.impactNodeDepth')}: ${depth}`,
            }))
          "
          @change="onImpactDepthChange"
        />
        <LineageQuickFilters
          :value="lineageStore.quickFilters"
          @change="(selections) => lineageStore.setQuickFilters(selections)"
        />
        <Button
          data-testid="lineage-clear-all"
          :disabled="!hasQuickFilterValues"
          @click="onClearAllFilters"
        >
          {{ t('lineage.clearAll') }}
        </Button>
      </div>
      <!--
        The alerts live inside a stable wrapper div on purpose: toggling a
        v-if sibling ahead of the graph would shift the parent's child
        slots and remount the graph (losing its view state) on every
        denial. Inside the div only the div's own children toggle.
      -->
      <div>
        <Alert v-if="denialMessage" type="error" show-icon :message="denialMessage" />
        <Alert v-if="errorMessage" type="error" show-icon :message="errorMessage" />
        <Alert
          v-else-if="!isDetailWired(entityType)"
          type="info"
          show-icon
          :message="t('lineage.unwired')"
        />
      </div>
      <Empty
        v-if="!loading && !errorMessage && empty"
        data-testid="lineage-empty"
        :description="t('lineage.emptyGraph')"
      />
      <template v-if="activeView === 'diagram'">
        <LineageGraph
          ref="graphRef"
          v-if="graph && !empty && !errorMessage"
          :model="graph"
          :variant="variant"
          :highlighted-column-fqns="highlightedColumnFqns"
          :highlighted-node-ids="highlightedNodeIds"
          :highlighted-edge-ids="highlightedEdgeIds"
          :dq-node-ids="dqHighlightResult.nodeIds"
          :dq-edge-ids="dqHighlightResult.edgeIds"
          :expanded-upstream-ids="expandedUpstreamIds"
          :expanded-downstream-ids="expandedDownstreamIds"
          :force-column-edges="columnOverlay"
          :pipeline-view-mode="lineageStore.config.pipelineViewMode"
          :can-edit="canEdit"
          :entity-type="entityType"
          :entity-context="entityContext"
          :active-layer="effectiveLayers"
          :platform-view="lineageStore.platformView"
          :fullscreen="isFullscreen"
          @open-node="onOpenNode"
          @select-node="(node) => { selectedNode = node; }"
          @connect="onConnectEdge"
          @expand-children="onExpandChildren"
          @collapse-children="onCollapseChildren"
          @select-edge="(selection) => { selectedEdge = selection; }"
          @edit-lineage="(request) => { editRequest = request; }"
          @delete-node="(node) => { nodePendingDelete = node; }"
          @delete-edge="(selection) => { edgePendingDelete = selection; }"
          @change-active-layer="onChangeActiveLayer"
          @change-platform-view="onChangePlatformView"
        />
      </template>
      <!-- Impact view (pin EntityLineageTab ?mode=impact_analysis): the
           server-backed LineageTable (L5); the mode wiring above selects
           this branch from the URL. -->
      <LineageTable
        v-else
        ref="tableRef"
        :entity-type="entityType"
        :fqn="fqn"
        :search-value="impactSearchValue"
        @update:depth-options="(options) => { impactDepthOptions = options; }"
      />
      <LineageEntityDrawer
        :open="Boolean(drawerNode)"
        :entity-type="drawerNode?.entityType ?? ''"
        :fqn="drawerNode?.fullyQualifiedName ?? ''"
        :display-name="drawerNode?.displayName || drawerNode?.name"
        :path-label="drawerNode?.pathLabel"
        @close="drawerNode = undefined"
      />
      <LineageConfigModal
        :open="configModalOpen"
        :config="lineageStore.config"
        @ok="onConfigSave"
        @cancel="configModalOpen = false"
      />
      <LineageNodeDeleteModal
        v-if="nodePendingDelete"
        :open="true"
        :kind="'node'"
        :name="nodePendingDelete.displayName || nodePendingDelete.name"
        :deleting="isDeletingNode"
        @confirm="confirmNodeDelete"
        @cancel="nodePendingDelete = undefined"
      />
      <LineageNodeDeleteModal
        v-if="edgePendingDelete"
        :open="true"
        :kind="edgePendingDelete.isColumnEdge ? 'column' : 'edge'"
        :from="pendingEdgeFrom"
        :to="pendingEdgeTo"
        :deleting="isDeletingEdge"
        @confirm="confirmEdgeDelete"
        @cancel="edgePendingDelete = undefined"
      />
      <AddLineagePopover
        v-if="editRequest"
        :open="true"
        :node-name="editRequest.node.displayName || editRequest.node.name"
        :node-id="editRequest.node.id"
        :direction="editRequest.direction"
        :column-fqn="editRequest.columnFqn"
        :canvas-nodes="graph?.nodes ?? []"
        :submitting="isCreatingEdge"
        @submit="onAddLineageSubmit"
        @close="editRequest = undefined"
      />
      <Typography.Text v-if="center" type="secondary">
        {{ t('lineage.focus', { name: center.displayName || center.name }) }}
      </Typography.Text>
    </Space>
  </Spin>
</template>

<style scoped>
.lineage-canvas {
  width: 100%;
}
.lineage-canvas__header {
  width: 100%;
}
.lineage-canvas__filters {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
  padding: 12px;
  border: 1px solid var(--sm-border-secondary);
  border-radius: var(--sm-border-radius);
  background: var(--sm-bg-container);
}
</style>
