/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { describe, expect, it, vi } from 'vitest';
import {
  MAX_EXPLORE_CACHE_ENTRIES,
  STALE_TIME_MS,
  createExploreCache,
} from './exploreCache';

describe('exploreCache (D31: 30s SWR cache, STALE_TIME_MS = 30_000)', () => {
  it('exposes the official 30s staleness window', () => {
    expect(STALE_TIME_MS).toBe(30_000);
  });

  it('serves a fresh entry without reloading', async () => {
    const cache = createExploreCache();
    const load = vi.fn(async () => ({ total: 3 }));
    await expect(cache.getOrLoad('results:q=orders', load)).resolves.toEqual({ total: 3 });
    await expect(cache.getOrLoad('results:q=orders', load)).resolves.toEqual({ total: 3 });
    expect(load).toHaveBeenCalledTimes(1);
    expect(cache.getCached('results:q=orders')?.data).toEqual({ total: 3 });
  });

  it('reloads once the entry is stale', async () => {
    let now = 1_000_000;
    const cache = createExploreCache(() => now);
    const load = vi.fn(async () => 'fresh');
    await expect(cache.getOrLoad('counts:q=orders', load)).resolves.toBe('fresh');
    now += STALE_TIME_MS - 1;
    await expect(cache.getOrLoad('counts:q=orders', load)).resolves.toBe('fresh');
    expect(load).toHaveBeenCalledTimes(1);
    now += 1;
    await expect(cache.getOrLoad('counts:q=orders', load)).resolves.toBe('fresh');
    expect(load).toHaveBeenCalledTimes(2);
    expect(cache.getCached('counts:q=orders')?.data).toBe('fresh');
    now += STALE_TIME_MS;
    expect(cache.getCached('counts:q=orders')).toBeUndefined();
  });

  it('shares one in-flight load between concurrent callers', async () => {
    const cache = createExploreCache();
    const load = vi.fn(
      () =>
        new Promise<string>((resolve) => {
          setTimeout(() => resolve('loaded'), 10);
        }),
    );
    const [first, second] = await Promise.all([
      cache.getOrLoad('results:q=orders', load),
      cache.getOrLoad('results:q=orders', load),
    ]);
    expect(first).toBe('loaded');
    expect(second).toBe('loaded');
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('does not cache a failed load', async () => {
    const cache = createExploreCache();
    const failing = vi.fn(async () => {
      throw new Error('boom');
    });
    await expect(cache.getOrLoad('results:q=orders', failing)).rejects.toThrow('boom');
    const succeeding = vi.fn(async () => 'ok');
    await expect(cache.getOrLoad('results:q=orders', succeeding)).resolves.toBe('ok');
    expect(succeeding).toHaveBeenCalledTimes(1);
  });

  it('evicts the oldest entry past the 60-entry cap', async () => {
    const cache = createExploreCache();
    for (let i = 0; i < MAX_EXPLORE_CACHE_ENTRIES + 1; i++) {
      cache.setCached(`key:${i}`, i);
    }
    expect(cache.getCached(`key:0`)).toBeUndefined();
    expect(cache.getCached(`key:${MAX_EXPLORE_CACHE_ENTRIES}`)?.data).toBe(MAX_EXPLORE_CACHE_ENTRIES);
  });

  it('drops every entry on clear', async () => {
    const cache = createExploreCache();
    const load = vi.fn(async () => 'v');
    await cache.getOrLoad('k', load);
    cache.clear();
    expect(cache.getCached('k')).toBeUndefined();
    await cache.getOrLoad('k', load);
    expect(load).toHaveBeenCalledTimes(2);
  });
});
