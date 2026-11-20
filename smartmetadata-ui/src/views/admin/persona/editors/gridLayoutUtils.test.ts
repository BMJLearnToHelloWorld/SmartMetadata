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
import {
  calculateNewPosition,
  compactVertical,
  fromLeftPanelEditGrid,
  getAddWidgetHandler,
  getDrawnLayout,
  getGridRowAt,
  getLeftPanelFlowLayout,
  getLeftPanelHeight,
  getNewWidgetPlacement,
  getUniqueFilteredLayout,
  isSameDetailsPageLayout,
  mergeGridLayout,
  placeWidgetBesideLeftPanel,
  placeWidgetInLeftPanel,
  toLeftPanelEditGrid,
  updateWidgetHeightRecursively,
} from './gridLayoutUtils';
import type { WidgetConfig } from './customizeTypes';

function widget(partial: Partial<WidgetConfig> & { i: string }): WidgetConfig {
  return { x: 0, y: 0, w: 1, h: 1, ...partial };
}

describe('left panel flow layout', () => {
  it('orders by row then column and wraps by fractional width', () => {
    const children = [
      widget({ i: 'a', x: 0, y: 1, w: 0.5, h: 2 }),
      widget({ i: 'b', x: 0, y: 0, w: 1, h: 2 }),
      widget({ i: 'c', x: 0.5, y: 1, w: 0.5, h: 1 }),
    ];
    const flowed = getLeftPanelFlowLayout(children);
    expect(flowed.map((child) => child.i)).toEqual(['b', 'a', 'c']);
    expect(flowed[0]).toMatchObject({ x: 0, y: 0 });
    expect(flowed[1]).toMatchObject({ x: 0, y: 2 });
    expect(flowed[2]).toMatchObject({ x: 0.5, y: 2 });
  });

  it('wraps when a widget does not fit the remaining line', () => {
    const children = [
      widget({ i: 'a', x: 0, y: 0, w: 0.5, h: 1 }),
      widget({ i: 'b', x: 0.5, y: 0, w: 0.5, h: 3 }),
      widget({ i: 'c', x: 0, y: 1, w: 1, h: 1 }),
    ];
    const flowed = getLeftPanelFlowLayout(children);
    expect(flowed[2]).toMatchObject({ x: 0, y: 3 });
  });

  it('computes the panel height from the flowed children', () => {
    expect(getLeftPanelHeight([])).toBe(0);
    expect(
      getLeftPanelHeight([
        widget({ i: 'a', x: 0, y: 0, w: 1, h: 2 }),
        widget({ i: 'b', x: 0, y: 1, w: 1, h: 7.5 }),
      ]),
    ).toBe(9.5);
  });

  it('scales widgets to and from the edit grid', () => {
    const child = widget({ i: 'a', x: 0.5, y: 2, w: 0.5, h: 1 });
    expect(toLeftPanelEditGrid(child, 6)).toMatchObject({ x: 3, w: 3 });
    expect(fromLeftPanelEditGrid(toLeftPanelEditGrid(child, 6), 6)).toMatchObject({
      x: 0.5,
      w: 0.5,
    });
  });

  it('maps a pixel offset to a grid row', () => {
    expect(getGridRowAt(0)).toBe(0);
    expect(getGridRowAt(115)).toBe(0);
    expect(getGridRowAt(116)).toBe(1);
    expect(getGridRowAt(-50)).toBe(0);
  });
});

describe('compaction', () => {
  it('compacts upward in (y, x) order and respects static items', () => {
    const layout = [
      widget({ i: 'a', x: 0, y: 3, w: 2, h: 1 }),
      widget({ i: 'b', x: 0, y: 0, w: 2, h: 1, static: true }),
      widget({ i: 'c', x: 2, y: 2, w: 2, h: 1 }),
    ];
    const compacted = compactVertical(layout);
    expect(compacted.find((item) => item.i === 'a')).toMatchObject({ y: 1 });
    expect(compacted.find((item) => item.i === 'b')).toMatchObject({ y: 0 });
    expect(compacted.find((item) => item.i === 'c')).toMatchObject({ y: 0 });
  });

  it('clamps out-of-bounds x before compacting (drawn layout)', () => {
    const drawn = getDrawnLayout([widget({ i: 'a', x: 7, y: 0, w: 2, h: 1 })], 8);
    expect(drawn[0].x).toBe(6);
  });
});

