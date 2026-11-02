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
import { useDomainStore, DOMAIN_STORAGE_KEY } from './domain';
import { useShellConfigStore, stripSnapshot } from './shellConfig';
import { useShellPreferencesStore, SIDEBAR_COLLAPSED_KEY } from './shellPreferences';

function jsonResponse(payload: unknown) {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('shell stores (Stage 1)', () => {
  beforeEach(() => {
    localStorage.clear();
    setActivePinia(createPinia());
    persistSession(localStorage, { accessToken: 'tok', tokenType: 'Bearer' });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it('persists the theme mode and applies dark to the document root', () => {
    const store = useShellPreferencesStore();
    store.setThemeMode('dark');
    expect(localStorage.getItem('sm.theme.v1')).toBe('dark');
    expect(store.isDark).toBe(true);
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    store.setThemeMode('light');
    expect(store.isDark).toBe(false);
    expect(document.documentElement.getAttribute('data-theme')).toBeNull();
  });

  it('strips -SNAPSHOT from the server version', () => {
    expect(stripSnapshot('1.5.0-SNAPSHOT')).toBe('1.5.0');
    expect(stripSnapshot('1.5.0')).toBe('1.5.0');
  });

  it('loads domains, persists the active domain, and clears a stale one', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({
      data: [{ id: 'd1', name: 'Marketing' }],
      paging: { total: 1 },
    })));
    const store = useDomainStore();
    store.selectDomain('d1');
    expect(localStorage.getItem(DOMAIN_STORAGE_KEY)).toBe('d1');
    await store.loadDomains();
    expect(store.activeDomain?.name).toBe('Marketing');
    expect(store.isDomainRestricted).toBe(false);
    store.selectDomain(null);
    expect(localStorage.getItem(DOMAIN_STORAGE_KEY)).toBeNull();
  });

  it('keeps domain scope at All Domains when the domain list fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('down'); }));
    const store = useDomainStore();
    await store.loadDomains();
    expect(store.domains).toEqual([]);
    expect(store.activeDomainId).toBeNull();
    expect(store.errorMessage).toBe('down');
  });

  it('persists sidebar collapse locally and reports no limit endpoint', () => {
    const prefs = useShellPreferencesStore();
    prefs.setSidebarCollapsed(true);
    expect(localStorage.getItem(SIDEBAR_COLLAPSED_KEY)).toBe('1');
    prefs.hydrate();
    expect(prefs.sidebarCollapsed).toBe(true);
    const config = useShellConfigStore();
    expect(config.limit).toBeNull();
  });

  it('caches the server version for an hour and reloads after expiry', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ version: '1.5.0-SNAPSHOT' }));
    vi.stubGlobal('fetch', fetchMock);
    const config = useShellConfigStore();
    await config.loadVersion();
    expect(config.displayVersion).toBe('1.5.0');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await config.loadVersion();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await config.loadVersion(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
