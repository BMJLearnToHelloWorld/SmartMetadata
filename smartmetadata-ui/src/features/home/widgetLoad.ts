/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { onMounted, ref, watch, type Ref } from 'vue';

/**
 * Shared load primitive for the My Data widgets (REVIEW-W2-G11-BC
 * condition 6): each widget keeps its own composable (its own key,
 * loader and shape), and every composable reads through this one
 * cache — a ref plus a TTL-equivalent stale window, keep-previous-data
 * across refetches, and no vue-query. The cache is bounded (100
 * entries, oldest evicted first); an unbounded module-level Map would
 * grow with every distinct widget key and filter combination.
 * ADR:2026-11-08-my-data-widget-load-cache
 */
export const WIDGET_LOAD_TTL_MS = 5 * 60 * 1000;
const WIDGET_LOAD_CACHE_MAX_ENTRIES = 100;

interface CacheEntry {
  data: unknown;
  fetchedAt: number;
}

const cache = new Map<string, CacheEntry>();
const pending = new Map<string, Promise<unknown>>();

function cacheGet(key: string, ttlMs: number): unknown | undefined {
  const entry = cache.get(key);
  if (!entry) {
    return undefined;
  }
  if (Date.now() - entry.fetchedAt > ttlMs) {
    cache.delete(key);
    return undefined;
  }
  return entry.data;
}

function cacheSet(key: string, data: unknown): void {
  if (cache.size >= WIDGET_LOAD_CACHE_MAX_ENTRIES && !cache.has(key)) {
    const oldest = cache.keys().next();
    if (!oldest.done) {
      cache.delete(oldest.value);
    }
  }
  cache.set(key, { data, fetchedAt: Date.now() });
}

/**
 * Drop every cached page and in-flight join. The permission store
 * calls this at a login boundary: the cache is keyed by widget, not
 * by principal, so without it a logout/login switch would serve the
 * previous viewer's rows to the next one.
 */
export function resetWidgetLoadCache(): void {
  cache.clear();
  pending.clear();
}

export interface WidgetLoadResult<T> {
  data: Ref<T | undefined>;
  isLoading: Ref<boolean>;
  isFetching: Ref<boolean>;
  isError: Ref<boolean>;
  dataUpdatedAt: Ref<number>;
  refetch: () => Promise<void>;
}

export function useWidgetLoad<T>(
  key: string | Ref<string>,
  loader: () => Promise<T>,
  options: { ttlMs?: number; enabled?: Ref<boolean> } = {},
): WidgetLoadResult<T> {
  const ttlMs = options.ttlMs ?? WIDGET_LOAD_TTL_MS;
  const enabled = options.enabled;
  const keyRef = typeof key === 'string' ? ref(key) : key;
  const data = ref<T | undefined>(undefined) as Ref<T | undefined>;
  const isLoading = ref(false);
  const isFetching = ref(false);
  const isError = ref(false);
  const dataUpdatedAt = ref(0);

  async function fetchData(force: boolean): Promise<void> {
    if (enabled && !enabled.value) {
      return;
    }
    const cacheKey = keyRef.value;
    if (!force) {
      const cached = cacheGet(cacheKey, ttlMs) as T | undefined;
      if (cached !== undefined) {
        data.value = cached;
        return;
      }
    }
    const inFlight = pending.get(cacheKey) as Promise<T> | undefined;
    if (inFlight) {
      isFetching.value = true;
      try {
        data.value = await inFlight;
        dataUpdatedAt.value = Date.now();
        isError.value = false;
      } catch {
        isError.value = true;
      } finally {
        isFetching.value = false;
        isLoading.value = false;
      }
      return;
    }
    const hadData = data.value !== undefined;
    isFetching.value = true;
    isLoading.value = !hadData;
    const promise = loader();
    pending.set(cacheKey, promise);
    try {
      const loaded = await promise;
      cacheSet(cacheKey, loaded);
      data.value = loaded;
      dataUpdatedAt.value = Date.now();
      isError.value = false;
    } catch {
      // Keep the previous data on a refetch failure: the card shows
      // the stale rows with a retry, never a blank card for a
      // transient failure.
      isError.value = true;
    } finally {
      pending.delete(cacheKey);
      isFetching.value = false;
      isLoading.value = false;
    }
  }

  async function refetch(): Promise<void> {
    await fetchData(true);
  }

  onMounted(() => {
    void fetchData(false);
  });

  if (enabled) {
    watch(enabled, (next) => {
      if (next) {
        void fetchData(false);
      }
    });
  }

  if (typeof key !== 'string') {
    watch(keyRef, () => {
      // A new key is new data, not a refetch: drop the previous key's
      // rows so a bucket switch shows its skeleton, never the other
      // bucket's rows.
      data.value = undefined;
      void fetchData(false);
    });
  }

  return { data, isLoading, isFetching, isError, dataUpdatedAt, refetch };
}
