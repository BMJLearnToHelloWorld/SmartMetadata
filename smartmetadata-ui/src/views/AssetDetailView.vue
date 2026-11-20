<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute, useRouter } from 'vue-router';
import {Alert, Button, Empty, Form, Input, Select, Space, Tag, Typography, message} from 'ant-design-vue';
import SmTable from '@/components/shared/SmTable.vue';
import SmRichTextEditor from '@/components/shared/SmRichTextEditor.vue';
import FormModal from '@/components/shared/FormModal.vue';
import { listEntityActivity } from '@/api/activity';
import { apiEndpointLocation, listApiEndpoints, type ApiEndpointRef } from '@/api/apiCollections';
import { listCatalogPipelineStatuses } from '@/api/catalogPipelines';
import { createConversation, listConversations } from '@/api/conversations';
import { listCustomProperties } from '@/api/customProperties';
import { fetchAssetDetail, followAsset, patchAsset, unfollowAsset, updateSchemaRowTags } from '@/api/entities';
import { updateDataModelColumn, updateTableColumn } from '@/api/columns';
import { getDerivedPermissionFlags } from '@/api/permissions';
import type { OperationPermissions } from '@/api/permissions';
import { getQueryCount } from '@/api/queries';
import { getVoteStatus, voteAsset, type VoteType } from '@/api/votes';
import { getLatestTableProfile, getTableSampleData, getTopicSampleData, listTableProfiles } from '@/api/profiler';
import { listTestCases } from '@/api/testCases';
import { getEntityUsage } from '@/api/usage';
import LineageCanvas from '@/components/lineage/LineageCanvas.vue';
import GenericTab from '@/components/customize/GenericTab.vue';
import AssetDetailPiece, {
  type AssetDetailPieceContext,
  type AssetDetailPieceId,
} from '@/views/AssetDetailPiece.vue';
import { assetTabKeys, type AssetTabKey } from '@/catalog/assetTabs';
import { DetailWidgetKeys } from '@/catalog/detailWidgetDispatch';
import { entityDetailTabDef, entityDetailTabDefs, isOfficiallySplit, preservedTabKeys } from '@/catalog/entityDetailTabs';
import { isDetailWired, lineageLocation, TABLE_USAGE_SUMMARY_FIELD, USAGE_SUMMARY_ENTITY_TYPES } from '@/catalog/entityRoutes';
import {
  findCustomizedTabEntry,
  getDetailsTabWithNewLabel,
  getRenderedActiveTab,
  pageTypeForEntityType,
  useCustomPages,
} from '@/composables/useCustomPages';
import { resolveWidgetLayout } from '@/composables/customizeWidgetLayout';
import { isWidgetLayoutTab } from '@/views/admin/persona/editors/customizePageData';
import { getTierTag } from '@/ingestion/tierTags';
import { getUsagePercentile } from '@/catalog/usagePercentile';
import {
  columnNullPoints,
  namedSeries,
  profilesToRowCountPoints,
  testResultsToStatusPoints,
  usageToPoints,
} from '@/features/charts/series';
import { seriesWindow, type ChartSeries } from '@/features/charts/types';
import AssetActivityPanel from '@/features/crud/AssetActivityPanel.vue';
import AssetCustomPropertiesPanel from '@/features/crud/AssetCustomPropertiesPanel.vue';
import AssetOverviewFields from '@/features/crud/AssetOverviewFields.vue';
import AssetRelatedPanel from '@/features/crud/AssetRelatedPanel.vue';
import AssetProfilerPanel from '@/features/crud/AssetProfilerPanel.vue';
import AssetSamplePanel from '@/features/crud/AssetSamplePanel.vue';
import EntityDetailShell from '@/features/crud/EntityDetailShell.vue';
import { requiredField } from '@/features/crud/formRules';
import TableQueries from '@/features/queries/TableQueries.vue';
import type { EntityBreadcrumb, EntityDetailTab } from '@/features/crud/types';
import {
  loadGovernanceCatalog,
  ownerKey,
  parseOwnerKey,
  type GovernanceCatalog,
} from '@/governance/catalogOptions';
import { descriptionPatch, domainsPatch, extensionPatch, ownersPatch, tagsPatch, columnTagsPatch, toTagLabel, type TagLabelInput } from '@/governance/assetPatch';
import { isPipelineTaskGraphEmpty, mapPipelineTaskGraph } from '@/pipeline/taskGraph';
import { toEntityLink } from '@/quality/entityLink';
import { useAuthStore } from '@/stores/auth';
import { usePermissionStore } from '@/stores/permissions';
import type { AssetDetail, CatalogPipelineStatus, SchemaRow, TagRef } from '@/types/api';
import type { TagSource } from '@/types/governance';
import type { ActivityEvent, Conversation, CustomPropertyDef } from '@/types/collaboration';
import type { TableProfile, TableSampleData, TestCase, TopicSampleData } from '@/types/quality';
import type { WidgetConfig } from '@/views/admin/persona/editors/customizeTypes';

const props = defineProps<{
  entityType: string;
  fqn: string;
}>();

const router = useRouter();
const route = useRoute();
const { t, te } = useI18n();
const auth = useAuthStore();
const permissionStore = usePermissionStore();

// C-4 consume side: the selected persona's customized page for this
// entity type reorders and renames the detail tabs (official
// `getDetailsTabWithNewLabel` replacement semantics, keeping only the
// product-only keys listed at the call site — see
// `useCustomPages.ts`). Types with no PageType (`query`) yield no
// customization and always render their defaults.
const pageType = computed(() => pageTypeForEntityType(props.entityType));
const { customizedPage } = useCustomPages(pageType);

const loading = ref(false);
const errorMessage = ref('');
const asset = ref<AssetDetail | null>(null);
const queryCount = ref<number | undefined>(undefined);
const catalog = ref<GovernanceCatalog>({ owners: [], tags: [], domains: [] });
/** D-F2 schema-cell edit flags (per-surface derived permissions) plus the
    deleted read-only gate; fail-closed (all false) until loaded. */
const schemaTagAccess = ref({ canEditTags: false, canEditGlossaryTerms: false, readOnly: false });
/** D-4 description + custom-properties derivation source: the entity's
    permission operations from the store (cache-shared with the
    usageSummary and schema branches below). */
const assetOps = ref<OperationPermissions | null>(null);

/**
 * D-4 derived flags (official getDerivedPermissionFlags, DescriptionWidget
 * shape): the entity's `deleted` gates every Edit* flag. The D-F2
 * per-surface deleted convention applies only to column tags, not to
 * the description derivation, which always passes `deleted`.
 */
const assetFlags = computed(() =>
  getDerivedPermissionFlags(assetOps.value ?? {}, asset.value?.deleted === true),
);
const canEditDescription = computed(() => assetFlags.value.canEditDescription);
const canEditCustomFields = computed(() => assetFlags.value.canEditCustomFields);
/**
 * D-4 governance-modal gate (pin DataAssetsHeader hasEditableMetadata):
 * the modal writes description/owners/tags/domains, so it is the OR of
 * those field flags. The P1 admin line ORs in on top.
 */
const canEditGovernance = computed(
  () =>
    permissionStore.isAdminUser ||
    assetFlags.value.canEditDescription ||
    assetFlags.value.can('EditOwners') ||
    assetFlags.value.canEditTags ||
    assetFlags.value.canEditDomains,
);
/** Custom-properties read gate: null while the permission fetch is still resolving. */
const customPropsCanView = computed<boolean | null>(() =>
  loading.value ? null : assetOps.value ? assetFlags.value.canViewCustomFields : false,
);

/**
 * Official isDescriptionExpandedFor (DescriptionWidget): the description
 * starts unfolded when the entity type's primary content collection is
 * empty, so the page is not blank. `schemaRows` is the proxy for the
 * column/field collections (table / dataModel / topic / searchIndex).
 */
const descriptionExpanded = computed(() => {
  const a = asset.value;
  if (!a) {
    return false;
  }
  switch (props.entityType) {
    case 'table':
    case 'dashboardDataModel':
    case 'topic':
    case 'searchIndex':
      return a.schemaRows.length === 0;
    case 'dashboard':
      return (a.charts?.length ?? 0) === 0;
    case 'mlmodel':
      return (a.mlFeatures?.length ?? 0) === 0;
    case 'pipeline':
      return (a.tasks?.length ?? 0) === 0;
    case 'storedProcedure':
      return !(a.storedProcedureCode?.code ?? '').trim();
    default:
      return false;
  }
});

/**
 * D-3 description-cell save: the same description JSON Patch as
 * onSaveGovernance, on its own. Throws on failure so the cell keeps
 * its editor open.
 */
