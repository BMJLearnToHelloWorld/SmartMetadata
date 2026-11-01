/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0.
 */

import { defineStore } from 'pinia';
import { ref } from 'vue';
import {
  DEFAULT_LINEAGE_CANVAS_CONFIG,
  normalizeLineageCanvasConfig,
  type LineageCanvasConfig,
} from '@/lineage/config';

/**
 * Canvas session configuration. This is deliberately separate from the
 * server lineageSettings edited on the settings page (shellConfig store):
 * the canvas modal edits the session that drives the next fetch, while
 * the settings page remains the stored default. Nothing here writes
 * back to /v1/system/settings/lineageSettings, so the split is explicit
 * rather than a silent half-sync.
 */
export const LINEAGE_CONFIG_STORAGE_KEY = 'sm.lineage.config.v1';

export const useLineageStore = defineStore('lineage', () => {
  const config = ref<LineageCanvasConfig>({ ...DEFAULT_LINEAGE_CANVAS_CONFIG });
  const hydrated = ref(false);
  const hasStoredConfig = ref(false);

  function hydrate(): void {
    if (hydrated.value) {
      return;
    }
    hydrated.value = true;
    try {
      const raw = window.localStorage.getItem(LINEAGE_CONFIG_STORAGE_KEY);
      if (raw) {
        config.value = normalizeLineageCanvasConfig(JSON.parse(raw));
        hasStoredConfig.value = true;
      }
    } catch {
      config.value = { ...DEFAULT_LINEAGE_CANVAS_CONFIG };
    }
  }

  function persist(): void {
    try {
      window.localStorage.setItem(LINEAGE_CONFIG_STORAGE_KEY, JSON.stringify(config.value));
    } catch {
      // A full or unavailable storage must not break the canvas.
    }
  }

  function applyDefaults(defaults: Partial<LineageCanvasConfig>): void {
    hydrate();
    // A stored session config wins over server defaults; defaults only
    // fill a first-run canvas, they never overwrite a saved session.
    if (hasStoredConfig.value) {
      return;
    }
    config.value = normalizeLineageCanvasConfig({ ...config.value, ...defaults });
    persist();
  }

  function update(next: Partial<LineageCanvasConfig>): void {
    config.value = normalizeLineageCanvasConfig({ ...config.value, ...next });
    persist();
  }

  return { config, hydrated, hydrate, applyDefaults, update };
});
