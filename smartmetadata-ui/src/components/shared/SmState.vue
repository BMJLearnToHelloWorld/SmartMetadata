<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { Alert, Button, Empty, Spin } from 'ant-design-vue';
import { useI18n } from 'vue-i18n';

/**
 * Shared empty / loading / error states. Pages must route their
 * loading, empty and error branches through this component instead of
 * scattering Ant Empty/Spin/Alert with per-page copy.
 */
withDefaults(
  defineProps<{
    state: 'empty' | 'loading' | 'error';
    emptyText?: string;
    errorText?: string;
    showRetry?: boolean;
    testId?: string;
  }>(),
  { emptyText: undefined, errorText: undefined, showRetry: false, testId: 'sm-state' },
);
const emit = defineEmits<{ retry: [] }>();
const { t } = useI18n();
</script>

<template>
  <div class="sm-state" :data-testid="testId">
    <Spin v-if="state === 'loading'" :data-testid="`${testId}-loading`" :tip="t('shared.loading')" />
    <Empty v-else-if="state === 'empty'" :data-testid="`${testId}-empty`" :description="emptyText ?? t('shared.empty')" />
    <div v-else class="sm-state__error" :data-testid="`${testId}-error`">
      <Alert type="error" show-icon :message="errorText ?? t('shared.loadFailed')" />
      <Button v-if="showRetry" class="sm-state__retry" @click="emit('retry')">{{ t('shared.retry') }}</Button>
    </div>
  </div>
</template>

<style scoped>
.sm-state__retry {
  margin-top: 8px;
}
</style>
