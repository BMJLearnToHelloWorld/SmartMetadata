<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { Alert, Button, Input, InputNumber, Switch, Table, Typography, message } from 'ant-design-vue';
import PermissionPlaceholder from '@/components/shared/PermissionPlaceholder.vue';
import type { CustomPropertyDef } from '@/types/collaboration';
import {
  widgetVisibleProperties,
  type CustomPropertiesWidgetSettings,
} from '@/views/admin/persona/editors/customPropertiesWidgetSettings';

const props = withDefaults(
  defineProps<{
    defs: CustomPropertyDef[];
    values: Record<string, unknown>;
    error: string;
    entityType: string;
    /**
     * Read permission for custom fields (official CustomPropertyTable:
     * without it the table is replaced by a PermissionPlaceholder).
     * `null` means the permission is still resolving — render nothing
     * rather than flashing either the table or the placeholder.
     * Defaults to true so existing callers without permission wiring
     * keep the current table.
     */
    canView?: boolean | null;
    /**
     * Widget settings from the widget's `config` (official
     * CustomPropertiesWidget: `getCustomPropertiesWidgetSettings`).
     * Only widget cells pass this; standalone usages (the custom
     * properties tab, Team/User detail) omit it and keep showing all
     * defs. When present, the visible defs are the settings selection
     * (default: first five), `showHeader: false` hides the lead, and
     * `size: 'large'` renders the table at size "middle".
     */
    widgetSettings?: CustomPropertiesWidgetSettings | null;
    /**
     * Write permission for custom fields (pin CustomPropertyTable:
     * each property row is editable inline). Defaults to false; the
     * caller derives it (`isAdminUser || canEditCustomFields`).
     */
    canEdit?: boolean;
    /**
     * Per-property save: receives the property name and the new value
     * (`undefined` when the editor was emptied — the caller deletes
     * the key). Throws on failure so the row stays in edit mode.
     */
    onPropertySave?: (name: string, value: unknown) => Promise<unknown> | unknown;
  }>(),
  { canView: true, widgetSettings: null, canEdit: false },
);

const { t } = useI18n();

const visibleDefs = computed(() =>
  props.widgetSettings
    ? widgetVisibleProperties(props.defs, props.widgetSettings)
    : props.defs,
);

const columns = computed(() => {
  const base = [
    { title: t('asset.columns.property'), key: 'property' },
    { title: t('asset.columns.propertyType'), dataIndex: 'propertyType', key: 'propertyType', width: 140 },
    { title: t('asset.columns.value'), key: 'value' },
  ];
  if (props.canEdit && props.onPropertySave) {
    return [...base, { title: '', key: 'actions', width: 96 }];
  }
  return base;
});

const editingName = ref<string | null>(null);
const editingValue = ref('');
const savingName = ref<string | null>(null);

function extensionValue(name: string): string {
  const value = props.values[name];
  if (value === undefined || value === null) {
    return '—';
  }
  return typeof value === 'string' ? value : JSON.stringify(value);
}

function isEditing(name: string): boolean {
  return editingName.value === name;
}

function startEdit(def: CustomPropertyDef): void {
  const value = props.values[def.name];
  editingValue.value =
    value === undefined || value === null ? '' : typeof value === 'string' ? value : JSON.stringify(value);
  editingName.value = def.name;
}

function onNumberInput(value: string | number | null): void {
  editingValue.value = value === null || value === undefined ? '' : String(value);
}

function parsedValue(def: CustomPropertyDef): unknown {
  const raw = editingValue.value.trim();
  if (raw === '') {
    return undefined;
  }
  if (def.propertyType === 'boolean') {
    return raw === 'true';
  }
  if (def.propertyType === 'integer') {
    return Number.parseInt(raw, 10);
  }
  if (def.propertyType === 'number') {
    return Number.parseFloat(raw);
  }
  return raw;
}

