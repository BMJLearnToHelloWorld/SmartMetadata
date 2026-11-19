/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { apiRequest } from '@/api/client';
import { useShellConfigStore } from './shellConfig';

vi.mock('@/api/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/api/client')>();
  return { ...actual, apiRequest: vi.fn() };
});

const apiRequestMock = apiRequest as unknown as ReturnType<typeof vi.fn>;

describe('shellConfig uiThemePreference slice', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
  });

  it('loads the bare preference through the public config endpoint', async () => {
    apiRequestMock.mockResolvedValue({
      customLogoConfig: { customLogoUrlPath: 'https://example.com/logo.svg' },
      customTheme: { primaryColor: '#112233', hoverColor: '#445566' },
    });
    const store = useShellConfigStore();
    await store.loadUiThemePreference();
    expect(apiRequestMock).toHaveBeenCalledWith(
      '/v1/system/config/customUiThemePreference',
    );
    expect(store.uiThemePreference).toEqual({
      customLogoConfig: { customLogoUrlPath: 'https://example.com/logo.svg' },
      customTheme: { primaryColor: '#112233', hoverColor: '#445566' },
    });
    expect(store.uiThemeLoading).toBe(false);
    expect(store.uiThemeError).toBe('');
  });

  it('fails open to null with the error recorded when the read fails', async () => {
    apiRequestMock.mockRejectedValue(new Error('unreachable'));
    const store = useShellConfigStore();
    await store.loadUiThemePreference();
    expect(store.uiThemePreference).toBeNull();
    expect(store.uiThemeError).toBe('unreachable');
    expect(store.uiThemeLoading).toBe(false);
  });

  it('updates the slice directly from a save payload without fetching', async () => {
    const store = useShellConfigStore();
    store.setUiThemePreference({
      customLogoConfig: {},
      customTheme: { primaryColor: '#005587' },
    });
    expect(store.uiThemePreference?.customTheme?.primaryColor).toBe('#005587');
    expect(apiRequestMock).not.toHaveBeenCalled();
  });
});
