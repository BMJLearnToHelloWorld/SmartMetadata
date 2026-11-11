<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed } from 'vue';
import { useScheduleDescriptionTexts } from '@/ingestion/scheduleDescription';

const props = defineProps<{
  scheduleInterval?: string;
}>();

/**
 * Official ScheduleFieldCell (openmetadata-ui
 * utils/IngestionListTableUtils.tsx, pin a3012259ca): the two-line
 * human-readable schedule description, '—' with no schedule. While
 * cronstrue is still loading, the cron itself stands in on the first
 * line so the cell never claims an existing schedule is absent.
 */
const texts = useScheduleDescriptionTexts(() => props.scheduleInterval);
const primary = computed(() => texts.value.descriptionFirstPart || props.scheduleInterval || '');
const secondary = computed(() => texts.value.descriptionSecondPart);
</script>

<template>
  <span v-if="!scheduleInterval">—</span>
  <span v-else class="ing-schedule-cell">
    <span class="ing-schedule-cell__primary" data-testid="schedule-primary-details">{{ primary }}</span>
    <span
      v-if="secondary"
      class="ing-schedule-cell__secondary"
      data-testid="schedule-secondary-details"
    >{{ secondary }}</span>
  </span>
</template>

<style scoped>
.ing-schedule-cell {
  display: flex;
  flex-direction: column;
  min-width: 0;
}
.ing-schedule-cell__primary {
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.ing-schedule-cell__secondary {
  font-size: 12px;
  color: var(--sm-text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
