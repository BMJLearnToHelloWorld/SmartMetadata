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

const props = defineProps<{
  entityType: string;
  fqn: string;
}>();

const router = useRouter();

const loading = ref(false);
const errorMessage = ref('');
const asset = ref<AssetDetail | null>(null);
const catalog = ref<GovernanceCatalog>({ owners: [], tags: [], domains: [] });
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
  try {
    asset.value = await fetchAssetDetail(props.entityType, decodedFqn.value);
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : 'Failed to load asset';
  } finally {
    loading.value = false;
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
