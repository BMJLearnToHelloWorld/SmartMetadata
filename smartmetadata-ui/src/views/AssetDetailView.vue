<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue';
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
  Tag,
  Typography,
  message,
} from 'ant-design-vue';
import { fetchAssetDetail, patchAsset } from '@/api/entities';
import { getLatestTableProfile, getTableSampleData, getTopicSampleData } from '@/api/profiler';
import { listTestCases } from '@/api/testCases';
import { isDetailWired, lineageLocation } from '@/catalog/entityRoutes';
import {
  loadGovernanceCatalog,
  ownerKey,
  parseOwnerKey,
  type GovernanceCatalog,
} from '@/governance/catalogOptions';
import { descriptionPatch, domainsPatch, ownersPatch, tagsPatch } from '@/governance/assetPatch';
import type { AssetDetail } from '@/types/api';
import type { AssetTagOption } from '@/types/governance';
import type { TableProfile, TableSampleData, TestCase, TopicSampleData } from '@/types/quality';

const props = defineProps<{
  entityType: string;
  fqn: string;
}>();

const router = useRouter();

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
const editOpen = ref(false);
const saving = ref(false);
const editForm = reactive({
  description: '',
  ownerKeys: [] as string[],
  tagFqns: [] as string[],
  domainIds: [] as string[],
});

const decodedFqn = computed(() => props.fqn);

const schemaColumns = [
  { title: 'Name', dataIndex: 'name', key: 'name' },
  { title: 'Type', dataIndex: 'dataType', key: 'dataType', width: 180 },
  { title: 'Description', dataIndex: 'description', key: 'description' },
];

const testColumns = [
  { title: 'Name', dataIndex: 'name', key: 'name' },
  { title: 'Definition', key: 'testDefinition' },
  { title: 'Latest status', key: 'status', width: 140 },
];

const profileColumns = [
  { title: 'Column', dataIndex: 'name', key: 'name' },
  { title: 'Nulls', dataIndex: 'nullCount', key: 'nullCount', width: 90 },
  { title: 'Unique', dataIndex: 'uniqueCount', key: 'uniqueCount', width: 90 },
  { title: 'Min', dataIndex: 'min', key: 'min' },
  { title: 'Max', dataIndex: 'max', key: 'max' },
];

