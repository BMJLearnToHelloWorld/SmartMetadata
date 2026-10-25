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
  Card,
  Descriptions,
  Form,
  Input,
  Modal,
  Select,
  Space,
  Spin,
  Table,
  Tabs,
  Tag,
  Typography,
  message,
} from 'ant-design-vue';
import { listEntityActivity } from '@/api/activity';
import { createConversation, listConversations } from '@/api/conversations';
import { listCustomProperties } from '@/api/customProperties';
import { fetchAssetDetail, patchAsset } from '@/api/entities';
import { fetchEntityLineage } from '@/api/lineage';
import { getLatestTableProfile, getTableSampleData, getTopicSampleData } from '@/api/profiler';
import { listTestCases } from '@/api/testCases';
import { assetLocation, isDetailWired, lineageLocation } from '@/catalog/entityRoutes';
import {
  loadGovernanceCatalog,
  ownerKey,
  parseOwnerKey,
  type GovernanceCatalog,
} from '@/governance/catalogOptions';
import { descriptionPatch, domainsPatch, extensionPatch, ownersPatch, tagsPatch } from '@/governance/assetPatch';
import { lineageNeighbors, mapEntityLineage, type LineageGraphModel } from '@/lineage/graphModel';
import { toEntityLink } from '@/quality/entityLink';
import type { AssetDetail } from '@/types/api';
import type { ActivityEvent, Conversation, CustomPropertyDef } from '@/types/collaboration';
import type { AssetTagOption } from '@/types/governance';
import type { TableProfile, TableSampleData, TestCase, TopicSampleData } from '@/types/quality';

const props = defineProps<{
  entityType: string;
  fqn: string;
}>();

const router = useRouter();
const { t } = useI18n();

const loading = ref(false);
const errorMessage = ref('');
const asset = ref<AssetDetail | null>(null);
const catalog = ref<GovernanceCatalog>({ owners: [], tags: [], domains: [] });
const tests = ref<TestCase[]>([]);
const testsError = ref('');
const tableSample = ref<TableSampleData | null>(null);
const topicSample = ref<TopicSampleData | null>(null);
const tableProfile = ref<TableProfile | null>(null);
const observabilityError = ref('');
const activity = ref<ActivityEvent[]>([]);
const conversations = ref<Conversation[]>([]);
const collaborationError = ref('');
const customProperties = ref<CustomPropertyDef[]>([]);
const customPropsError = ref('');
const lineageModel = ref<LineageGraphModel | null>(null);
const lineageError = ref('');
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
const neighbors = computed(() =>
  lineageModel.value ? lineageNeighbors(lineageModel.value) : { upstream: [], downstream: [] },
);

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

const neighborColumns = computed(() => [
  { title: t('asset.fields.type'), dataIndex: 'entityType', key: 'entityType', width: 120 },
  { title: t('asset.fields.name'), key: 'name' },
  { title: t('asset.fields.fqn'), dataIndex: 'fullyQualifiedName', key: 'fqn' },
]);

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
  observabilityError.value = '';
  activity.value = [];
  conversations.value = [];
  collaborationError.value = '';
  customProperties.value = [];
  customPropsError.value = '';
  lineageModel.value = null;
  lineageError.value = '';
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
    await Promise.all([loadQuality(), loadCollaboration(), loadCustomProperties(), loadLineage()]);
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : t('asset.loadFailed');
  } finally {
    loading.value = false;
  }
}

