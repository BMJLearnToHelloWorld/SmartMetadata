<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
  Official StatItem (DataAssetsHeader/StatItem): icon + count,
  tooltip, isActive, testId. Vue + ant-design-vue; no CCL CSS.
-->
<script setup lang="ts">
import { computed, type Component } from 'vue';
import { Button, Tooltip } from 'ant-design-vue';

const props = withDefaults(
  defineProps<{
    icon?: Component;
    count?: string | number;
    tooltip: string;
    testId: string;
    countTestId?: string;
    loading?: boolean;
    disabled?: boolean;
    isActive?: boolean;
    srLabel?: string;
  }>(),
  { loading: false, disabled: false, isActive: false },
);

const emit = defineEmits<{ click: [] }>();

const isDisabled = computed(() => props.disabled || props.loading);
const ariaLabel = computed(() => props.srLabel ?? props.tooltip);
</script>

<template>
  <Tooltip :title="tooltip">
    <Button
      type="text"
      :aria-busy="loading || undefined"
      :aria-label="ariaLabel"
      :data-active="isActive || undefined"
      :data-testid="testId"
      :disabled="isDisabled"
      :loading="loading"
      class="stat-item"
      :class="{ 'stat-item--active': isActive }"
      @click="emit('click')"
    >
      <span class="stat-item__label">
        <component :is="icon" v-if="icon" class="stat-item__icon" />
        <span v-if="count !== undefined" class="stat-item__count" :data-testid="countTestId">{{ count }}</span>
        <span v-if="srLabel" class="stat-item__sr">{{ srLabel }}</span>
      </span>
    </Button>
  </Tooltip>
</template>

<style scoped>
.stat-item {
  padding: 0;
  border-radius: var(--sm-radius-sm, 4px);
}

.stat-item__label {
  display: inline-flex;
  align-items: center;
  gap: var(--sm-spacing-xs, 4px);
  font-size: 12px;
  font-weight: 500;
  color: var(--sm-color-text-secondary, rgba(0, 0, 0, 0.45));
}

.stat-item--active .stat-item__label {
  color: var(--sm-color-brand, var(--sm-color-primary, #1677ff));
}

.stat-item__icon {
  font-size: 16px;
}

.stat-item__sr {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
}
</style>
