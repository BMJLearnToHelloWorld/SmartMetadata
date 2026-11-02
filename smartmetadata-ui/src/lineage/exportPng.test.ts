/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0.
 */
import { describe, expect, it } from 'vitest';
import {
  computeSafePixelRatio,
  lineagePngFileName,
  shouldIncludeInLineageExport,
} from './exportPng';

describe('lineage PNG export helpers (Fix3)', () => {
  it('targets pixelRatio 2 for ordinary graphs and caps huge ones', () => {
    expect(computeSafePixelRatio(1000, 800)).toBe(2);
    expect(computeSafePixelRatio(20000, 20000)).toBeLessThan(1);
    expect(computeSafePixelRatio(0, 800)).toBe(1);
    expect(computeSafePixelRatio(1000, 0)).toBe(1);
  });

  it('prunes VueFlow chrome and export-hidden subtrees, keeps nodes', () => {
    const background = document.createElement('div');
    background.className = 'vue-flow__background';
    expect(shouldIncludeInLineageExport(background)).toBe(false);
    const controls = document.createElement('div');
    controls.className = 'vue-flow__controls';
    expect(shouldIncludeInLineageExport(controls)).toBe(false);
    const minimap = document.createElement('div');
    minimap.className = 'vue-flow__minimap';
    expect(shouldIncludeInLineageExport(minimap)).toBe(false);
    const hidden = document.createElement('div');
    hidden.dataset.exportHide = 'true';
    expect(shouldIncludeInLineageExport(hidden)).toBe(false);
    const node = document.createElement('div');
    node.className = 'vue-flow__node';
    expect(shouldIncludeInLineageExport(node)).toBe(true);
    const edge = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    expect(shouldIncludeInLineageExport(edge as unknown as Element)).toBe(true);
  });

  it('sanitises the PNG file name the same way the CSV download does', () => {
    expect(lineagePngFileName('table', 'svc.db.schema/orders')).toBe('lineage-table-svc.db.schema_orders.png');
  });
});
