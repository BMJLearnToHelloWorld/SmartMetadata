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

export const useShellPreferencesStore = defineStore('shellPreferences', () => {
  const sidebarCollapsed = ref(false);

  function hydrate(): void {
    sidebarCollapsed.value = window.localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === '1';
  }

  function setSidebarCollapsed(value: boolean): void {
    sidebarCollapsed.value = value;
    window.localStorage.setItem(SIDEBAR_COLLAPSED_KEY, value ? '1' : '0');
  }

  return { sidebarCollapsed, hydrate, setSidebarCollapsed };
});
