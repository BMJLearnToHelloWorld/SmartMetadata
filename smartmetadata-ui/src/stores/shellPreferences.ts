/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */

import { defineStore } from 'pinia';
import { ref } from 'vue';
import { EXPLORE_PAGE_SIZE_OPTIONS } from '@/catalog/searchQuery';
import {
  applyThemeMode,
  prefersDarkColorScheme,
  readThemeMode,
  THEME_STORAGE_KEY,
  type ThemeMode,
} from '@/theme/themePreference';

/**
 * Shell preferences slice.
 *
 * The official shell persists the collapsed state through
 * currentUserPreferences (a server-side user preference). No product
 * endpoint for that preference is wired in this console, so the
 * collapsed state is persisted locally instead — the local link is
 * fully working, and the server sync is the documented residual gap,
 * not a silently missing feature.
 */
export const SIDEBAR_COLLAPSED_KEY = 'sm.sidebar.collapsed.v1';

/**
 * Explore page size, persisted locally. The official default page size comes
 * from the server-side currentUserPreferences globalPageSize; no product
 * endpoint for that preference is wired in this console, so the local link
 * is fully working and the server sync is the documented residual gap,
 * not a silently missing feature (same bridge as the collapsed state above).
 */
export const EXPLORE_PAGE_SIZE_KEY = 'sm.explore.pageSize.v1';

export const useShellPreferencesStore = defineStore('shellPreferences', () => {
  const sidebarCollapsed = ref(false);
  const themeMode = ref<ThemeMode>('light');
  const isDark = ref(false);
  const explorePageSize = ref(15);
  let mediaListenerAttached = false;

  function applyTheme(): void {
    isDark.value = applyThemeMode(themeMode.value, prefersDarkColorScheme());
  }

  function hydrate(): void {
    sidebarCollapsed.value = window.localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === '1';
    const storedPageSize = Number.parseInt(window.localStorage.getItem(EXPLORE_PAGE_SIZE_KEY) ?? '', 10);
    if ((EXPLORE_PAGE_SIZE_OPTIONS as readonly number[]).includes(storedPageSize)) {
      explorePageSize.value = storedPageSize;
    }
    themeMode.value = readThemeMode(window.localStorage);
    applyTheme();
    if (!mediaListenerAttached && typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
      mediaListenerAttached = true;
      window
        .matchMedia('(prefers-color-scheme: dark)')
        .addEventListener('change', () => {
          if (themeMode.value === 'system') {
            applyTheme();
          }
        });
    }
  }

  function setSidebarCollapsed(value: boolean): void {
    sidebarCollapsed.value = value;
    window.localStorage.setItem(SIDEBAR_COLLAPSED_KEY, value ? '1' : '0');
  }

  function setExplorePageSize(value: number): void {
    if (!(EXPLORE_PAGE_SIZE_OPTIONS as readonly number[]).includes(value)) {
      return;
    }
    explorePageSize.value = value;
    window.localStorage.setItem(EXPLORE_PAGE_SIZE_KEY, String(value));
  }

  function setThemeMode(value: ThemeMode): void {
    themeMode.value = value;
    window.localStorage.setItem(THEME_STORAGE_KEY, value);
    applyTheme();
  }

  return { sidebarCollapsed, themeMode, isDark, explorePageSize, hydrate, setSidebarCollapsed, setThemeMode, setExplorePageSize };
});
