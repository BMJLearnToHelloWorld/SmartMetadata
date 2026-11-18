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
import CustomizeTabWidget from './CustomizeTabWidget.vue';
import { getDefaultTabs, getDefaultWidgetForTab } from './customizePageData';
import { cleanupBody, mountTabWidget } from './testHarness';

function tablePage(): PersonaPage {
  return {
    pageType: 'Table',
    tabs: getDefaultTabs('Table') as unknown as PersonaPage['tabs'],
  } as PersonaPage;
}

describe('CustomizeTabWidget', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanupBody();
  });

  it('renders system tabs with the first editable tab active and its grid', async () => {
    const { wrapper } = await mountTabWidget(CustomizeTabWidget, {
      currentPage: tablePage(),
      currentPageType: 'Table',
    });
    // Table tabs render as chips; the schema tab is editable/active.
    expect(wrapper.find('[data-testid="tab-schema"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="tab-custom_properties"]').exists()).toBe(true);
    // The schema default layout renders widget cells incl. the left panel.
    expect(wrapper.find('[data-testid="detail-grid-editor"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="left-panel-drop-target"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="detail-placeholder-cell"]').exists()).toBe(true);
  });

  it('adds a tab through the modal with a custom id and empty layout', async () => {
    const { wrapper, currentPage } = await mountTabWidget(CustomizeTabWidget, {
      currentPage: tablePage(),
      currentPageType: 'Table',
    });
    await wrapper.get('[data-testid="add-tab-button"]').trigger('click');
    await flushPromises();
    const input = document.body.querySelector(
      '[data-testid="add-tab-input"]',
    ) as HTMLInputElement | null;
    expect(input).not.toBeNull();
    input!.value = 'My Tab';
    input!.dispatchEvent(new Event('input', { bubbles: true }));
    await flushPromises();
    // Ant Input v-model:value listens to the input event via update:value;
    // set the value through the component instead if the DOM write missed.
    const modal = document.body.querySelector('.ant-modal-footer .ant-btn-primary') as HTMLElement;
    modal.click();
    await flushPromises();
    const tabs = (currentPage.value?.tabs ?? []) as Array<Record<string, unknown>>;
    const added = tabs[tabs.length - 1];
    expect(String(added.id)).toMatch(/^custom/);
    expect(added.editable).toBe(true);
    expect(added.layout).toEqual([]);
  });

  it('removes a top-level widget from the active tab layout', async () => {
    const { wrapper, currentPage } = await mountTabWidget(CustomizeTabWidget, {
      currentPage: tablePage(),
      currentPageType: 'Table',
    });
    const layoutOf = () =>
      (currentPage.value?.tabs?.[0] as unknown as Record<string, unknown>)
        .layout as Array<Record<string, unknown>>;
    const topLevelKey = String(layoutOf().find((item) => item.x === 6)?.i);
    expect(topLevelKey).toBeTruthy();
    const before = layoutOf().length;
    await wrapper.get(`[data-testid="widget-remove-${topLevelKey}"]`).trigger('click');
    await flushPromises();
    expect(layoutOf()).toHaveLength(before - 1);
    expect(layoutOf().some((item) => item.i === topLevelKey)).toBe(false);
  });

  it('removes a left-panel child from the panel children', async () => {
    const { wrapper, currentPage } = await mountTabWidget(CustomizeTabWidget, {
      currentPage: tablePage(),
      currentPageType: 'Table',
    });
    const panelOf = () =>
      (
        (currentPage.value?.tabs?.[0] as unknown as Record<string, unknown>)
          .layout as Array<Record<string, unknown>>
      ).find((item) => String(item.i).startsWith('KnowledgePanel.LeftPanel'))!;
    const childKey = String((panelOf().children as Array<Record<string, unknown>>)[0].i);
    const before = (panelOf().children as unknown[]).length;
    await wrapper.get(`[data-testid="widget-remove-${childKey}"]`).trigger('click');
    await flushPromises();
    expect(panelOf().children).toHaveLength(before - 1);
  });

  it('adds a widget through the placeholder modal', async () => {
    const { wrapper, currentPage } = await mountTabWidget(CustomizeTabWidget, {
      currentPage: tablePage(),
      currentPageType: 'Table',
    });
    await wrapper.get('[data-testid="detail-placeholder-cell"]').trigger('click');
    await flushPromises();
    const addButton = document.body.querySelector(
      '[data-testid="add-widget-KnowledgePanel.Tags"]',
    ) as HTMLElement | null;
    expect(addButton).not.toBeNull();
    addButton!.click();
    await flushPromises();
    const layout = (
      (currentPage.value?.tabs?.[0] as unknown as Record<string, unknown>).layout as Array<
        Record<string, unknown>
      >
    );
    expect(layout.some((item) => String(item.i).startsWith('KnowledgePanel.Tags-'))).toBe(true);
    // The placeholder never persists into the stored layout.
    expect(
      layout.some((item) => item.i === 'ExtraWidget.EmptyWidgetPlaceholder'),
    ).toBe(false);
  });

  it('shows the D2 abnormal state for an object-shaped tab layout and converts on confirm', async () => {
    const page = tablePage();
    (page.tabs?.[0] as unknown as Record<string, unknown>).layout = { a: 1 };
    const { wrapper, currentPage } = await mountTabWidget(CustomizeTabWidget, {
      currentPage: page,
      currentPageType: 'Table',
    });
    expect(wrapper.find('[data-testid="object-layout-notice"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="detail-grid-editor"]').exists()).toBe(false);
    // The stored object is preserved until conversion + save.
    expect((currentPage.value?.tabs?.[0] as unknown as Record<string, unknown>).layout).toEqual({
      a: 1,
    });
    await wrapper.get('[data-testid="object-layout-convert"]').trigger('click');
    await flushPromises();
    const layout = (currentPage.value?.tabs?.[0] as unknown as Record<string, unknown>)
      .layout as unknown[];
    expect(Array.isArray(layout)).toBe(true);
    expect(layout).toEqual(getDefaultWidgetForTab('Table', 'schema'));
    expect(wrapper.find('[data-testid="detail-grid-editor"]').exists()).toBe(true);
  });

  it('treats {} like a non-empty object (D2, no silent default)', async () => {
    const page = tablePage();
    (page.tabs?.[0] as unknown as Record<string, unknown>).layout = {};
    const { wrapper } = await mountTabWidget(CustomizeTabWidget, {
      currentPage: page,
      currentPageType: 'Table',
    });
    expect(wrapper.find('[data-testid="object-layout-notice"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="detail-grid-editor"]').exists()).toBe(false);
  });

  it('renders the Custom Properties section for the custom_properties tab', async () => {
    const page = tablePage();
    const { wrapper } = await mountTabWidget(CustomizeTabWidget, {
      currentPage: page,
      currentPageType: 'Table',
    });
    // Open the custom_properties chip menu and choose Edit widgets.
    await wrapper.get('[data-testid="tab-custom_properties"]').trigger('click');
    await flushPromises();
    const menuItems = [...document.body.querySelectorAll('.ant-dropdown-menu-item')];
    const editItem = menuItems.find((item) => item.textContent?.includes('Edit widget'));
    expect(editItem).toBeDefined();
    (editItem as HTMLElement).click();
    await flushPromises();
    expect(wrapper.find('[data-testid="custom-properties-tab-layout"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="detail-grid-editor"]').exists()).toBe(false);
  });

  it('arranges a stored propertyLayout and writes the single full-width widget', async () => {
    const page = tablePage();
    const cpTab = (page.tabs as Array<Record<string, unknown>>).find(
      (tab) => tab.id === 'custom_properties',
    )!;
    cpTab.layout = [
      {
        i: 'KnowledgePanel.CustomProperties',
        x: 0,
        y: 0,
        w: 8,
        h: 1,
        config: {
          propertyLayout: [
            { name: 'propA', width: 'half' },
            { name: 'propB', width: 'full' },
          ],
        },
      },
    ];
    const { wrapper, currentPage } = await mountTabWidget(CustomizeTabWidget, {
      currentPage: page,
      currentPageType: 'Table',
    });
    await wrapper.get('[data-testid="tab-custom_properties"]').trigger('click');
    await flushPromises();
    const menuItems = [...document.body.querySelectorAll('.ant-dropdown-menu-item')];
    const editItem = menuItems.find((item) => item.textContent?.includes('Edit widget'));
    (editItem as HTMLElement).click();
    await flushPromises();
    expect(
      wrapper.find('[data-testid="custom-property-layout-item-propA"]').exists(),
    ).toBe(true);
    await wrapper
      .get('[data-testid="custom-property-layout-remove-propA"]')
      .trigger('click');
    await flushPromises();
    const updatedCpTab = (
      currentPage.value?.tabs as Array<Record<string, unknown>>
    ).find((tab) => tab.id === 'custom_properties')!;
    const layout = updatedCpTab.layout as Array<Record<string, unknown>>;
    expect(layout).toHaveLength(1);
    expect(layout[0]).toMatchObject({ i: 'KnowledgePanel.CustomProperties', w: 8, h: 1 });
    expect(
      (layout[0].config as Record<string, unknown>).propertyLayout,
    ).toEqual([{ name: 'propB', width: 'full' }]);
  });

  it('re-adds a hidden system tab through the Show action', async () => {
    const page = tablePage();
    page.tabs = (page.tabs as unknown[]).slice(0, 1) as PersonaPage['tabs'];
    const { wrapper, currentPage } = await mountTabWidget(CustomizeTabWidget, {
      currentPage: page,
      currentPageType: 'Table',
    });
    // activity_feed is a hidden system tab: its chip offers Show.
    expect(wrapper.find('[data-testid="tab-activity_feed"]').exists()).toBe(true);
    await wrapper.get('[data-testid="tab-activity_feed"]').trigger('click');
    await flushPromises();
    const menuItems = [...document.body.querySelectorAll('.ant-dropdown-menu-item')];
    const showItem = menuItems.find((item) => item.textContent?.includes('Show'));
    expect(showItem).toBeDefined();
    (showItem as HTMLElement).click();
    await flushPromises();
    const ids = ((currentPage.value?.tabs ?? []) as Array<Record<string, unknown>>).map(
      (tab) => tab.id,
    );
    expect(ids).toContain('activity_feed');
  });
});
