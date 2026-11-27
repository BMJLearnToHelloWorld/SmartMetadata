<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { getErrorText } from '@/views/admin/accessApiErrors';
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
  { label: t('label.test-library'), to: { name: 'quality-test-definitions' } },
  { label: entityLabel(definition.value) || t('label.entity-detail-plural', { entity: t('label.test-definition') }) },
]);

const tabs = computed<EntityDetailTab[]>(() => [
  { key: 'overview', label: t('label.summary'), testId: 'test-definition-tab-overview' },
  { key: 'parameters', label: t('label.parameter-plural'), testId: 'test-definition-tab-parameters' },
]);

const parameterColumns = computed<EntityListColumn[]>(() => [
  { title: t('label.name'), dataIndex: 'name', key: 'name' },
  { title: t('label.type'), dataIndex: 'dataType', key: 'dataType' },
  { title: t('label.required'), key: 'required', width: 100 },
  { title: t('label.description'), dataIndex: 'description', key: 'description' },
]);

async function load(): Promise<void> {
  loading.value = true;
  errorMessage.value = '';
  try {
    definition.value = await getTestDefinition(props.id);
  } catch (error) {
    definition.value = null;
    errorMessage.value = getErrorText(error, t('server.entity-fetch-error', { entity: t('label.test-definition') }));
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
    message.success(t('server.update-entity-success', { entity: t('label.test-definition') }));
    await load();
  } catch (error) {
    message.error(getErrorText(error, t('server.update-entity-error', { entity: t('label.test-definition') })));
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
    :title="entityLabel(definition) || t('label.entity-detail-plural', { entity: t('label.test-definition') })"
    :name="definition?.name"
    :fqn="definition?.fullyQualifiedName"
    :lead="t('message.page-sub-header-for-test-definitions')"
    :loading="loading"
    :error="errorMessage"
    :empty="!definition && !loading && !errorMessage"
    :breadcrumbs="breadcrumbs"
    :tabs="definition ? tabs : []"
    v-model:active-tab="activeTab"
  >
    <template #actions>
      <Button data-testid="edit-test-definition" :disabled="!definition" @click="openEdit">
        {{ t('label.edit') }}
      </Button>
    </template>
    <template #overview>
      <Descriptions v-if="definition" bordered :column="1" size="small">
        <Descriptions.Item :label="t('label.name')">{{ definition.name }}</Descriptions.Item>
        <Descriptions.Item :label="t('label.fully-qualified-name')">{{ definition.fullyQualifiedName }}</Descriptions.Item>
        <Descriptions.Item :label="t('label.entity-type')">
          {{ definition.entityType || '—' }}
        </Descriptions.Item>
        <Descriptions.Item :label="t('label.test-platform-plural')">
          {{ definition.testPlatforms.join(', ') || '—' }}
        </Descriptions.Item>
        <Descriptions.Item :label="t('label.data-quality-dimension')">
          {{ definition.dataQualityDimension || '—' }}
        </Descriptions.Item>
        <Descriptions.Item :label="t('label.provider')">
          {{ definition.provider || '—' }}
        </Descriptions.Item>
        <Descriptions.Item :label="t('label.supported-service-plural')">
          {{ (definition.supportedServices || []).join(', ') || '—' }}
        </Descriptions.Item>
        <Descriptions.Item :label="t('label.supported-data-type-plural')">
          {{ (definition.supportedDataTypes || []).join(', ') || '—' }}
        </Descriptions.Item>
        <Descriptions.Item :label="t('label.enabled')">
          {{ definition.enabled === false ? t('label.no') : t('label.yes') }}
        </Descriptions.Item>
        <Descriptions.Item :label="t('label.sql-expression')">
          <pre v-if="definition.sqlExpression" data-testid="test-definition-sql">{{ definition.sqlExpression }}</pre>
          <template v-else>—</template>
        </Descriptions.Item>
        <Descriptions.Item :label="t('label.description')">{{ definition.description || '—' }}</Descriptions.Item>
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
            {{ record.required ? t('label.yes') : t('label.no') }}
          </template>
        </template>
      </SmTable>
    </template>
  </EntityDetailShell>
  <FormModal
    :open="editOpen"
    :title="t('label.edit-entity', { entity: t('label.test-definition') })"
    :ok-text="t('label.update')"
    :cancel-text="t('label.cancel')"
    :confirm-loading="saving"
    @ok="onSave" @cancel="editOpen = false">
    <p v-if="isSystem" data-testid="system-definition-hint">{{ t('message.system-test-definition-dimension-edit-only') }}</p>
    <TestDefinitionFormFields :form="editForm" is-edit :read-only-except-dimension="isSystem" />
  </FormModal>
</template>
