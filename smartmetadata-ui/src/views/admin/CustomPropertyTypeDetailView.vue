<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { Button, Descriptions, Form, Input, Modal, Select, Table, message } from 'ant-design-vue';
import {
  addOrUpdateCustomProperty,
  getMetadataTypeByName,
  listPropertyTypes,
} from '@/api/customProperties';
import EntityDetailShell from '@/features/crud/EntityDetailShell.vue';
import { requiredField } from '@/features/crud/formRules';
import type { EntityBreadcrumb, EntityListColumn } from '@/features/crud/types';
import type { CustomPropertyDef, MetadataType } from '@/types/collaboration';

const props = defineProps<{ entityType: string }>();
const { t } = useI18n();
const loading = ref(false);
const errorMessage = ref('');
const typeMeta = ref<MetadataType | null>(null);
const definitions = ref<CustomPropertyDef[]>([]);
const propertyTypeOptions = ref<{ value: string; label: string; id: string; name: string }[]>([]);
const modalOpen = ref(false);
const saving = ref(false);
const editingName = ref<string | null>(null);
const form = reactive({
  name: '',
  displayName: '',
  description: '',
  propertyTypeId: '',
});

const breadcrumbs = computed<EntityBreadcrumb[]>(() => [
  { label: t('settings.customProperties.title'), to: { name: 'admin-settings-custom-properties' } },
  { label: props.entityType },
]);

const columns = computed<EntityListColumn[]>(() => [
  { title: t('crud.name'), dataIndex: 'name', key: 'name' },
  { title: t('settings.customProperties.displayName'), dataIndex: 'displayName', key: 'displayName' },
  { title: t('settings.customProperties.propertyType'), dataIndex: 'propertyType', key: 'propertyType' },
  { title: t('crud.description'), dataIndex: 'description', key: 'description' },
  { title: t('crud.actions'), key: 'actions', width: 100 },
]);

function resetForm(): void {
  form.name = '';
  form.displayName = '';
  form.description = '';
  form.propertyTypeId = propertyTypeOptions.value[0]?.id || '';
  editingName.value = null;
}

async function loadPropertyTypes(): Promise<void> {
  const page = await listPropertyTypes(100);
  propertyTypeOptions.value = page.data
    .filter((row) => row.id)
    .map((row) => ({
      value: row.id as string,
      label: row.displayName || row.name,
      id: row.id as string,
      name: row.name,
    }));
}

async function load(): Promise<void> {
  loading.value = true;
  errorMessage.value = '';
  try {
    const meta = await getMetadataTypeByName(props.entityType);
    typeMeta.value = meta;
    definitions.value = meta.customProperties;
  } catch (error) {
    typeMeta.value = null;
    definitions.value = [];
    errorMessage.value = error instanceof Error ? error.message : t('crud.loadFailed');
  } finally {
    loading.value = false;
  }
}

function openCreate(): void {
  resetForm();
  if (!form.propertyTypeId && propertyTypeOptions.value[0]) {
    form.propertyTypeId = propertyTypeOptions.value[0].id;
  }
  modalOpen.value = true;
}

function openEdit(def: CustomPropertyDef): void {
  editingName.value = def.name;
  form.name = def.name;
  form.displayName = def.displayName || '';
  form.description = def.description || '';
  const match = propertyTypeOptions.value.find(
    (opt) => opt.name === def.propertyType || opt.label === def.propertyType,
  );
  form.propertyTypeId = match?.id || propertyTypeOptions.value[0]?.id || '';
  modalOpen.value = true;
}

