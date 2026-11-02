<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute, useRouter } from 'vue-router';
import {
  Alert,
  Button,
  Empty,
  Form,
  Input,
  Modal,
  Select,
  Space,
  Table,
  Tag,
  Typography,
  message,
} from 'ant-design-vue';
import { listEntityActivity } from '@/api/activity';
import { listCatalogPipelineStatuses } from '@/api/catalogPipelines';
import { createConversation, listConversations } from '@/api/conversations';
import { listCustomProperties } from '@/api/customProperties';
import { fetchAssetDetail, followAsset, patchAsset, unfollowAsset } from '@/api/entities';
import { getLatestTableProfile, getTableSampleData, getTopicSampleData, listTableProfiles } from '@/api/profiler';
import { listTestCases } from '@/api/testCases';
import { getEntityUsage } from '@/api/usage';
import LineageCanvas from '@/components/lineage/LineageCanvas.vue';
import PipelineTaskGraph from '@/components/pipeline/PipelineTaskGraph.vue';
import { assetTabKeys, type AssetTabKey } from '@/catalog/assetTabs';
import { entityDetailTabDef, entityDetailTabDefs, isOfficiallySplit } from '@/catalog/entityDetailTabs';
import { isDetailWired, lineageLocation } from '@/catalog/entityRoutes';
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
import type { EntityBreadcrumb, EntityDetailTab } from '@/features/crud/types';
import {
  loadGovernanceCatalog,
  ownerKey,
  parseOwnerKey,
  type GovernanceCatalog,
} from '@/governance/catalogOptions';
import { descriptionPatch, domainsPatch, extensionPatch, ownersPatch, tagsPatch } from '@/governance/assetPatch';
import { isPipelineTaskGraphEmpty, mapPipelineTaskGraph } from '@/pipeline/taskGraph';
import { toEntityLink } from '@/quality/entityLink';
import { useAuthStore } from '@/stores/auth';
import type { AssetDetail, CatalogPipelineStatus } from '@/types/api';
import type { ActivityEvent, Conversation, CustomPropertyDef } from '@/types/collaboration';
import type { AssetTagOption } from '@/types/governance';
import type { TableProfile, TableSampleData, TestCase, TopicSampleData } from '@/types/quality';

const props = defineProps<{
  entityType: string;
  fqn: string;
}>();

const router = useRouter();
const route = useRoute();
const { t, te } = useI18n();
const auth = useAuthStore();

const loading = ref(false);
const errorMessage = ref('');
const asset = ref<AssetDetail | null>(null);
const catalog = ref<GovernanceCatalog>({ owners: [], tags: [], domains: [] });
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
const activeTab = ref('');
const editOpen = ref(false);
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
// whose FQN starts with the `Tier.` category (constants.ts TIER_CATEGORY
// plus the FQN separator). Rendered only when present: the product never
// invents a default tier.
const TIER_TAG_PREFIX = 'Tier.';
const tierTag = computed(() => asset.value?.tags.find((tag) => tag.tagFQN.startsWith(TIER_TAG_PREFIX)));

const followers = computed(() => asset.value?.followers ?? []);
const currentUserId = computed(() => auth.user?.id || '');
const isFollowing = computed(
  () => Boolean(currentUserId.value) && followers.value.some((follower) => follower.id === currentUserId.value),
);
const followLoading = ref(false);

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

function firstTabKey(): string {
  const defs = entityDetailTabDefs(props.entityType);
  if (defs?.length) {
    return defs[0].key;
  }
  return assetTabKeys(props.entityType)[0] ?? 'overview';
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
  if (defs) {
    return defs.map((def) => ({
      key: def.key,
      label: t(`asset.tabs.${def.labelKey}`),
      testId: `asset-tab-${def.key}`,
    }));
  }
  return assetTabKeys(props.entityType).map((key) => ({
    key,
    label: t(`asset.tabs.${key}`),
    testId: TAB_TEST_IDS[key],
  }));
});

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

const taskGraph = computed(() => mapPipelineTaskGraph(asset.value?.tasks, asset.value?.pipelineStatus));
const taskGraphEmpty = computed(() => isPipelineTaskGraphEmpty(taskGraph.value));
const executionRows = computed(() => {
  if (pipelineStatuses.value.length) {
    return pipelineStatuses.value;
  }
  return asset.value?.pipelineStatus ? [asset.value.pipelineStatus] : [];
});

