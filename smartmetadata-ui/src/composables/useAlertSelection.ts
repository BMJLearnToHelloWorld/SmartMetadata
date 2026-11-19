/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { computed, toValue, type ComputedRef, type MaybeRefOrGetter } from 'vue';
import type {
  AlertCapabilities,
  AlertFilteringInput,
  AlertSelectionSupport,
  AlertSourceCapability,
} from '@/types/notifications';
import type { AlertType } from '@/types/quality';
import { getSelectionSupport } from '@/utils/notifications/alertSelection';
import {
  getAlertSourceSearch,
  type AlertSearchHooks,
  type AlertSourceSearch,
} from '@/utils/notifications/alertSourceSearch';
import type { TranslateFn } from '@/utils/notifications/alertUtils';
import { useAlertCapabilities } from './useAlertCapabilities';

/**
 * Selection state, ported from pin hooks/useAlertSelection.ts. The form
 * or view that shows an alert owns one instance, and every field inside
 * reads it from props, so the source picker, the filters, the triggers
 * and the recipients never disagree about the selection. Pin provides
 * it through React context with a NOTHING_SELECTED default; Vue passes
 * it as a prop, so no provider or default is needed.
 */

export interface UseAlertSelectionProps {
  alertType: MaybeRefOrGetter<AlertType>;
  sources?: MaybeRefOrGetter<string[] | undefined>;
  input?: MaybeRefOrGetter<AlertFilteringInput | undefined>;
  /** Forwarded to the capabilities engine; see its `enabled` contract. */
  enabled?: MaybeRefOrGetter<boolean>;
  t: TranslateFn;
  notifyError: (message: string) => void;
}

export interface AlertSelectionState {
  sources: string[];
  support: AlertSelectionSupport;
  capabilities: {
    selection?: AlertCapabilities;
    answeredFor?: string[];
    knownSources: AlertSourceCapability[];
    loading: boolean;
    settled: boolean;
    retry: () => void;
  };
  loading: boolean;
  /**
   * The server has answered the first question, or it failed. A form or
   * view waits for this before it shows anything, and does not go back
   * to waiting afterwards.
   */
  ready: boolean;
  search: AlertSourceSearch;
}

const splitKey = (key: string): string[] => (key ? key.split('|') : []);

export function useAlertSelection(
  props: UseAlertSelectionProps,
): ComputedRef<AlertSelectionState> {
  const capabilities = useAlertCapabilities({
    alertType: props.alertType,
    sources: props.sources,
    input: props.input,
    enabled: props.enabled,
  });
  const hooks: AlertSearchHooks = { t: props.t, notifyError: props.notifyError };
  const support = computed(() =>
    getSelectionSupport({
      sources: toValue(props.sources) ?? [],
      selection: capabilities.selection.value,
      answeredFor: capabilities.answeredFor.value,
      t: props.t,
    }),
  );
  // Every capabilities answer is a new object, even when it says the same
  // thing. The fields that search re-run their initial fetch and cancel a
  // pending typed search whenever `search` changes, so it is keyed by the
  // joined values it closes over rather than by the arrays that carry
  // them: the key strings only change when the values do.
  const sourcesKey = computed(() => (toValue(props.sources) ?? []).join('|'));
  const containerEntitiesKey = computed(() =>
    (support.value.containerEntities ?? []).join('|'),
  );
  const search = computed(() =>
    getAlertSourceSearch(splitKey(sourcesKey.value), splitKey(containerEntitiesKey.value), hooks),
  );
  return computed(() => ({
    sources: toValue(props.sources) ?? [],
    support: support.value,
    capabilities: {
      selection: capabilities.selection.value,
      answeredFor: capabilities.answeredFor.value,
      knownSources: capabilities.knownSources.value,
      loading: capabilities.loading.value,
      settled: capabilities.settled.value,
      retry: capabilities.retry,
    },
    loading: capabilities.loading.value,
    ready: capabilities.settled.value,
    search: search.value,
  }));
}
