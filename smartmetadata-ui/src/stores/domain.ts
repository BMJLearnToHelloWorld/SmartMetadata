/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */

import { listDomains } from '@/api/domains';
import type { Domain } from '@/types/governance';
import { defineStore } from 'pinia';
import { computed, ref } from 'vue';

/**
 * Domain scope slice, mirroring the official DomainSelect contract
 * (activeDomain / userDomains) as far as the product API reaches.
 *
 * Wired: GET /v1/domains for the selectable list; the active id is
 * persisted locally. Residual: the official `isDomainRestricted` flag
 * (user-scoped domain restriction) has no product endpoint located —
 * the store reports `isDomainRestricted: false` and does not invent a
 * restriction, and switching a domain only scopes the shell selection;
 * it does not rewrite per-page queries (Stage 2+ concern).
 */
export const DOMAIN_STORAGE_KEY = 'sm.domain.v1';

export const useDomainStore = defineStore('domain', () => {
  const domains = ref<Domain[]>([]);
  const activeDomainId = ref<string | null>(null);
  const loading = ref(false);
  const errorMessage = ref('');
  const loaded = ref(false);

  const activeDomain = computed(
    () => domains.value.find((item) => item.id === activeDomainId.value) ?? null,
  );
  const isDomainRestricted = computed(() => false);

  function hydrate(): void {
    const stored = window.localStorage.getItem(DOMAIN_STORAGE_KEY);
    activeDomainId.value = stored ? stored : null;
  }

  async function loadDomains(): Promise<void> {
    loading.value = true;
    errorMessage.value = '';
    try {
      const page = await listDomains({ limit: 100 });
      domains.value = page.data;
      if (activeDomainId.value && !domains.value.some((item) => item.id === activeDomainId.value)) {
        activeDomainId.value = null;
        window.localStorage.removeItem(DOMAIN_STORAGE_KEY);
      }
    } catch (error) {
      errorMessage.value = error instanceof Error ? error.message : 'Failed to load domains';
    } finally {
      loading.value = false;
      loaded.value = true;
    }
  }

  function selectDomain(id: string | null): void {
    activeDomainId.value = id;
    if (id) {
      window.localStorage.setItem(DOMAIN_STORAGE_KEY, id);
    } else {
      window.localStorage.removeItem(DOMAIN_STORAGE_KEY);
    }
  }

  return {
    domains,
    activeDomainId,
    activeDomain,
    isDomainRestricted,
    loading,
    errorMessage,
    loaded,
    hydrate,
    loadDomains,
    selectDomain,
  };
});
