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
  Checkbox,
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
import { getClassification, updateClassification } from '@/api/classifications';
import { createTag, listTags } from '@/api/tags';
import type { Classification, ClassificationTag } from '@/types/governance';

const props = defineProps<{ id: string }>();
const router = useRouter();
const loading = ref(false);
const errorMessage = ref('');
const classification = ref<Classification | null>(null);
const tags = ref<ClassificationTag[]>([]);
const editOpen = ref(false);
const createTagOpen = ref(false);
const saving = ref(false);
const creating = ref(false);
const editForm = reactive({
  displayName: '',
  description: '',
  mutuallyExclusive: false,
});
const tagForm = reactive({
  name: '',
  displayName: '',
  description: '',
  parent: undefined as string | undefined,
  mutuallyExclusive: false,
});

const tagColumns = [
  { title: 'Name', dataIndex: 'name', key: 'name' },
  { title: 'FQN', dataIndex: 'fullyQualifiedName', key: 'fullyQualifiedName' },
  { title: 'Usage', key: 'usageCount', width: 90 },
];

async function load(): Promise<void> {
  loading.value = true;
  errorMessage.value = '';
  try {
    classification.value = await getClassification(props.id);
    const parent = classification.value.fullyQualifiedName || classification.value.name;
    tags.value = (await listTags({ parent, limit: 100 })).data;
  } catch (error) {
    classification.value = null;
    tags.value = [];
    errorMessage.value = error instanceof Error ? error.message : 'Failed to load classification';
  } finally {
    loading.value = false;
  }
}

function openEdit(): void {
  if (!classification.value) {
    return;
  }
  editForm.displayName = classification.value.displayName || '';
  editForm.description = classification.value.description || '';
  editForm.mutuallyExclusive = Boolean(classification.value.mutuallyExclusive);
  editOpen.value = true;
}

async function onSave(): Promise<void> {
  if (!classification.value) {
    return;
  }
  saving.value = true;
  try {
    await updateClassification({
      name: classification.value.name,
      description: editForm.description.trim(),
      displayName: editForm.displayName.trim() || undefined,
      mutuallyExclusive: editForm.mutuallyExclusive,
    });
    editOpen.value = false;
    message.success('Classification updated');
    await load();
  } catch (error) {
    message.error(error instanceof Error ? error.message : 'Update failed');
  } finally {
    saving.value = false;
  }
}

async function onCreateTag(): Promise<void> {
  if (!classification.value) {
    return;
  }
  creating.value = true;
  try {
    const created = await createTag({
      name: tagForm.name.trim(),
      description: tagForm.description.trim(),
      classification: classification.value.fullyQualifiedName || classification.value.name,
      displayName: tagForm.displayName.trim() || undefined,
      parent: tagForm.parent,
      mutuallyExclusive: tagForm.mutuallyExclusive,
    });
    createTagOpen.value = false;
    message.success(`Created tag ${created.name}`);
    await load();
  } catch (error) {
    message.error(error instanceof Error ? error.message : 'Create tag failed');
  } finally {
    creating.value = false;
  }
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
            {{ classification?.displayName || classification?.name || 'Classification' }}
          </Typography.Title>
          <Space>
            <Button @click="router.push({ name: 'governance-classifications' })">Back</Button>
            <Button type="primary" :disabled="!classification" data-testid="edit-classification" @click="openEdit">
              Edit
            </Button>
            <Button :disabled="!classification" data-testid="create-tag" @click="createTagOpen = true">
              Create tag
            </Button>
          </Space>
        </div>
        <Alert v-if="errorMessage" type="warning" show-icon :message="errorMessage" />
        <Descriptions v-if="classification" bordered :column="1" size="small">
          <Descriptions.Item label="Name">{{ classification.name }}</Descriptions.Item>
          <Descriptions.Item label="Description">{{ classification.description || '—' }}</Descriptions.Item>
          <Descriptions.Item label="Mutually exclusive">
            {{ classification.mutuallyExclusive ? 'yes' : 'no' }}
          </Descriptions.Item>
        </Descriptions>
        <Typography.Title :level="5">Tags</Typography.Title>
        <Table
          row-key="id"
          data-testid="classification-tags-table"
          :columns="tagColumns"
          :data-source="tags"
          :pagination="false"
          size="small"
        >
          <template #bodyCell="{ column, record }">
            <template v-if="column.key === 'name'">
              <a
                href="#"
                @click.prevent="
                  router.push({ name: 'governance-tag', params: { id: (record as ClassificationTag).id } })
                "
              >
                {{ (record as ClassificationTag).displayName || (record as ClassificationTag).name }}
              </a>
            </template>
            <template v-else-if="column.key === 'usageCount'">
              {{ (record as ClassificationTag).usageCount ?? '—' }}
            </template>
          </template>
        </Table>
      </Space>
    </Card>
    <Modal v-model:open="editOpen" title="Edit classification" :confirm-loading="saving" @ok="onSave">
      <Form layout="vertical">
        <Form.Item label="Display name">
          <Input v-model:value="editForm.displayName" />
        </Form.Item>
        <Form.Item label="Description" required>
          <Input.TextArea v-model:value="editForm.description" :rows="3" />
        </Form.Item>
        <Form.Item>
          <Checkbox v-model:checked="editForm.mutuallyExclusive">Tags are mutually exclusive</Checkbox>
        </Form.Item>
      </Form>
    </Modal>
    <Modal v-model:open="createTagOpen" title="Create tag" :confirm-loading="creating" @ok="onCreateTag">
      <Form layout="vertical">
        <Form.Item label="Name" required>
          <Input v-model:value="tagForm.name" data-testid="create-tag-name" />
        </Form.Item>
        <Form.Item label="Description" required>
          <Input.TextArea v-model:value="tagForm.description" :rows="3" />
        </Form.Item>
        <Form.Item label="Display name">
          <Input v-model:value="tagForm.displayName" />
        </Form.Item>
        <Form.Item label="Parent tag">
          <Select v-model:value="tagForm.parent" allow-clear>
            <Select.Option
              v-for="tag in tags"
              :key="tag.id"
              :value="tag.fullyQualifiedName || tag.name"
            >
              {{ tag.displayName || tag.name }}
            </Select.Option>
          </Select>
        </Form.Item>
        <Form.Item>
          <Checkbox v-model:checked="tagForm.mutuallyExclusive">Child tags are mutually exclusive</Checkbox>
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
