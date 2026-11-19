<!--
Copyright 2026 SmartMetadata authors.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0
-->
<script setup lang="ts">
import { Divider, Skeleton } from 'ant-design-vue';
import { useI18n } from 'vue-i18n';
import type { EventsRecord } from '@/types/notifications';
import { formatEventCount } from '@/utils/notifications/alertUtils';

/**
 * Pin `getAlertExtraInfo` (AlertsUtil.tsx:294-350): while the counts load,
 * three vertical-divider + skeleton pairs; once loaded, Total / Pending /
 * Failed inline labels. Only Total and Pending carry the `+` lower-bound
 * suffix; Failed renders the raw count (0 when absent).
 */
const props = defineProps<{
  loading: boolean;
  counts?: EventsRecord;
}>();

const { t } = useI18n();
</script>

<template>
  <template v-if="props.loading">
    <template v-for="index in 3" :key="`alert-skeleton-${index}`">
      <Divider type="vertical" />
      <Skeleton
        active
        class="alert-extra-info__skeleton"
        :paragraph="false"
        :title="{ width: 80 }"
      />
    </template>
  </template>
  <template v-else>
    <span data-testid="total-events-count">
      {{ t('label.total-entity', { entity: t('label.event-plural') }) }}:
      {{ formatEventCount(props.counts?.totalEventsCount, props.counts?.countsAreLowerBound) }}
    </span>
    <span data-testid="pending-events-count">
      {{ t('label.pending-entity', { entity: t('label.event-plural') }) }}:
      {{ formatEventCount(props.counts?.pendingEventsCount, props.counts?.countsAreLowerBound) }}
    </span>
    <span data-testid="failed-events-count">
      {{ t('label.failed-entity', { entity: t('label.event-plural') }) }}:
      {{ props.counts?.failedEventsCount ?? 0 }}
    </span>
  </template>
</template>

<style scoped>
.alert-extra-info__skeleton :deep(.ant-skeleton-title) {
  height: 40px;
}
</style>
