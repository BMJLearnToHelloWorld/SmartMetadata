/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { computed, ref, toValue, useId, watch, type MaybeRefOrGetter } from 'vue';

/**
 * Stable keys for a list of rules that has no ids of its own, ported
 * from pin components/Alerts/useAlertRuleKeys.ts. Keys are resized
 * synchronously when the count changes, so a newly added row commits
 * with its final key once, instead of mounting under a fallback key
 * and remounting.
 */
export function useAlertRuleKeys(count: MaybeRefOrGetter<number>) {
  const prefix = useId();
  const ids = ref<number[]>([]);
  const nextId = ref(0);

  const resize = (target: number) => {
    if (ids.value.length >= target) {
      ids.value = ids.value.slice(0, target);
      return;
    }
    const added = target - ids.value.length;
    ids.value = [
      ...ids.value,
      ...Array.from({ length: added }, (_, i) => nextId.value + i),
    ];
    nextId.value += added;
  };

  watch(() => toValue(count), resize, { immediate: true, flush: 'sync' });

  return {
    keys: computed(() => ids.value.map((id) => `${prefix}-${id}`)),
    removeKey: (index: number) => {
      ids.value = ids.value.filter((_, position) => position !== index);
    },
  };
}
