<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import {
  Alert,
  Button,
  Descriptions,
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
import { fetchAssetDetail, patchAsset } from '@/api/entities';
import { getLatestTableProfile, getTableSampleData, getTopicSampleData, listTableProfiles } from '@/api/profiler';
import { listTestCases } from '@/api/testCases';
import { getEntityUsage } from '@/api/usage';
import LineageCanvas from '@/components/lineage/LineageCanvas.vue';
import PipelineTaskGraph from '@/components/pipeline/PipelineTaskGraph.vue';
import { assetTabKeys, type AssetTabKey } from '@/catalog/assetTabs';
import { isDetailWired, lineageLocation } from '@/catalog/entityRoutes';
import SmChart from '@/features/charts/SmChart.vue';
import {
  columnNullPoints,
  namedSeries,
  profilesToRowCountPoints,
  testResultsToStatusPoints,
  usageToPoints,
} from '@/features/charts/series';
import { seriesWindow, type ChartSeries } from '@/features/charts/types';
import EntityDetailShell from '@/features/crud/EntityDetailShell.vue';
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
import type { AssetDetail, CatalogPipelineStatus } from '@/types/api';
import type { ActivityEvent, Conversation, CustomPropertyDef } from '@/types/collaboration';
import type { AssetTagOption } from '@/types/governance';
import type { TableProfile, TableSampleData, TestCase, TopicSampleData } from '@/types/quality';

const props = defineProps<{
  entityType: string;
  fqn: string;
}>();

const router = useRouter();
const { t, te } = useI18n();

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
const activeTab = ref('overview');
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

const tabs = computed<EntityDetailTab[]>(() => {
  if (!asset.value) {
    return [];
  }
  return assetTabKeys(props.entityType).map((key) => ({
    key,
    label: t(`asset.tabs.${key}`),
    testId: TAB_TEST_IDS[key],
  }));
});

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

const testColumns = computed(() => [
  { title: t('asset.columns.name'), dataIndex: 'name', key: 'name' },
  { title: t('asset.columns.definition'), key: 'testDefinition' },
  { title: t('asset.columns.status'), key: 'status', width: 140 },
]);

const profileColumns = computed(() => [
  { title: t('asset.columns.column'), dataIndex: 'name', key: 'name' },
  { title: t('asset.columns.nulls'), dataIndex: 'nullCount', key: 'nullCount', width: 90 },
  { title: t('asset.columns.unique'), dataIndex: 'uniqueCount', key: 'uniqueCount', width: 90 },
  { title: t('asset.columns.min'), dataIndex: 'min', key: 'min' },
  { title: t('asset.columns.max'), dataIndex: 'max', key: 'max' },
]);

const activityColumns = computed(() => [
  { title: t('asset.columns.eventType'), dataIndex: 'eventType', key: 'eventType', width: 180 },
  { title: t('asset.columns.summary'), key: 'summary' },
]);

const conversationColumns = computed(() => [
  { title: t('asset.columns.message'), dataIndex: 'message', key: 'message' },
  { title: t('asset.columns.replies'), dataIndex: 'replyCount', key: 'replyCount', width: 90 },
]);

const customPropertyColumns = computed(() => [
  { title: t('asset.columns.property'), key: 'property' },
  { title: t('asset.columns.propertyType'), dataIndex: 'propertyType', key: 'propertyType', width: 140 },
  { title: t('asset.columns.value'), key: 'value' },
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

function extensionValue(name: string): string {
  const value = asset.value?.extension?.[name];
  if (value === undefined || value === null) {
    return '—';
  }
  return typeof value === 'string' ? value : JSON.stringify(value);
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
  activeTab.value = 'overview';
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
      @update:activeTab="activeTab = $event"
    >
      <template #actions>
        <Button
          data-testid="view-lineage"
          @click="router.push(lineageLocation(entityType, decodedFqn))"
        >
          {{ t('asset.viewLineage') }}
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
          <Descriptions bordered :column="1" size="small">
            <Descriptions.Item :label="t('asset.fields.name')">{{ asset.name }}</Descriptions.Item>
            <Descriptions.Item :label="t('asset.fields.type')">{{ asset.entityType }}</Descriptions.Item>
            <Descriptions.Item v-if="asset.tableType" :label="t('asset.fields.tableType')">
              {{ asset.tableType }}
            </Descriptions.Item>
            <Descriptions.Item v-if="asset.serviceType" :label="t('asset.fields.serviceType')">
              {{ asset.serviceType }}
            </Descriptions.Item>
            <Descriptions.Item v-if="asset.service" :label="t('asset.fields.service')">
              {{ asset.service.displayName || asset.service.name }}
            </Descriptions.Item>
            <Descriptions.Item v-if="asset.database" :label="t('asset.fields.database')">
              {{ asset.database.displayName || asset.database.name }}
            </Descriptions.Item>
            <Descriptions.Item v-if="asset.databaseSchema" :label="t('asset.fields.schema')">
              {{ asset.databaseSchema.displayName || asset.databaseSchema.name }}
            </Descriptions.Item>
            <Descriptions.Item v-if="asset.partitions !== undefined" :label="t('asset.fields.partitions')">
              {{ asset.partitions }}
            </Descriptions.Item>
            <Descriptions.Item v-if="asset.project" :label="t('asset.fields.project')">
              {{ asset.project }}
            </Descriptions.Item>
            <Descriptions.Item v-if="asset.dashboardType" :label="t('asset.fields.dashboardType')">
              {{ asset.dashboardType }}
            </Descriptions.Item>
            <Descriptions.Item v-if="asset.chartType" :label="t('asset.fields.chartType')">
              {{ asset.chartType }}
            </Descriptions.Item>
            <Descriptions.Item v-if="asset.metricType" :label="t('asset.fields.metricType')">
              {{ asset.metricType }}
            </Descriptions.Item>
            <Descriptions.Item v-if="asset.unitOfMeasurement" :label="t('asset.fields.unitOfMeasurement')">
              {{ asset.unitOfMeasurement }}
            </Descriptions.Item>
            <Descriptions.Item v-if="asset.granularity" :label="t('asset.fields.granularity')">
              {{ asset.granularity }}
            </Descriptions.Item>
            <Descriptions.Item v-if="asset.dataModelType" :label="t('asset.fields.dataModelType')">
              {{ asset.dataModelType }}
            </Descriptions.Item>
            <Descriptions.Item v-if="asset.scheduleInterval" :label="t('asset.fields.scheduleInterval')">
              {{ asset.scheduleInterval }}
            </Descriptions.Item>
            <Descriptions.Item v-if="asset.pipelineState" :label="t('asset.fields.pipelineState')">
              {{ asset.pipelineState }}
            </Descriptions.Item>
            <Descriptions.Item v-if="asset.algorithm" :label="t('asset.fields.algorithm')">
              {{ asset.algorithm }}
            </Descriptions.Item>
            <Descriptions.Item v-if="asset.target" :label="t('asset.fields.target')">
              {{ asset.target }}
            </Descriptions.Item>
            <Descriptions.Item v-if="asset.prefix" :label="t('asset.fields.prefix')">
              {{ asset.prefix }}
            </Descriptions.Item>
            <Descriptions.Item v-if="asset.fileFormats?.length" :label="t('asset.fields.fileFormats')">
              {{ asset.fileFormats.join(', ') }}
            </Descriptions.Item>
            <Descriptions.Item v-if="asset.indexType" :label="t('asset.fields.indexType')">
              {{ asset.indexType }}
            </Descriptions.Item>
            <Descriptions.Item v-if="asset.storedProcedureType" :label="t('asset.fields.storedProcedureType')">
              {{ asset.storedProcedureType }}
            </Descriptions.Item>
            <Descriptions.Item v-if="asset.sourceUrl" :label="t('asset.fields.sourceUrl')">
              <a :href="asset.sourceUrl" target="_blank" rel="noreferrer">{{ asset.sourceUrl }}</a>
            </Descriptions.Item>
            <Descriptions.Item :label="t('asset.fields.fqn')">{{ asset.fullyQualifiedName }}</Descriptions.Item>
            <Descriptions.Item :label="t('asset.fields.description')">{{ asset.description || '—' }}</Descriptions.Item>
            <Descriptions.Item :label="t('asset.fields.owners')">
              <Space wrap>
                <span v-for="owner in asset.owners" :key="owner.id || owner.name">
                  {{ owner.displayName || owner.name }}
                </span>
                <Typography.Text v-if="!asset.owners.length" type="secondary">—</Typography.Text>
              </Space>
            </Descriptions.Item>
            <Descriptions.Item :label="t('asset.fields.tags')">
              <Space wrap>
                <Tag v-for="tag in asset.tags" :key="tag.tagFQN">{{ tag.name }}</Tag>
                <Typography.Text v-if="!asset.tags.length" type="secondary">—</Typography.Text>
              </Space>
            </Descriptions.Item>
            <Descriptions.Item :label="t('asset.fields.domains')">
              <Space wrap>
                <span v-for="domain in asset.domains" :key="domain.id || domain.name">
                  {{ domain.displayName || domain.name }}
                </span>
                <Typography.Text v-if="!asset.domains.length" type="secondary">—</Typography.Text>
              </Space>
            </Descriptions.Item>
          </Descriptions>
          <template v-if="entityType === 'chart' || entityType === 'database' || entityType === 'databaseSchema'">
            <Typography.Title :level="5" class="detail__schema-title">{{ t('asset.relatedTitle') }}</Typography.Title>
            <Empty
              v-if="!asset.children?.length"
              data-testid="asset-related-empty"
              :description="t('asset.relatedEmpty')"
            />
            <Table
              v-else
              row-key="name"
              data-testid="asset-related-table"
              :columns="refColumns"
              :data-source="asset.children"
              :pagination="false"
              size="small"
            />
          </template>
      </template>
      <template v-if="asset" #schema>
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
      <template v-if="asset" #charts>
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
          <Typography.Title :level="5">{{ t('asset.testsTitle') }}</Typography.Title>
          <Typography.Paragraph type="secondary">{{ t('asset.qualityLead') }}</Typography.Paragraph>
          <Alert v-if="testsError" type="warning" show-icon :message="testsError" class="detail__alert" />
          <Table
            row-key="id"
            data-testid="asset-tests-table"
            :columns="testColumns"
            :data-source="tests"
            :pagination="false"
            size="small"
          >
            <template #bodyCell="{ column, record }">
              <template v-if="column.key === 'name'">
                <a
                  href="#"
                  :data-testid="`asset-test-${(record as TestCase).id}`"
                  @click.prevent="router.push({ name: 'quality-test-case', params: { id: (record as TestCase).id } })"
                >
                  {{ (record as TestCase).displayName || (record as TestCase).name }}
                </a>
              </template>
              <template v-else-if="column.key === 'testDefinition'">
                <a
                  v-if="(record as TestCase).testDefinition?.id"
                  href="#"
                  @click.prevent="
                    router.push({
                      name: 'quality-test-definition',
                      params: { id: (record as TestCase).testDefinition?.id },
                    })
                  "
                >
                  {{
                    (record as TestCase).testDefinition?.fullyQualifiedName ||
                    (record as TestCase).testDefinition?.name
                  }}
                </a>
                <span v-else>
                  {{ (record as TestCase).testDefinition?.name || '—' }}
                </span>
              </template>
              <template v-else-if="column.key === 'status'">
                {{
                  (record as TestCase).testCaseResult?.testCaseStatus ||
                  (record as TestCase).testCaseStatus ||
                  '—'
                }}
              </template>
            </template>
          </Table>
          <div class="detail__chart-block">
            <Typography.Text strong>{{ t('asset.testStatusChart') }}</Typography.Text>
            <Typography.Paragraph type="secondary">{{ t('asset.testStatusChartLead') }}</Typography.Paragraph>
            <SmChart kind="donut" test-id="asset-test-status-chart" :series="testStatusSeries" :empty="t('charts.empty')" />
          </div>
          <template v-if="entityType === 'table'">
            <Typography.Title :level="5" class="detail__schema-title">{{ t('asset.profilerTitle') }}</Typography.Title>
            <Typography.Paragraph type="secondary">{{ t('asset.profilerLead') }}</Typography.Paragraph>
            <Typography.Paragraph v-if="tableProfile">
              {{ t('asset.rows', { rows: tableProfile.rowCount ?? '—', columns: tableProfile.columnCount ?? '—' }) }}
            </Typography.Paragraph>
            <div class="detail__charts" data-testid="asset-profile-charts">
              <div>
                <Typography.Text strong>{{ t('asset.rowCountChart') }}</Typography.Text>
                <Typography.Paragraph type="secondary">{{ t('asset.rowCountChartLead') }}</Typography.Paragraph>
                <SmChart kind="line" test-id="asset-rowcount-chart" :series="rowCountSeries" :empty="t('charts.empty')" />
              </div>
              <div>
                <Typography.Text strong>{{ t('asset.usageChart') }}</Typography.Text>
                <Typography.Paragraph type="secondary">{{ t('asset.usageChartLead') }}</Typography.Paragraph>
                <SmChart kind="line" test-id="asset-usage-chart" :series="usageSeries" :empty="t('charts.empty')" />
              </div>
              <div>
                <Typography.Text strong>{{ t('asset.columnNullChart') }}</Typography.Text>
                <Typography.Paragraph type="secondary">{{ t('asset.columnNullChartLead') }}</Typography.Paragraph>
                <SmChart kind="bar" test-id="asset-column-null-chart" :series="columnNullSeries" :empty="t('charts.empty')" />
              </div>
            </div>
            <Table
              row-key="name"
              data-testid="asset-profile-table"
              :columns="profileColumns"
              :data-source="tableProfile?.columns ?? []"
              :pagination="false"
              size="small"
            />
            <Typography.Title :level="5" class="detail__schema-title">{{ t('asset.sampleTitle') }}</Typography.Title>
            <Typography.Paragraph type="secondary">{{ t('asset.sampleLead') }}</Typography.Paragraph>
            <Alert
              v-if="observabilityError && !tableSample"
              type="warning"
              show-icon
              :message="observabilityError"
              class="detail__alert"
            />
            <Table
              v-if="tableSample"
              data-testid="asset-sample-table"
              row-key="__idx"
              :columns="tableSample.columns.map((name) => ({ title: name, dataIndex: name, key: name }))"
              :data-source="
                tableSample.rows.map((row, index) => {
                  const record: Record<string, string | number> = { __idx: index };
                  tableSample.columns.forEach((name, col) => {
                    record[name] = row[col] ?? '';
                  });
                  return record;
                })
              "
              :pagination="false"
              size="small"
            />
          </template>
          <template v-else-if="entityType === 'topic'">
            <Typography.Title :level="5" class="detail__schema-title">{{ t('asset.topicSampleTitle') }}</Typography.Title>
            <Typography.Paragraph type="secondary">{{ t('asset.topicSampleLead') }}</Typography.Paragraph>
            <Alert
              v-if="observabilityError && !topicSample"
              type="warning"
              show-icon
              :message="observabilityError"
              class="detail__alert"
            />
            <Table
              v-if="topicSample"
              data-testid="asset-topic-sample-table"
              row-key="__idx"
              :columns="[{ title: t('asset.columns.message'), dataIndex: 'message', key: 'message' }]"
              :data-source="topicSample.messages.map((message, index) => ({ __idx: index, message }))"
              :pagination="false"
              size="small"
            />
          </template>
      </template>
      <template v-if="asset" #activity>
          <Typography.Paragraph type="secondary">
            {{ t('asset.activityLead', { type: entityType, fqn: decodedFqn }) }}
          </Typography.Paragraph>
          <Alert
            v-if="collaborationError"
            type="warning"
            show-icon
            :message="collaborationError"
            class="detail__alert"
          />
          <Table
            row-key="id"
            data-testid="asset-activity-table"
            :columns="activityColumns"
            :data-source="activity"
            :pagination="false"
            size="small"
          >
            <template #bodyCell="{ column, record }">
              <template v-if="column.key === 'summary'">
                {{ (record as ActivityEvent).summary || (record as ActivityEvent).fieldName || '—' }}
              </template>
            </template>
          </Table>
          <Typography.Title :level="5" class="detail__schema-title">{{ t('asset.conversationsTitle') }}</Typography.Title>
          <Typography.Paragraph type="secondary">
            {{ t('asset.conversationsLead', { type: entityType, fqn: decodedFqn }) }}
          </Typography.Paragraph>
          <Table
            row-key="id"
            data-testid="asset-conversations-table"
            :columns="conversationColumns"
            :data-source="conversations"
            :pagination="false"
            size="small"
          />
      </template>
      <template v-if="asset" #customProperties>
          <Typography.Paragraph type="secondary">
            {{ t('asset.customPropertiesLead', { type: entityType }) }}
          </Typography.Paragraph>
          <Alert v-if="customPropsError" type="warning" show-icon :message="customPropsError" class="detail__alert" />
          <Table
            row-key="name"
            data-testid="asset-custom-properties-table"
            :columns="customPropertyColumns"
            :data-source="customProperties"
            :pagination="false"
            size="small"
          >
            <template #bodyCell="{ column, record }">
              <template v-if="column.key === 'property'">
                {{ (record as CustomPropertyDef).displayName || (record as CustomPropertyDef).name }}
              </template>
              <template v-else-if="column.key === 'value'">
                {{ extensionValue((record as CustomPropertyDef).name) }}
              </template>
            </template>
          </Table>
      </template>
    </EntityDetailShell>
    <Modal
      v-model:open="editOpen"
      :title="t('asset.editTitle')"
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
      :get-container="false"
      :confirm-loading="saving"
      @ok="onCreateConversation"
    >
      <Form layout="vertical">
        <Form.Item :label="t('asset.messageLabel')" required>
          <Input.TextArea v-model:value="commentMessage" data-testid="asset-conversation-message" :rows="3" />
        </Form.Item>
      </Form>
    </Modal>
    <Modal
      v-model:open="propsOpen"
      :title="t('asset.propsTitle')"
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
  background: var(--ant-color-fill-quaternary, #fafafa);
  border-radius: 6px;
}
</style>
