/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { computed, ref, unref, watch, type MaybeRef } from 'vue';
import { getMetadataTypeByName } from '@/api/customProperties';
import type { CustomPropertyDef } from '@/types/collaboration';

const EMPTY_PROPERTIES: CustomPropertyDef[] = [];

/**
 * Official `useEntityTypeCustomProperties`: load the entity type
 * definition (`getTypeByFQN` / `GET /v1/metadata/types/name/{entityType}?fields=customProperties`)
 * and expose its custom property type defs.
 */
export function useEntityTypeCustomProperties(entityType: MaybeRef<string | undefined>) {
  const customProperties = ref<CustomPropertyDef[]>(EMPTY_PROPERTIES);
  const loading = ref(false);
  const error = ref<unknown>(null);

  async function load(): Promise<void> {
    const type = unref(entityType);
    if (!type) {
      customProperties.value = EMPTY_PROPERTIES;
      loading.value = false;
      error.value = null;
      return;
    }
    loading.value = true;
    error.value = null;
    try {
      const meta = await getMetadataTypeByName(type);
      customProperties.value = meta.customProperties ?? EMPTY_PROPERTIES;
    } catch (err) {
      error.value = err;
      customProperties.value = EMPTY_PROPERTIES;
    } finally {
      loading.value = false;
    }
  }

  watch(() => unref(entityType), () => { void load(); }, { immediate: true });

  return {
    customProperties,
    isLoading: computed(() => Boolean(unref(entityType)) && loading.value),
    error,
    reload: load,
  };
}
