/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { LINEAGE_CONFIG_STORAGE_KEY, useLineageStore } from './lineage';

beforeEach(() => {
  setActivePinia(createPinia());
  window.localStorage.clear();
});

describe('lineage store', () => {
  it('persists session config and rehydrates it', () => {
    const store = useLineageStore();
    store.update({ upstreamDepth: 2, layer: 'ColumnLevelLineage', nodesPerLayer: 25 });
    expect(window.localStorage.getItem(LINEAGE_CONFIG_STORAGE_KEY)).toContain('"nodesPerLayer":25');

    setActivePinia(createPinia());
    const rehydrated = useLineageStore();
    rehydrated.hydrate();
    expect(rehydrated.config.layer).toBe('ColumnLevelLineage');
    expect(rehydrated.config.upstreamDepth).toBe(2);
  });

  it('does not let server defaults overwrite a stored session config', () => {
    const store = useLineageStore();
    store.update({ downstreamDepth: 3 });
    const next = useLineageStore();
    next.applyDefaults({ downstreamDepth: 1 });
    expect(next.config.downstreamDepth).toBe(3);
  });

  it('applies server defaults on a first-run canvas', () => {
    const store = useLineageStore();
    store.applyDefaults({ upstreamDepth: 2, downstreamDepth: 2 });
    expect(store.config.upstreamDepth).toBe(2);
    expect(store.config.downstreamDepth).toBe(2);
  });
});

describe('lineage store layers (pin useLineageStore activeLayer/platformView)', () => {
  it('starts with no overlays, platform view None, both derived flags off', () => {
    const store = useLineageStore();
    expect(store.activeLayer).toEqual([]);
    expect(store.platformView).toBe('None');
    expect(store.isColumnLevelLineage).toBe(false);
    expect(store.isDQEnabled).toBe(false);
  });

  it('setActiveLayer derives the flags and clears a platform view when an overlay is picked', () => {
    const store = useLineageStore();
    store.setPlatformView('Service');
    store.setActiveLayer(['ColumnLevelLineage']);
    expect(store.platformView).toBe('None');
    expect(store.isColumnLevelLineage).toBe(true);
    expect(store.isDQEnabled).toBe(false);
    store.setActiveLayer(['DataObservability']);
    expect(store.isColumnLevelLineage).toBe(false);
    expect(store.isDQEnabled).toBe(true);
    store.setActiveLayer(['ColumnLevelLineage', 'DataObservability', 'ColumnLevelLineage']);
    expect(store.activeLayer).toEqual(['ColumnLevelLineage', 'DataObservability']);
  });

  it('updateActiveLayer unions layers in without touching the platform view', () => {
    const store = useLineageStore();
    store.setPlatformView('Domain');
    store.updateActiveLayer('ColumnLevelLineage');
    store.updateActiveLayer(['DataObservability', 'ColumnLevelLineage']);
    expect(store.activeLayer).toEqual(['ColumnLevelLineage', 'DataObservability']);
    expect(store.platformView).toBe('Domain');
    expect(store.isDQEnabled).toBe(true);
  });

  it('setPlatformView only changes the view', () => {
    const store = useLineageStore();
    store.setActiveLayer(['DataObservability']);
    store.setPlatformView('DataProduct');
    expect(store.platformView).toBe('DataProduct');
    expect(store.activeLayer).toEqual(['DataObservability']);
  });
});
