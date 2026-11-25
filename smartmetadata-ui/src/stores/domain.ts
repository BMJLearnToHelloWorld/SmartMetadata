/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */

import { updateUserDetail } from '@/api/users';
import { listDomains } from '@/api/domains';
import type { Domain } from '@/types/governance';
import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { useAuthStore } from '@/stores/auth';

/**
 * Domain scope slice, mirroring the official DomainSelect contract
 * (activeDomain / userDomains) as far as the product API reaches.
 *
 * Two switch paths, both pin-shaped:
 * - `selectDomain` is the local shell selection, used by page filters
 *   (SearchView, MembersEntityPicker, metric option loaders): it only
 *   scopes the shell selection and does not rewrite per-page queries.
 * - `switchDomain` is the navbar switch (pin
 *   `hooks/useSwitchActiveDomain.ts`): it persists the pick as the
 *   user's `defaultDomain` so the server applies it to every list, and
 *   the caller reloads the page afterwards. A failed switch leaves the
 *   selection untouched and reports `switchErrorMessage` instead of
 *   reloading.
 *
 * Residual: the official `isDomainRestricted` flag (user-scoped domain
 * restriction) has no product endpoint located — the store reports
 * `isDomainRestricted: false` and does not invent a restriction. The
 * single-domain disabled trigger branch in DomainSelect therefore
 * never fires until such an endpoint exists (ADR:2026-11-25-nav-domain-persona).
 */
export const DOMAIN_STORAGE_KEY = 'sm.domain.v1';

export const useDomainStore = defineStore('domain', () => {
  const domains = ref<Domain[]>([]);
  const activeDomainId = ref<string | null>(null);
  const loading = ref(false);
  const errorMessage = ref('');
  const switchErrorMessage = ref('');
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

  /**
   * Navbar domain switch (pin `hooks/useSwitchActiveDomain.ts`): persist
   * the pick as the user's `defaultDomain` (JSON Patch `add`, null
   * clears to All Domains), then mirror it into the local selection so
   * the reloaded page hydrates the same scope. Returns true when the
   * caller should reload; false when the PATCH failed — the selection
   * is untouched and `switchErrorMessage` carries the failure. With no
   * signed-in user id (pin's no-currentUser branch) the pick is local
   * only, and the caller still reloads.
   */
  async function switchDomain(id: string | null): Promise<boolean> {
    switchErrorMessage.value = '';
    const userId = useAuthStore().user?.id;
    if (userId) {
      try {
        // Pin `useSwitchActiveDomain`: JSON Patch `add` upserts
        // `/defaultDomain` — one op covers first-set, change, and
        // clear (null) — through the existing `updateUserDetail`.
        await updateUserDetail(userId, [
          { op: 'add', path: '/defaultDomain', value: id ? { id, type: 'domain' } : null },
        ]);
      } catch (error) {
        switchErrorMessage.value =
          error instanceof Error ? error.message : 'Failed to switch domain';
        return false;
      }
    }
    selectDomain(id);
    return true;
  }

  return {
    domains,
    activeDomainId,
    activeDomain,
    isDomainRestricted,
    loading,
    errorMessage,
    switchErrorMessage,
    loaded,
    hydrate,
    loadDomains,
    selectDomain,
    switchDomain,
  };
});
