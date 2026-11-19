/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { ref, toValue, watch, type MaybeRefOrGetter } from 'vue';
import { useI18n } from 'vue-i18n';
import { getServiceByFqn } from '@/api/serviceLookup';
import type { ServiceKind } from '@/types/ingestion';

/**
 * Service-name validation (01 §5.2), ported from official
 * `pages/AddServicePage/useServiceNameValidation.ts` (pin
 * a3012259ca): a 400ms-debounced duplicate check — a successful
 * `getServiceByFQN` means the name is taken, any failure means it
 * passes — with a `base_N+1` suggestion and a request-id guard
 * against stale responses.
 */

export const SERVICE_NAME_VALIDATION_DEBOUNCE_MS = 400;

/**
 * Category label keys (official :20-32). Drive has no `-service`
 * key in the pin — it uses `label.drive`. Product keys follow §2.6
 * (`settings.services.*`, pin values verbatim).
 */
export const SERVICE_CATEGORY_LABEL_KEYS: Record<string, string> = {
  api: 'settings.services.categoryLabel.api',
  dashboard: 'settings.services.categoryLabel.dashboard',
  database: 'settings.services.categoryLabel.database',
  drive: 'settings.services.categoryLabel.drive',
  messaging: 'settings.services.categoryLabel.messaging',
  metadata: 'settings.services.categoryLabel.metadata',
  mlmodel: 'settings.services.categoryLabel.mlmodel',
  pipeline: 'settings.services.categoryLabel.pipeline',
  search: 'settings.services.categoryLabel.search',
  security: 'settings.services.categoryLabel.security',
  storage: 'settings.services.categoryLabel.storage',
};

/** Fallback label when the category has no label key (official :57-59). */
export const SERVICE_LABEL_FALLBACK_KEY = 'settings.services.serviceLowercase';

/** Official :34-40: `name` → `name_2`, `name_3` → `name_4`. */
export function getSuggestedServiceName(serviceName: string): string {
  const match = serviceName.match(/^(.*?)(?:_(\d+))?$/);
  const baseName = match?.[1] || serviceName;
  const nextSuffix = Number(match?.[2] ?? 1) + 1;
  return `${baseName}_${nextSuffix}`;
}

/**
 * Official :57-59: the mapped label lowercased; the fallback is
 * used as-is (the pin value is already lowercase).
 */
export function getServiceCategoryLabel(
  kind: string,
  translate: (key: string) => string,
): string {
  const labelKey = SERVICE_CATEGORY_LABEL_KEYS[kind];
  return labelKey ? translate(labelKey).toLowerCase() : translate(SERVICE_LABEL_FALLBACK_KEY);
}

export function getDuplicateServiceNameError(
  name: string,
  kind: string,
  translate: (key: string, params?: Record<string, string>) => string,
): string {
  return translate('settings.services.nameAlreadyExistsWithSuggestion', {
    serviceCategory: getServiceCategoryLabel(kind, (key) => translate(key)),
    serviceName: name,
    suggestedServiceName: getSuggestedServiceName(name),
  });
}

export function useServiceNameValidation(options: {
  enabled: MaybeRefOrGetter<boolean>;
  serviceCategory: MaybeRefOrGetter<ServiceKind>;
  serviceName: MaybeRefOrGetter<string>;
  /** Lookup override for tests; defaults to the FQN fetch. */
  lookup?: (kind: ServiceKind, name: string) => Promise<unknown>;
}) {
  const { t } = useI18n();
  const nameError = ref('');
  const isServiceNameChecking = ref(false);
  const validationRequestId = ref(0);
  const lookup = options.lookup ?? getServiceByFqn;

  function resetNameValidation(): void {
    validationRequestId.value += 1;
    isServiceNameChecking.value = false;
    nameError.value = '';
  }

  async function validateServiceName(
    name: string = toValue(options.serviceName),
    requestId: number = validationRequestId.value + 1,
  ): Promise<boolean> {
    const trimmedName = name.trim();
    if (requestId < validationRequestId.value) {
      return false;
    }
    validationRequestId.value = requestId;
    if (!toValue(options.enabled) || !trimmedName) {
      isServiceNameChecking.value = false;
      return true;
    }
    isServiceNameChecking.value = true;
    try {
      await lookup(toValue(options.serviceCategory), trimmedName);
      if (requestId === validationRequestId.value) {
        nameError.value = getDuplicateServiceNameError(trimmedName, toValue(options.serviceCategory), (key, params) =>
          t(key, params ?? {}),
        );
      }
      return false;
    } catch {
      if (requestId === validationRequestId.value) {
        nameError.value = '';
      }
      return true;
    } finally {
      if (requestId === validationRequestId.value) {
        isServiceNameChecking.value = false;
      }
    }
  }

  watch(
    [() => toValue(options.enabled), () => toValue(options.serviceName)],
    ([enabled, serviceName], _prev, onCleanup) => {
      const trimmedName = serviceName.trim();
      const requestId = validationRequestId.value + 1;
      validationRequestId.value = requestId;
      if (!enabled || !trimmedName) {
        isServiceNameChecking.value = false;
        return;
      }
      isServiceNameChecking.value = true;
      const timer = window.setTimeout(() => {
        void validateServiceName(trimmedName, requestId);
      }, SERVICE_NAME_VALIDATION_DEBOUNCE_MS);
      onCleanup(() => window.clearTimeout(timer));
    },
  );

  function setNameError(value: string): void {
    nameError.value = value;
  }

  return {
    isServiceNameChecking,
    nameError,
    resetNameValidation,
    setNameError,
    validateServiceName,
  };
}
