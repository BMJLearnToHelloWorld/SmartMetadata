<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
  Official RunExecutionError (message + traceback subset).
-->
<script setup lang="ts">
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { Button } from 'ant-design-vue';
import type { TestCaseErrorDetails } from '@/types/quality';

const props = defineProps<{
  errorDetails?: TestCaseErrorDetails;
  resultMessage?: string;
}>();

const { t } = useI18n();
const expanded = ref(false);

const message = computed(() => props.errorDetails?.message?.trim() || props.resultMessage?.trim() || '');
const stackTrace = computed(() => props.errorDetails?.stackTrace?.trim() || '');
</script>

<template>
  <section v-if="message || stackTrace" class="run-execution-error" data-testid="run-execution-error">
    <p v-if="message" class="run-execution-error__message" data-testid="run-execution-error-message">
      {{ expanded ? message : message }}
    </p>
    <Button v-if="message.length > 180" type="link" size="small" @click="expanded = !expanded">
      {{ expanded ? t('label.show-less') : t('label.show-more') }}
    </Button>
    <pre v-if="stackTrace" class="run-execution-error__trace" data-testid="run-execution-error-trace">{{ stackTrace }}</pre>
  </section>
</template>

<style scoped>
.run-execution-error {
  border-top: 1px solid var(--sm-border-color, #e8e8e8);
  padding-top: 12px;
}
.run-execution-error__message {
  margin: 0 0 8px;
  white-space: pre-wrap;
  color: var(--sm-color-error, #b42318);
}
.run-execution-error__trace {
  margin: 0;
  max-height: 240px;
  overflow: auto;
  border: 1px solid var(--sm-border-color, #e8e8e8);
  border-radius: 8px;
  background: var(--sm-bg-layout, #f5f5f5);
  padding: 12px;
  font-size: 12px;
}
</style>