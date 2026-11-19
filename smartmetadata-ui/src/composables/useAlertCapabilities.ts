/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { computed, ref, toValue, watch, type MaybeRefOrGetter, type Ref } from 'vue';
import { getAlertCapabilities } from '@/api/eventSubscriptions';
import type {
  AlertCapabilities,
  AlertFilteringInput,
  AlertSourceCapability,
} from '@/types/notifications';
import type { AlertType } from '@/types/quality';
import { capabilitiesKeyOf } from '@/utils/notifications/alertSelection';

/**
 * Capabilities engine, ported from pin hooks/useAlertCapabilities.ts.
 * It asks once per distinct selection (the empty one included), keeps
 * the previous answer on screen while asking, keeps knownSources on
 * failure, and never un-settles. One deliberate adaptation: pin's
 * `answered` cache is an unbounded record; the worktree AGENTS.md
 * requires every cache to be bounded, so this port caps it at 100
 * entries with LRU eviction (per-hook instance, as in pin).
 */

export const ALERT_CAPABILITIES_CACHE_LIMIT = 100;

export interface UseAlertCapabilitiesProps {
  alertType: MaybeRefOrGetter<AlertType>;
  sources?: MaybeRefOrGetter<string[] | undefined>;
  input?: MaybeRefOrGetter<AlertFilteringInput | undefined>;
  /**
   * The engine asks only while enabled. The form page gates it on the
   * access check: pin mounts the selection hook inside the form, which
   * renders only after access is granted, so a denied visitor never
   * triggers a capabilities request. Defaults to enabled.
   */
  enabled?: MaybeRefOrGetter<boolean>;
}

export interface UseAlertCapabilitiesState {
  /** What the current selection supports, and which sources can still join it. */
  selection: Ref<AlertCapabilities | undefined>;
  /** The sources the answer on screen was given for, which can lag behind the selection. */
  answeredFor: Ref<string[] | undefined>;
  /**
   * Every source of the alert type, by name and kind, from the last
   * answer that arrived. A later question that fails leaves it in
   * place, so the source picker keeps something to offer.
   */
  knownSources: Ref<AlertSourceCapability[]>;
  loading: Ref<boolean>;
  /** The first question has had its answer, or has failed. It never goes back. */
  settled: Ref<boolean>;
  /** Asks the current question again, after it failed. The source picker offers it. */
  retry: () => void;
}

interface Shown {
  selection?: AlertCapabilities;
  answeredFor?: string[];
  knownSources: AlertSourceCapability[];
}

const show =
  (selection: AlertCapabilities | undefined, answeredFor: string[]) =>
  (previous: Shown): Shown => ({
    selection,
    answeredFor: selection ? answeredFor : undefined,
    knownSources: selection
      ? selection.sources.map(({ name, kind }) => ({ name, kind }))
      : previous.knownSources,
  });

function jsonDeepEquals(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export function useAlertCapabilities(
  props: UseAlertCapabilitiesProps,
): UseAlertCapabilitiesState {
  const shown = ref<Shown>({ knownSources: [] });
  // It asks as soon as it mounts, so it starts out asking.
  const loading = ref(true);
  const settled = ref(false);
  const attempt = ref(0);
  const answered = new Map<string, AlertCapabilities>();
  const latestKey = ref<string | undefined>(undefined);
  // Callers often hand over a new array on every render. The names in it are what matters.
  const selected = computed(() => [...new Set(toValue(props.sources) ?? [])]);
  const lastInput = ref<AlertFilteringInput | undefined>(toValue(props.input));

  const ask = async (names: string[], chosen?: AlertFilteringInput) => {
    try {
      return await getAlertCapabilities({
        alertType: toValue(props.alertType),
        sources: names,
        input: chosen,
      });
    } catch {
      return undefined;
    }
  };

  const retry = () => {
    attempt.value += 1;
  };

  watch(
    [
      () => toValue(props.alertType),
      selected,
      () => toValue(props.input),
      attempt,
      () => toValue(props.enabled) ?? true,
    ],
    () => {
      if ((toValue(props.enabled) ?? true) === false) {
        return;
      }
      const input = toValue(props.input);
      if (!jsonDeepEquals(lastInput.value, input)) {
        lastInput.value = input;
      }
      const stableInput = lastInput.value;
      const key = capabilitiesKeyOf(toValue(props.alertType), selected.value, stableInput);
      latestKey.value = key;
      const cached = answered.get(key);
      if (cached) {
        // Refresh LRU order on hit.
        answered.delete(key);
        answered.set(key, cached);
        shown.value = show(cached, selected.value)(shown.value);
        loading.value = false;
        settled.value = true;
        return;
      }
      loading.value = true;
      const askedNames = [...selected.value];
      ask(askedNames, stableInput).then((capabilities) => {
        if (capabilities) {
          answered.set(key, capabilities);
          if (answered.size > ALERT_CAPABILITIES_CACHE_LIMIT) {
            const oldest = answered.keys().next().value;
            if (oldest !== undefined) {
              answered.delete(oldest);
            }
          }
        }
        // An answer to a selection the user has already changed is kept, but not shown.
        if (latestKey.value === key) {
          shown.value = show(capabilities, askedNames)(shown.value);
          loading.value = false;
          settled.value = true;
        }
      });
    },
    { immediate: true },
  );

  return {
    selection: computed(() => shown.value.selection),
    answeredFor: computed(() => shown.value.answeredFor),
    knownSources: computed(() => shown.value.knownSources),
    loading,
    settled,
    retry,
  };
}
