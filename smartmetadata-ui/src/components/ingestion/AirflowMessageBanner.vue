<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed } from 'vue';
import { Alert } from 'ant-design-vue';
import type { OrchestratorStatus } from '@/types/ingestion';

const props = defineProps<{
  /** The orchestrator probe result; null when the probe failed. */
  status: OrchestratorStatus | null;
  /** True once the probe has settled, either way. */
  checked: boolean;
  /** Message when the pipeline service is disabled for the deployment. */
  disabledMessage: string;
  /** Message when the pipeline service cannot be reached. */
  unreachableMessage: string;
}>();

/**
 * Port of official AirflowMessageBanner (openmetadata-ui, pin
 * a3012259ca): silent while the status is loading, the disabled
 * message when the platform is disabled, the server reason (or the
 * unreachable fallback) when the service does not answer 200, and
 * the reason on a hybrid platform. A disabled client answers 200,
 * so availability alone never hides the disabled message.
 */
const bannerMessage = computed(() => {
  if (!props.checked) {
    return '';
  }
  const status = props.status;
  if (status?.platform === 'disabled') {
    return props.disabledMessage;
  }
  if (status?.code !== 200) {
    return status?.reason || props.unreachableMessage;
  }
  if (status.platform === 'Hybrid' && status.reason) {
    return status.reason;
  }
  return '';
});
</script>

<template>
  <div v-if="bannerMessage" data-testid="no-airflow-placeholder" role="status" style="margin-bottom: 16px">
    <Alert type="warning" show-icon :message="bannerMessage" />
  </div>
</template>