async function onDescriptionUpdate(description: string): Promise<void> {
  if (!asset.value?.id) {
    return;
  }
  await patchAsset(props.entityType, asset.value.id, descriptionPatch(asset.value.description, description));
  message.success(t('asset.updated'));
  await load();
}
const tests = ref<TestCase[]>([]);
const testsError = ref('');
const tableSample = ref<TableSampleData | null>(null);
const topicSample = ref<TopicSampleData | null>(null);
const tableProfile = ref<TableProfile | null>(null);
const rowCountSeries = ref<ChartSeries[]>([]);
const usageSeries = ref<ChartSeries[]>([]);
const columnNullSeries = ref<ChartSeries[]>([]);
const testStatusSeries = ref<ChartSeries[]>([]);
const observabilityError = ref('');
const activity = ref<ActivityEvent[]>([]);
const conversations = ref<Conversation[]>([]);
const collaborationError = ref('');
const customProperties = ref<CustomPropertyDef[]>([]);
const customPropsError = ref('');
const pipelineStatuses = ref<CatalogPipelineStatus[]>([]);
const pipelineStatusError = ref('');
const pipelineStatusTried = ref(false);
const apiEndpoints = ref<ApiEndpointRef[]>([]);
const apiEndpointsError = ref('');
const activeTab = ref('');
const editOpen = ref(false);
const editKey = ref(0);
const descriptionEditorRef = ref<{ getEditorContent: () => string } | null>(null);
const commentOpen = ref(false);
const propsOpen = ref(false);
const saving = ref(false);
const commentMessage = ref('');
const extensionForm = reactive<Record<string, string>>({});
const editForm = reactive({
  description: '',
  ownerKeys: [] as string[],
  tagFqns: [] as string[],
  domainIds: [] as string[],
});

const decodedFqn = computed(() => props.fqn);

function entityLabel(entityType: string): string {
  const key = `explore.entity.${entityType}`;
  return te(key) ? t(key) : entityType;
}

const breadcrumbs = computed<EntityBreadcrumb[]>(() => [
  { label: t('nav.explore'), to: { name: 'search' } },
  { label: entityLabel(props.entityType) },
  { label: asset.value?.displayName || asset.value?.name || decodedFqn.value },
]);

const TAB_TEST_IDS: Record<AssetTabKey, string> = {
  overview: 'asset-tab-overview',
  schema: 'asset-tab-schema',
  charts: 'asset-tab-charts',
  features: 'asset-tab-features',
  tasks: 'asset-tab-tasks',
  executions: 'asset-tab-executions',
  code: 'asset-tab-code',
  lineage: 'asset-tab-lineage',
  quality: 'asset-tab-quality',
  activity: 'asset-tab-activity',
  customProperties: 'asset-tab-custom',
};

const isSplit = computed(() => isOfficiallySplit(props.entityType));

// Official tier rule (utils/TablePureUtils.ts getTierTags): the first tag
// whose FQN starts with the `Tier.` category. Rendered only when present:
// the product never invents a default tier.
const tierTag = computed(() => (asset.value ? getTierTag(asset.value.tags) : undefined));

const followers = computed(() => asset.value?.followers ?? []);
const currentUserId = computed(() => auth.user?.id || '');
const isFollowing = computed(
  () => Boolean(currentUserId.value) && followers.value.some((follower) => follower.id === currentUserId.value),
);
const followLoading = ref(false);

const voteStatus = computed(() =>
  getVoteStatus(currentUserId.value, asset.value?.votes),
);
const voteLoading = ref(false);

async function onToggleVote(direction: 'votedUp' | 'votedDown'): Promise<void> {
  if (!asset.value?.id || !currentUserId.value) {
    return;
  }
  voteLoading.value = true;
  try {
    const next: VoteType = voteStatus.value === direction ? 'unVoted' : direction;
    await voteAsset(props.entityType, asset.value.id, next);
    // The vote endpoint answers a ChangeEvent, not the entity, so reload
    // for authoritative counts — the same pattern as follow/unfollow.
    await load();
  } catch (error) {
    message.error(error instanceof Error ? error.message : t('asset.voteFailed'));
  } finally {
    voteLoading.value = false;
  }
}

async function onToggleFollow(): Promise<void> {
  if (!asset.value?.id || !currentUserId.value) {
    return;
  }
  followLoading.value = true;
  try {
    if (isFollowing.value) {
      await unfollowAsset(props.entityType, asset.value.id, currentUserId.value);
    } else {
      await followAsset(props.entityType, asset.value.id, currentUserId.value);
    }
    // Reload for the authoritative followers list; never keep an optimistic
    // follow state after a failed or partial write.
    await load();
  } catch (error) {
    message.error(error instanceof Error ? error.message : t('asset.followFailed'));
  } finally {
    followLoading.value = false;
  }
}

function residualReasonFor(key: string): string {
  const def = entityDetailTabDef(props.entityType, key);
  return def?.residual ? t(def.residual) : '';
}

const tabs = computed<EntityDetailTab[]>(() => {
  if (!asset.value) {
    return [];
  }
  const defs = entityDetailTabDefs(props.entityType);
  const defaults: EntityDetailTab[] = defs
    ? defs.map((def) => ({
        key: def.key,
        label: t(`asset.tabs.${def.labelKey}`),
        testId: `asset-tab-${def.key}`,
        // Pin tableQueryCountFn: the badge shows once the count resolves;
        // while it is pending (or failed) the tab renders without one.
        ...(def.key === 'table_queries' && queryCount.value !== undefined
          ? { count: queryCount.value }
          : {}),
      }))
    : assetTabKeys(props.entityType).map((key) => ({
        key,
        label: t(`asset.tabs.${key}`),
        testId: TAB_TEST_IDS[key],
      }));
  // The customized tab list replaces the defaults, in the customized
  // order; only product-only tabs survive a customization that never
  // mentions them — `preservedTabKeys` carries the per-type evidence.
  return getDetailsTabWithNewLabel(defaults, customizedPage.value?.tabs, {
    preserveKeys: preservedTabKeys(props.entityType, defs !== null),
  });
});

// B-8 widget layer: a tab renders the widget grid only when the
// customized page carries a tab entry resolving to the rendered tab
// key AND the entry's official id is a mount tab for this page type
// (`isWidgetLayoutTab` — the tab whose detail page officially mounts
// `GenericTab`). The editor saves an entry for every system tab with
// `layout: []` on the non-editable ones, so entry existence alone
// would blank every non-primary tab of any editor-saved page; the
// mount check is what keeps those tabs on their fixed children. The
// check uses the ENTRY's id — not the rendered key, which may differ
// through an alias (e.g. rendered `apiEndpoints` from entry
// `apiEndpoint`, rendered `overview` from entry `details`) — because
// the official mount set is keyed by tab id. A resolved mount tab
// whose layout is []/missing/non-array still renders an empty grid:
// no default pane leaks in — except the Container mount excluded by
// the data-model mutual-exclusion gate below, which renders its
// default pane. `null` means "no grid" (no entry, a non-mount entry,
// an excluded Container mount, or no customized page): the existing
// default pane renders unchanged. An empty array is a real (empty)
// grid, so callers compare against `null` rather than truthiness.
function widgetLayoutFor(slotKey: string): WidgetConfig[] | null {
  const pageTypeValue = pageType.value;
  if (!pageTypeValue) {
    return null;
  }
  const entry = findCustomizedTabEntry(customizedPage.value?.tabs, slotKey);
  if (!entry?.id) {
    return null;
  }
  if (!isWidgetLayoutTab(pageTypeValue, entry.id)) {
    return null;
  }
  // Container mount mutual exclusion (official
  // `utils/ContainerDetailUtils.tsx:103-152`, driven by
  // `ContainerPage.tsx:329-330` `isDataModelEmpty =
  // isEmpty(containerData?.dataModel)`): an empty data model mounts
  // GenericTab ONLY on CHILDREN, a non-empty one ONLY on SCHEMA (the
  // other tab renders fixed children). The two mounts never coexist,
  // so at most one Container grid mounts and the two slots can never
  // emit duplicate widget ids. The product has no dataModel field on
  // AssetDetail; `schemaRows` is the proxy — `schemaRowsFor` derives
  // container rows solely from `dataModel.columns` (`api/entities.ts`),
  // so an empty row list means no named data-model columns. Bounded
  // divergence (residual R-3): a data model present but yielding no
  // named columns — zero columns, or only unnamed ones dropped by
  // `mapColumns` (`api/entities.ts:114-117`) — reads as empty here
  // while official `isEmpty(dataModel)` reads the non-empty object
  // as non-empty. The mount tab flips: official mounts the grid on
  // SCHEMA, the product mounts it on CHILDREN and the schema tab
  // renders its fixed pane, whose schema piece shows the empty
  // state rather than a table. The content shown is equivalent
  // (empty schema plus the children list). The gate fires only for
  // Container (the sole two-mount page type).
  if (props.entityType === 'container') {
    const dataModelEmpty = (asset.value?.schemaRows.length ?? 0) === 0;
    if (
      (entry.id === 'children' && !dataModelEmpty) ||
      (entry.id === 'schema' && dataModelEmpty)
    ) {
      return null;
    }
  }
  return resolveWidgetLayout(pageTypeValue, entry.id, customizedPage.value);
}

