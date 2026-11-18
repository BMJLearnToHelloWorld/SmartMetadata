/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may
 * not use this file except in compliance with the License. You may obtain
 * a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { flushPromises } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PersonaPage } from '@/types/persona';
import DataMarketplaceEditor from './DataMarketplaceEditor.vue';
import DetailGridEditor from './DetailGridEditor.vue';
import { cleanupBody, clickBody, mountPageEditor } from './testHarness';

function marketplacePage(layout: unknown): PersonaPage {
  return {
    pageType: 'DataMarketplace',
    tabs: [{ id: 'overview', name: 'overview', layout }],
  };
}

describe('DataMarketplaceEditor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanupBody();
  });

  it('shows the default two widgets at full width for an empty layout', async () => {
    const { wrapper } = await mountPageEditor(DataMarketplaceEditor, {
      currentPage: marketplacePage([]),
      currentPageType: 'DataMarketplace',
      originalPage: marketplacePage([]),
    });
    const cells = wrapper.findAll('.detail-grid-editor__cell, [data-widget-key]');
    expect(cells.length).toBeGreaterThanOrEqual(2);
    const grid = wrapper.findComponent(DetailGridEditor);
    const layout = grid.props('layout') as Array<Record<string, unknown>>;
    expect(layout).toHaveLength(2);
    expect(layout[0]).toMatchObject({
      i: 'KnowledgePanel.MarketplaceDataProducts',
      w: 8,
      x: 0,
      y: 0,
      h: 1,
    });
    expect(layout[1]).toMatchObject({
      i: 'KnowledgePanel.MarketplaceDomains',
      w: 8,
      x: 0,
      y: 1,
      h: 1,
    });
  });

  it('forces w=8 and x=0 on a non-empty saved layout', async () => {
    const { wrapper } = await mountPageEditor(DataMarketplaceEditor, {
      currentPage: marketplacePage([
        { i: 'KnowledgePanel.MarketplaceDataProducts', x: 3, y: 0, w: 2, h: 1 },
      ]),
      currentPageType: 'DataMarketplace',
      originalPage: marketplacePage([]),
    });
    const grid = wrapper.findComponent(DetailGridEditor);
    const layout = grid.props('layout') as Array<Record<string, unknown>>;
    expect(layout).toHaveLength(1);
    expect(layout[0]).toMatchObject({ w: 8, x: 0 });
    const cell = wrapper.find('[data-widget-key="KnowledgePanel.MarketplaceDataProducts"]');
    expect((cell.element as HTMLElement).style.gridColumn).toBe('1 / span 8');
  });

  it('renders the greeting banner and a disabled search bar', async () => {
    const { wrapper } = await mountPageEditor(DataMarketplaceEditor, {
      currentPage: marketplacePage([]),
      currentPageType: 'DataMarketplace',
      originalPage: marketplacePage([]),
    });
    expect(wrapper.find('[data-testid="marketplace-greeting"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="marketplace-greeting"]').text()).toContain('Hey,');
    const search = wrapper.get('[data-testid="marketplace-search"]');
    expect(search.element.tagName).toBe('INPUT');
    expect(search.attributes('disabled')).toBeDefined();
  });

  it('offers no resize or remove affordances', async () => {
    const { wrapper } = await mountPageEditor(DataMarketplaceEditor, {
      currentPage: marketplacePage([]),
      currentPageType: 'DataMarketplace',
      originalPage: marketplacePage([]),
    });
    const grid = wrapper.findComponent(DetailGridEditor);
    expect(grid.props('resizable')).toBe(false);
    expect(grid.props('removable')).toBe(false);
    expect(grid.props('rowHeight')).toBe(170);
    expect(grid.props('rowGap')).toBe(24);
    expect(wrapper.find('[data-testid^="widget-remove-"]').exists()).toBe(false);
  });

  it('resets: updateCurrentPage with the forced default layout, then a no-arg save', async () => {
    const { wrapper, onSaveLayout, updateCalls } = await mountPageEditor(DataMarketplaceEditor, {
      currentPage: marketplacePage([
        { i: 'KnowledgePanel.MarketplaceDomains', x: 0, y: 0, w: 8, h: 1 },
      ]),
      currentPageType: 'DataMarketplace',
      originalPage: marketplacePage([]),
    });
    await wrapper.get('[data-testid="reset-button"]').trigger('click');
    await flushPromises();
    clickBody('.ant-modal-confirm-btns .ant-btn-primary');
    await flushPromises();
    expect(updateCalls).toHaveLength(1);
    const resetPage = updateCalls[0];
    expect(resetPage.pageType).toBe('DataMarketplace');
    const tabs = resetPage.tabs as unknown as Array<Record<string, unknown>>;
    expect(tabs[0].layout).toEqual([
      expect.objectContaining({ i: 'KnowledgePanel.MarketplaceDataProducts', w: 8, x: 0 }),
      expect.objectContaining({ i: 'KnowledgePanel.MarketplaceDomains', w: 8, x: 0 }),
    ]);
    expect(onSaveLayout).toHaveBeenCalledTimes(1);
    expect(onSaveLayout).toHaveBeenCalledWith();
  });

  it('shows the D2 abnormal state for an object layout and converts on confirm', async () => {
    const { wrapper, updateCalls } = await mountPageEditor(DataMarketplaceEditor, {
      currentPage: marketplacePage({ a: 1 }),
      currentPageType: 'DataMarketplace',
      originalPage: marketplacePage({ a: 1 }),
    });
    expect(wrapper.find('[data-testid="object-layout-notice"]').exists()).toBe(true);
    expect(wrapper.findComponent(DetailGridEditor).exists()).toBe(false);
    expect(updateCalls).toHaveLength(0);
    await wrapper.get('[data-testid="object-layout-convert"]').trigger('click');
    await flushPromises();
    expect(updateCalls).toHaveLength(1);
    const tabs = updateCalls[0].tabs as unknown as Array<Record<string, unknown>>;
    expect(Array.isArray(tabs[0].layout)).toBe(true);
    expect(wrapper.findComponent(DetailGridEditor).exists()).toBe(true);
  });

  it('treats {} like a non-empty object (D2, no silent default)', async () => {
    const { wrapper } = await mountPageEditor(DataMarketplaceEditor, {
      currentPage: marketplacePage({}),
      currentPageType: 'DataMarketplace',
      originalPage: marketplacePage({}),
    });
    expect(wrapper.find('[data-testid="object-layout-notice"]').exists()).toBe(true);
    expect(wrapper.findComponent(DetailGridEditor).exists()).toBe(false);
  });

  it('writes grid changes back forced to full width', async () => {
    const { wrapper, updateCalls } = await mountPageEditor(DataMarketplaceEditor, {
      currentPage: marketplacePage([]),
      currentPageType: 'DataMarketplace',
      originalPage: marketplacePage([]),
    });
    const grid = wrapper.findComponent(DetailGridEditor);
    await grid.vm.$emit('layout-change', [
      { i: 'KnowledgePanel.MarketplaceDomains', x: 2, y: 0, w: 3, h: 1 },
      { i: 'KnowledgePanel.MarketplaceDataProducts', x: 0, y: 1, w: 8, h: 1 },
    ]);
    await flushPromises();
    expect(updateCalls).toHaveLength(1);
    const tabs = updateCalls[0].tabs as unknown as Array<Record<string, unknown>>;
    const layout = tabs[0].layout as Array<Record<string, unknown>>;
    expect(layout[0]).toMatchObject({ i: 'KnowledgePanel.MarketplaceDomains', w: 8, x: 0, y: 0 });
    expect(layout[1]).toMatchObject({
      i: 'KnowledgePanel.MarketplaceDataProducts',
      w: 8,
      x: 0,
      y: 1,
    });
  });
});
