<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { Spin } from 'ant-design-vue';
import { useI18n } from 'vue-i18n';
import ServiceDocPanel from '@/components/ingestion/ServiceDocPanel.vue';
import SettingsSourceBanner from '@/components/shared/SettingsSourceBanner.vue';
import { useFieldFocus } from '@/ingestion/fieldFocus';
import type { JsonSchema } from './appAssets';
import ResizablePanels from '@/components/shared/ResizablePanels.vue';
import AppSchemaForm from './AppSchemaForm.vue';
import { formatFormDataForSubmit } from './formDataFormat';
import { useMcpConfiguration } from './useMcpConfiguration';

defineProps<{
  appName: string;
  jsonSchema: JsonSchema;
}>();

const { t } = useI18n();
const { activeField, activeFieldMeta, handleFieldFocus } = useFieldFocus();
const {
  formConfig,
  managedFields,
  isEveryFieldManaged,
  isFetching,
  isSaving,
  sources,
  fetchMcpConfig,
  refetchSources,
  saveMcpConfig,
} = useMcpConfiguration();

/**
 * Official McpApplicationConfiguration (components/Settings/Applications/
 * McpApplicationConfiguration/McpApplicationConfiguration.tsx, pin
 * a3012259ca): a Loader while fetching, then the settings-source
 * banner plus the schema form in resizable panels. Every field
 * managed disables the form and hides its footer; individually
 * managed fields render readonly through the shared predicates (the
 * Vue equivalent of pin's applyManagedPathsToUiSchema chain, which is
 * RJSF-specific and was not ported). Submit runs
 * formatFormDataForSubmit before the save, as in pin.
 */
function onFocus(id: string, meta: { title?: string; description?: string }): void {
  handleFieldFocus(id, { title: meta.title, description: meta.description });
}

function isFieldReadonly(dotPath: string): boolean {
  return (managedFields.value as string[]).includes(dotPath);
}

function onSubmit(formData: Record<string, unknown>): void {
  void saveMcpConfig(
    formatFormDataForSubmit(formData) as Parameters<typeof saveMcpConfig>[0],
  );
}
</script>

<template>
  <Spin v-if="isFetching" data-testid="mcp-config-loader" style="display: flex; justify-content: center; padding: 48px" />
  <ResizablePanels
    v-else
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
      <SettingsSourceBanner
        :on-adopted="fetchMcpConfig"
        :on-refetch="refetchSources"
        :sources="sources"
      />
      <AppSchemaForm
        :cancel-text="t('label.back')"
        :disabled="isEveryFieldManaged"
        :form-data="formConfig"
        hide-cancel-button
        :hide-footer="isEveryFieldManaged"
        :is-field-readonly="isFieldReadonly"
        :is-loading="isSaving"
        :ok-text="t('label.save')"
        :readonly="isEveryFieldManaged"
        :schema="jsonSchema"
        @focus="onFocus"
        @submit="onSubmit"
      />
    </template>
    <template #second>
      <ServiceDocPanel
        :active-field="activeField"
        :active-field-meta="activeFieldMeta"
        :service-name="appName"
        service-type="Applications"
      />
    </template>
  </ResizablePanels>
</template>
