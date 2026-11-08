<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { Alert, Button, Descriptions, Empty, Form, Input, Select, Tag, Tooltip, Typography, message } from 'ant-design-vue';
import SmTable from '@/components/shared/SmTable.vue';
import FormModal from '@/components/shared/FormModal.vue';
import {
  addOrUpdateCustomProperty,
  deleteCustomPropertyByName,
  filterCustomProperties,
  getMetadataTypeByName,
  getPropertyConfigSummary,
  getPropertyTypeOptions,
  listPropertyTypes,
  type CustomPropertyConfigSummary,
} from '@/api/customProperties';
import EntityDetailShell from '@/features/crud/EntityDetailShell.vue';
import { confirmDelete } from '@/features/crud/confirmDelete';
import { requiredField } from '@/features/crud/formRules';
import type { EntityBreadcrumb, EntityDetailTab, EntityListColumn } from '@/features/crud/types';
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
const activeTab = ref('custom-properties');
const searchInput = ref('');
const appliedSearch = ref('');
const selectedTypes = ref<string[]>([]);
const deletingName = ref<string | null>(null);
let searchTimer: ReturnType<typeof setTimeout> | undefined;
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

const tabs = computed<EntityDetailTab[]>(() => [
  {
    key: 'custom-properties',
    label: `${t('settings.customProperties.title')} (${definitions.value.length})`,
    testId: 'custom-property-tab-properties',
  },
  {
    key: 'schema',
    label: t('settings.customProperties.schemaTab'),
    testId: 'custom-property-tab-schema',
  },
]);

const columns = computed<EntityListColumn[]>(() => [
  { title: t('crud.name'), dataIndex: 'name', key: 'name' },
  { title: t('settings.customProperties.displayName'), dataIndex: 'displayName', key: 'displayName' },
  { title: t('settings.customProperties.propertyType'), dataIndex: 'propertyType', key: 'propertyType' },
  { title: t('crud.description'), dataIndex: 'description', key: 'description' },
  { title: t('settings.customProperties.configuration'), key: 'configuration' },
  { title: t('crud.actions'), key: 'actions', width: 160 },
]);

/** Official getPropertyTypeOptions: options from the types actually present, with counts. */
const typeFilterOptions = computed(() =>
  getPropertyTypeOptions(definitions.value).map((option) => ({
    value: option.value,
    label: `${option.label} (${option.count})`,
  })),
);

/**
 * Official activeTypeFilters: a selected type whose last property was
 * removed drops out of the effective filter (and out of the Select, which
 * is bound to this list, not to the raw selection).
 */
const activeTypeFilters = computed(() =>
  selectedTypes.value.filter((type) =>
    typeFilterOptions.value.some((option) => option.value === type),
  ),
);

const isFiltered = computed(
  () => appliedSearch.value.trim().length > 0 || activeTypeFilters.value.length > 0,
);

const filteredDefinitions = computed(() =>
  filterCustomProperties(definitions.value, appliedSearch.value, activeTypeFilters.value),
);

/** Schema tab: read-only JSON; a missing schema renders as `{}` (official `JSON.parse(schema ?? '{}')`). */
const schemaView = computed(() => {
  const raw = (typeMeta.value?.schema ?? '').trim();
  if (!raw) {
    return { text: '{}', error: false };
  }
  try {
    return { text: JSON.stringify(JSON.parse(raw), null, 2), error: false };
  } catch {
    return { text: '', error: true };
  }
});

function configLabel(summary: CustomPropertyConfigSummary): string {
  if (summary.kind === 'format') {
    return t('settings.customProperties.configFormat');
  }
  if (summary.kind === 'entityTypes') {
    return t('settings.customProperties.configEntityTypes');
  }
  if (summary.kind === 'columns') {
    return t('settings.customProperties.configColumns');
  }
  return `${t('settings.customProperties.configValues')} · ${
    summary.multiSelect
      ? t('settings.customProperties.configMultiSelect')
      : t('settings.customProperties.configSingleSelect')
  }`;
}

/** Official MAX_VISIBLE_CONFIG_VALUES = 3; the rest collapse into a "+N" tooltip. */
const MAX_VISIBLE_CONFIG_VALUES = 3;

function configCell(def: CustomPropertyDef): {
  summary: CustomPropertyConfigSummary | undefined;
  visible: string[];
  hidden: string[];
} {
  const summary = getPropertyConfigSummary(def);
  return {
    summary,
    visible: summary ? summary.values.slice(0, MAX_VISIBLE_CONFIG_VALUES) : [],
    hidden: summary ? summary.values.slice(MAX_VISIBLE_CONFIG_VALUES) : [],
  };
}

/** One summary per property name, computed once per definitions change. */
const configCells = computed(
  () => new Map(definitions.value.map((def) => [def.name, configCell(def)] as const)),
);

function configFor(def: CustomPropertyDef): ReturnType<typeof configCell> {
  return (
    configCells.value.get(def.name) ?? { summary: undefined, visible: [], hidden: [] }
  );
}

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