describe('cross-panel placement', () => {
  const panel = widget({
    i: 'KnowledgePanel.LeftPanel',
    x: 0,
    y: 0,
    w: 6,
    h: 7,
    static: true,
    children: [
      widget({ i: 'KnowledgePanel.Description', x: 0, y: 0, w: 1, h: 2 }),
      widget({ i: 'KnowledgePanel.Tags', x: 0, y: 2, w: 1, h: 2 }),
    ],
  });
  const side = widget({ i: 'KnowledgePanel.Domain', x: 6, y: 0, w: 2, h: 2 });

  it('places a side widget into the panel at the drop point', () => {
    const next = placeWidgetInLeftPanel([panel, side], side, { row: 2, x: 0, w: 0.5 });
    expect(next).toHaveLength(1);
    const children = next[0].children ?? [];
    expect(children.map((child) => child.i)).toEqual([
      'KnowledgePanel.Description',
      'KnowledgePanel.Domain',
      'KnowledgePanel.Tags',
    ]);
    expect(children[1]).toMatchObject({ w: 0.5, x: 0, y: 2 });
  });

  it('places a panel widget beside the panel and removes it from the panel', () => {
    const child = panel.children![0];
    const next = placeWidgetBesideLeftPanel([panel, side], child, 1, 8);
    expect(next[0]).toMatchObject({ i: child.i, x: 6, y: 1, w: 2 });
    const nextPanel = next.find((item) => item.i === panel.i);
    expect(nextPanel?.children?.map((item) => item.i)).toEqual(['KnowledgePanel.Tags']);
  });

  it('returns the layout unchanged when there is no panel', () => {
    const layout = [side];
    expect(placeWidgetBesideLeftPanel(layout, side, 0, 8)).toBe(layout);
  });
});

describe('isSameDetailsPageLayout', () => {
  function page(layout: WidgetConfig[]): PersonaPage {
    return { pageType: 'Table', tabs: [{ id: 'schema', layout }] } as unknown as PersonaPage;
  }

  it('ignores the placeholder, static flags and child flow positions', () => {
    const original = page([
      widget({
        i: 'KnowledgePanel.LeftPanel',
        x: 0,
        y: 0,
        w: 6,
        h: 7,
        static: true,
        children: [
          widget({ i: 'KnowledgePanel.Description', x: 0, y: 0, w: 1, h: 2 }),
          widget({ i: 'KnowledgePanel.Tags', x: 0, y: 2, w: 1, h: 2 }),
        ],
      }),
    ]);
    const edited = page([
      widget({
        i: 'KnowledgePanel.LeftPanel',
        x: 0,
        y: 0,
        w: 6,
        h: 7,
        children: [
          widget({ i: 'KnowledgePanel.Tags', x: 0.5, y: 9, w: 1, h: 2 }),
          widget({ i: 'KnowledgePanel.Description', x: 0, y: 0, w: 1, h: 2 }),
        ],
      }),
      widget({ i: 'ExtraWidget.EmptyWidgetPlaceholder', x: 0, y: 1000, w: 3, h: 2 }),
    ]);
    expect(isSameDetailsPageLayout(original, edited)).toBe(true);
  });

  it('detects geometry and config differences', () => {
    const original = page([widget({ i: 'KnowledgePanel.Domain', x: 6, y: 0, w: 2, h: 2 })]);
    const moved = page([widget({ i: 'KnowledgePanel.Domain', x: 6, y: 1, w: 2, h: 2 })]);
    expect(isSameDetailsPageLayout(original, moved)).toBe(false);
    const configured = page([
      widget({ i: 'KnowledgePanel.Domain', x: 6, y: 0, w: 2, h: 2, config: { size: 'large' } }),
    ]);
    expect(isSameDetailsPageLayout(original, configured)).toBe(false);
  });

  it('treats a non-array tab layout as an opaque value (D2/D3)', () => {
    const original = {
      pageType: 'Table',
      tabs: [{ id: 'schema', layout: { a: 1 } }],
    } as unknown as PersonaPage;
    const same = {
      pageType: 'Table',
      tabs: [{ id: 'schema', layout: { a: 1 } }],
    } as unknown as PersonaPage;
    const different = {
      pageType: 'Table',
      tabs: [{ id: 'schema', layout: { a: 2 } }],
    } as unknown as PersonaPage;
    expect(isSameDetailsPageLayout(original, same)).toBe(true);
    expect(isSameDetailsPageLayout(original, different)).toBe(false);
  });

  it('treats an absent tabs field vs an empty tabs array as different (N-4)', () => {
    // Pin `toComparablePage` maps `page.tabs?.map(...)`: an absent
    // tabs stays absent, and fast-json-patch `compare` reports an add
    // op against `tabs: []` — dirty, not clean.
    const withoutTabs = { pageType: 'Table' } as unknown as PersonaPage;
    const emptyTabs = { pageType: 'Table', tabs: [] } as unknown as PersonaPage;
    expect(isSameDetailsPageLayout(withoutTabs, emptyTabs)).toBe(false);
    expect(isSameDetailsPageLayout(withoutTabs, withoutTabs)).toBe(true);
    expect(isSameDetailsPageLayout(emptyTabs, emptyTabs)).toBe(true);
  });

  it('is insensitive to key order', () => {
    const original = page([widget({ i: 'KnowledgePanel.Domain', x: 6, y: 0, w: 2, h: 2 })]);
    const reordered = {
      pageType: 'Table',
      tabs: [{ layout: [widget({ h: 2, w: 2, y: 0, x: 6, i: 'KnowledgePanel.Domain' })], id: 'schema' }],
    } as unknown as PersonaPage;
    expect(isSameDetailsPageLayout(original, reordered)).toBe(true);
  });
});

