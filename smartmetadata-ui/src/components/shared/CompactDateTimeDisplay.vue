<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
  Official DateTimeDisplay size="compact" without React/core-ui.
-->
<script setup lang="ts">
import { computed } from 'vue';
import { formatCompactDateTimeDisplay } from '@/utils/dates';

const props = defineProps<{
  timestamp?: number;
}>();

const parts = computed(() => formatCompactDateTimeDisplay(props.timestamp));
</script>

<template>
  <span v-if="parts" class="compact-datetime" data-testid="compact-date-time-display">
    <span class="compact-datetime__date" data-testid="compact-date-time-date">{{ parts.dateLine }}</span>
    <span class="compact-datetime__sub">
      <span data-testid="compact-date-time-time">{{ parts.timeLine }}</span>
      <span class="compact-datetime__utc" data-testid="compact-date-time-utc">{{ parts.utcLine }}</span>
    </span>
  </span>
  <span v-else data-testid="compact-date-time-empty">—</span>
</template>

<style scoped>
.compact-datetime {
  display: inline-flex;
  flex-direction: column;
  line-height: 1.25;
  white-space: nowrap;
}
.compact-datetime__date {
  font-size: 12px;
  color: rgba(0, 0, 0, 0.45);
}
.compact-datetime__sub {
  display: inline-flex;
  gap: 4px;
  font-size: 12px;
  color: rgba(0, 0, 0, 0.45);
}
.compact-datetime__utc {
  color: rgba(0, 0, 0, 0.35);
}
</style>