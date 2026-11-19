<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import ServiceDocPanel from '@/components/ingestion/ServiceDocPanel.vue';
import { useFieldFocus } from '@/ingestion/fieldFocus';
import type { EntityRef } from '@/types/api';
import type { AdminApp } from '@/types/admin';
import type { MarketplaceApp } from '@/api/marketplaceApps';
import type { JsonSchema } from './appAssets';
import AppResizablePanels from './AppResizablePanels.vue';
import AppSchemaForm from './AppSchemaForm.vue';

const props = defineProps<{
  appData: AdminApp | MarketplaceApp;
  isLoading: boolean;
  jsonSchema: JsonSchema;
  onConfigSave: (
    formData: Record<string, unknown>,
    ingestionRunner?: EntityRef,
  ) => void;
  onCancel?: () => void;
}>();

const { t } = useI18n();
const { activeField, activeFieldMeta, handleFieldFocus } = useFieldFocus();

// The marketplace definition types appConfiguration as unknown; only a
// record reaches the form, everything else starts empty.
const formData = computed(() => {
  const config = props.appData.appConfiguration;
  return typeof config === 'object' && config !== null && !Array.isArray(config)
    ? (config as Record<string, unknown>)
    : {};
});

/**
 * Official ApplicationConfiguration (components/Settings/Applications/
 * ApplicationConfiguration/ApplicationConfiguration.tsx, pin
 * a3012259ca): the schema form plus the ServiceDocPanel in resizable
 * panels (form minWidth 700 flex 0.7, docs minWidth 400 flex 0.3).
 * Cancel reads Back and shows only when `onCancel` exists; field
 * focus seeds the doc panel after the shared 50ms delay. The
 * `ingestionRunner` passthrough stays in the save signature (pin
 * AppDetails.interface.ts:41-43); no producer exists in this flow.
 */
function onFocus(id: string, meta: { title?: string; description?: string }): void {
  handleFieldFocus(id, { title: meta.title, description: meta.description });
}

function onSubmit(formData: Record<string, unknown>): void {
  props.onConfigSave(formData);
}
</script>

<template>
  <AppResizablePanels
    :first-panel="{
      minWidth: 700,
      flex: 0.7,
      className: 'content-resizable-panel-container',
    }"
    :second-panel="{
      minWidth: 400,
      flex: 0.3,
      className: 'service-doc-panel content-resizable-panel-container',
    }"
  >
    <template #first>
      <AppSchemaForm
        :cancel-text="t('label.back')"
        :form-data="formData"
        :hide-cancel-button="!onCancel"
        :is-loading="isLoading"
        :ok-text="t('label.save')"
        :schema="jsonSchema"
        @cancel="onCancel?.()"
        @focus="onFocus"
        @submit="onSubmit"
      />
    </template>
    <template #second>
      <ServiceDocPanel
        :active-field="activeField"
        :active-field-meta="activeFieldMeta"
        :service-name="appData.name"
        service-type="Applications"
      />
    </template>
  </AppResizablePanels>
</template>
