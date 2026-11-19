/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { persistSession } from '@/auth/token';
import { useShellConfigStore, VERSION_CACHE_TTL_MS } from './shellConfig';

function jsonResponse(payload: unknown) {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('shellConfig version-mismatch check (pin NavBar :320-340)', () => {
  let now = 1_700_000_000_000;
  let nowSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    localStorage.clear();
    setActivePinia(createPinia());
    persistSession(localStorage, { accessToken: 'tok', tokenType: 'Bearer' });
    now = 1_700_000_000_000;
    nowSpy = vi.spyOn(Date, 'now').mockImplementation(() => now);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    nowSpy.mockRestore();
    localStorage.clear();
  });

  it('skips the re-fetch within an hour of the last fetch', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ version: '1.5.0' }));
    vi.stubGlobal('fetch', fetchMock);
    const config = useShellConfigStore();
    await config.loadVersion();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await config.checkVersionMismatch();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(config.versionMismatch).toBe(false);
  });

  it('sets the mismatch flag when the re-fetch after expiry returns a different version', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ version: '1.5.0' }));
    vi.stubGlobal('fetch', fetchMock);
    const config = useShellConfigStore();
    await config.loadVersion();
    now += VERSION_CACHE_TTL_MS + 1000;
    fetchMock.mockResolvedValueOnce(jsonResponse({ version: '1.6.0' }));
    await config.checkVersionMismatch();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(config.displayVersion).toBe('1.6.0');
    expect(config.versionMismatch).toBe(true);
  });

  it('does not flag a mismatch when the re-fetched version is unchanged', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ version: '1.5.0' }));
    vi.stubGlobal('fetch', fetchMock);
    const config = useShellConfigStore();
    await config.loadVersion();
    now += VERSION_CACHE_TTL_MS + 1000;
    await config.checkVersionMismatch();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(config.versionMismatch).toBe(false);
  });

  it('does not flag a mismatch on the first load, when no version was seen before', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ version: '1.5.0' }));
    vi.stubGlobal('fetch', fetchMock);
    const config = useShellConfigStore();
    await config.checkVersionMismatch();
    expect(config.displayVersion).toBe('1.5.0');
    expect(config.versionMismatch).toBe(false);
  });

  it('compares versions after stripping -SNAPSHOT', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ version: '1.5.0-SNAPSHOT' }));
    vi.stubGlobal('fetch', fetchMock);
    const config = useShellConfigStore();
    await config.loadVersion();
    expect(config.displayVersion).toBe('1.5.0');
    now += VERSION_CACHE_TTL_MS + 1000;
    fetchMock.mockResolvedValueOnce(jsonResponse({ version: '1.5.0' }));
    await config.checkVersionMismatch();
    expect(config.versionMismatch).toBe(false);
  });

  it('leaves the flag clear and retries later when the re-fetch fails', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ version: '1.5.0' }));
    vi.stubGlobal('fetch', fetchMock);
    const config = useShellConfigStore();
    await config.loadVersion();
    now += VERSION_CACHE_TTL_MS + 1000;
    fetchMock.mockRejectedValueOnce(new Error('down'));
    await config.checkVersionMismatch();
    expect(config.versionMismatch).toBe(false);
    expect(config.displayVersion).toBe('1.5.0');
    fetchMock.mockResolvedValueOnce(jsonResponse({ version: '1.6.0' }));
    await config.checkVersionMismatch();
    expect(config.versionMismatch).toBe(true);
  });
});