// Content-key → shared content piece, following the official
// per-type widget switches (each type's `getWidgetsFromKey` checks
// its specific keys, then the shared CommonWidgets dispatcher; see
// `detailWidgetDispatch.ts` for the file:line table). Keys with no
// product pane are absent on purpose, so their cells stay empty
// (residual R-4: data products, related metrics / metric hierarchy):
// table constraints / partitioned keys / table aliases / asset
// health (no product panes), data products (no field on the detail
// payload), experts / tier / certification (no detail surfaces;
// tier already renders in the shell header), knowledge articles,
// related metrics / metric hierarchy (no metric surfaces). The
// widget's `config` (e.g. the custom-properties propertyLayout) is
// not consumed: the product panels take no layout input.
const WIDGET_CONTENT_PIECES: Record<string, AssetDetailPieceId> = {
  [DetailWidgetKeys.TABLE_SCHEMA]: 'schemaTable',
  [DetailWidgetKeys.TOPIC_SCHEMA]: 'schemaTable',
  [DetailWidgetKeys.CONTAINER_SCHEMA]: 'schemaTable',
  [DetailWidgetKeys.SEARCH_INDEX_FIELDS]: 'schemaTable',
  [DetailWidgetKeys.DATA_MODEL]: 'schemaTable',
  [DetailWidgetKeys.DATABASE_SCHEMA]: 'related',
  [DetailWidgetKeys.TABLES]: 'related',
  [DetailWidgetKeys.CONTAINER_CHILDREN]: 'related',
  [DetailWidgetKeys.FREQUENTLY_JOINED_TABLES]: 'frequentlyJoined',
  [DetailWidgetKeys.CHARTS_TABLE]: 'chartsTables',
  [DetailWidgetKeys.PIPELINE_TASKS]: 'tasks',
  [DetailWidgetKeys.STORED_PROCEDURE_CODE]: 'code',
  [DetailWidgetKeys.ML_MODEL_FEATURES]: 'features',
  [DetailWidgetKeys.API_ENDPOINTS]: 'apiEndpoints',
  [DetailWidgetKeys.API_SCHEMA]: 'apiSchema',
  [DetailWidgetKeys.METRIC_DEFINITION]: 'metricExpression',
  [DetailWidgetKeys.CUSTOM_PROPERTIES]: 'customProperties',
  [DetailWidgetKeys.DESCRIPTION]: 'description',
  [DetailWidgetKeys.TAGS]: 'tags',
  [DetailWidgetKeys.GLOSSARY_TERMS]: 'glossaryTerms',
  [DetailWidgetKeys.OWNERS]: 'owners',
  [DetailWidgetKeys.DOMAIN]: 'domains',
};

function pieceForContentKey(contentKey: string | null): AssetDetailPieceId | null {
  return contentKey ? (WIDGET_CONTENT_PIECES[contentKey] ?? null) : null;
}

// Pin detail header: the percentile renders only when usageSummary is
// present (the `&&` gate), with a missing rank falling back to 0.
const usagePercentileText = computed(() =>
  asset.value?.usageSummary
    ? getUsagePercentile(
        asset.value.usageSummary.weeklyStats?.percentileRank ?? 0,
        false,
        (key) => t(key),
      )
    : undefined,
);

function onTabChange(key: string): void {
  activeTab.value = key;
  void router
    .replace({
      name: 'asset',
      params: { entityType: props.entityType, fqn: props.fqn },
      query: { ...route.query, tab: key },
    })
    .catch(() => undefined);
}

const apiEndpointColumns = computed(() => [
  { title: t('asset.name'), dataIndex: 'name', key: 'name' },
  { title: t('asset.apiRequestMethod'), dataIndex: 'requestMethod', key: 'requestMethod' },
  { title: t('asset.apiEndpointUrl'), dataIndex: 'endpointURL', key: 'endpointURL' },
]);

const apiEndpointSchemaJson = (schema: Record<string, unknown> | undefined): string => {
  if (!schema) {
    return '';
  }
  try {
    return JSON.stringify(schema, null, 2);
  } catch {
    return '';
  }
};

const taskGraph = computed(() => mapPipelineTaskGraph(asset.value?.tasks, asset.value?.pipelineStatus));
const taskGraphEmpty = computed(() => isPipelineTaskGraphEmpty(taskGraph.value));
const executionRows = computed(() => {
  if (pipelineStatuses.value.length) {
    return pipelineStatuses.value;
  }
  return asset.value?.pipelineStatus ? [asset.value.pipelineStatus] : [];
});

/**
 * D-F2 schema-column widths per surface, taken from the official column
 * definitions (see DF2-BENCHMARK.md §1.1): name / type / description /
 * Tags / Glossary Terms. The five surfaces do not share one width — a
 * single shared width would misalign every surface against official.
 */
const SCHEMA_COLUMN_WIDTHS: Record<
  string,
  { name: number; dataType: number; description: number; tags: number; glossaryTerms: number }
> = {
  table: { name: 200, dataType: 150, description: 300, tags: 230, glossaryTerms: 230 },
  topic: { name: 220, dataType: 220, description: 350, tags: 300, glossaryTerms: 300 },
  container: { name: 300, dataType: 220, description: 350, tags: 300, glossaryTerms: 300 },
  searchIndex: { name: 220, dataType: 180, description: 320, tags: 250, glossaryTerms: 250 },
  dashboardDataModel: { name: 250, dataType: 100, description: 350, tags: 250, glossaryTerms: 250 },
};

/** Entity types whose detail view renders the D-F2 schema table. */
const SCHEMA_COLUMN_ENTITY_TYPES = Object.keys(SCHEMA_COLUMN_WIDTHS);

const schemaColumns = computed(() => {
  const widths = SCHEMA_COLUMN_WIDTHS[props.entityType];
  if (!widths) {
    return [
      { title: t('asset.columns.name'), dataIndex: 'name', key: 'name' },
      { title: t('asset.columns.dataType'), dataIndex: 'dataType', key: 'dataType', width: 180 },
      { title: t('asset.columns.description'), dataIndex: 'description', key: 'description' },
    ];
  }
  return [
    { title: t('asset.columns.name'), dataIndex: 'name', key: 'name', width: widths.name },
    { title: t('asset.columns.dataType'), dataIndex: 'dataType', key: 'dataType', width: widths.dataType },
    { title: t('asset.columns.description'), dataIndex: 'description', key: 'description', width: widths.description },
    // D-F2 read side: Tags and Glossary Terms share the row's single tags
    // list (official SchemaTable's shared `TAGS` dataIndex, split by
    // TagSource at render time); widths are per surface, not unified.
    { title: t('asset.fields.tags'), dataIndex: 'tags', key: 'tags', width: widths.tags },
    { title: t('asset.tabs.glossaryTerms'), dataIndex: 'tags', key: 'glossaryTerms', width: widths.glossaryTerms },
  ];
});

// Official SchemaTable's second guard: only STRUCT columns with loaded
// nested columns get an expand icon.
const schemaExpandable = {
  rowExpandable: (record: SchemaRow) => (record.children?.length ?? 0) > 0,
};

const refColumns = computed(() => [
  { title: t('asset.columns.name'), dataIndex: 'name', key: 'name' },
  { title: t('asset.columns.type'), dataIndex: 'type', key: 'type', width: 160 },
  { title: t('asset.columns.fqn'), dataIndex: 'fullyQualifiedName', key: 'fullyQualifiedName' },
]);

const featureColumns = computed(() => [
  { title: t('asset.columns.name'), dataIndex: 'name', key: 'name' },
  { title: t('asset.columns.dataType'), dataIndex: 'dataType', key: 'dataType', width: 160 },
  { title: t('asset.columns.description'), dataIndex: 'description', key: 'description' },
]);

const hyperColumns = computed(() => [
  { title: t('asset.columns.name'), dataIndex: 'name', key: 'name' },
  { title: t('asset.columns.value'), dataIndex: 'value', key: 'value' },
  { title: t('asset.columns.description'), dataIndex: 'description', key: 'description' },
]);

const executionColumns = computed(() => [
  { title: t('asset.columns.timestamp'), dataIndex: 'timestamp', key: 'timestamp', width: 180 },
  { title: t('asset.columns.status'), dataIndex: 'executionStatus', key: 'executionStatus', width: 140 },
  { title: t('asset.columns.executionId'), dataIndex: 'executionId', key: 'executionId' },
]);