async function load(): Promise<void> {
  loading.value = true;
  errorMessage.value = '';
  asset.value = null;
  if (!isDetailWired(props.entityType)) {
    errorMessage.value =
      `Phase 1 fetches full detail only for table and topic. "${props.entityType}" is not wired.`;
    loading.value = false;
    return;
  }
  tests.value = [];
  testsError.value = '';
  tableSample.value = null;
  topicSample.value = null;
  tableProfile.value = null;
  observabilityError.value = '';
  try {
    asset.value = await fetchAssetDetail(props.entityType, decodedFqn.value);
    await loadQuality();
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : 'Failed to load asset';
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
  } catch (error) {
    tests.value = [];
    testsError.value = error instanceof Error ? error.message : 'Failed to load linked tests';
  }
  if (props.entityType === 'table' && asset.value.id) {
    try {
      tableSample.value = await getTableSampleData(asset.value.id);
    } catch (error) {
      tableSample.value = null;
      observabilityError.value = error instanceof Error ? error.message : 'Sample data unavailable';
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
      observabilityError.value = error instanceof Error ? error.message : 'Sample data unavailable';
    }
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
    message.error('Cannot PATCH this asset without an entity id');
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
    message.success('Asset governance updated');
    await load();
  } catch (error) {
    message.error(error instanceof Error ? error.message : 'Update failed');
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
          View lineage
        </Button>
        <Button data-testid="edit-governance" :disabled="!asset?.id" @click="openEdit">
          Edit governance
        </Button>
      </Space>
      <Alert v-if="errorMessage" type="warning" show-icon :message="errorMessage" class="detail__alert" />
      <template v-if="asset">
        <Descriptions bordered :column="1" size="small">
          <Descriptions.Item label="Name">{{ asset.name }}</Descriptions.Item>
          <Descriptions.Item label="Type">{{ asset.entityType }}</Descriptions.Item>
          <Descriptions.Item label="FQN">{{ asset.fullyQualifiedName }}</Descriptions.Item>
          <Descriptions.Item label="Description">{{ asset.description || '—' }}</Descriptions.Item>
          <Descriptions.Item label="Owners">
            <Space wrap>
              <span v-for="owner in asset.owners" :key="owner.id || owner.name">
                {{ owner.displayName || owner.name }}
              </span>
              <Typography.Text v-if="!asset.owners.length" type="secondary">—</Typography.Text>
            </Space>
          </Descriptions.Item>
          <Descriptions.Item label="Tags">
            <Space wrap>
              <Tag v-for="tag in asset.tags" :key="tag.tagFQN">{{ tag.name }}</Tag>
              <Typography.Text v-if="!asset.tags.length" type="secondary">—</Typography.Text>
            </Space>
          </Descriptions.Item>
          <Descriptions.Item label="Domains">
            <Space wrap>
              <span v-for="domain in asset.domains" :key="domain.id || domain.name">
                {{ domain.displayName || domain.name }}
              </span>
              <Typography.Text v-if="!asset.domains.length" type="secondary">—</Typography.Text>
            </Space>
          </Descriptions.Item>
        </Descriptions>
        <Typography.Title :level="5" class="detail__schema-title">{{ asset.schemaLabel }}</Typography.Title>
        <Table
          row-key="name"
          :columns="schemaColumns"
          :data-source="asset.schemaRows"
          :pagination="false"
          size="small"
        />
        <Typography.Title :level="5" class="detail__schema-title">Data quality tests</Typography.Title>
        <Typography.Paragraph type="secondary">
          GET /api/v1/dataQuality/testCases?entityFQN=…&includeAllTests=true
        </Typography.Paragraph>
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
          <Typography.Title :level="5" class="detail__schema-title">Latest profiler</Typography.Title>
          <Typography.Paragraph type="secondary">
            GET /api/v1/tables/{fqn}/tableProfile/latest — empty when no profiler job has written
            results. This UI does not trigger ingestion.
          </Typography.Paragraph>
          <Typography.Paragraph v-if="tableProfile">
            rows {{ tableProfile.rowCount ?? '—' }} · columns {{ tableProfile.columnCount ?? '—' }}
          </Typography.Paragraph>
          <Table
            row-key="name"
            data-testid="asset-profile-table"
            :columns="profileColumns"
            :data-source="tableProfile?.columns ?? []"
            :pagination="false"
            size="small"
          />
          <Typography.Title :level="5" class="detail__schema-title">Sample data</Typography.Title>
          <Typography.Paragraph type="secondary">
            GET /api/v1/tables/{id}/sampleData
          </Typography.Paragraph>
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
          <Typography.Title :level="5" class="detail__schema-title">Sample messages</Typography.Title>
          <Typography.Paragraph type="secondary">
            GET /api/v1/topics/{id}/sampleData. Topics have no tableProfile endpoint.
          </Typography.Paragraph>
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
            :columns="[{ title: 'Message', dataIndex: 'message', key: 'message' }]"
            :data-source="topicSample.messages.map((message, index) => ({ __idx: index, message }))"
            :pagination="false"
            size="small"
          />
        </template>
      </template>
    </Card>
    <Modal
      v-model:open="editOpen"
      title="Edit description, owners, tags, and domain"
      :get-container="false"
      :confirm-loading="saving"
      @ok="onSaveGovernance"
    >
      <Form layout="vertical">
        <Form.Item label="Description">
          <Input.TextArea v-model:value="editForm.description" data-testid="asset-description" :rows="3" />
        </Form.Item>
        <Form.Item label="Owners">
          <Select v-model:value="editForm.ownerKeys" mode="multiple" allow-clear data-testid="asset-owners">
            <Select.Option v-for="owner in catalog.owners" :key="owner.key" :value="owner.key">
              {{ owner.label }}
            </Select.Option>
          </Select>
        </Form.Item>
        <Form.Item label="Tags">
          <Select v-model:value="editForm.tagFqns" mode="multiple" allow-clear data-testid="asset-tags">
            <Select.Option v-for="tag in catalog.tags" :key="tag.tagFQN" :value="tag.tagFQN">
              {{ tag.source }} · {{ tag.name }}
            </Select.Option>
          </Select>
        </Form.Item>
        <Form.Item label="Domains">
          <Select v-model:value="editForm.domainIds" mode="multiple" allow-clear data-testid="asset-domains">
            <Select.Option v-for="domain in catalog.domains" :key="domain.id" :value="domain.id">
              {{ domain.displayName || domain.name }}
            </Select.Option>
          </Select>
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
</style>