describe('add-widget placement', () => {
  it('calculateNewPosition appends after the last row or beside it', () => {
    expect(calculateNewPosition([], { w: 2, h: 2 })).toEqual({ x: 0, y: 0 });
    const layout = [widget({ i: 'a', x: 0, y: 0, w: 6, h: 2 })];
    expect(calculateNewPosition(layout, { w: 2, h: 2 })).toEqual({ x: 6, y: 0 });
    expect(calculateNewPosition(layout, { w: 3, h: 2 })).toEqual({ x: 0, y: 2 });
  });

  it('getNewWidgetPlacement measures against 2 columns (official quirk)', () => {
    const layout = [widget({ i: 'a', x: 0, y: 0, w: 1, h: 1 })];
    expect(getNewWidgetPlacement(layout, 1)).toEqual({ x: 1, y: 0 });
    expect(getNewWidgetPlacement(layout, 2)).toEqual({ x: 0, y: 1 });
  });

  it('adds a widget through the placeholder branch with size meta', () => {
    const layout = [
      widget({ i: 'a', x: 0, y: 0, w: 1, h: 1 }),
      widget({ i: 'ExtraWidget.EmptyWidgetPlaceholder', x: 0, y: 1000, w: 3, h: 2 }),
    ];
    const next = getAddWidgetHandler(
      { fullyQualifiedName: 'KnowledgePanel.Tags', labelKey: 'label.tag-plural', gridSizes: ['small'] },
      'ExtraWidget.EmptyWidgetPlaceholder',
      3,
      'Table',
    )(layout);
    const added = next.find((item) => item.i.startsWith('KnowledgePanel.Tags-'));
    expect(added).toBeDefined();
    expect(added?.config).toMatchObject({ size: 'large' });
    expect(added?.w).toBe(3);
    const placeholder = next.find((item) => item.i === 'ExtraWidget.EmptyWidgetPlaceholder');
    expect(placeholder?.y).toBe((added?.y ?? 0) + 1);
  });

  it('adds a widget through the append branch with a unique id', () => {
    const layout = [widget({ i: 'a', x: 0, y: 0, w: 6, h: 2 })];
    const handler = getAddWidgetHandler(
      { fullyQualifiedName: 'KnowledgePanel.Tags', labelKey: 'label.tag-plural', gridSizes: ['small'] },
      '',
      1,
      'Table',
    );
    const first = handler(layout);
    const second = handler(layout);
    const firstAdded = first[first.length - 1];
    const secondAdded = second[second.length - 1];
    expect(firstAdded.i).not.toBe(secondAdded.i);
    expect(firstAdded.config).toMatchObject({ size: 'small' });
    expect(firstAdded).toMatchObject({ x: 6, y: 0 });
  });
});

describe('merge and filter helpers', () => {
  it('mergeGridLayout carries config and children from previous widgets', () => {
    const previous = [
      widget({ i: 'a', x: 0, y: 0, w: 2, h: 2, config: { size: 'large' }, children: [widget({ i: 'c' })] }),
    ];
    const merged = mergeGridLayout([widget({ i: 'a', x: 0, y: 1, w: 2, h: 2 })], previous);
    expect(merged[0]).toMatchObject({ y: 1, config: { size: 'large' } });
    expect(merged[0].children).toHaveLength(1);
  });

  it('getUniqueFilteredLayout keeps KnowledgePanel widgets, deduped', () => {
    const layout = [
      widget({ i: 'KnowledgePanel.Description' }),
      widget({ i: 'KnowledgePanel.Description' }),
      widget({ i: 'ExtraWidget.EmptyWidgetPlaceholder' }),
      widget({ i: 'Other.Widget' }),
    ];
    expect(getUniqueFilteredLayout(layout).map((item) => item.i)).toEqual([
      'KnowledgePanel.Description',
    ]);
    expect(getUniqueFilteredLayout([])).toEqual([]);
  });

  it('updateWidgetHeightRecursively updates nested children', () => {
    const layout = [
      widget({ i: 'p', children: [widget({ i: 'c', h: 1 })] }),
      widget({ i: 's', h: 1 }),
    ];
    const next = updateWidgetHeightRecursively('c', 5, layout);
    expect(next[0].children?.[0].h).toBe(5);
    expect(next[1].h).toBe(1);
    const next2 = updateWidgetHeightRecursively('s', 3, layout);
    expect(next2[1].h).toBe(3);
  });
});
