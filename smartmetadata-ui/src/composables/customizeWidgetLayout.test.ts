/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may
 * not use this file except in compliance with the License. You may obtain
 * a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { describe, expect, it } from 'vitest';
import type { PersonaPage } from '@/types/persona';
import { getDefaultWidgetForTab } from '@/views/admin/persona/editors/customizePageData';
import type { WidgetConfig } from '@/views/admin/persona/editors/customizeTypes';
import {
  getLayoutFromCustomizedPage,
  resolveWidgetLayout,
} from './customizeWidgetLayout';

function widget(i: string, overrides: Partial<WidgetConfig> = {}): WidgetConfig {
  return { i, x: 0, y: 0, w: 6, h: 2, ...overrides };
}

function pageWithTabs(tabs: unknown): PersonaPage {
  return { pageType: 'Table', tabs } as unknown as PersonaPage;
}

describe('getLayoutFromCustomizedPage', () => {
  it('returns the default layout when there is no customized page', () => {
    expect(getLayoutFromCustomizedPage('Table', 'schema', null)).toEqual(
      getDefaultWidgetForTab('Table', 'schema'),
    );
    expect(getLayoutFromCustomizedPage('Table', 'schema', undefined)).toEqual(
      getDefaultWidgetForTab('Table', 'schema'),
    );
    expect(getLayoutFromCustomizedPage('Table', 'overview', null)).toEqual([]);
  });

  it('returns the default layout for a version view even with stored tabs', () => {
    const stored = [widget('KnowledgePanel.Description')];
    const page = pageWithTabs([{ id: 'schema', layout: stored }]);
    expect(getLayoutFromCustomizedPage('Table', 'schema', page, true)).toEqual(
      getDefaultWidgetForTab('Table', 'schema'),
    );
  });

  it('returns the matching tab entry layout, found by id only', () => {
    const schemaLayout = [widget('KnowledgePanel.TableSchema')];
    const page = pageWithTabs([
      { id: 'overview', name: 'schema', layout: [widget('KnowledgePanel.Description')] },
      { id: 'schema', layout: schemaLayout },
    ]);
    expect(getLayoutFromCustomizedPage('Table', 'schema', page)).toBe(schemaLayout);
  });

  it('returns undefined when the tab is not found', () => {
    const page = pageWithTabs([{ id: 'schema', layout: [widget('KnowledgePanel.TableSchema')] }]);
    expect(getLayoutFromCustomizedPage('Table', 'lineage', page)).toBeUndefined();
  });

  it('returns undefined when the found entry has no layout', () => {
    const page = pageWithTabs([{ id: 'schema' }]);
    expect(getLayoutFromCustomizedPage('Table', 'schema', page)).toBeUndefined();
  });

  it('returns the stored layout as-is when it is not an array', () => {
    const stored = { widgets: ['KnowledgePanel.Description'] };
    const page = pageWithTabs([{ id: 'schema', layout: stored }]);
    expect(getLayoutFromCustomizedPage('Table', 'schema', page)).toBe(stored);
  });

  it('returns an empty layout as-is', () => {
    const page = pageWithTabs([{ id: 'schema', layout: [] }]);
    expect(getLayoutFromCustomizedPage('Table', 'schema', page)).toEqual([]);
  });

  it('returns the first tab layout when no tab is given', () => {
    const firstLayout = [widget('KnowledgePanel.Description')];
    const page = pageWithTabs([
      { id: 'schema', layout: firstLayout },
      { id: 'lineage', layout: [widget('KnowledgePanel.TableSchema')] },
    ]);
    expect(getLayoutFromCustomizedPage('Table', undefined, page)).toBe(firstLayout);
  });

  it('returns [] when the first tab has no layout and no tab is given', () => {
    const page = pageWithTabs([{ id: 'schema' }, { id: 'lineage', layout: [] }]);
    expect(getLayoutFromCustomizedPage('Table', undefined, page)).toEqual([]);
  });

  it('treats an empty-string tab like no tab (official truthiness)', () => {
    const firstLayout = [widget('KnowledgePanel.Description')];
    const page = pageWithTabs([{ id: 'schema', layout: firstLayout }]);
    expect(getLayoutFromCustomizedPage('Table', '', page)).toBe(firstLayout);
  });

  it('returns the default layout when tabs are absent or empty', () => {
    expect(
      getLayoutFromCustomizedPage('Table', 'schema', { pageType: 'Table' } as PersonaPage),
    ).toEqual(getDefaultWidgetForTab('Table', 'schema'));
    expect(getLayoutFromCustomizedPage('Table', 'schema', pageWithTabs([]))).toEqual(
      getDefaultWidgetForTab('Table', 'schema'),
    );
  });

  it('returns the default layout when tabs are not an array', () => {
    expect(getLayoutFromCustomizedPage('Table', 'schema', pageWithTabs({ id: 'schema' }))).toEqual(
      getDefaultWidgetForTab('Table', 'schema'),
    );
    expect(getLayoutFromCustomizedPage('Table', 'schema', pageWithTabs('schema'))).toEqual(
      getDefaultWidgetForTab('Table', 'schema'),
    );
    expect(getLayoutFromCustomizedPage('Table', 'schema', pageWithTabs(3))).toEqual(
      getDefaultWidgetForTab('Table', 'schema'),
    );
  });

  it('skips non-object tab entries when finding by id', () => {
    const schemaLayout = [widget('KnowledgePanel.TableSchema')];
    const page = pageWithTabs([null, 'schema', { id: 'schema', layout: schemaLayout }]);
    expect(getLayoutFromCustomizedPage('Table', 'schema', page)).toBe(schemaLayout);
  });

  it('returns [] for a null first entry when no tab is given', () => {
    const page = pageWithTabs([null, { id: 'schema', layout: [widget('KnowledgePanel.Tags')] }]);
    expect(getLayoutFromCustomizedPage('Table', undefined, page)).toEqual([]);
  });

  it('returns [] for an undefined tab with no page (product lookup has no falsy-tab branch)', () => {
    // Official getDefaultLayout treats a falsy tab as the primary tab;
    // the product getDefaultWidgetForTab has no such branch, so the
    // '' sentinel yields []. Recorded as a residual on the shared
    // lookup; callers pass their active tab id.
    expect(getLayoutFromCustomizedPage('Table', undefined, null)).toEqual([]);
    expect(getLayoutFromCustomizedPage('GlossaryTerm', undefined, null)).toEqual([]);
  });
});

