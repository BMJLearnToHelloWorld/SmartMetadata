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
import { getGlossary, updateGlossary } from '@/api/glossaries';
import { createGlossaryTerm, listGlossaryTerms } from '@/api/glossaryTerms';
import type { Glossary, GlossaryTerm } from '@/types/governance';

const props = defineProps<{ id: string }>();
const router = useRouter();
const loading = ref(false);
const errorMessage = ref('');
const glossary = ref<Glossary | null>(null);
const terms = ref<GlossaryTerm[]>([]);
const editOpen = ref(false);
const createTermOpen = ref(false);
const saving = ref(false);
const creating = ref(false);
const editForm = reactive({
  displayName: '',
  description: '',
  mutuallyExclusive: false,
});
const termForm = reactive({
  name: '',
  displayName: '',
  description: '',
  parent: undefined as string | undefined,
  mutuallyExclusive: false,
});

const termColumns = [
  { title: 'Name', dataIndex: 'name', key: 'name' },
  { title: 'FQN', dataIndex: 'fullyQualifiedName', key: 'fullyQualifiedName' },
  { title: 'Parent', key: 'parent' },
  { title: 'Related', key: 'relatedTerms' },
];

async function load(): Promise<void> {
  loading.value = true;
  errorMessage.value = '';
  try {
    glossary.value = await getGlossary(props.id);
    const page = await listGlossaryTerms({ glossary: props.id, limit: 100 });
    terms.value = page.data;
  } catch (error) {
    glossary.value = null;
    terms.value = [];
    errorMessage.value = error instanceof Error ? error.message : 'Failed to load glossary';
  } finally {
    loading.value = false;
  }
}

function openEdit(): void {
  if (!glossary.value) {
    return;
  }
  editForm.displayName = glossary.value.displayName || '';
  editForm.description = glossary.value.description || '';
  editForm.mutuallyExclusive = Boolean(glossary.value.mutuallyExclusive);
  editOpen.value = true;
}

async function onSave(): Promise<void> {
  if (!glossary.value) {
    return;
  }
  saving.value = true;
  try {
    await updateGlossary({
      name: glossary.value.name,
      description: editForm.description.trim(),
      displayName: editForm.displayName.trim() || undefined,
      mutuallyExclusive: editForm.mutuallyExclusive,
    });
    editOpen.value = false;
    message.success('Glossary updated');
    await load();
  } catch (error) {
    message.error(error instanceof Error ? error.message : 'Update failed');
  } finally {
    saving.value = false;
  }
}

async function onCreateTerm(): Promise<void> {
  if (!glossary.value) {
    return;
  }
  creating.value = true;
  try {
    const created = await createGlossaryTerm({
      glossary: glossary.value.fullyQualifiedName || glossary.value.name,
      name: termForm.name.trim(),
      description: termForm.description.trim(),
      displayName: termForm.displayName.trim() || undefined,
      parent: termForm.parent,
      mutuallyExclusive: termForm.mutuallyExclusive,
    });
    createTermOpen.value = false;
    message.success(`Created term ${created.name}`);
    await load();
  } catch (error) {
    message.error(error instanceof Error ? error.message : 'Create term failed');
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
            {{ glossary?.displayName || glossary?.name || 'Glossary' }}
          </Typography.Title>
          <Space>
            <Button @click="router.push({ name: 'governance-glossaries' })">Back</Button>
            <Button type="primary" data-testid="edit-glossary" :disabled="!glossary" @click="openEdit">
              Edit glossary
            </Button>
            <Button data-testid="create-term" :disabled="!glossary" @click="createTermOpen = true">
              Create term
            </Button>
          </Space>
        </div>
        <Alert v-if="errorMessage" type="warning" show-icon :message="errorMessage" />
        <Descriptions v-if="glossary" bordered :column="1" size="small">
          <Descriptions.Item label="Name">{{ glossary.name }}</Descriptions.Item>
          <Descriptions.Item label="FQN">{{ glossary.fullyQualifiedName }}</Descriptions.Item>
          <Descriptions.Item label="Description">{{ glossary.description || '—' }}</Descriptions.Item>
          <Descriptions.Item label="Mutually exclusive">
            {{ glossary.mutuallyExclusive ? 'yes' : 'no' }}
          </Descriptions.Item>
          <Descriptions.Item label="Term count">{{ glossary.termCount ?? terms.length }}</Descriptions.Item>
        </Descriptions>
        <Typography.Title :level="5">Terms</Typography.Title>
        <Table
          row-key="id"
          data-testid="glossary-terms-table"
          :columns="termColumns"
          :data-source="terms"
          :pagination="false"
          size="small"
        >
          <template #bodyCell="{ column, record }">
            <template v-if="column.key === 'name'">
              <a
                href="#"
                @click.prevent="
                  router.push({ name: 'governance-term', params: { id: (record as GlossaryTerm).id } })
                "
              >
                {{ (record as GlossaryTerm).displayName || (record as GlossaryTerm).name }}
              </a>
            </template>
            <template v-else-if="column.key === 'parent'">
              {{ (record as GlossaryTerm).parent?.name || '—' }}
            </template>
            <template v-else-if="column.key === 'relatedTerms'">
              {{ (record as GlossaryTerm).relatedTerms.map((item) => item.name).join(', ') || '—' }}
            </template>
          </template>
        </Table>
      </Space>
    </Card>
    <Modal v-model:open="editOpen" title="Edit glossary" :confirm-loading="saving" @ok="onSave">
      <Form layout="vertical">
        <Form.Item label="Display name">
          <Input v-model:value="editForm.displayName" />
        </Form.Item>
        <Form.Item label="Description" required>
          <Input.TextArea v-model:value="editForm.description" :rows="3" />
        </Form.Item>
        <Form.Item>
          <Checkbox v-model:checked="editForm.mutuallyExclusive">Child terms are mutually exclusive</Checkbox>
        </Form.Item>
      </Form>
    </Modal>
    <Modal v-model:open="createTermOpen" title="Create glossary term" :confirm-loading="creating" @ok="onCreateTerm">
      <Form layout="vertical">
        <Form.Item label="Name" required>
          <Input v-model:value="termForm.name" data-testid="create-term-name" />
        </Form.Item>
        <Form.Item label="Description" required>
          <Input.TextArea v-model:value="termForm.description" data-testid="create-term-description" :rows="3" />
        </Form.Item>
        <Form.Item label="Display name">
          <Input v-model:value="termForm.displayName" />
        </Form.Item>
        <Form.Item label="Parent term">
          <Select v-model:value="termForm.parent" allow-clear>
            <Select.Option
              v-for="term in terms"
              :key="term.id"
              :value="term.fullyQualifiedName || term.name"
            >
              {{ term.displayName || term.name }}
            </Select.Option>
          </Select>
        </Form.Item>
        <Form.Item>
          <Checkbox v-model:checked="termForm.mutuallyExclusive">Child terms are mutually exclusive</Checkbox>
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
