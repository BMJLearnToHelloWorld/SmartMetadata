<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import WorkflowInfoLabel from './WorkflowInfoLabel.vue';

/**
 * Official FormField (pin a3012259ca): a labelled form row — the label
 * (with a ` *` suffix when required) above the control. The testid is the
 * label lowercased with spaces as dashes, as in official.
 */
const props = withDefaults(
  defineProps<{
    label: string;
    description?: string;
    required?: boolean;
    showInfoIcon?: boolean;
    className?: string;
    onInfoClick?: () => void;
  }>(),
  {
    description: undefined,
    required: false,
    showInfoIcon: false,
    className: '',
    onInfoClick: undefined,
  },
);

const testId = `form-field-${props.label.toLowerCase().replace(/\s+/g, '-')}`;
const controlTestId = `form-control-${props.label.toLowerCase().replace(/\s+/g, '-')}`;
</script>

<template>
  <div style="margin-bottom: 24px" :class="className" :data-testid="testId">
    <WorkflowInfoLabel
      style="margin-bottom: 6px"
      :text="required ? `${label} *` : label"
      :description="description"
      :show-icon="showInfoIcon"
      :on-info-click="onInfoClick"
    />
    <div style="width: 100%" :data-testid="controlTestId">
      <slot />
    </div>
  </div>
</template>
