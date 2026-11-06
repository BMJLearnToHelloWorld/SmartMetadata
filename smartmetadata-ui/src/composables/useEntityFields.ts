/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { onMounted, ref, watch } from 'vue';
import {
  getAllCustomProperties,
  getFieldsForEntity,
} from '@/api/metadataTypes';
import { buildFieldOptions } from '@/utils/workflowConfig';

/**
 * Official useEntityFields (pin a3012259ca): the field-option list for a
 * workflow field picker — per-entity-type fields from
 * GET /metadata/types/fields/{type}, with custom properties (one bulk
 * call, best-effort) prefixed `extension.` per type, merged + deduped.
 * A custom-property name on one type must not prefix (and hide) a
 * standard field of the same name on another type.
 */
export function useEntityFields(entityTypes: string[] | undefined) {
  const fieldOptions = ref<string[]>([]);
  const isLoading = ref(false);
  const error = ref<string | null>(null);

  async function loadFields(types: string[]): Promise<void> {
    if (!types || types.length === 0) {
      fieldOptions.value = [];
      return;
    }
    isLoading.value = true;
    error.value = null;
    try {
      const [allFieldsResults, customPropertiesByType] = await Promise.all([
        Promise.all(types.map((entityType) => getFieldsForEntity(entityType))),
        // One bulk call returns custom properties for every entity type.
        // Best-effort: on failure fall back to bare names rather than
        // breaking the whole field picker.
        getAllCustomProperties().catch(() => ({} as Record<string, Array<{ name: string }>>)),
      ]);
      const perTypeOptions = types.map((entityType, index) =>
        buildFieldOptions(
          (allFieldsResults[index] ?? []).filter(Boolean),
          new Set(
            (customPropertiesByType[entityType] ?? []).map(({ name }) => name),
          ),
        ),
      );
      fieldOptions.value = Array.from(new Set(perTypeOptions.flat()));
    } catch (err) {
      error.value =
        err instanceof Error ? err.message : 'Failed to load fields';
      fieldOptions.value = [];
    } finally {
      isLoading.value = false;
    }
  }

  function refetchFields(): void {
    if (entityTypes && entityTypes.length > 0) {
      void loadFields(entityTypes);
    }
  }

  watch(
    () => entityTypes?.join(','),
    () => {
      if (entityTypes && entityTypes.length > 0) {
        void loadFields(entityTypes);
      } else {
        fieldOptions.value = [];
      }
    },
  );
  onMounted(() => {
    if (entityTypes && entityTypes.length > 0) {
      void loadFields(entityTypes);
    }
  });

  return { fieldOptions, isLoading, error, refetchFields };
}
