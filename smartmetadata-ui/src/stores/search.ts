/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { ref } from 'vue';
import { defineStore } from 'pinia';
import { getNLPEnabledStatus } from '@/api/search';

/**
 * Search state (Explore D13/D11), mirroring pin
 * `hooks/useSearchStore.ts` (zustand): the NLP toggle in the global
 * search bar and the NLQ request flag the Explore page reads.
 *
 * `initNLP` guards on `isNLPInitialized` (not `isNLPEnabled`), so a
 * `false` response from the server also prevents a redundant second
 * fetch; a failed status call disables NLP instead of breaking the
 * header. `isNLPActive` is the single flag the Explore page reads to
 * route a search through the NLQ path (D11).
 */
export const useSearchStore = defineStore('search', () => {
  const isNLPActive = ref(false);
  const isNLPEnabled = ref(false);
  const isNLPInitialized = ref(false);

  function setNLPActive(active: boolean): void {
    isNLPActive.value = active;
  }

  async function initNLP(): Promise<void> {
    if (isNLPInitialized.value) {
      return;
    }
    const enabled = await getNLPEnabledStatus().catch(() => false);
    isNLPEnabled.value = enabled;
    isNLPInitialized.value = true;
  }

  return { isNLPActive, isNLPEnabled, isNLPInitialized, setNLPActive, initNLP };
});
