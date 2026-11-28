<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
  Official FailureReasonChipGroup parity (reason-chip-* test ids).
-->
<script setup lang="ts">
import { computed } from 'vue';

const FAILURE_REASONS = ['FalsePositive', 'MissingData', 'Duplicates', 'OutOfBounds', 'Other'] as const;

export type IncidentFailureReason = (typeof FAILURE_REASONS)[number];

const props = defineProps<{
  modelValue: string;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: string];
}>();

const reasons = computed(() => FAILURE_REASONS);

function label(reason: string): string {
  return reason.replace(/([A-Z])/g, ' $1').trim();
}

function select(reason: string): void {
  emit('update:modelValue', reason);
}
</script>

<template>
  <div class="incident-failure-reasons">
    <button
      v-for="reason in reasons"
      :key="reason"
      type="button"
      class="incident-failure-reasons__chip"
      :class="{ 'incident-failure-reasons__chip--selected': modelValue === reason }"
      :data-testid="`reason-chip-${reason}`"
      @click="select(reason)"
    >
      {{ label(reason) }}
    </button>
  </div>
</template>

<style scoped>
.incident-failure-reasons {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.incident-failure-reasons__chip {
  border: 1px solid var(--sm-border-color);
  border-radius: 6px;
  background: var(--sm-bg-container);
  cursor: pointer;
  font-size: 12px;
  line-height: 1.25;
  padding: 0.25rem 0.5rem;
}

.incident-failure-reasons__chip--selected {
  background: var(--sm-color-primary);
  border-color: var(--sm-color-primary);
  color: var(--sm-text-on-primary);
}
</style>