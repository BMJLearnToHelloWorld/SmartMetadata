/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0.
 */
import { computed, ref } from 'vue';
import { defineStore } from 'pinia';
import { TOUR_STEPS } from '@/features/tour/tourSteps';

export const useTourStore = defineStore('tour', () => {
  const active = ref(false);
  const stepIndex = ref(0);
  const step = computed(() => TOUR_STEPS[stepIndex.value] ?? TOUR_STEPS[0]);
  const isFirst = computed(() => stepIndex.value <= 0);
  const isLast = computed(() => stepIndex.value >= TOUR_STEPS.length - 1);

  function start(): void {
    stepIndex.value = 0;
    active.value = true;
  }

  function stop(): void {
    active.value = false;
  }

  function next(): void {
    if (isLast.value) {
      stop();
    } else {
      stepIndex.value += 1;
    }
  }

  function prev(): void {
    if (!isFirst.value) {
      stepIndex.value -= 1;
    }
  }

  return { active, stepIndex, step, isFirst, isLast, start, stop, next, prev };
});
