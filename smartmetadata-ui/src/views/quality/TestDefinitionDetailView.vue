<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { Button, Descriptions, message } from 'ant-design-vue';
import SmTable from '@/components/shared/SmTable.vue';
import FormModal from '@/components/shared/FormModal.vue';
import { getTestDefinition, patchTestDefinition, updateTestDefinition } from '@/api/testDefinitions';
import TestDefinitionFormFields from '@/components/quality/TestDefinitionFormFields.vue';
import {
  dimensionPatch,
  formValuesFromDefinition,
  isSystemTestDefinition,
  toCreateTestDefinitionRequest,
  type TestDefinitionFormValues,
} from '@/quality/testDefinitionForm';
import EntityDetailShell from '@/features/crud/EntityDetailShell.vue';
import { entityLabel } from '@/features/crud/paging';
import type { EntityBreadcrumb, EntityDetailTab, EntityListColumn } from '@/features/crud/types';
import type { TestDefinition } from '@/types/quality';

const props = defineProps<{ id: string }>();
const { t } = useI18n();
const loading = ref(false);
const errorMessage = ref('');
const definition = ref<TestDefinition | null>(null);
const activeTab = ref('overview');
const editOpen = ref(false);
const saving = ref(false);
const editForm = reactive<TestDefinitionFormValues>(formValuesFromDefinition());
const isSystem = computed(() => isSystemTestDefinition(definition.value));

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
  Object.assign(editForm, formValuesFromDefinition(definition.value));
  editOpen.value = true;
}

async function onSave(): Promise<void> {
  if (!definition.value) {
    return;
  }
  saving.value = true;
  try {
    if (isSystem.value) {
      const operations = dimensionPatch(definition.value.dataQualityDimension, editForm.dataQualityDimension);
      if (operations.length > 0) {
        await patchTestDefinition(definition.value.id, operations);
      }
    } else {
      await updateTestDefinition(toCreateTestDefinitionRequest(editForm));
      if (editForm.enabled !== definition.value.enabled) {
        await patchTestDefinition(definition.value.id, [
          {
            op: definition.value.enabled === undefined ? 'add' : 'replace',
            path: '/enabled',
            value: editForm.enabled,
          },
        ]);
      }
    }
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
        <Descriptions.Item :label="t('quality.testDefinitions.supportedServices')">
          {{ (definition.supportedServices || []).join(', ') || '—' }}
        </Descriptions.Item>
        <Descriptions.Item :label="t('quality.testDefinitions.supportedDataTypes')">
          {{ (definition.supportedDataTypes || []).join(', ') || '—' }}
        </Descriptions.Item>
        <Descriptions.Item :label="t('quality.testDefinitions.enabled')">
          {{ definition.enabled === false ? t('crud.no') : t('crud.yes') }}
        </Descriptions.Item>
        <Descriptions.Item :label="t('quality.testDefinitions.sqlExpression')">
          <pre v-if="definition.sqlExpression" data-testid="test-definition-sql">{{ definition.sqlExpression }}</pre>
          <template v-else>—</template>
        </Descriptions.Item>
        <Descriptions.Item :label="t('crud.description')">{{ definition.description || '—' }}</Descriptions.Item>
      </Descriptions>
    </template>
    <template #parameters>
      <SmTable
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
      </SmTable>
    </template>
  </EntityDetailShell>
  <FormModal
    :open="editOpen"
    :title="t('quality.testDefinitions.editTitle')"
    :ok-text="t('crud.edit')"
    :cancel-text="t('crud.cancel')"
    :confirm-loading="saving"
    @ok="onSave" @cancel="editOpen = false">
    <p v-if="isSystem" data-testid="system-definition-hint">{{ t('quality.testDefinitions.systemDimensionOnly') }}</p>
    <TestDefinitionFormFields :form="editForm" is-edit :read-only-except-dimension="isSystem" />
  </FormModal>
</template>