describe('resolveWidgetLayout', () => {
  it('returns the resolved array layout', () => {
    const stored = [widget('KnowledgePanel.Description')];
    const page = pageWithTabs([{ id: 'schema', layout: stored }]);
    expect(resolveWidgetLayout('Table', 'schema', page)).toBe(stored);
  });

  it('coerces a missing tab to an empty grid, never a default', () => {
    const page = pageWithTabs([{ id: 'schema', layout: [widget('KnowledgePanel.TableSchema')] }]);
    expect(resolveWidgetLayout('Table', 'lineage', page)).toEqual([]);
  });

  it('coerces a missing layout to an empty grid', () => {
    const page = pageWithTabs([{ id: 'schema' }]);
    expect(resolveWidgetLayout('Table', 'schema', page)).toEqual([]);
  });

  it('coerces a non-array stored layout to an empty grid', () => {
    const page = pageWithTabs([{ id: 'schema', layout: { widgets: [] } }]);
    expect(resolveWidgetLayout('Table', 'schema', page)).toEqual([]);
    const nullLayout = pageWithTabs([{ id: 'schema', layout: null }]);
    expect(resolveWidgetLayout('Table', 'schema', nullLayout)).toEqual([]);
  });

  it('returns the default layout when there is no page or tabs', () => {
    expect(resolveWidgetLayout('Table', 'schema', null)).toEqual(
      getDefaultWidgetForTab('Table', 'schema'),
    );
    expect(resolveWidgetLayout('Table', 'schema', pageWithTabs([]))).toEqual(
      getDefaultWidgetForTab('Table', 'schema'),
    );
    expect(resolveWidgetLayout('Table', 'schema', pageWithTabs('schema'))).toEqual(
      getDefaultWidgetForTab('Table', 'schema'),
    );
  });

  it('returns the default layout for a version view', () => {
    const page = pageWithTabs([{ id: 'schema', layout: [widget('KnowledgePanel.Description')] }]);
    expect(resolveWidgetLayout('Table', 'schema', page, true)).toEqual(
      getDefaultWidgetForTab('Table', 'schema'),
    );
  });

  it('returns the first tab layout when no tab is given', () => {
    const firstLayout = [widget('KnowledgePanel.Description')];
    const page = pageWithTabs([{ id: 'schema', layout: firstLayout }]);
    expect(resolveWidgetLayout('Table', undefined, page)).toBe(firstLayout);
  });

  it('drops null, non-object, and missing-i entries without mutating the stored layout', () => {
    const stored = [
      null,
      'KnowledgePanel.Description',
      { x: 0, y: 0, w: 2, h: 1 },
      widget('KnowledgePanel.Description'),
    ];
    const snapshot = JSON.parse(JSON.stringify(stored));
    const page = pageWithTabs([{ id: 'schema', layout: stored }]);
    expect(resolveWidgetLayout('Table', 'schema', page)).toEqual([
      widget('KnowledgePanel.Description'),
    ]);
    expect(stored).toEqual(snapshot);
  });

  it('clamps top-level geometry to the 8-column grid and preserves fractions', () => {
    const stored = [
      widget('a', { x: -2, w: 3 }),
      widget('b', { x: 9, w: 4 }),
      widget('c', { x: 6, w: 5 }),
      widget('d', { x: 0.5, w: 2.5 }),
      widget('e', { w: 0 }),
    ];
    const page = pageWithTabs([{ id: 'schema', layout: stored }]);
    const resolved = resolveWidgetLayout('Table', 'schema', page);
    expect(resolved.map((entry) => [entry.i, entry.x, entry.w])).toEqual([
      ['a', 0, 3],
      ['b', 7, 1],
      ['c', 6, 2],
      ['d', 0.5, 2.5],
      ['e', 0, 1],
    ]);
    // The stored layout is never mutated: fixes land on copies.
    expect(stored[1]).toMatchObject({ x: 9, w: 4 });
  });

  it('sanitizes non-finite or missing geometry to defaults', () => {
    const stored = [
      { i: 'a', x: Number.NaN, y: Number.NaN, w: Number.NaN, h: Number.NaN },
      { i: 'b' },
      { i: 'c', x: 'left', y: 'top', w: 'wide', h: 'tall' },
    ];
    const page = pageWithTabs([{ id: 'schema', layout: stored }]);
    expect(resolveWidgetLayout('Table', 'schema', page)).toEqual([
      { i: 'a', x: 0, y: 0, w: 1, h: 1, children: undefined },
      { i: 'b', x: 0, y: 0, w: 1, h: 1, children: undefined },
      { i: 'c', x: 0, y: 0, w: 1, h: 1, children: undefined },
    ]);
  });

  it('filters LeftPanel children without clamping their flow geometry', () => {
    const flowChild = widget('KnowledgePanel.Description', { x: 0, y: 0, w: 0.5, h: 2 });
    const stored = [
      widget('KnowledgePanel.LeftPanel', {
        // Intentionally malformed stored JSON: the read path receives
        // untyped documents, so the children array is cast past the
        // WidgetConfig type, as the non-array case below is.
        children: [null, { x: 0, y: 0, w: 1, h: 1 }, flowChild] as never,
      }),
      widget('KnowledgePanel.Tags', { children: 'not-an-array' as never }),
    ];
    const page = pageWithTabs([{ id: 'schema', layout: stored }]);
    const resolved = resolveWidgetLayout('Table', 'schema', page);
    expect(resolved[0]?.children).toEqual([flowChild]);
    expect(resolved[0]?.children?.[0]).toBe(flowChild);
    expect(resolved[1]?.children).toEqual([]);
  });

  it('keeps a clean layout and its entries identical', () => {
    const child = widget('KnowledgePanel.Description', { w: 0.5 });
    const stored = [
      widget('KnowledgePanel.LeftPanel', { children: [child] }),
      widget('KnowledgePanel.Tags'),
    ];
    const page = pageWithTabs([{ id: 'schema', layout: stored }]);
    const resolved = resolveWidgetLayout('Table', 'schema', page);
    expect(resolved).toBe(stored);
    expect(resolved[0]).toBe(stored[0]);
    expect(resolved[0]?.children).toBe(stored[0]?.children);
  });
});