function formatTs(value?: number): string {
  if (typeof value !== 'number') {
    return '—';
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toISOString();
}

function resetSecondary(): void {
  tests.value = [];
  testsError.value = '';
  tableSample.value = null;
  topicSample.value = null;
  tableProfile.value = null;
  rowCountSeries.value = [];
  usageSeries.value = [];
  columnNullSeries.value = [];
  testStatusSeries.value = [];
  observabilityError.value = '';
  activity.value = [];
  conversations.value = [];
  collaborationError.value = '';
  customProperties.value = [];
  customPropsError.value = '';
  pipelineStatuses.value = [];
  pipelineStatusError.value = '';
  pipelineStatusTried.value = false;
  apiEndpoints.value = [];
  apiEndpointsError.value = '';
  activeTab.value = '';
  queryCount.value = undefined;
}

async function load(): Promise<void> {
  loading.value = true;
  errorMessage.value = '';
  asset.value = null;
  schemaTagAccess.value = { canEditTags: false, canEditGlossaryTerms: false, readOnly: false };
  resetSecondary();
  if (!isDetailWired(props.entityType)) {
    errorMessage.value = t('asset.unwired', { type: props.entityType });
    loading.value = false;
    return;
  }
  try {
    // The pin requests usageSummary only when the viewer holds
    // VIEW_USAGE, on the four header-percentile entity types, so the
    // permission is resolved before the detail fetch. A failed
    // permission read fails closed (no usageSummary requested). The
    // resource name is the entity type itself (pin ResourceEntity:
    // 'table' | 'dashboard' | 'pipeline' | 'mlmodel').
    let extraFields: string[] | undefined;
    if (USAGE_SUMMARY_ENTITY_TYPES.includes(props.entityType)) {
      const entityOps = await permissionStore
        .getEntityPermissionByFqn(props.entityType, decodedFqn.value)
        .catch(() => null);
      if (entityOps && getDerivedPermissionFlags(entityOps).can('ViewUsage')) {
        extraFields = [TABLE_USAGE_SUMMARY_FIELD];
      }
    }
    asset.value = await fetchAssetDetail(
      props.entityType,
      decodedFqn.value,
      extraFields ? { extraFields } : undefined,
    );
    // D-4: one store read for the description + custom-properties
    // derivation. The usageSummary branch above and the schema branch
    // below populate the same per-entity cache key, so this is a cache
    // hit whenever they ran; no extra request is issued for those
    // types. A failed read fails closed (assetOps stays null).
    assetOps.value = await permissionStore
      .getEntityPermissionByFqn(props.entityType, decodedFqn.value)
      .catch(() => null);
    // D-F2 schema-cell permissions, per-surface official convention: Table
    // and Container pass `deleted` into the derivation, Topic /
    // SearchIndex / DataModel do not (their cells take `deleted` as a
    // separate read-only gate instead). A failed permission read fails
    // closed — the cells stay read-only — like the usageSummary gate
    // above.
    if (SCHEMA_COLUMN_ENTITY_TYPES.includes(props.entityType)) {
      const deleted = asset.value.deleted === true;
      const ops = await permissionStore
        .getEntityPermissionByFqn(props.entityType, decodedFqn.value)
        .catch(() => null);
      if (ops) {
        const passDeleted = props.entityType === 'table' || props.entityType === 'container';
        const flags = getDerivedPermissionFlags(ops, passDeleted ? deleted : false);
        schemaTagAccess.value = {
          canEditTags: flags.canEditTags,
          canEditGlossaryTerms: flags.canEditGlossaryTerms,
          readOnly: deleted,
        };
      } else {
        schemaTagAccess.value = { canEditTags: false, canEditGlossaryTerms: false, readOnly: deleted };
      }
    }
    const requestedTab = typeof route.query.tab === 'string' ? route.query.tab : '';
    activeTab.value = getRenderedActiveTab(tabs.value, requestedTab || undefined);
    // Pin tableQueryCountFn runs on the table page: the count resolves
    // independently of the tab mount, and a failure leaves the tab
    // without a badge rather than failing the page.
    if (props.entityType === 'table' && asset.value?.id) {
      const tableId = asset.value.id;
      getQueryCount(tableId)
        .then((count) => {
          queryCount.value = count;
        })
        .catch(() => undefined);
    }
    await Promise.all([loadQuality(), loadCollaboration(), loadCustomProperties(), loadPipelineStatuses(), loadApiEndpoints()]);
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : t('asset.loadFailed');
    assetOps.value = null;
  } finally {
    loading.value = false;
  }
}

async function loadQuality(): Promise<void> {
  if (!asset.value) {
    return;
  }
  try {
    const page = await listTestCases({
      entityFQN: asset.value.fullyQualifiedName,
      includeAllTests: true,
      limit: 50,
    });
    tests.value = page.data;
    testStatusSeries.value = namedSeries(
      t('asset.testStatusChart'),
      testResultsToStatusPoints(
        page.data.map((item) => ({
          testCaseStatus: item.testCaseResult?.testCaseStatus || item.testCaseStatus,
        })),
      ),
    );
  } catch (error) {
    tests.value = [];
    testStatusSeries.value = [];
    testsError.value = error instanceof Error ? error.message : t('asset.testsFailed');
  }
  if (props.entityType === 'table' && asset.value.id) {
    try {
      tableSample.value = await getTableSampleData(asset.value.id);
    } catch (error) {
      tableSample.value = null;
      observabilityError.value = error instanceof Error ? error.message : t('asset.sampleUnavailable');
    }
    try {
      tableProfile.value = await getLatestTableProfile(asset.value.fullyQualifiedName);
      columnNullSeries.value = namedSeries(
        t('asset.columnNullChart'),
        columnNullPoints(tableProfile.value.columns),
      );
    } catch {
      tableProfile.value = null;
      columnNullSeries.value = [];
    }
    const window = seriesWindow();
    try {
      const history = await listTableProfiles(asset.value.fullyQualifiedName, window.startTs, window.endTs);
      rowCountSeries.value = namedSeries(t('asset.rowCountChart'), profilesToRowCountPoints(history));
    } catch {
      rowCountSeries.value = [];
    }
    try {
      const days = await getEntityUsage('table', asset.value.fullyQualifiedName, 30);
      usageSeries.value = namedSeries(t('asset.usageChart'), usageToPoints(days));
    } catch {
      usageSeries.value = [];
    }
  }
  if (props.entityType === 'topic' && asset.value.id) {
    try {
      topicSample.value = await getTopicSampleData(asset.value.id);
    } catch (error) {
      topicSample.value = null;
      observabilityError.value = error instanceof Error ? error.message : t('asset.sampleUnavailable');
    }
  }
}

async function loadApiEndpoints(): Promise<void> {
  // Official APIEndpointsTab: endpoints are listed per collection, not
  // embedded in the collection payload.
  if (props.entityType !== 'apiCollection' || !asset.value) {
    return;
  }
  try {
    const page = await listApiEndpoints({ apiCollection: asset.value.fullyQualifiedName });
    apiEndpoints.value = page.data;
    apiEndpointsError.value = '';
  } catch (error) {
    apiEndpoints.value = [];
    apiEndpointsError.value = error instanceof Error ? error.message : t('asset.apiEndpointsFailed');
  }
}

async function loadPipelineStatuses(): Promise<void> {
  if (props.entityType !== 'pipeline' || !asset.value) {
    return;
  }
  const window = seriesWindow();
  pipelineStatusTried.value = true;
  try {
    const page = await listCatalogPipelineStatuses(asset.value.fullyQualifiedName, {
      startTs: window.startTs,
      endTs: window.endTs,
      limit: 20,
    });
    pipelineStatuses.value = page.data;
    pipelineStatusError.value = '';
  } catch (error) {
    pipelineStatuses.value = [];
    pipelineStatusError.value = error instanceof Error ? error.message : t('asset.executionsFailed');
  }
}

async function loadCollaboration(): Promise<void> {
  if (!asset.value) {
    return;
  }
  try {
    const [activityPage, conversationPage] = await Promise.all([
      listEntityActivity(props.entityType, asset.value.fullyQualifiedName),
      listConversations({
        entityLink: toEntityLink(props.entityType, asset.value.fullyQualifiedName),
        limit: 20,
      }),
    ]);
    activity.value = activityPage.data;
    conversations.value = conversationPage.data;
  } catch (error) {
    activity.value = [];
    conversations.value = [];
    collaborationError.value = error instanceof Error ? error.message : t('asset.activityFailed');
  }
}

async function loadCustomProperties(): Promise<void> {
  try {
    customProperties.value = await listCustomProperties(props.entityType);
  } catch (error) {
    customProperties.value = [];
    customPropsError.value = error instanceof Error ? error.message : t('asset.customPropsFailed');
  }
}

function openEdit(): void {
  if (!asset.value) {
    return;
  }
  editForm.description = asset.value.description || '';
  editForm.ownerKeys = asset.value.owners
    .filter((owner) => owner.id && owner.type)
    .map((owner) => ownerKey(owner.id as string, owner.type as string));
  editForm.tagFqns = asset.value.tags.map((tag) => tag.tagFQN);
  editForm.domainIds = asset.value.domains.map((domain) => domain.id).filter((id): id is string => Boolean(id));
  // Rebuild the rich-text editor so it opens on the current description.
  editKey.value += 1;
  editOpen.value = true;
}

function selectedTagOptions(): TagLabelInput[] {
  return editForm.tagFqns.flatMap((fqn) => {
    // The catalog carries no labelType, so the existing tag's labelType is
    // overlaid onto whichever option wins: without this, saving an edit
    // would silently convert a Generated label to Manual. Fresh picks keep
    // no labelType and default to Manual in toTagLabel.
    const existing = asset.value?.tags.find((tag) => tag.tagFQN === fqn);
    const fromCatalog = catalog.value.tags.find((tag) => tag.tagFQN === fqn);
    if (fromCatalog) {
      return [{ ...fromCatalog, labelType: existing?.labelType }];
    }
    if (existing) {
      return [
        {
          tagFQN: existing.tagFQN,
          name: existing.name,
          source: existing.source || 'Classification',
          labelType: existing.labelType,
        },
      ];
    }
    return [];
  });
}

async function onSaveGovernance(): Promise<void> {
  if (!asset.value?.id) {
    message.error(t('asset.patchNeedsId'));
    return;
  }
  saving.value = true;
  try {
    const owners = editForm.ownerKeys.flatMap((key) => {
      const parsed = parseOwnerKey(key);
      return parsed ? [parsed] : [];
    });
    await patchAsset(props.entityType, asset.value.id, [
      ...descriptionPatch(asset.value.description, descriptionEditorRef.value?.getEditorContent()?.trim() ?? editForm.description),
      ...ownersPatch(asset.value.owners, owners),
      ...tagsPatch(asset.value.tags, selectedTagOptions()),
      ...domainsPatch(asset.value.domains, editForm.domainIds),
    ]);
    editOpen.value = false;
    message.success(t('asset.updated'));
    await load();
  } catch (error) {
    message.error(error instanceof Error ? error.message : t('asset.updateFailed'));
  } finally {
    saving.value = false;
  }
}

async function onSchemaTagChange(row: SchemaRow, source: TagSource, tagFqns: string[]): Promise<void> {
  if (!asset.value?.id) {
    message.error(t('asset.patchNeedsId'));
    return;
  }
  // Merge rule (official TagsContainerV2): the write carries the row's
  // full tag list — the edited source's new selection plus the other
  // source's existing labels untouched — because both the single-column
  // PUT body and the PATCH tags op replace the whole list.
  const otherSource: TagSource = source === 'Classification' ? 'Glossary' : 'Classification';
  const kept = (row.tags ?? []).filter(
    (tag) => tag.source === otherSource || (otherSource === 'Classification' && !tag.source),
  );
  const toInput = (tag: TagRef): TagLabelInput => ({
    tagFQN: tag.tagFQN,
    name: tag.name,
    source: tag.source || 'Classification',
    labelType: tag.labelType,
    state: tag.state,
  });
  const picked: TagLabelInput[] = tagFqns.flatMap((fqn) => {
    // The catalog carries no labelType/state, so the existing row tag's
    // values are overlaid onto whichever option wins — the same rule as
    // selectedTagOptions above, so an edit never flips a Generated label
    // to Manual.
    const existing = (row.tags ?? []).find((tag) => tag.tagFQN === fqn);
    const fromCatalog = catalog.value.tags.find((tag) => tag.tagFQN === fqn);
    if (fromCatalog) {
      return [{ ...fromCatalog, labelType: existing?.labelType, state: existing?.state }];
    }
    if (existing) {
      return [toInput(existing)];
    }
    return [];
  });
  const nextInputs: TagLabelInput[] = [...kept.map(toInput), ...picked];
  const nextLabels = nextInputs.map((input) => toTagLabel(input));
  const nextTags: TagRef[] = nextInputs.map((input) => {
    const label = toTagLabel(input);
    return {
      tagFQN: label.tagFQN,
      name: input.name,
      source: label.source,
      labelType: label.labelType,
      state: label.state,
    };
  });
  try {
    let writtenTags: TagRef[];
    if (props.entityType === 'table' || props.entityType === 'dashboardDataModel') {
      // PUT group (official tableAPI / dataModelsAPI single-column PUT).
      if (!row.fullyQualifiedName) {
        message.error(t('asset.updateFailed'));
        return;
      }
      const update = props.entityType === 'table' ? updateTableColumn : updateDataModelColumn;
      writtenTags = await update(row.fullyQualifiedName, nextLabels);
    } else if (
      props.entityType === 'topic' ||
      props.entityType === 'container' ||
      props.entityType === 'searchIndex'
    ) {
      // PATCH group (official whole-entity PATCH, one JSON Patch op on
      // this field's tags array via patchAsset).
      const ops = columnTagsPatch(props.entityType, row.indexPath, row.tags, nextInputs);
      await patchAsset(props.entityType, asset.value.id, ops);
      writtenTags = nextTags;
    } else {
      return;
    }
    asset.value.schemaRows = updateSchemaRowTags(asset.value.schemaRows, row.key, writtenTags);
  } catch (error) {
    message.error(error instanceof Error ? error.message : t('asset.updateFailed'));
  }
}

function openComment(): void {
  commentMessage.value = '';
  commentOpen.value = true;
}

async function onCreateConversation(): Promise<void> {
  if (!asset.value) {
    return;
  }
  saving.value = true;
  try {
    await createConversation({
      message: commentMessage.value.trim(),
      about: toEntityLink(props.entityType, asset.value.fullyQualifiedName),
    });
    commentOpen.value = false;
    message.success(t('asset.posted'));
    await loadCollaboration();
  } catch (error) {
    message.error(error instanceof Error ? error.message : t('asset.commentFailed'));
  } finally {
    saving.value = false;
  }
}

function openCustomProperties(): void {
  for (const key of Object.keys(extensionForm)) {
    delete extensionForm[key];
  }
  for (const def of customProperties.value) {
    const current = asset.value?.extension?.[def.name];
    extensionForm[def.name] = current === undefined || current === null ? '' : String(current);
  }
  propsOpen.value = true;
}

async function onSaveCustomProperties(): Promise<void> {
  if (!asset.value?.id) {
    message.error(t('asset.patchNeedsId'));
    return;
  }
  saving.value = true;
  try {
    const next: Record<string, unknown> = { ...(asset.value.extension || {}) };
    for (const def of customProperties.value) {
      const typed = extensionForm[def.name]?.trim() ?? '';
      if (!typed) {
        delete next[def.name];
        continue;
      }
      if (def.propertyType === 'integer' || def.propertyType === 'number') {
        const parsed = Number(typed);
        next[def.name] = Number.isFinite(parsed) ? parsed : typed;
      } else {
        next[def.name] = typed;
      }
    }
    await patchAsset(props.entityType, asset.value.id, extensionPatch(asset.value.extension, next));
    propsOpen.value = false;
    message.success(t('asset.propsUpdated'));
    await load();
  } catch (error) {
    message.error(error instanceof Error ? error.message : t('asset.updateFailed'));
  } finally {
    saving.value = false;
  }
}

function onApiEndpointClick(row: ApiEndpointRef): void {
  void router.push(apiEndpointLocation(row));
}

// The shared pieces render only inside `v-if="asset"` slots, so the
// asset cast below never feeds a rendered piece a null asset.
const pieceContext = computed<AssetDetailPieceContext>(() => ({
  asset: asset.value as AssetDetail,
  entityType: props.entityType,
  schemaColumns: schemaColumns.value,
  schemaExpandable,
  featureColumns: featureColumns.value,
  hyperColumns: hyperColumns.value,
  refColumns: refColumns.value,
  apiEndpointColumns: apiEndpointColumns.value,
  taskGraph: taskGraph.value,
  taskGraphEmpty: taskGraphEmpty.value,
  customProperties: customProperties.value,
  customPropsError: customPropsError.value,
  apiEndpoints: apiEndpoints.value,
  apiEndpointsError: apiEndpointsError.value,
  apiEndpointSchemaJson,
  onApiEndpointClick,
  descriptionAccess: canEditDescription.value,
  descriptionExpanded: descriptionExpanded.value,
  onDescriptionUpdate,
  customPropsCanView: customPropsCanView.value,
  schemaTagOptions: catalog.value.tags,
  schemaTagAccess: schemaTagAccess.value,
  onSchemaTagChange,
}));

watch(
  () => [props.entityType, props.fqn],
  () => {
    void load();
  },
  { immediate: true },
);

onMounted(() => {
  void loadGovernanceCatalog()
    .then((loaded) => {
      catalog.value = loaded;
    })
    .catch(() => undefined);
});
</script>

<template>
  <div>
    <EntityDetailShell
      :title="asset?.displayName || asset?.name || decodedFqn"
      :name="asset?.name"
      :fqn="asset?.fullyQualifiedName || decodedFqn"
      :lead="entityLabel(entityType)"
      :loading="loading"
      :error="errorMessage"
      :empty="!loading && !errorMessage && !asset"
      :breadcrumbs="breadcrumbs"
      :tabs="tabs"
      :active-tab="activeTab"
      tabs-test-id="asset-tabs"
      @update:activeTab="onTabChange"
    >
      <template #meta>
        <Space wrap>
          <Tag v-if="tierTag" color="blue" data-testid="asset-tier">{{ tierTag.tagFQN }}</Tag>
          <Typography.Text v-if="asset?.owners.length" type="secondary" data-testid="asset-header-owners">
            {{ asset?.owners.map((owner) => owner.displayName || owner.name).join(' · ') }}
          </Typography.Text>
          <!-- Pin header pairs ExtraInfoLabel label=Usage with the
               non-literal percentile value; the value's leading space
               separates label and value, so no space is added here. -->
          <Typography.Text v-if="usagePercentileText" type="secondary" data-testid="asset-usage-percentile">
            {{ t('usage.usage') }}{{ usagePercentileText }}
          </Typography.Text>
        </Space>
      </template>
      <template #actions>
        <Button
          data-testid="asset-follow"
          :loading="followLoading"
          :disabled="!asset?.id || !currentUserId"
          @click="onToggleFollow"
        >
          {{ isFollowing ? t('asset.unfollow') : t('asset.follow') }}
          <template v-if="followers.length">({{ followers.length }})</template>
        </Button>
        <Button
          data-testid="asset-vote-up"
          :type="voteStatus === 'votedUp' ? 'primary' : 'default'"
          :loading="voteLoading"
          :disabled="!asset?.id || !currentUserId"
          @click="onToggleVote('votedUp')"
        >
          {{ t('asset.voteUp') }} ({{ asset?.votes?.upVotes ?? 0 }})
        </Button>
        <Button
          data-testid="asset-vote-down"
          :type="voteStatus === 'votedDown' ? 'primary' : 'default'"
          :loading="voteLoading"
          :disabled="!asset?.id || !currentUserId"
          @click="onToggleVote('votedDown')"
        >
          {{ t('asset.voteDown') }} ({{ asset?.votes?.downVotes ?? 0 }})
        </Button>
        <Button
          data-testid="view-lineage"
          @click="router.push(lineageLocation(entityType, decodedFqn))"
        >
          {{ t('asset.viewLineage') }}
        </Button>
        <Button data-testid="asset-versions" @click="router.push({ name: 'asset-version', params: { entityType, fqn: decodedFqn } })">
          {{ t('asset.versionsTitle') }}
        </Button>
        <Button data-testid="edit-governance" :disabled="!asset?.id || !canEditGovernance" @click="openEdit">
          {{ t('asset.editGovernance') }}
        </Button>
        <Button data-testid="create-asset-conversation" :disabled="!asset" @click="openComment">
          {{ t('asset.postConversation') }}
        </Button>
        <Button
          data-testid="edit-custom-properties"
          :disabled="!asset?.id || !canEditCustomFields || !customProperties.length"
          @click="openCustomProperties"
        >
          {{ t('asset.editCustomProperties') }}
        </Button>
      </template>
      <template v-if="asset" #overview>
          <GenericTab
            v-if="widgetLayoutFor('overview') !== null"
            :layout="widgetLayoutFor('overview') ?? []"
            :page-type="pageType ?? ''"
          >
            <template #widget="{ contentKey }">
              <AssetDetailPiece :piece="pieceForContentKey(contentKey)" :context="pieceContext" />
            </template>
          </GenericTab>
          <template v-else>
            <AssetOverviewFields
              :asset="asset"
              :entity-type="entityType"
              :description-access="canEditDescription"
              :description-expanded="descriptionExpanded"
              :on-description-update="onDescriptionUpdate"
            />
            <AssetDetailPiece piece="metricExpression" :context="pieceContext" />
          </template>
      </template>
      <template v-if="asset" #schemas>
          <GenericTab
            v-if="widgetLayoutFor('schemas') !== null"
            :layout="widgetLayoutFor('schemas') ?? []"
            :page-type="pageType ?? ''"
          >
            <template #widget="{ contentKey }">
              <AssetDetailPiece :piece="pieceForContentKey(contentKey)" :context="pieceContext" />
            </template>
          </GenericTab>
          <template v-else>
            <AssetRelatedPanel :asset="asset" />
          </template>
      </template>
      <template v-if="asset" #table>
          <GenericTab
            v-if="widgetLayoutFor('table') !== null"
            :layout="widgetLayoutFor('table') ?? []"
            :page-type="pageType ?? ''"
          >
            <template #widget="{ contentKey }">
              <AssetDetailPiece :piece="pieceForContentKey(contentKey)" :context="pieceContext" />
            </template>
          </GenericTab>
          <template v-else>
            <AssetRelatedPanel :asset="asset" />
          </template>
      </template>
      <template v-if="asset" #children>
          <GenericTab
            v-if="widgetLayoutFor('children') !== null"
            :layout="widgetLayoutFor('children') ?? []"
            :page-type="pageType ?? ''"
          >
            <template #widget="{ contentKey }">
              <AssetDetailPiece :piece="pieceForContentKey(contentKey)" :context="pieceContext" />
            </template>
          </GenericTab>
          <template v-else>
            <AssetRelatedPanel :asset="asset" />
          </template>
      </template>
      <template v-if="asset" #model>
          <GenericTab
            v-if="widgetLayoutFor('model') !== null"
            :layout="widgetLayoutFor('model') ?? []"
            :page-type="pageType ?? ''"
          >
            <template #widget="{ contentKey }">
              <AssetDetailPiece :piece="pieceForContentKey(contentKey)" :context="pieceContext" />
            </template>
          </GenericTab>
          <template v-else>
            <AssetOverviewFields
              v-if="isSplit"
              :asset="asset"
              :entity-type="entityType"
              :description-access="canEditDescription"
              :description-expanded="descriptionExpanded"
              :on-description-update="onDescriptionUpdate"
            />
            <AssetDetailPiece piece="schemaTable" :context="pieceContext" />
          </template>
      </template>
      <template v-if="asset" #fields>
          <GenericTab
            v-if="widgetLayoutFor('fields') !== null"
            :layout="widgetLayoutFor('fields') ?? []"
            :page-type="pageType ?? ''"
          >
            <template #widget="{ contentKey }">
              <AssetDetailPiece :piece="pieceForContentKey(contentKey)" :context="pieceContext" />
            </template>
          </GenericTab>
          <template v-else>
            <AssetOverviewFields
              v-if="isSplit"
              :asset="asset"
              :entity-type="entityType"
              :description-access="canEditDescription"
              :description-expanded="descriptionExpanded"
              :on-description-update="onDescriptionUpdate"
            />
            <AssetDetailPiece piece="schemaTable" :context="pieceContext" />
          </template>
      </template>
      <template v-if="asset" #schema>
          <GenericTab
            v-if="widgetLayoutFor('schema') !== null"
            :layout="widgetLayoutFor('schema') ?? []"
            :page-type="pageType ?? ''"
          >
            <template #widget="{ contentKey }">
              <AssetDetailPiece :piece="pieceForContentKey(contentKey)" :context="pieceContext" />
            </template>
          </GenericTab>
          <template v-else>
            <AssetOverviewFields
              v-if="isSplit"
              :asset="asset"
              :entity-type="entityType"
              :description-access="canEditDescription"
              :description-expanded="descriptionExpanded"
              :on-description-update="onDescriptionUpdate"
            />
            <AssetDetailPiece piece="schemaTable" :context="pieceContext" with-joins />
          </template>
      </template>
      <template v-if="asset" #features>
          <GenericTab
            v-if="widgetLayoutFor('features') !== null"
            :layout="widgetLayoutFor('features') ?? []"
            :page-type="pageType ?? ''"
          >
            <template #widget="{ contentKey }">
              <AssetDetailPiece :piece="pieceForContentKey(contentKey)" :context="pieceContext" />
            </template>
          </GenericTab>
          <template v-else>
            <AssetDetailPiece piece="features" :context="pieceContext" />
          </template>
      </template>
      <template v-if="asset" #tasks>
          <GenericTab
            v-if="widgetLayoutFor('tasks') !== null"
            :layout="widgetLayoutFor('tasks') ?? []"
            :page-type="pageType ?? ''"
          >
            <template #widget="{ contentKey }">
              <AssetDetailPiece :piece="pieceForContentKey(contentKey)" :context="pieceContext" />
            </template>
          </GenericTab>
          <template v-else>
            <AssetDetailPiece piece="tasks" :context="pieceContext" />
          </template>
      </template>
      <template v-if="asset" #executions>
          <GenericTab
            v-if="widgetLayoutFor('executions') !== null"
            :layout="widgetLayoutFor('executions') ?? []"
            :page-type="pageType ?? ''"
          >
            <template #widget="{ contentKey }">
              <AssetDetailPiece :piece="pieceForContentKey(contentKey)" :context="pieceContext" />
            </template>
          </GenericTab>
          <template v-else>
            <Typography.Paragraph type="secondary">{{ t('asset.executionsLead') }}</Typography.Paragraph>
            <Alert
              v-if="pipelineStatusError && !executionRows.length"
              type="warning"
              show-icon
              :message="pipelineStatusError"
              class="detail__alert"
            />
            <Empty
              v-if="pipelineStatusTried && !pipelineStatusError && !executionRows.length"
              data-testid="pipeline-executions-empty"
              :description="t('asset.executionsEmpty')"
            />
            <SmTable
              v-else-if="executionRows.length"
              row-key="timestamp"
              test-id="pipeline-executions-table"
              :columns="executionColumns"
              :data-source="executionRows"
              :pagination="false"
              size="small"
            >
              <template #bodyCell="{ column, record }">
                <template v-if="column.key === 'timestamp'">
                  {{ formatTs((record as CatalogPipelineStatus).timestamp) }}
                </template>
              </template>
            </SmTable>
          </template>
      </template>
      <template v-if="asset" #code>
          <GenericTab
            v-if="widgetLayoutFor('code') !== null"
            :layout="widgetLayoutFor('code') ?? []"
            :page-type="pageType ?? ''"
          >
            <template #widget="{ contentKey }">
              <AssetDetailPiece :piece="pieceForContentKey(contentKey)" :context="pieceContext" />
            </template>
          </GenericTab>
          <template v-else>
            <AssetDetailPiece piece="code" :context="pieceContext" />
          </template>
      </template>
      <template v-if="asset" #lineage>
          <GenericTab
            v-if="widgetLayoutFor('lineage') !== null"
            :layout="widgetLayoutFor('lineage') ?? []"
            :page-type="pageType ?? ''"
          >
            <template #widget="{ contentKey }">
              <AssetDetailPiece :piece="pieceForContentKey(contentKey)" :context="pieceContext" />
            </template>
          </GenericTab>
          <template v-else>
            <LineageCanvas :entity-type="entityType" :fqn="decodedFqn" variant="tab" />
          </template>
      </template>
      <template v-if="asset" #quality>
          <GenericTab
            v-if="widgetLayoutFor('quality') !== null"
            :layout="widgetLayoutFor('quality') ?? []"
            :page-type="pageType ?? ''"
          >
            <template #widget="{ contentKey }">
              <AssetDetailPiece :piece="pieceForContentKey(contentKey)" :context="pieceContext" />
            </template>
          </GenericTab>
          <template v-else>
            <AssetProfilerPanel
              :tests="tests"
              :tests-error="testsError"
              :test-status-series="testStatusSeries"
              :table-profile="tableProfile"
              :row-count-series="rowCountSeries"
              :usage-series="usageSeries"
              :column-null-series="columnNullSeries"
              :entity-type="entityType"
              :table-id="asset.id"
              :columns="asset.schemaRows"
            />
            <AssetSamplePanel
              :table-sample="tableSample"
              :topic-sample="topicSample"
              :observability-error="observabilityError"
              :entity-type="entityType"
            />
          </template>
      </template>
      <template v-if="asset" #activity>
          <GenericTab
            v-if="widgetLayoutFor('activity') !== null"
            :layout="widgetLayoutFor('activity') ?? []"
            :page-type="pageType ?? ''"
          >
            <template #widget="{ contentKey }">
              <AssetDetailPiece :piece="pieceForContentKey(contentKey)" :context="pieceContext" />
            </template>
          </GenericTab>
          <template v-else>
            <AssetActivityPanel
              :activity="activity"
              :conversations="conversations"
              :collaboration-error="collaborationError"
              :entity-type="entityType"
              :fqn="decodedFqn"
            />
          </template>
      </template>
      <template v-if="asset" #details>
          <GenericTab
            v-if="widgetLayoutFor('details') !== null"
            :layout="widgetLayoutFor('details') ?? []"
            :page-type="pageType ?? ''"
          >
            <template #widget="{ contentKey }">
              <AssetDetailPiece :piece="pieceForContentKey(contentKey)" :context="pieceContext" />
            </template>
          </GenericTab>
          <template v-else>
            <AssetOverviewFields
              :asset="asset"
              :entity-type="entityType"
              :description-access="canEditDescription"
              :description-expanded="descriptionExpanded"
              :on-description-update="onDescriptionUpdate"
            />
            <AssetDetailPiece piece="chartsTables" :context="pieceContext" />
          </template>
      </template>
      <template v-if="asset" #apiEndpoints>
          <GenericTab
            v-if="widgetLayoutFor('apiEndpoints') !== null"
            :layout="widgetLayoutFor('apiEndpoints') ?? []"
            :page-type="pageType ?? ''"
          >
            <template #widget="{ contentKey }">
              <AssetDetailPiece :piece="pieceForContentKey(contentKey)" :context="pieceContext" />
            </template>
          </GenericTab>
          <template v-else>
            <AssetDetailPiece piece="apiEndpoints" :context="pieceContext" />
          </template>
      </template>
      <template v-if="asset" #endpoint>
          <GenericTab
            v-if="widgetLayoutFor('endpoint') !== null"
            :layout="widgetLayoutFor('endpoint') ?? []"
            :page-type="pageType ?? ''"
          >
            <template #widget="{ contentKey }">
              <AssetDetailPiece :piece="pieceForContentKey(contentKey)" :context="pieceContext" />
            </template>
          </GenericTab>
          <template v-else>
            <AssetDetailPiece piece="apiSchema" :context="pieceContext" />
          </template>
      </template>
      <template v-if="asset" #activity_feed>
          <GenericTab
            v-if="widgetLayoutFor('activity_feed') !== null"
            :layout="widgetLayoutFor('activity_feed') ?? []"
            :page-type="pageType ?? ''"
          >
            <template #widget="{ contentKey }">
              <AssetDetailPiece :piece="pieceForContentKey(contentKey)" :context="pieceContext" />
            </template>
          </GenericTab>
          <template v-else>
            <AssetActivityPanel
              :activity="activity"
              :conversations="conversations"
              :collaboration-error="collaborationError"
              :entity-type="entityType"
              :fqn="decodedFqn"
            />
          </template>
      </template>
      <template v-if="asset" #sample_data>
          <GenericTab
            v-if="widgetLayoutFor('sample_data') !== null"
            :layout="widgetLayoutFor('sample_data') ?? []"
            :page-type="pageType ?? ''"
          >
            <template #widget="{ contentKey }">
              <AssetDetailPiece :piece="pieceForContentKey(contentKey)" :context="pieceContext" />
            </template>
          </GenericTab>
          <template v-else>
            <Empty
              v-if="residualReasonFor('sample_data')"
              data-testid="asset-tab-residual"
              :description="residualReasonFor('sample_data')"
            />
            <AssetSamplePanel
              v-else
              :table-sample="tableSample"
              :topic-sample="topicSample"
              :observability-error="observabilityError"
              :entity-type="entityType"
            />
          </template>
      </template>
      <template v-if="asset" #stored_procedure>
          <GenericTab
            v-if="widgetLayoutFor('stored_procedure') !== null"
            :layout="widgetLayoutFor('stored_procedure') ?? []"
            :page-type="pageType ?? ''"
          >
            <template #widget="{ contentKey }">
              <AssetDetailPiece :piece="pieceForContentKey(contentKey)" :context="pieceContext" />
            </template>
          </GenericTab>
          <template v-else>
            <Empty data-testid="asset-tab-residual" :description="residualReasonFor('stored_procedure')" />
          </template>
      </template>
      <template v-if="asset" #search_index_settings>
          <GenericTab
            v-if="widgetLayoutFor('search_index_settings') !== null"
            :layout="widgetLayoutFor('search_index_settings') ?? []"
            :page-type="pageType ?? ''"
          >
            <template #widget="{ contentKey }">
              <AssetDetailPiece :piece="pieceForContentKey(contentKey)" :context="pieceContext" />
            </template>
          </GenericTab>
          <template v-else>
            <Empty data-testid="asset-tab-residual" :description="residualReasonFor('search_index_settings')" />
          </template>
      </template>
      <template v-if="asset" #assets>
          <GenericTab
            v-if="widgetLayoutFor('assets') !== null"
            :layout="widgetLayoutFor('assets') ?? []"
            :page-type="pageType ?? ''"
          >
            <template #widget="{ contentKey }">
              <AssetDetailPiece :piece="pieceForContentKey(contentKey)" :context="pieceContext" />
            </template>
          </GenericTab>
          <template v-else>
            <Empty data-testid="asset-tab-residual" :description="residualReasonFor('assets')" />
          </template>
      </template>
      <template v-if="asset" #profiler>
          <GenericTab
            v-if="widgetLayoutFor('profiler') !== null"
            :layout="widgetLayoutFor('profiler') ?? []"
            :page-type="pageType ?? ''"
          >
            <template #widget="{ contentKey }">
              <AssetDetailPiece :piece="pieceForContentKey(contentKey)" :context="pieceContext" />
            </template>
          </GenericTab>
          <template v-else>
            <AssetProfilerPanel
              :tests="tests"
              :tests-error="testsError"
              :test-status-series="testStatusSeries"
              :table-profile="tableProfile"
              :row-count-series="rowCountSeries"
              :usage-series="usageSeries"
              :column-null-series="columnNullSeries"
              :entity-type="entityType"
              :table-id="asset.id"
              :columns="asset.schemaRows"
            />
          </template>
      </template>
      <template v-if="asset" #table_queries>
          <GenericTab
            v-if="widgetLayoutFor('table_queries') !== null"
            :layout="widgetLayoutFor('table_queries') ?? []"
            :page-type="pageType ?? ''"
          >
            <template #widget="{ contentKey }">
              <AssetDetailPiece :piece="pieceForContentKey(contentKey)" :context="pieceContext" />
            </template>
          </GenericTab>
          <template v-else>
            <!-- Mount-gated: the shell force-renders every pane, and the
                 pin mounts only the active tab, so the list fetches only
                 while this tab is selected. -->
            <TableQueries
              v-if="activeTab === 'table_queries' && asset.id"
              :table-id="asset.id"
              :dataset-fqn="asset.fullyQualifiedName ?? asset.name"
              :is-table-deleted="asset.deleted === true"
            />
          </template>
      </template>
      <template v-if="asset" #dbt>
          <GenericTab
            v-if="widgetLayoutFor('dbt') !== null"
            :layout="widgetLayoutFor('dbt') ?? []"
            :page-type="pageType ?? ''"
          >
            <template #widget="{ contentKey }">
              <AssetDetailPiece :piece="pieceForContentKey(contentKey)" :context="pieceContext" />
            </template>
          </GenericTab>
          <template v-else>
            <Empty data-testid="asset-tab-residual" :description="residualReasonFor('dbt')" />
          </template>
      </template>
      <template v-if="asset" #view_definition>
          <GenericTab
            v-if="widgetLayoutFor('view_definition') !== null"
            :layout="widgetLayoutFor('view_definition') ?? []"
            :page-type="pageType ?? ''"
          >
            <template #widget="{ contentKey }">
              <AssetDetailPiece :piece="pieceForContentKey(contentKey)" :context="pieceContext" />
            </template>
          </GenericTab>
          <template v-else>
            <Empty data-testid="asset-tab-residual" :description="residualReasonFor('view_definition')" />
          </template>
      </template>
      <template v-if="asset" #contract>
          <GenericTab
            v-if="widgetLayoutFor('contract') !== null"
            :layout="widgetLayoutFor('contract') ?? []"
            :page-type="pageType ?? ''"
          >
            <template #widget="{ contentKey }">
              <AssetDetailPiece :piece="pieceForContentKey(contentKey)" :context="pieceContext" />
            </template>
          </GenericTab>
          <template v-else>
            <Empty data-testid="asset-tab-residual" :description="residualReasonFor('contract')" />
          </template>
      </template>
      <template v-if="asset" #config>
          <GenericTab
            v-if="widgetLayoutFor('config') !== null"
            :layout="widgetLayoutFor('config') ?? []"
            :page-type="pageType ?? ''"
          >
            <template #widget="{ contentKey }">
              <AssetDetailPiece :piece="pieceForContentKey(contentKey)" :context="pieceContext" />
            </template>
          </GenericTab>
          <template v-else>
            <Empty data-testid="asset-tab-residual" :description="residualReasonFor('config')" />
          </template>
      </template>
      <template v-if="asset" #customProperties>
          <GenericTab
            v-if="widgetLayoutFor('customProperties') !== null"
            :layout="widgetLayoutFor('customProperties') ?? []"
            :page-type="pageType ?? ''"
          >
            <template #widget="{ contentKey }">
              <AssetDetailPiece :piece="pieceForContentKey(contentKey)" :context="pieceContext" />
            </template>
          </GenericTab>
          <template v-else>
            <AssetCustomPropertiesPanel
              :defs="customProperties"
              :values="asset?.extension ?? {}"
              :error="customPropsError"
              :entity-type="entityType"
              :can-view="customPropsCanView"
            />
          </template>
      </template>
      <template v-if="asset" #custom_properties>
          <GenericTab
            v-if="widgetLayoutFor('custom_properties') !== null"
            :layout="widgetLayoutFor('custom_properties') ?? []"
            :page-type="pageType ?? ''"
          >
            <template #widget="{ contentKey }">
              <AssetDetailPiece :piece="pieceForContentKey(contentKey)" :context="pieceContext" />
            </template>
          </GenericTab>
          <template v-else>
            <AssetCustomPropertiesPanel
              :defs="customProperties"
              :values="asset?.extension ?? {}"
              :error="customPropsError"
              :entity-type="entityType"
              :can-view="customPropsCanView"
            />
          </template>
      </template>
    </EntityDetailShell>
    <FormModal
      :open="editOpen"
      :title="t('asset.editTitle')"
      :ok-text="t('crud.save')"
      :cancel-text="t('crud.cancel')"
      :get-container="false"
      :confirm-loading="saving"
      @ok="onSaveGovernance" @cancel="editOpen = false">
      <Form layout="vertical">
        <Form.Item :label="t('asset.fields.description')">
          <div data-testid="asset-description">
            <SmRichTextEditor
              :key="editKey"
              ref="descriptionEditorRef"
              :autofocus="true"
              :initial-value="editForm.description"
            />
          </div>
        </Form.Item>
        <Form.Item :label="t('asset.fields.owners')">
          <Select v-model:value="editForm.ownerKeys" mode="multiple" allow-clear data-testid="asset-owners">
            <Select.Option v-for="owner in catalog.owners" :key="owner.key" :value="owner.key">
              {{ owner.label }}
            </Select.Option>
          </Select>
        </Form.Item>
        <Form.Item :label="t('asset.fields.tags')">
          <Select v-model:value="editForm.tagFqns" mode="multiple" allow-clear data-testid="asset-tags">
            <Select.Option v-for="tag in catalog.tags" :key="tag.tagFQN" :value="tag.tagFQN">
              {{ tag.source }} · {{ tag.name }}
            </Select.Option>
          </Select>
        </Form.Item>
        <Form.Item :label="t('asset.fields.domains')">
          <Select v-model:value="editForm.domainIds" mode="multiple" allow-clear data-testid="asset-domains">
            <Select.Option v-for="domain in catalog.domains" :key="domain.id" :value="domain.id">
              {{ domain.displayName || domain.name }}
            </Select.Option>
          </Select>
        </Form.Item>
      </Form>
    </FormModal>
    <FormModal
      :open="commentOpen"
      :title="t('asset.commentTitle')"
      :ok-text="t('crud.save')"
      :cancel-text="t('crud.cancel')"
      :get-container="false"
      :confirm-loading="saving"
      @ok="onCreateConversation" @cancel="commentOpen = false">
      <Form layout="vertical">
        <Form.Item :label="t('asset.messageLabel')" :rules="requiredField(t, t('asset.messageLabel'))">
          <Input.TextArea v-model:value="commentMessage" data-testid="asset-conversation-message" :rows="3" />
        </Form.Item>
      </Form>
    </FormModal>
    <FormModal
      :open="propsOpen"
      :title="t('asset.propsTitle')"
      :ok-text="t('crud.save')"
      :cancel-text="t('crud.cancel')"
      :get-container="false"
      :confirm-loading="saving"
      @ok="onSaveCustomProperties" @cancel="propsOpen = false">
      <Form layout="vertical">
        <Form.Item
          v-for="def in customProperties"
          :key="def.name"
          :label="def.displayName || def.name"
        >
          <Input v-model:value="extensionForm[def.name]" :data-testid="`custom-prop-${def.name}`" />
        </Form.Item>
      </Form>
    </FormModal>
  </div>
</template>

<style scoped>
.detail__alert {
  margin-bottom: 16px;
}
.detail__actions {
  margin-bottom: 16px;
}
.detail__schema-title {
  margin-top: 24px;
}
.detail__tabs {
  margin-top: 8px;
}
.detail__charts {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 16px;
  margin-block: 12px 16px;
}
.detail__chart-block {
  margin-block: 12px 16px;
  max-width: 420px;
}
.detail__code {
  margin: 0;
  padding: 12px;
  font-size: 12px;
  white-space: pre-wrap;
  background: var(--sm-bg-elevated);
  border-radius: 6px;
}
</style>
