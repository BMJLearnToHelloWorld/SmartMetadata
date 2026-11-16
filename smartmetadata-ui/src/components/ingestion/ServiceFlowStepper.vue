<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { CheckOutlined } from '@ant-design/icons-vue';

/**
 * Port of official ServiceFlowStepper (pin a3012259ca): steps are
 * 1-based; a step before the active step is completed (check node),
 * the active step is current (ringed dot), later steps are upcoming
 * (empty ring). The connector after a step is filled only when that
 * step is completed. Step names arrive already translated.
 */
export interface ServiceFlowStep {
  name: string;
  step: number;
}

withDefaults(
  defineProps<{
    steps: ServiceFlowStep[];
    activeStep: number;
    testId?: string;
  }>(),
  { testId: 'stepper-container' },
);

type StepState = 'completed' | 'current' | 'upcoming';

function stepState(step: number, activeStep: number): StepState {
  if (step < activeStep) {
    return 'completed';
  }
  if (step === activeStep) {
    return 'current';
  }
  return 'upcoming';
}
</script>

<template>
  <div :data-testid="testId" class="service-flow-stepper">
    <template v-for="(item, index) in steps" :key="item.step">
      <div class="service-flow-step">
        <span :class="['service-flow-node', stepState(item.step, activeStep)]">
          <CheckOutlined v-if="stepState(item.step, activeStep) === 'completed'" />
          <span v-else-if="stepState(item.step, activeStep) === 'current'" class="service-flow-dot" />
        </span>
        <span
          :class="['service-flow-label', stepState(item.step, activeStep)]"
          :data-testid="`step-label-${item.step}`"
        >
          {{ item.name }}
        </span>
      </div>
      <div
        v-if="index < steps.length - 1"
        :class="['service-flow-connector', stepState(item.step, activeStep)]"
        :data-testid="`step-connector-${item.step}`"
      />
    </template>
  </div>
</template>

<style scoped>
.service-flow-stepper {
  display: flex;
  width: fit-content;
  max-width: 100%;
  align-items: flex-start;
  justify-content: center;
  margin: 0 auto;
}

.service-flow-step {
  display: flex;
  width: 150px;
  flex-direction: column;
  align-items: center;
  gap: 10px;
}

.service-flow-node {
  display: flex;
  width: 24px;
  height: 24px;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  font-size: 14px;
}

.service-flow-node.completed {
  background: var(--sm-color-primary);
  color: var(--sm-text-on-primary);
}

.service-flow-node.current {
  border: 2px solid var(--sm-color-primary);
  background: var(--sm-bg-container);
}

.service-flow-node.upcoming {
  border: 2px solid var(--sm-border-color);
  background: var(--sm-bg-container);
}

.service-flow-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--sm-color-primary);
}

.service-flow-label {
  text-align: center;
  font-size: 14px;
  font-weight: 500;
  color: var(--sm-text-tertiary);
}

.service-flow-label.completed,
.service-flow-label.current {
  font-weight: 600;
  color: var(--sm-color-primary);
}

.service-flow-connector {
  width: 100px;
  height: 2px;
  flex: none;
  margin-top: 12px;
  border-radius: 2px;
  background: var(--sm-border-color);
}

.service-flow-connector.completed {
  background: var(--sm-color-primary);
}
</style>
