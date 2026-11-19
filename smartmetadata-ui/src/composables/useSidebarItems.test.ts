/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may
 * not use this file except in compliance with the License. You may obtain
 * a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { defineComponent, h, nextTick } from 'vue';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { NAV_ENTRIES, type NavEntry } from '@/layouts/nav';
import { usePersonaStore } from '@/stores/persona';
import type { PersonaDocument } from '@/types/persona';
import { filterHiddenNavigationItems, useSidebarItems } from './useSidebarItems';

const BASE: NavEntry[] = [
  { kind: 'item', key: 'home', titleKey: 'nav.home' },
  { kind: 'item', key: 'search', titleKey: 'nav.explore' },
  {
    kind: 'section',
    key: 'governance',
    titleKey: 'nav.govern',
    testId: 'governance-nav',
    items: [
      { key: 'governance-glossaries', titleKey: 'nav.glossary' },
      { key: 'governance-metrics', titleKey: 'nav.metrics' },
    ],
  },
];

function navItem(id: string, extra: Record<string, unknown> = {}) {
  return { id, title: id, pageId: `page-${id}`, ...extra };
}

describe('filterHiddenNavigationItems', () => {
  it('returns the default entries for a missing, empty, or malformed navigation', () => {
    expect(filterHiddenNavigationItems(null, BASE)).toEqual(BASE);
    expect(filterHiddenNavigationItems(undefined, BASE)).toEqual(BASE);
    expect(filterHiddenNavigationItems([], BASE)).toEqual(BASE);
    expect(filterHiddenNavigationItems('nope', BASE)).toEqual(BASE);
    expect(filterHiddenNavigationItems({}, BASE)).toEqual(BASE);
    expect(filterHiddenNavigationItems(null)).toEqual(NAV_ENTRIES);
  });

  it('renders saved items in saved order, with titles from the default entries', () => {
    expect(
      filterHiddenNavigationItems(
        [navItem('search', { title: 'Renamed by hand' }), navItem('home')],
        BASE,
      ),
    ).toEqual([
      { kind: 'item', key: 'search', titleKey: 'nav.explore', testId: undefined },
      { kind: 'item', key: 'home', titleKey: 'nav.home', testId: undefined },
    ]);
  });

  it('drops hidden items and ids with no default entry', () => {
    expect(
      filterHiddenNavigationItems(
        [navItem('home', { isHidden: true }), navItem('ghost'), navItem('search')],
        BASE,
      ),
    ).toEqual([{ kind: 'item', key: 'search', titleKey: 'nav.explore', testId: undefined }]);
  });

  it('filters and reorders section children by the same rules', () => {
    expect(
      filterHiddenNavigationItems(
        [
          navItem('governance', {
            children: [
              navItem('governance-metrics'),
              navItem('governance-glossaries', { isHidden: true }),
              navItem('ghost-child'),
            ],
          }),
        ],
        BASE,
      ),
    ).toEqual([
      {
        kind: 'section',
        key: 'governance',
        titleKey: 'nav.govern',
        testId: 'governance-nav',
        items: [{ key: 'governance-metrics', titleKey: 'nav.metrics', testId: undefined }],
      },
    ]);
  });

  it('renders a section with no surviving children as a plain item', () => {
    expect(
      filterHiddenNavigationItems([navItem('governance', { children: [] })], BASE),
    ).toEqual([{ kind: 'item', key: 'governance', titleKey: 'nav.govern', testId: 'governance-nav' }]);
    expect(filterHiddenNavigationItems([navItem('governance')], BASE)).toEqual([
      { kind: 'item', key: 'governance', titleKey: 'nav.govern', testId: 'governance-nav' },
    ]);
  });

  it('promotes a section child to a top-level item when saved there', () => {
    expect(filterHiddenNavigationItems([navItem('governance-metrics')], BASE)).toEqual([
      { kind: 'item', key: 'governance-metrics', titleKey: 'nav.metrics', testId: undefined },
    ]);
  });

  it('drops duplicate ids, first wins, and skips malformed entries', () => {
    expect(
      filterHiddenNavigationItems(
        [navItem('home'), navItem('home'), null, 'home', { title: 'No id' }, navItem('search')],
        BASE,
      ),
    ).toEqual([
      { kind: 'item', key: 'home', titleKey: 'nav.home', testId: undefined },
      { kind: 'item', key: 'search', titleKey: 'nav.explore', testId: undefined },
    ]);
  });

  it('yields no entries when every saved item is hidden', () => {
    expect(
      filterHiddenNavigationItems([navItem('home', { isHidden: true })], BASE),
    ).toEqual([]);
  });
});

describe('useSidebarItems', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  function mountHook() {
    const pinia = createPinia();
    setActivePinia(pinia);
    const store = usePersonaStore();
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('/v1/personas')) {
          return new Response(JSON.stringify({ data: [], paging: { total: 0 } }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        }
        return new Response('not found', { status: 404 });
      }),
    );
    let exposed: ReturnType<typeof useSidebarItems> | undefined;
    const probe = defineComponent({
      setup() {
        exposed = useSidebarItems();
        return () => h('div');
      },
    });
    const wrapper = mount(probe, { global: { plugins: [pinia] } });
    return { wrapper, store, exposed: () => exposed as ReturnType<typeof useSidebarItems> };
  }

  it('renders the default sidebar without a persona document', async () => {
    const { exposed } = mountHook();
    await nextTick();
    expect(exposed().value).toEqual(NAV_ENTRIES);
  });

  it('applies the saved navigation from the store document, and follows saves', async () => {
    const { store, exposed } = mountHook();
    const document: PersonaDocument = {
      name: 'Analyst-Analyst',
      fullyQualifiedName: 'persona.Analyst',
      entityType: 'Page',
      data: {
        pages: [],
        navigation: [
          { id: 'insights', title: 'Insights', pageId: 'p-insights' },
          { id: 'home', title: 'Home', pageId: 'p-home', isHidden: true },
        ],
      },
    };
    store.document = document;
    await nextTick();
    expect(exposed().value.map((entry) => entry.key)).toEqual(['insights']);
    store.document = { ...document, data: { pages: [], navigation: null } };
    await nextTick();
    expect(exposed().value).toEqual(NAV_ENTRIES);
  });
});
