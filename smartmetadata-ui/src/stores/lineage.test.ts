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
