<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { CheckCircleFilled } from '@ant-design/icons-vue';
import { computed } from 'vue';

const props = withDefaults(
  defineProps<{
    steps: { name: string; step: number }[];
    activeStep: number;
    excludeSteps?: number[];
    className?: string;
  }>(),
  { excludeSteps: () => [], className: '' },
);

/**
 * Official IngestionStepper (components/Settings/Services/Ingestion/
 * IngestionStepper/IngestionStepper.component.tsx, pin a3012259ca):
 * the step list minus excluded steps; status derives from the
 * original step identifier (optional steps leave gaps), never from
 * the visible index: the active step is current, earlier steps are
 * complete, later steps are incomplete. Each title carries
 * `data-testid="step-icon-{step}"`. The product ServiceFlowStepper
 * has different testids and semantics, so this scoped stepper
 * mirrors pin directly.
 */
const items = computed(() =>
  props.steps
    .filter((step) => !props.excludeSteps.includes(step.step))
    .map((step) => ({
      id: String(step.step),
      name: step.name,
      step: step.step,
      status: step.step === props.activeStep ? 'current' : step.step < props.activeStep ? 'complete' : 'incomplete',
    })),
);
</script>

<template>
  <div :class="['stepper-container', className]" data-testid="stepper-container">
    <div style="display: flex; align-items: flex-start">
      <template v-for="(item, index) in items" :key="item.id">
        <div style="display: flex; flex-direction: column; align-items: center; gap: 4px">
          <span
            :style="{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '24px',
              height: '24px',
              borderRadius: '50%',
              border: item.status === 'current' ? '2px solid var(--sm-primary, #005587)' : '1px solid #d9d9d9',
              color: item.status === 'current' ? 'var(--sm-primary, #005587)' : '#8c8c8c',
              fontSize: '12px',
            }"
          >
            <CheckCircleFilled v-if="item.status === 'complete'" />
            <span v-else>{{ item.step }}</span>
          </span>
          <span :data-testid="`step-icon-${item.step}`" style="font-size: 12px; white-space: nowrap">
            {{ item.name }}
          </span>
        </div>
        <div
          v-if="index < items.length - 1"
          style="flex: 1; height: 1px; background: #d9d9d9; margin: 12px 8px 0"
        />
      </template>
    </div>
  </div>
</template>