async function saveEdit(def: CustomPropertyDef): Promise<void> {
  if (!props.onPropertySave) {
    return;
  }
  savingName.value = def.name;
  try {
    await props.onPropertySave(def.name, parsedValue(def));
    editingName.value = null;
  } catch (error) {
    message.error(error instanceof Error ? error.message : t('crud.loadFailed'));
  } finally {
    savingName.value = null;
  }
}
</script>

<template>
  <div v-if="canView === false" class="custom-properties__no-access">
    <PermissionPlaceholder
      :permission-value="t('label.view-entity', { entity: t('label.custom-property-plural') })"
    />
  </div>
  <!-- Official filterWidgets: a widget cell with nothing to show is
       removed from the grid, so an empty selection renders nothing
       rather than an empty table. Standalone usages (no settings)
       keep the table even when empty. -->
  <div v-else-if="canView === true && !(widgetSettings && visibleDefs.length === 0)">
    <Typography.Paragraph v-if="!widgetSettings || widgetSettings.showHeader" type="secondary">
      {{ t('asset.customPropertiesLead', { type: entityType }) }}
    </Typography.Paragraph>
    <Alert v-if="error" type="warning" show-icon :message="error" class="detail__alert" />
    <Table
      row-key="name"
      data-testid="asset-custom-properties-table"
      :columns="columns"
      :data-source="visibleDefs"
      :pagination="false"
      :size="widgetSettings?.size === 'large' ? 'middle' : 'small'"
    >
      <template #bodyCell="{ column, record }">
        <template v-if="column.key === 'property'">
          {{ (record as CustomPropertyDef).displayName || (record as CustomPropertyDef).name }}
        </template>
        <template v-else-if="column.key === 'value'">
          <template v-if="isEditing((record as CustomPropertyDef).name)">
            <Switch
              v-if="(record as CustomPropertyDef).propertyType === 'boolean'"
              :checked="editingValue === 'true'"
              data-testid="custom-property-boolean-input"
              @change="(checked: boolean | string | number) => (editingValue = checked === true || checked === 'true' ? 'true' : 'false')"
            />
            <InputNumber
              v-else-if="
                (record as CustomPropertyDef).propertyType === 'integer' ||
                (record as CustomPropertyDef).propertyType === 'number'
              "
              :value="editingValue === '' ? undefined : Number(editingValue)"
              style="width: 100%"
              data-testid="custom-property-number-input"
              @change="onNumberInput"
            />
            <Input
              v-else
              v-model:value="editingValue"
              data-testid="custom-property-text-input"
              @press-enter="saveEdit(record as CustomPropertyDef)"
            />
          </template>
          <template v-else>
            {{ extensionValue((record as CustomPropertyDef).name) }}
          </template>
        </template>
        <template v-else-if="column.key === 'actions'">
          <template v-if="isEditing((record as CustomPropertyDef).name)">
            <Button
              type="link"
              size="small"
              :loading="savingName === (record as CustomPropertyDef).name"
              data-testid="save-custom-property"
              @click="saveEdit(record as CustomPropertyDef)"
            >
              {{ t('crud.save') }}
            </Button>
            <Button type="link" size="small" data-testid="cancel-custom-property" @click="editingName = null">
              {{ t('crud.cancel') }}
            </Button>
          </template>
          <Button
            v-else
            type="text"
            size="small"
            :data-testid="`edit-custom-property-${(record as CustomPropertyDef).name}`"
            @click="startEdit(record as CustomPropertyDef)"
          >
            {{ t('label.edit') }}
          </Button>
        </template>
      </template>
    </Table>
  </div>
</template>

<style scoped>
.detail__alert {
  margin-bottom: 16px;
}

/* Official CustomPropertyTable placeholder host: relative, full-size,
   min-height so the absolutely-positioned placeholder stays visible. */
.custom-properties__no-access {
  position: relative;
  min-height: 240px;
}
</style>