const schemaColumns = computed(() => [
  { title: t('asset.columns.name'), dataIndex: 'name', key: 'name' },
  { title: t('asset.columns.dataType'), dataIndex: 'dataType', key: 'dataType', width: 180 },
  { title: t('asset.columns.description'), dataIndex: 'description', key: 'description' },
]);

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
  activeTab.value = '';
}

async function load(): Promise<void> {
  loading.value = true;
  errorMessage.value = '';
  asset.value = null;
  resetSecondary();
  if (!isDetailWired(props.entityType)) {
    errorMessage.value = t('asset.unwired', { type: props.entityType });
    loading.value = false;
    return;
  }
  try {
    asset.value = await fetchAssetDetail(props.entityType, decodedFqn.value);
    const requestedTab = typeof route.query.tab === 'string' ? route.query.tab : '';
    const validKeys = tabs.value.map((tab) => tab.key);
    activeTab.value = requestedTab && validKeys.includes(requestedTab) ? requestedTab : firstTabKey();
    await Promise.all([loadQuality(), loadCollaboration(), loadCustomProperties(), loadPipelineStatuses()]);
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : t('asset.loadFailed');
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
  editOpen.value = true;
}

function selectedTagOptions(): AssetTagOption[] {
  return editForm.tagFqns.flatMap((fqn) => {
    const fromCatalog = catalog.value.tags.find((tag) => tag.tagFQN === fqn);
    if (fromCatalog) {
      return [fromCatalog];
    }
    const existing = asset.value?.tags.find((tag) => tag.tagFQN === fqn);
    if (existing) {
      return [
        {
          tagFQN: existing.tagFQN,
          name: existing.name,
          source: existing.source || 'Classification',
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
      ...descriptionPatch(asset.value.description, editForm.description),
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
          data-testid="view-lineage"
          @click="router.push(lineageLocation(entityType, decodedFqn))"
        >
          {{ t('asset.viewLineage') }}
        </Button>
        <Button data-testid="asset-versions" @click="router.push({ name: 'asset-version', params: { entityType, fqn: decodedFqn } })">
          {{ t('asset.versionsTitle') }}
        </Button>
        <Button data-testid="edit-governance" :disabled="!asset?.id" @click="openEdit">
          {{ t('asset.editGovernance') }}
        </Button>
        <Button data-testid="create-asset-conversation" :disabled="!asset" @click="openComment">
          {{ t('asset.postConversation') }}
        </Button>
        <Button
          data-testid="edit-custom-properties"
          :disabled="!asset?.id || !customProperties.length"
          @click="openCustomProperties"
        >
          {{ t('asset.editCustomProperties') }}
        </Button>
      </template>
      <template v-if="asset" #overview>
          <AssetOverviewFields :asset="asset" :entity-type="entityType" />
          <template v-if="entityType === 'metric' && (asset.storedProcedureCode?.code || asset.storedProcedureCode?.language)">
            <Typography.Title :level="5">{{ t('asset.metricExpressionTitle') }}</Typography.Title>
            <pre data-testid="asset-metric-expression" class="detail__code">{{
              [asset.storedProcedureCode?.language, asset.storedProcedureCode?.code].filter(Boolean).join('\n\n')
            }}</pre>
          </template>
      </template>
      <template v-if="asset" #schemas>
          <AssetRelatedPanel :asset="asset" />
      </template>
      <template v-if="asset" #table>
          <AssetRelatedPanel :asset="asset" />
      </template>
      <template v-if="asset" #children>
          <AssetRelatedPanel :asset="asset" />
      </template>
      <template v-if="asset" #model>
          <AssetOverviewFields v-if="isSplit" :asset="asset" :entity-type="entityType" />
          <Typography.Title :level="5">{{ asset.schemaLabel }}</Typography.Title>
          <Empty
            v-if="!asset.schemaRows.length"
            data-testid="asset-schema-empty"
            :description="t('asset.schemaEmpty')"
          />
          <Table
            v-else
            row-key="name"
            data-testid="asset-schema-table"
            :columns="schemaColumns"
            :data-source="asset.schemaRows"
            :pagination="false"
            size="small"
          />
      </template>
      <template v-if="asset" #fields>
          <AssetOverviewFields v-if="isSplit" :asset="asset" :entity-type="entityType" />
          <Typography.Title :level="5">{{ asset.schemaLabel }}</Typography.Title>
          <Empty
            v-if="!asset.schemaRows.length"
            data-testid="asset-schema-empty"
            :description="t('asset.schemaEmpty')"
          />
          <Table
            v-else
            row-key="name"
            data-testid="asset-schema-table"
            :columns="schemaColumns"
            :data-source="asset.schemaRows"
            :pagination="false"
            size="small"
          />
      </template>
      <template v-if="asset" #schema>
          <AssetOverviewFields v-if="isSplit" :asset="asset" :entity-type="entityType" />
          <Typography.Title :level="5">{{ asset.schemaLabel }}</Typography.Title>
          <Empty
            v-if="!asset.schemaRows.length"
            data-testid="asset-schema-empty"
            :description="t('asset.schemaEmpty')"
          />
          <Table
            v-else
            row-key="name"
            data-testid="asset-schema-table"
            :columns="schemaColumns"
            :data-source="asset.schemaRows"
            :pagination="false"
            size="small"
          />
      </template>
      <template v-if="asset" #features>
          <Typography.Paragraph type="secondary">{{ t('asset.featuresLead') }}</Typography.Paragraph>
          <Empty
            v-if="!asset.mlFeatures?.length && !asset.mlHyperParameters?.length"
            data-testid="asset-features-empty"
            :description="t('asset.featuresEmpty')"
          />
          <template v-else>
            <Typography.Title :level="5">{{ t('asset.featuresTitle') }}</Typography.Title>
            <Table
              row-key="name"
              data-testid="asset-features-table"
              :columns="featureColumns"
              :data-source="asset.mlFeatures ?? []"
              :pagination="false"
              size="small"
            />
            <Typography.Title :level="5" class="detail__schema-title">{{ t('asset.hyperTitle') }}</Typography.Title>
            <Table
              row-key="name"
              data-testid="asset-hyper-table"
              :columns="hyperColumns"
              :data-source="asset.mlHyperParameters ?? []"
              :pagination="false"
              size="small"
            />
          </template>
      </template>
      <template v-if="asset" #tasks>
          <Typography.Paragraph type="secondary">{{ t('asset.tasksLead') }}</Typography.Paragraph>
          <Empty
            v-if="taskGraphEmpty"
            data-testid="pipeline-task-empty"
            :description="t('asset.tasksEmpty')"
          />
          <PipelineTaskGraph v-else :model="taskGraph" />
      </template>
      <template v-if="asset" #executions>
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
          <Table
            v-else-if="executionRows.length"
            row-key="timestamp"
            data-testid="pipeline-executions-table"
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
          </Table>
      </template>
      <template v-if="asset" #code>
          <Typography.Paragraph type="secondary">{{ t('asset.codeLead') }}</Typography.Paragraph>
          <Empty
            v-if="!asset.storedProcedureCode?.code && !asset.storedProcedureCode?.language"
            data-testid="asset-code-empty"
            :description="t('asset.codeEmpty')"
          />
          <pre v-else data-testid="asset-code-block" class="detail__code">{{
            [asset.storedProcedureCode?.language, asset.storedProcedureCode?.code].filter(Boolean).join('\n\n')
          }}</pre>
      </template>
      <template v-if="asset" #lineage>
          <LineageCanvas :entity-type="entityType" :fqn="decodedFqn" variant="tab" />
      </template>
      <template v-if="asset" #quality>
          <AssetProfilerPanel
            :tests="tests"
            :tests-error="testsError"
            :test-status-series="testStatusSeries"
            :table-profile="tableProfile"
            :row-count-series="rowCountSeries"
            :usage-series="usageSeries"
            :column-null-series="columnNullSeries"
            :entity-type="entityType"
          />
          <AssetSamplePanel
            :table-sample="tableSample"
            :topic-sample="topicSample"
            :observability-error="observabilityError"
            :entity-type="entityType"
          />
      </template>
      <template v-if="asset" #activity>
          <AssetActivityPanel
            :activity="activity"
            :conversations="conversations"
            :collaboration-error="collaborationError"
            :entity-type="entityType"
            :fqn="decodedFqn"
          />
      </template>
      <template v-if="asset" #details>
          <AssetOverviewFields :asset="asset" :entity-type="entityType" />
          <Typography.Paragraph type="secondary">{{ t('asset.chartsLead') }}</Typography.Paragraph>
          <Empty
            v-if="!asset.charts?.length && !asset.dataModels?.length"
            data-testid="asset-charts-empty"
            :description="t('asset.chartsEmpty')"
          />
          <template v-else>
            <Typography.Title :level="5">{{ t('asset.chartsTitle') }}</Typography.Title>
            <Table
              row-key="name"
              data-testid="asset-charts-table"
              :columns="refColumns"
              :data-source="asset.charts ?? []"
              :pagination="false"
              size="small"
            />
            <Typography.Title :level="5" class="detail__schema-title">{{ t('asset.dataModelsTitle') }}</Typography.Title>
            <Table
              row-key="name"
              data-testid="asset-data-models-table"
              :columns="refColumns"
              :data-source="asset.dataModels ?? []"
              :pagination="false"
              size="small"
            />
          </template>
      </template>
      <template v-if="asset" #activity_feed>
          <AssetActivityPanel
            :activity="activity"
            :conversations="conversations"
            :collaboration-error="collaborationError"
            :entity-type="entityType"
            :fqn="decodedFqn"
          />
      </template>
      <template v-if="asset" #sample_data>
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
      <template v-if="asset" #stored_procedure>
          <Empty data-testid="asset-tab-residual" :description="residualReasonFor('stored_procedure')" />
      </template>
      <template v-if="asset" #search_index_settings>
          <Empty data-testid="asset-tab-residual" :description="residualReasonFor('search_index_settings')" />
      </template>
      <template v-if="asset" #assets>
          <Empty data-testid="asset-tab-residual" :description="residualReasonFor('assets')" />
      </template>
      <template v-if="asset" #profiler>
          <AssetProfilerPanel
            :tests="tests"
            :tests-error="testsError"
            :test-status-series="testStatusSeries"
            :table-profile="tableProfile"
            :row-count-series="rowCountSeries"
            :usage-series="usageSeries"
            :column-null-series="columnNullSeries"
            :entity-type="entityType"
          />
      </template>
      <template v-if="asset" #table_queries>
          <Empty data-testid="asset-tab-residual" :description="residualReasonFor('table_queries')" />
      </template>
      <template v-if="asset" #dbt>
          <Empty data-testid="asset-tab-residual" :description="residualReasonFor('dbt')" />
      </template>
      <template v-if="asset" #view_definition>
          <Empty data-testid="asset-tab-residual" :description="residualReasonFor('view_definition')" />
      </template>
      <template v-if="asset" #contract>
          <Empty data-testid="asset-tab-residual" :description="residualReasonFor('contract')" />
      </template>
      <template v-if="asset" #config>
          <Empty data-testid="asset-tab-residual" :description="residualReasonFor('config')" />
      </template>
      <template v-if="asset" #customProperties>
          <AssetCustomPropertiesPanel
            :defs="customProperties"
            :values="asset?.extension ?? {}"
            :error="customPropsError"
            :entity-type="entityType"
          />
      </template>
      <template v-if="asset" #custom_properties>
          <AssetCustomPropertiesPanel
            :defs="customProperties"
            :values="asset?.extension ?? {}"
            :error="customPropsError"
            :entity-type="entityType"
          />
      </template>
    </EntityDetailShell>
    <Modal
      v-model:open="editOpen"
      :title="t('asset.editTitle')"
      :ok-text="t('crud.save')"
      :cancel-text="t('crud.cancel')"
      :get-container="false"
      :confirm-loading="saving"
      @ok="onSaveGovernance"
    >
      <Form layout="vertical">
        <Form.Item :label="t('asset.fields.description')">
          <Input.TextArea v-model:value="editForm.description" data-testid="asset-description" :rows="3" />
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
    </Modal>
    <Modal
      v-model:open="commentOpen"
      :title="t('asset.commentTitle')"
      :ok-text="t('crud.save')"
      :cancel-text="t('crud.cancel')"
      :get-container="false"
      :confirm-loading="saving"
      @ok="onCreateConversation"
    >
      <Form layout="vertical">
        <Form.Item :label="t('asset.messageLabel')" :rules="requiredField(t, t('asset.messageLabel'))">
          <Input.TextArea v-model:value="commentMessage" data-testid="asset-conversation-message" :rows="3" />
        </Form.Item>
      </Form>
    </Modal>
    <Modal
      v-model:open="propsOpen"
      :title="t('asset.propsTitle')"
      :ok-text="t('crud.save')"
      :cancel-text="t('crud.cancel')"
      :get-container="false"
      :confirm-loading="saving"
      @ok="onSaveCustomProperties"
    >
      <Form layout="vertical">
        <Form.Item
          v-for="def in customProperties"
          :key="def.name"
          :label="def.displayName || def.name"
        >
          <Input v-model:value="extensionForm[def.name]" :data-testid="`custom-prop-${def.name}`" />
        </Form.Item>
      </Form>
    </Modal>
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
  border-radius: var(--sm-border-radius);
}
</style>