async function loadLineage(): Promise<void> {
  try {
    const payload = await fetchEntityLineage({
      entityType: props.entityType,
      fqn: decodedFqn.value,
      upstreamDepth: 1,
      downstreamDepth: 1,
    });
    lineageModel.value = mapEntityLineage(payload);
  } catch (error) {
    lineageModel.value = null;
    lineageError.value = error instanceof Error ? error.message : t('asset.lineageFailed');
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
  } catch (error) {
    tests.value = [];
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
    } catch {
      tableProfile.value = null;
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

function openNeighbor(entityType: string, fqn: string): void {
  if (!entityType || !fqn) {
    return;
  }
  void router.push(assetLocation(entityType, fqn));
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
  <Spin :spinning="loading">
    <Card>
      <Typography.Title :level="4">
        {{ asset?.displayName || asset?.name || decodedFqn }}
      </Typography.Title>
      <Typography.Paragraph type="secondary">
        {{ entityType }} · {{ asset?.fullyQualifiedName || decodedFqn }}
      </Typography.Paragraph>
      <Space class="detail__actions">
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
      </Space>
      <Alert v-if="errorMessage" type="warning" show-icon :message="errorMessage" class="detail__alert" />
      <Tabs v-if="asset" data-testid="asset-tabs" class="detail__tabs">
        <Tabs.TabPane key="overview" :tab="t('asset.tabs.overview')" force-render data-testid="asset-tab-overview">
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
        </Tabs.TabPane>
        <Tabs.TabPane key="schema" :tab="t('asset.tabs.schema')" force-render data-testid="asset-tab-schema">
          <Typography.Title :level="5">{{ asset.schemaLabel }}</Typography.Title>
          <Table
            row-key="name"
            data-testid="asset-schema-table"
            :columns="schemaColumns"
            :data-source="asset.schemaRows"
            :pagination="false"
            size="small"
          />
        </Tabs.TabPane>
        <Tabs.TabPane key="lineage" :tab="t('asset.tabs.lineage')" force-render data-testid="asset-tab-lineage">
          <Typography.Paragraph type="secondary">
            {{ t('asset.lineageLead', { type: entityType, fqn: decodedFqn }) }}
          </Typography.Paragraph>
          <Alert v-if="lineageError" type="warning" show-icon :message="lineageError" class="detail__alert" />
          <Typography.Text v-else-if="!neighbors.upstream.length && !neighbors.downstream.length" type="secondary">
            {{ t('asset.lineageEmpty') }}
          </Typography.Text>
          <template v-else>
            <Typography.Title :level="5">{{ t('asset.upstream') }}</Typography.Title>
            <Table
              row-key="id"
              data-testid="asset-lineage-upstream"
              :columns="neighborColumns"
              :data-source="neighbors.upstream"
              :pagination="false"
              size="small"
            >
              <template #bodyCell="{ column, record }">
                <template v-if="column.key === 'name'">
                  <a
                    href="#"
                    @click.prevent="
                      openNeighbor(
                        (record as { entityType: string; fullyQualifiedName: string }).entityType,
                        (record as { fullyQualifiedName: string }).fullyQualifiedName,
                      )
                    "
                  >
                    {{ (record as { displayName?: string; name: string }).displayName || (record as { name: string }).name }}
                  </a>
                </template>
              </template>
            </Table>
            <Typography.Title :level="5" class="detail__schema-title">{{ t('asset.downstream') }}</Typography.Title>
            <Table
              row-key="id"
              data-testid="asset-lineage-downstream"
              :columns="neighborColumns"
              :data-source="neighbors.downstream"
              :pagination="false"
              size="small"
            >
              <template #bodyCell="{ column, record }">
                <template v-if="column.key === 'name'">
                  <a
                    href="#"
                    @click.prevent="
                      openNeighbor(
                        (record as { entityType: string; fullyQualifiedName: string }).entityType,
                        (record as { fullyQualifiedName: string }).fullyQualifiedName,
                      )
                    "
                  >
                    {{ (record as { displayName?: string; name: string }).displayName || (record as { name: string }).name }}
                  </a>
                </template>
              </template>
            </Table>
          </template>
        </Tabs.TabPane>
        <Tabs.TabPane key="quality" :tab="t('asset.tabs.quality')" force-render data-testid="asset-tab-quality">
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
          <template v-if="entityType === 'table'">
            <Typography.Title :level="5" class="detail__schema-title">{{ t('asset.profilerTitle') }}</Typography.Title>
            <Typography.Paragraph type="secondary">{{ t('asset.profilerLead') }}</Typography.Paragraph>
            <Typography.Paragraph v-if="tableProfile">
              {{ t('asset.rows', { rows: tableProfile.rowCount ?? '—', columns: tableProfile.columnCount ?? '—' }) }}
            </Typography.Paragraph>
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
        </Tabs.TabPane>
        <Tabs.TabPane key="activity" :tab="t('asset.tabs.activity')" force-render data-testid="asset-tab-activity">
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
        </Tabs.TabPane>
        <Tabs.TabPane key="customProperties" :tab="t('asset.tabs.customProperties')" force-render data-testid="asset-tab-custom">
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
        </Tabs.TabPane>
      </Tabs>
    </Card>
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
  </Spin>
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
</style>
