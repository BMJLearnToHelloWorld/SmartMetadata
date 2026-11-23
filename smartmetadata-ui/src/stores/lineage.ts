/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0.
 */

import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import {
  DEFAULT_LINEAGE_CANVAS_CONFIG,
  normalizeLineageCanvasConfig,
  type LineageCanvasConfig,
  type LineageLayer,
} from '@/lineage/config';
import {
  LINEAGE_PLATFORM_VIEW_NONE,
  type LineagePlatformView,
} from '@/lineage/layers';
import {
  EMPTY_LINEAGE_QUICK_FILTERS,
  normalizeLineageQuickFilters,
  type LineageQuickFilterSelection,
} from '@/lineage/quickFilters';

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
  /**
   * Quick-filter selections (domains/owners/tag/column), mirroring pin
   * `useLineageStore.selectedQuickFilters`. In-memory only, like pin: a
   * filter is a fetch-time selection, not a persisted preference.
   */
  const quickFilters = ref<LineageQuickFilterSelection[]>([...EMPTY_LINEAGE_QUICK_FILTERS]);
  /**
   * Layers-panel state, mirroring pin `useLineageStore` (`activeLayer`,
   * `platformView`, `isColumnLevelLineage`, `isDQEnabled`): overlays are
   * multi-select, platform views are one at a time and re-center the
   * graph on the container entity. The settings `lineageLayer` seeds
   * `activeLayer` (see the canvas `applyShellDefaults`); the panel is
   * the only writer after that. In-memory only, like pin.
   */
  const activeLayer = ref<LineageLayer[]>([]);
  const platformView = ref<LineagePlatformView>(LINEAGE_PLATFORM_VIEW_NONE);
  const isColumnLevelLineage = computed(() => activeLayer.value.includes('ColumnLevelLineage'));
  const isDQEnabled = computed(() => activeLayer.value.includes('DataObservability'));

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

  function setQuickFilters(next: LineageQuickFilterSelection[]): void {
    quickFilters.value = normalizeLineageQuickFilters(next);
  }

  /**
   * Pin `useLineageStore.setActiveLayer`: selecting an overlay clears any
   * platform view (the graph goes back to the asset view). Pin also clears
   * traced columns when the column layer leaves; the product keeps no
   * traced-columns store, so there is nothing to clear here.
   */
  function setActiveLayer(next: LineageLayer[]): void {
    const deduped = [...new Set(next)];
    if (
      deduped.includes('ColumnLevelLineage') ||
      deduped.includes('DataObservability')
    ) {
      platformView.value = LINEAGE_PLATFORM_VIEW_NONE;
    }
    activeLayer.value = deduped;
  }

  /** Pin `useLineageStore.updateActiveLayer`: union layers in, never out. */
  function updateActiveLayer(layer: LineageLayer | LineageLayer[]): void {
    // Unlike setActiveLayer, pin's update path does NOT reset the platform
    // view — it only unions the layers in.
    activeLayer.value = [
      ...new Set([...activeLayer.value, ...(Array.isArray(layer) ? layer : [layer])]),
    ];
  }

  /** Pin `useLineageStore.setPlatformView`. */
  function setPlatformView(next: LineagePlatformView): void {
    platformView.value = next;
  }

  return {
    config,
    hydrated,
    hydrate,
    applyDefaults,
    update,
    quickFilters,
    setQuickFilters,
    activeLayer,
    platformView,
    isColumnLevelLineage,
    isDQEnabled,
    setActiveLayer,
    updateActiveLayer,
    setPlatformView,
  };
});
