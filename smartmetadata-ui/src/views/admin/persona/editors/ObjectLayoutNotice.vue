<!--
  Copyright 2026 SmartMetadata authors.

  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { Alert, Button } from 'ant-design-vue';
import { useI18n } from 'vue-i18n';

/**
 * D2 explicit abnormal state (S-C4STORE §3.2, binding): the stored
 * layout is present but not an array, so it cannot be grid-edited.
 * The original field is preserved (the editor never normalizes it
 * away); no "looks normal" default grid is offered. Conversion happens
 * only when the user explicitly confirms AND saves — the parent
 * replaces the layout in edit state on `convert` and the save writes
 * the editor-submitted new page (reviewable conversion rule, D3).
 * `{}` and non-empty objects are treated identically here, a
 * conscious ruling-backed deviation from the official marketplace
 * `{}` fallback (see S-C4STORE-API.md §3).
 */
defineProps<{
  /** The stored non-array layout value, shown verbatim for review. */
  storedValue: unknown;
}>();

const { t } = useI18n();

const emit = defineEmits<{
  convert: [];
}>();
</script>

<template>
  <div data-testid="object-layout-notice">
    <Alert type="warning" show-icon>
      <template #message>
        <span data-testid="object-layout-title">{{ t('persona.objectLayoutTitle') }}</span>
      </template>
      <template #description>
        <p data-testid="object-layout-description">
          {{ t('persona.objectLayoutDescription') }}
        </p>
        <pre
          class="object-layout-notice__value"
          data-testid="object-layout-value"
        >{{ JSON.stringify(storedValue) }}</pre>
        <Button
          type="primary"
          data-testid="object-layout-convert"
          @click="emit('convert')"
        >
          {{ t('persona.objectLayoutConvert') }}
        </Button>
      </template>
    </Alert>
  </div>
</template>

<style scoped>
.object-layout-notice__value {
  max-height: 160px;
  overflow: auto;
  white-space: pre-wrap;
  word-break: break-all;
}
</style>