async function onDelete(def: CustomPropertyDef): Promise<void> {
  const confirmed = await confirmDelete({
    title: t('crud.deleteTitle'),
    content: t('settings.customProperties.deleteConfirm', { name: def.name }),
    okText: t('crud.delete'),
    cancelText: t('crud.cancel'),
  });
  if (!confirmed) {
    return;
  }
  deletingName.value = def.name;
  try {
    // deleteCustomPropertyByName resolves undefined when the property is
    // already gone; that counts as deleted, so refresh instead of failing.
    const updated = await deleteCustomPropertyByName(props.entityType, def.name);
    if (updated) {
      // The PATCH response may not carry `schema`; keep the loaded one.
      typeMeta.value = { ...updated, schema: updated.schema ?? typeMeta.value?.schema };
      definitions.value = updated.customProperties;
    } else {
      await load();
    }
    message.success(t('settings.customProperties.deleted', { name: def.name }));
  } catch (error) {
    message.error(error instanceof Error ? error.message : t('settings.customProperties.deleteFailed'));
  } finally {
    deletingName.value = null;
  }
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

function onTypeFilterChange(value: unknown): void {
  selectedTypes.value = Array.isArray(value) ? value.map((item) => String(item)) : [];
}

watch(searchInput, () => {
  if (searchTimer !== undefined) {
    clearTimeout(searchTimer);
  }
  // Official typingInterval 300ms; product setTimeout pattern (PermissionDebuggerView).
  searchTimer = setTimeout(() => {
    appliedSearch.value = searchInput.value;
  }, 300);
});

onUnmounted(() => {
  if (searchTimer !== undefined) {
    clearTimeout(searchTimer);
  }
});

onMounted(() => {
  void loadPropertyTypes().then(() => load());
});

watch(
  () => props.entityType,
  () => {
    searchInput.value = '';
    appliedSearch.value = '';
    selectedTypes.value = [];
    activeTab.value = 'custom-properties';
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
    :tabs="tabs"
    :active-tab="activeTab"
    :breadcrumbs="breadcrumbs"
    @update:active-tab="activeTab = $event"
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
    <template #custom-properties>
      <Descriptions bordered :column="1" size="small" style="margin-bottom: 16px">
        <Descriptions.Item :label="t('crud.type')">{{ entityType }}</Descriptions.Item>
        <Descriptions.Item :label="t('settings.customProperties.definitions')">
          {{ definitions.length }}
        </Descriptions.Item>
      </Descriptions>
      <div class="custom-property-toolbar">
        <Input
          v-model:value="searchInput"
          data-testid="custom-property-search"
          :placeholder="t('settings.customProperties.searchPlaceholder')"
          allow-clear
          style="width: 280px"
        />
        <Select
          :value="activeTypeFilters"
          mode="multiple"
          data-testid="custom-property-type-filter"
          :placeholder="t('settings.customProperties.typeFilterPlaceholder')"
          :options="typeFilterOptions"
          allow-clear
          style="width: 280px"
          @change="onTypeFilterChange"
        />
      </div>
      <SmTable
        v-if="filteredDefinitions.length"
        row-key="name"
        test-id="admin-custom-property-defs-table"
        :columns="columns"
        :data-source="filteredDefinitions"
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
          <template v-else-if="column.key === 'configuration'">
            <div
              v-if="configFor(record as CustomPropertyDef).summary"
              :data-testid="configFor(record as CustomPropertyDef).summary?.testId"
            >
              <Typography.Text type="secondary" class="custom-property-config__label">
                {{ configLabel(configFor(record as CustomPropertyDef).summary!) }}
              </Typography.Text>
              <div class="custom-property-config__chips">
                <Tag
                  v-for="value in configFor(record as CustomPropertyDef).visible"
                  :key="value"
                  data-testid="config-value"
                >
                  {{ value }}
                </Tag>
                <Tooltip
                  v-if="configFor(record as CustomPropertyDef).hidden.length > 0"
                  :title="configFor(record as CustomPropertyDef).hidden.join(', ')"
                >
                  <Tag data-testid="config-hidden-count">
                    +{{ configFor(record as CustomPropertyDef).hidden.length }}
                  </Tag>
                </Tooltip>
              </div>
            </div>
            <span v-else data-testid="no-config">—</span>
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
            <Button
              type="link"
              danger
              size="small"
              :loading="deletingName === (record as CustomPropertyDef).name"
              :data-testid="`delete-custom-property-${(record as CustomPropertyDef).name}`"
              @click="onDelete(record as CustomPropertyDef)"
            >
              {{ t('crud.delete') }}
            </Button>
          </template>
        </template>
      </SmTable>
      <Empty
        v-else-if="isFiltered"
        data-testid="custom-property-no-results"
      >
        <template #description>
          <div>{{ t('settings.customProperties.noResults') }}</div>
          <Typography.Text type="secondary">
            {{ t('settings.customProperties.noResultsHint') }}
          </Typography.Text>
        </template>
      </Empty>
      <Empty
        v-else
        data-testid="custom-property-defs-empty"
        :description="t('settings.customProperties.emptyText')"
      />
    </template>
    <template #schema>
      <Alert
        v-if="schemaView.error"
        type="error"
        show-icon
        :message="t('settings.customProperties.schemaInvalid')"
        data-testid="custom-property-type-schema-error"
      />
      <pre v-else data-testid="custom-property-type-schema" class="custom-property-schema">{{ schemaView.text }}</pre>
    </template>
  </EntityDetailShell>
  <FormModal
    :open="modalOpen"
    :title="editingName ? t('settings.customProperties.editTitle') : t('settings.customProperties.addTitle')"
    :ok-text="t('crud.save')"
    :cancel-text="t('crud.cancel')"
    :confirm-loading="saving"
    :get-container="false"
    @ok="onSave" @cancel="modalOpen = false">
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
  </FormModal>
</template>

<style scoped>
.custom-property-toolbar {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
  margin-bottom: 16px;
}
.custom-property-config__label {
  display: block;
  font-size: 12px;
  margin-bottom: 4px;
}
.custom-property-config__chips {
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
}
.custom-property-schema {
  margin: 0;
  white-space: pre-wrap;
  word-break: break-word;
  font-size: 13px;
}
</style>
