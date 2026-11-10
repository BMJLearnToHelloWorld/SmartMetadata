/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may
 * not use this file except in compliance with the License. You may obtain
 * a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { ref } from 'vue';
import { defineStore } from 'pinia';

/**
 * The welcome-screen visibility flag, mirroring the official
 * `useWelcomeStore`: visible until something dismisses it. The
 * first-login hook reads it; the welcome screen's close action clears
 * it. It defaults to true and is session-scoped (never persisted) —
 * the server-side `isFirstTimeUser` flag is what makes the welcome
 * once-per-user.
 */
export const useWelcomeStore = defineStore('welcome', () => {
  const isWelcomeVisible = ref(true);

  function setIsWelcomeVisible(isVisible: boolean): void {
    isWelcomeVisible.value = isVisible;
  }

  return { isWelcomeVisible, setIsWelcomeVisible };
});
