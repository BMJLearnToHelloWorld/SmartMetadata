/**
 * Copyright 2026 SmartMetadata authors.
 * Licensed under the Apache License, Version 2.0.
 * Official useSelectedRunInUrl + useTestCase.store selectedRunTimestamp.
 */
import { ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { toFiniteNumber } from '@/quality/testSummaryGraphUtils';

const SELECTED_RUN_PARAM = 'run';

export function useTestCaseSelectedRun() {
  const route = useRoute();
  const router = useRouter();
  const openingRun = toFiniteNumber(
    typeof route.query[SELECTED_RUN_PARAM] === 'string' ? route.query[SELECTED_RUN_PARAM] : undefined,
  );
  const selectedRunTimestamp = ref<number | undefined>(openingRun);
  let skipFirstUrlWrite = true;

  watch(selectedRunTimestamp, (timestamp) => {
    if (skipFirstUrlWrite && timestamp === undefined) {
      skipFirstUrlWrite = false;
      return;
    }
    skipFirstUrlWrite = false;
    const nextQuery = { ...route.query };
    if (timestamp === undefined) {
      delete nextQuery[SELECTED_RUN_PARAM];
    } else {
      nextQuery[SELECTED_RUN_PARAM] = String(timestamp);
    }
    void router.replace({ query: nextQuery });
  });

  watch(
    () => route.query[SELECTED_RUN_PARAM],
    (raw) => {
      const parsed = toFiniteNumber(typeof raw === 'string' ? raw : undefined);
      if (parsed !== selectedRunTimestamp.value) {
        selectedRunTimestamp.value = parsed;
      }
    },
  );

  function setSelectedRunTimestamp(timestamp: number | undefined): void {
    selectedRunTimestamp.value = timestamp;
  }

  return { selectedRunTimestamp, setSelectedRunTimestamp };
}