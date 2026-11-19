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
import {
  getHiddenKeysFromNavigationItems,
  getNavigationItems,
  getTreeDataForNavigationItems,
  moveNavigationItem,
  type NavigationItem,
  type SidebarBaseItem,
} from './navigationUtils';

const BASE: SidebarBaseItem[] = [
  { key: 'home', title: 'nav.home' },
  {
    key: 'observability',
    title: 'nav.observability',
    children: [
      { key: 'quality', title: 'nav.dataQuality' },
      { key: 'alerts', title: 'nav.alerts' },
    ],
  },
  { key: 'insights', title: 'nav.insights' },
];

describe('getTreeDataForNavigationItems', () => {
  it('builds the full default tree for null and empty input (never empty)', () => {
    for (const input of [null, undefined, []]) {
      const tree = getTreeDataForNavigationItems(input as NavigationItem[] | null, BASE);
      expect(tree.map((node) => node.key)).toEqual(['home', 'observability', 'insights']);
      expect(tree[1].children?.map((node) => node.key)).toEqual(['quality', 'alerts']);
    }
  });

  it('keeps saved order, drops unknown ids, appends new defaults hidden', () => {
    const saved: NavigationItem[] = [
      { id: 'insights', title: 'nav.insights', isHidden: false, children: [] },
      { id: 'ghost', title: 'nav.ghost', isHidden: false, children: [] },
      {
        id: 'observability',
        title: 'nav.observability',
        isHidden: false,
        children: [{ id: 'alerts', title: 'nav.alerts', isHidden: true, children: [] }],
      },
    ];
    const tree = getTreeDataForNavigationItems(saved, BASE);
    expect(tree.map((node) => node.key)).toEqual(['insights', 'observability', 'home']);
    expect(tree[2].isHidden).toBe(true);
    expect(tree[1].children?.map((node) => node.key)).toEqual(['alerts', 'quality']);
  });

  it('uses saved titles for saved nodes and base titles for new defaults', () => {
    const saved: NavigationItem[] = [
      { id: 'home', title: 'custom.home', isHidden: false, children: [] },
    ];
    const tree = getTreeDataForNavigationItems(saved, BASE);
    expect(tree[0].title).toBe('custom.home');
    expect(tree[1].title).toBe('nav.observability');
  });
});

describe('getHiddenKeysFromNavigationItems', () => {
  it('returns [] for null and empty input', () => {
    expect(getHiddenKeysFromNavigationItems(null, BASE)).toEqual([]);
    expect(getHiddenKeysFromNavigationItems([], BASE)).toEqual([]);
  });

  it('marks absent keys and isHidden keys as hidden', () => {
    const saved: NavigationItem[] = [
      { id: 'home', title: 'nav.home', isHidden: false, children: [] },
      {
        id: 'observability',
        title: 'nav.observability',
        isHidden: false,
        children: [{ id: 'alerts', title: 'nav.alerts', isHidden: true, children: [] }],
      },
    ];
    expect(getHiddenKeysFromNavigationItems(saved, BASE)).toEqual([
      'quality',
      'alerts',
      'insights',
    ]);
  });
});

describe('getNavigationItems', () => {
  it('serializes {id, title, isHidden, children} with no pageId', () => {
    const tree = getTreeDataForNavigationItems(null, BASE);
    const items = getNavigationItems(tree, ['alerts']);
    expect(items).toEqual([
      { id: 'home', title: 'nav.home', isHidden: false, children: [] },
      {
        id: 'observability',
        title: 'nav.observability',
        isHidden: false,
        children: [
          { id: 'quality', title: 'nav.dataQuality', isHidden: false, children: [] },
          { id: 'alerts', title: 'nav.alerts', isHidden: true, children: [] },
        ],
      },
      { id: 'insights', title: 'nav.insights', isHidden: false, children: [] },
    ]);
    expect(JSON.stringify(items)).not.toContain('pageId');
  });
});

describe('moveNavigationItem', () => {
  const tree = getTreeDataForNavigationItems(null, BASE);

  it('moves before and after siblings', () => {
    const before = moveNavigationItem(tree, 'insights', 'home', 'before');
    expect(before.map((node) => node.key)).toEqual(['insights', 'home', 'observability']);
    const after = moveNavigationItem(tree, 'home', 'insights', 'after');
    expect(after.map((node) => node.key)).toEqual(['observability', 'insights', 'home']);
  });

  it('moves onto a parent as its first child', () => {
    const next = moveNavigationItem(tree, 'insights', 'observability', 'on');
    const parent = next.find((node) => node.key === 'observability');
    expect(parent?.children?.map((node) => node.key)).toEqual([
      'insights',
      'quality',
      'alerts',
    ]);
    expect(next.map((node) => node.key)).toEqual(['home', 'observability']);
  });

  it('appends to the root when the target is undefined', () => {
    const next = moveNavigationItem(tree, 'quality', undefined, 'after');
    expect(next.map((node) => node.key)).toEqual(['home', 'observability', 'insights', 'quality']);
  });

  it('rejects dropping a parent into its own subtree without losing items', () => {
    const next = moveNavigationItem(tree, 'observability', 'quality', 'on');
    expect(next).toBe(tree);
    expect(JSON.stringify(next)).toBe(JSON.stringify(tree));
  });

  it('returns the input unchanged for same-key and missing keys', () => {
    expect(moveNavigationItem(tree, 'home', 'home', 'before')).toBe(tree);
    expect(moveNavigationItem(tree, 'ghost', 'home', 'before')).toBe(tree);
    expect(moveNavigationItem(tree, 'home', 'ghost', 'before')).toBe(tree);
  });
});