async function onSave(): Promise<void> {
  const typeId = typeMeta.value?.id;
  if (!typeId) {
    message.error(t('settings.customProperties.missingTypeId'));
    return;
  }
  const name = form.name.trim();
  const description = form.description.trim();
  const selected = propertyTypeOptions.value.find((opt) => opt.id === form.propertyTypeId);
  if (!name || !description || !selected) {
    message.error(t('settings.customProperties.createInvalid'));
    return;
  }
  saving.value = true;
  try {
    const updated = await addOrUpdateCustomProperty(typeId, {
      name,
      description,
      displayName: form.displayName.trim() || undefined,
      propertyType: { id: selected.id, type: 'type', name: selected.name },
    });
    typeMeta.value = updated;
    definitions.value = updated.customProperties;
    modalOpen.value = false;
    message.success(
      editingName.value
        ? t('settings.customProperties.updated', { name })
        : t('settings.customProperties.created', { name }),
    );
    resetForm();
  } catch (error) {
    message.error(error instanceof Error ? error.message : t('crud.updateFailed'));
  } finally {
    saving.value = false;
  }
}

onMounted(() => {
  void loadPropertyTypes().then(() => load());
});

watch(
  () => props.entityType,
  () => {
    void load();
  },
);
</script>

<template>
  <EntityDetailShell
    :title="entityType"
    :lead="t('settings.customProperties.detailLead', { type: entityType })"
    :loading="loading"
    :error="errorMessage"
    :empty="!loading && !errorMessage && definitions.length === 0"
    :breadcrumbs="breadcrumbs"
  >
    <template #actions>
      <Button
        v-if="typeMeta?.id"
        type="primary"
        data-testid="add-custom-property"
        @click="openCreate"
      >
        {{ t('settings.customProperties.add') }}
      </Button>
    </template>
    <template v-if="definitions.length">
      <Descriptions bordered :column="1" size="small" style="margin-bottom: 16px">
        <Descriptions.Item :label="t('crud.type')">{{ entityType }}</Descriptions.Item>
        <Descriptions.Item :label="t('settings.customProperties.definitions')">
          {{ definitions.length }}
        </Descriptions.Item>
      </Descriptions>
      <Table
        row-key="name"
        data-testid="admin-custom-property-defs-table"
        :columns="columns"
        :data-source="definitions"
        :pagination="false"
        size="small"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'displayName'">
            {{ (record as CustomPropertyDef).displayName || '—' }}
          </template>
          <template v-else-if="column.key === 'propertyType'">
            {{ (record as CustomPropertyDef).propertyType || '—' }}
          </template>
          <template v-else-if="column.key === 'description'">
            {{ (record as CustomPropertyDef).description || '—' }}
          </template>
          <template v-else-if="column.key === 'actions'">
            <Button
              type="link"
              size="small"
              :data-testid="`edit-custom-property-${(record as CustomPropertyDef).name}`"
              @click="openEdit(record as CustomPropertyDef)"
            >
              {{ t('crud.edit') }}
            </Button>
          </template>
        </template>
      </Table>
    </template>
  </EntityDetailShell>
  <Modal
    v-model:open="modalOpen"
    :title="editingName ? t('settings.customProperties.editTitle') : t('settings.customProperties.addTitle')"
    :ok-text="t('crud.save')"
    :cancel-text="t('crud.cancel')"
    :confirm-loading="saving"
    destroy-on-close
    :get-container="false"
    @ok="onSave"
  >
    <Form layout="vertical">
      <Form.Item :label="t('crud.name')" :rules="requiredField(t, t('crud.name'))">
        <Input
          v-model:value="form.name"
          data-testid="custom-property-name"
          :disabled="Boolean(editingName)"
        />
      </Form.Item>
      <Form.Item :label="t('settings.customProperties.displayName')">
        <Input v-model:value="form.displayName" />
      </Form.Item>
      <Form.Item :label="t('crud.description')" required>
        <Input.TextArea v-model:value="form.description" :rows="3" data-testid="custom-property-description" />
      </Form.Item>
      <Form.Item :label="t('settings.customProperties.propertyType')" required>
        <Select
          v-model:value="form.propertyTypeId"
          data-testid="custom-property-type"
          style="width: 100%"
          :options="propertyTypeOptions"
        />
      </Form.Item>
    </Form>
  </Modal>
</template>
