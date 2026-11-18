<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import type { AlertSelectionState } from '@/composables/useAlertSelection';
import AlertFormSection from './AlertFormSection.vue';
import AlertSourcePicker from './AlertSourcePicker.vue';

/**
 * Source section, ported from pin
 * components/Alerts/AlertFormSourceItem/AlertFormSourceItem.tsx. The
 * form's error for the sources renders under the picker.
 */
const props = withDefaults(
  defineProps<{
    isViewMode?: boolean;
    value?: string[];
    error?: string;
    selection: AlertSelectionState;
  }>(),
  { isViewMode: false, value: () => [], error: undefined },
);
const emit = defineEmits<{ 'update:value': [value: string[]] }>();
const { t } = useI18n();
</script>

<template>
  <AlertFormSection
    :heading="t('label.source')"
    :sub-heading="t('message.alerts-source-description')"
  >
    <div class="source-input-container">
      <AlertSourcePicker
        :value="value"
        :capabilities="selection.capabilities"
        :disabled="isViewMode"
        :invalid="Boolean(error)"
        @update:value="(next) => emit('update:value', next)"
      />
      <div v-if="error" class="alert-form-source-item__hint">{{ error }}</div>
    </div>
  </AlertFormSection>
</template>

<style scoped>
.source-input-container {
  display: flex;
  flex-direction: column;
  gap: 8px;
  align-items: stretch;
}

.alert-form-source-item__hint {
  color: var(--sm-color-error);
  font-size: 12px;
}
</style>
