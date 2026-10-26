<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { Button, Descriptions, Form, Input, Modal, Select, Table, message } from 'ant-design-vue';
import { getTestDefinition, updateTestDefinition } from '@/api/testDefinitions';
import EntityDetailShell from '@/features/crud/EntityDetailShell.vue';
import { entityLabel } from '@/features/crud/paging';
import type { EntityBreadcrumb, EntityDetailTab, EntityListColumn } from '@/features/crud/types';
import { TEST_DEFINITION_ENTITY_TYPES, TEST_PLATFORMS, type TestDefinition } from '@/types/quality';

const props = defineProps<{ id: string }>();
const { t } = useI18n();
const loading = ref(false);
const errorMessage = ref('');
const definition = ref<TestDefinition | null>(null);
const activeTab = ref('overview');
const editOpen = ref(false);
const saving = ref(false);
const editForm = reactive({
  displayName: '',
  description: '',
  entityType: 'TABLE',
  testPlatforms: ['OpenMetadata'] as string[],
});

const breadcrumbs = computed<EntityBreadcrumb[]>(() => [
  { label: t('quality.testDefinitions.title'), to: { name: 'quality-test-definitions' } },
  { label: entityLabel(definition.value) || t('quality.testDefinitions.title') },
]);

const tabs = computed<EntityDetailTab[]>(() => [
  { key: 'overview', label: t('crud.overview'), testId: 'test-definition-tab-overview' },
  { key: 'parameters', label: t('quality.testDefinitions.parametersTab'), testId: 'test-definition-tab-parameters' },
]);

const parameterColumns = computed<EntityListColumn[]>(() => [
  { title: t('crud.name'), dataIndex: 'name', key: 'name' },
  { title: t('crud.type'), dataIndex: 'dataType', key: 'dataType' },
  { title: t('quality.testDefinitions.required'), key: 'required', width: 100 },
  { title: t('crud.description'), dataIndex: 'description', key: 'description' },
]);

async function load(): Promise<void> {
  loading.value = true;
  errorMessage.value = '';
  try {
    definition.value = await getTestDefinition(props.id);
  } catch (error) {
    definition.value = null;
    errorMessage.value = error instanceof Error ? error.message : t('crud.loadFailed');
  } finally {
    loading.value = false;
  }
}

function openEdit(): void {
  if (!definition.value) {
    return;
  }
  editForm.displayName = definition.value.displayName || '';
  editForm.description = definition.value.description || '';
  editForm.entityType = definition.value.entityType || 'TABLE';
  editForm.testPlatforms = definition.value.testPlatforms.length
    ? [...definition.value.testPlatforms]
    : ['OpenMetadata'];
  editOpen.value = true;
}

async function onSave(): Promise<void> {
  if (!definition.value) {
    return;
  }
  saving.value = true;
  try {
    await updateTestDefinition({
      name: definition.value.name,
      entityType: editForm.entityType,
      testPlatforms: editForm.testPlatforms,
      description: editForm.description.trim() || undefined,
      displayName: editForm.displayName.trim() || undefined,
    });
    editOpen.value = false;
    message.success(t('quality.testDefinitions.updated'));
    await load();
  } catch (error) {
    message.error(error instanceof Error ? error.message : t('crud.updateFailed'));
  } finally {
    saving.value = false;
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
  <EntityDetailShell
    :title="entityLabel(definition) || t('quality.testDefinitions.title')"
    :name="definition?.name"
    :fqn="definition?.fullyQualifiedName"
    :lead="t('quality.testDefinitions.lead')"
    :loading="loading"
    :error="errorMessage"
    :empty="!definition && !loading && !errorMessage"
    :breadcrumbs="breadcrumbs"
    :tabs="definition ? tabs : []"
    v-model:active-tab="activeTab"
  >
    <template #actions>
      <Button data-testid="edit-test-definition" :disabled="!definition" @click="openEdit">
        {{ t('crud.edit') }}
      </Button>
    </template>
    <template #overview>
      <Descriptions v-if="definition" bordered :column="1" size="small">
        <Descriptions.Item :label="t('crud.name')">{{ definition.name }}</Descriptions.Item>
        <Descriptions.Item :label="t('crud.fqn')">{{ definition.fullyQualifiedName }}</Descriptions.Item>
        <Descriptions.Item :label="t('quality.testDefinitions.entityType')">
          {{ definition.entityType || '—' }}
        </Descriptions.Item>
        <Descriptions.Item :label="t('quality.testDefinitions.platforms')">
          {{ definition.testPlatforms.join(', ') || '—' }}
        </Descriptions.Item>
        <Descriptions.Item :label="t('quality.testDefinitions.dimension')">
          {{ definition.dataQualityDimension || '—' }}
        </Descriptions.Item>
        <Descriptions.Item :label="t('quality.testDefinitions.provider')">
          {{ definition.provider || '—' }}
        </Descriptions.Item>
        <Descriptions.Item :label="t('crud.description')">{{ definition.description || '—' }}</Descriptions.Item>
      </Descriptions>
    </template>
    <template #parameters>
      <Table
        v-if="definition"
        row-key="name"
        size="small"
        :columns="parameterColumns"
        :data-source="definition.parameterDefinition"
        :pagination="false"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'required'">
            {{ record.required ? t('crud.yes') : t('crud.no') }}
          </template>
        </template>
      </Table>
    </template>
  </EntityDetailShell>
  <Modal
    v-model:open="editOpen"
    :title="t('quality.testDefinitions.editTitle')"
    :ok-text="t('crud.edit')"
    :cancel-text="t('crud.cancel')"
    :confirm-loading="saving"
    @ok="onSave"
  >
    <Form layout="vertical">
      <Form.Item :label="t('crud.displayName')">
        <Input v-model:value="editForm.displayName" />
      </Form.Item>
      <Form.Item :label="t('crud.description')">
        <Input.TextArea v-model:value="editForm.description" :rows="3" />
      </Form.Item>
      <Form.Item :label="t('quality.testDefinitions.entityType')">
        <Select v-model:value="editForm.entityType">
          <Select.Option v-for="type in TEST_DEFINITION_ENTITY_TYPES" :key="type" :value="type">
            {{ type }}
          </Select.Option>
        </Select>
      </Form.Item>
      <Form.Item :label="t('quality.testDefinitions.platforms')">
        <Select v-model:value="editForm.testPlatforms" mode="multiple">
          <Select.Option v-for="platform in TEST_PLATFORMS" :key="platform" :value="platform">
            {{ platform }}
          </Select.Option>
        </Select>
      </Form.Item>
    </Form>
  </Modal>
</template>
