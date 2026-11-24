/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */

/**
 * Explore search cache, mirroring official `hooks/useExploreCache.ts`:
 * a bounded, timestamped store shared by the results and counts
 * requests of one Explore session. Official `STALE_TIME_MS = 30_000`
 * (`useExploreCache.ts:39`) and `MAX_ENTRIES = 60` (`:38`) are kept
 * verbatim.
 *
 * One deliberate adaptation: official `getOrLoad` re-loads when the
 * cached promise is older than 2s (`useExploreCache.ts:85-104`) — a
 * dedupe window, not a freshness window — while `getCached` honours
 * the 30s staleness. This lane's brief defines D31 as a 30s SWR result
 * cache, so `getOrLoad` here serves a fresh (< 30s) entry and only
 * loads on a miss or a stale entry; concurrent loads for one key share
 * a single in-flight promise. `clearCache` (logout / user switch in
 * official) is `clear()`.
 */
export const STALE_TIME_MS = 30_000;

export const MAX_EXPLORE_CACHE_ENTRIES = 60;

export interface ExploreCacheEntry<T = unknown> {
  data: T;
  timestamp: number;
}

export class ExploreCache {
  private readonly entries = new Map<string, ExploreCacheEntry>();
  private readonly pending = new Map<string, Promise<unknown>>();
  private readonly now: () => number;

  constructor(now: () => number = Date.now) {
    this.now = now;
  }

  private isFresh(entry: ExploreCacheEntry): boolean {
    return this.now() - entry.timestamp < STALE_TIME_MS;
  }

  /** Read a cached entry. Returns undefined when absent or stale. */
  getCached<T = unknown>(key: string): ExploreCacheEntry<T> | undefined {
    const entry = this.entries.get(key) as ExploreCacheEntry<T> | undefined;
    if (!entry || !this.isFresh(entry)) {
      return undefined;
    }
    return entry;
  }

  /** Write a new entry under `key`, evicting the oldest past capacity. */
  setCached<T = unknown>(key: string, data: T): void {
    this.entries.delete(key);
    this.entries.set(key, { data, timestamp: this.now() });
    if (this.entries.size > MAX_EXPLORE_CACHE_ENTRIES) {
      const oldest = this.entries.keys().next().value;
      if (oldest !== undefined) {
        this.entries.delete(oldest);
      }
    }
  }

  /**
   * Serve the fresh cached value for `key`, or load it once and cache
   * the result. Concurrent callers for one key share the in-flight
   * promise; a failed load is not cached.
   */
  getOrLoad<T>(key: string, load: () => Promise<T>): Promise<T> {
    const cached = this.getCached<T>(key);
    if (cached) {
      return Promise.resolve(cached.data);
    }
    const inFlight = this.pending.get(key) as Promise<T> | undefined;
    if (inFlight) {
      return inFlight;
    }
    const pending = load().then(
      (data) => {
        this.setCached(key, data);
        this.pending.delete(key);
        return data;
      },
      (error) => {
        this.pending.delete(key);
        throw error;
      },
    );
    this.pending.set(key, pending);
    return pending;
  }

  /** Drop every entry. Call on logout / user switch / explicit refresh. */
  clear(): void {
    this.entries.clear();
    this.pending.clear();
  }
}

/** Create the cache for one mounted Explore view. */
export function createExploreCache(now?: () => number): ExploreCache {
  return new ExploreCache(now);
}
