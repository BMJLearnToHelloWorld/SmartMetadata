<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { Alert, Table, Typography } from 'ant-design-vue';
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
  }>(),
  { canView: true, widgetSettings: null },
);

const { t } = useI18n();

const visibleDefs = computed(() =>
  props.widgetSettings
    ? widgetVisibleProperties(props.defs, props.widgetSettings)
    : props.defs,
);

const columns = computed(() => [
  { title: t('asset.columns.property'), key: 'property' },
  { title: t('asset.columns.propertyType'), dataIndex: 'propertyType', key: 'propertyType', width: 140 },
  { title: t('asset.columns.value'), key: 'value' },
]);

function extensionValue(name: string): string {
  const value = props.values[name];
  if (value === undefined || value === null) {
    return '—';
  }
  return typeof value === 'string' ? value : JSON.stringify(value);
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
          {{ extensionValue((record as CustomPropertyDef).name) }}
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
