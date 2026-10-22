<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { onMounted, reactive, ref, watch } from 'vue';
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
  Typography,
  message,
} from 'ant-design-vue';
import { isDetailWired } from '@/catalog/entityRoutes';
import { getGlossaryTerm, listGlossaryTermAssets, listGlossaryTerms, updateGlossaryTerm } from '@/api/glossaryTerms';
import type { EntityRef } from '@/types/api';
import type { GlossaryTerm } from '@/types/governance';

const props = defineProps<{ id: string }>();
const router = useRouter();
const loading = ref(false);
const errorMessage = ref('');
const term = ref<GlossaryTerm | null>(null);
const siblings = ref<GlossaryTerm[]>([]);
const assets = ref<EntityRef[]>([]);
const editOpen = ref(false);
const saving = ref(false);
const editForm = reactive({
  displayName: '',
  description: '',
  relatedTermFqns: [] as string[],
});

const assetColumns = [
  { title: 'Name', dataIndex: 'name', key: 'name' },
  { title: 'Type', dataIndex: 'type', key: 'type', width: 140 },
  { title: 'FQN', dataIndex: 'fullyQualifiedName', key: 'fullyQualifiedName' },
];

async function load(): Promise<void> {
  loading.value = true;
  errorMessage.value = '';
  try {
    term.value = await getGlossaryTerm(props.id);
    const glossaryId = term.value.glossary?.id;
    if (glossaryId) {
      siblings.value = (await listGlossaryTerms({ glossary: glossaryId, limit: 100 })).data;
    } else {
      siblings.value = [];
    }
    try {
      assets.value = (await listGlossaryTermAssets(props.id, 50)).data;
    } catch {
      assets.value = [];
    }
  } catch (error) {
    term.value = null;
    assets.value = [];
    errorMessage.value = error instanceof Error ? error.message : 'Failed to load glossary term';
  } finally {
    loading.value = false;
  }
}

function openEdit(): void {
  if (!term.value) {
    return;
  }
  editForm.displayName = term.value.displayName || '';
  editForm.description = term.value.description || '';
  editForm.relatedTermFqns = term.value.relatedTerms
    .map((item) => item.fullyQualifiedName || item.name)
    .filter(Boolean);
  editOpen.value = true;
}

async function onSave(): Promise<void> {
  if (!term.value?.glossary) {
    message.error('This term has no glossary FQN; PUT /v1/glossaryTerms requires glossary');
    return;
  }
  saving.value = true;
  try {
    await updateGlossaryTerm({
      glossary: term.value.glossary.fullyQualifiedName || term.value.glossary.name,
      name: term.value.name,
      description: editForm.description.trim(),
      displayName: editForm.displayName.trim() || undefined,
      parent: term.value.parent?.fullyQualifiedName || term.value.parent?.name,
      relatedTerms: editForm.relatedTermFqns,
    });
    editOpen.value = false;
    message.success('Term updated');
    await load();
  } catch (error) {
    message.error(error instanceof Error ? error.message : 'Update failed');
  } finally {
    saving.value = false;
  }
}

function openAsset(asset: EntityRef): void {
  const entityType = asset.type || '';
  const fqn = asset.fullyQualifiedName || asset.name;
  if (!isDetailWired(entityType) || !fqn) {
    return;
  }
  void router.push({ name: 'asset', params: { entityType, fqn } });
}

watch(
  () => props.id,
  () => {
    void load();
  },
);

onMounted(() => {
  void load();
});
</script>

<template>
  <Spin :spinning="loading">
    <Card>
      <Space direction="vertical" size="middle" style="width: 100%">
        <div class="gov-head">
          <Typography.Title :level="4">
            {{ term?.displayName || term?.name || 'Glossary term' }}
          </Typography.Title>
          <Space>
            <Button
              v-if="term?.glossary?.id"
              @click="router.push({ name: 'governance-glossary', params: { id: term.glossary.id } })"
            >
              Back to glossary
            </Button>
            <Button type="primary" data-testid="edit-term" :disabled="!term" @click="openEdit">Edit term</Button>
          </Space>
        </div>
        <Alert v-if="errorMessage" type="warning" show-icon :message="errorMessage" />
        <Descriptions v-if="term" bordered :column="1" size="small">
          <Descriptions.Item label="Name">{{ term.name }}</Descriptions.Item>
          <Descriptions.Item label="FQN">{{ term.fullyQualifiedName }}</Descriptions.Item>
          <Descriptions.Item label="Glossary">{{ term.glossary?.name || '—' }}</Descriptions.Item>
          <Descriptions.Item label="Parent">{{ term.parent?.name || '—' }}</Descriptions.Item>
          <Descriptions.Item label="Description">{{ term.description || '—' }}</Descriptions.Item>
          <Descriptions.Item label="Related terms">
            {{ term.relatedTerms.map((item) => item.displayName || item.name).join(', ') || '—' }}
          </Descriptions.Item>
        </Descriptions>
        <Typography.Title :level="5">Related entities</Typography.Title>
        <Typography.Paragraph type="secondary">
          Assets returned by GET /api/v1/glossaryTerms/{id}/assets when this term is applied as a tag.
        </Typography.Paragraph>
        <Table
          row-key="id"
          data-testid="term-assets-table"
          :columns="assetColumns"
          :data-source="assets"
          :pagination="false"
          size="small"
        >
          <template #bodyCell="{ column, record }">
            <template v-if="column.key === 'name'">
              <a
                v-if="isDetailWired((record as EntityRef).type || '') && (record as EntityRef).fullyQualifiedName"
                href="#"
                @click.prevent="openAsset(record as EntityRef)"
              >
                {{ (record as EntityRef).displayName || (record as EntityRef).name }}
              </a>
              <span v-else>{{ (record as EntityRef).displayName || (record as EntityRef).name }}</span>
            </template>
          </template>
        </Table>
        <Typography.Text v-if="!assets.length" type="secondary">No tagged assets returned.</Typography.Text>
      </Space>
    </Card>
    <Modal v-model:open="editOpen" title="Edit glossary term" :confirm-loading="saving" @ok="onSave">
      <Form layout="vertical">
        <Form.Item label="Display name">
          <Input v-model:value="editForm.displayName" />
        </Form.Item>
        <Form.Item label="Description" required>
          <Input.TextArea v-model:value="editForm.description" :rows="3" />
        </Form.Item>
        <Form.Item label="Related terms">
          <Select v-model:value="editForm.relatedTermFqns" mode="multiple" allow-clear>
            <Select.Option
              v-for="item in siblings.filter((candidate) => candidate.id !== term?.id)"
              :key="item.id"
              :value="item.fullyQualifiedName || item.name"
            >
              {{ item.displayName || item.name }}
            </Select.Option>
          </Select>
        </Form.Item>
      </Form>
    </Modal>
  </Spin>
</template>

<style scoped>
.gov-head {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  align-items: flex-start;
}
</style>
