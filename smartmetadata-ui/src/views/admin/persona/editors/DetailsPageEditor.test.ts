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
import { getDefaultTabs } from './customizePageData';
import DetailsPageEditor from './DetailsPageEditor.vue';
import { bodyEl, cleanupBody, clickBody, mountPageEditor } from './testHarness';

function tablePage(): PersonaPage {
  return {
    pageType: 'Table',
    tabs: getDefaultTabs('Table') as unknown as PersonaPage['tabs'],
  } as PersonaPage;
}

describe('DetailsPageEditor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanupBody();
  });

  it('renders the dummy preview and keeps save disabled while clean', async () => {
    const { wrapper } = await mountPageEditor(DetailsPageEditor, {
      currentPage: tablePage(),
      currentPageType: 'Table',
      originalPage: tablePage(),
    });
    expect(wrapper.find('[data-testid="details-page-editor"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="preview-entity-name"]').text()).toContain(
      'raw_product_catalog',
    );
    expect(wrapper.text()).toContain('sample_data.ecommerce_db.shopify.raw_product_catalog');
    const saveButton = wrapper.get('[data-testid="save-button"]');
    expect(saveButton.attributes('disabled')).toBeDefined();
  });

  it('renders nothing when currentPageType is empty', async () => {
    const { wrapper } = await mountPageEditor(DetailsPageEditor, {
      currentPage: null,
      currentPageType: '',
      originalPage: null,
    });
    expect(wrapper.find('[data-testid="details-page-editor"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="customize-page-header"]').exists()).toBe(false);
  });

  it('ignores initialPageData and reads currentPage', async () => {
    const { wrapper } = await mountPageEditor(DetailsPageEditor, {
      currentPage: tablePage(),
      currentPageType: 'Table',
      originalPage: tablePage(),
      props: {
        initialPageData: {
          pageType: 'Table',
          tabs: [{ id: 'bogus', name: 'bogus', layout: [], editable: true }],
        } as PersonaPage,
      },
    });
    expect(wrapper.find('[data-testid="tab-bogus"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="tab-schema"]').exists()).toBe(true);
  });

  it('saves the edited currentPage and enables save only after an edit', async () => {
    const { wrapper, currentPage, onSaveLayout } = await mountPageEditor(DetailsPageEditor, {
      currentPage: tablePage(),
      currentPageType: 'Table',
      originalPage: tablePage(),
    });
    const layoutOf = () =>
      (currentPage.value?.tabs?.[0] as unknown as Record<string, unknown>)
        .layout as Array<Record<string, unknown>>;
    const topLevelKey = String(layoutOf().find((item) => item.x === 6)?.i);
    await wrapper.get(`[data-testid="widget-remove-${topLevelKey}"]`).trigger('click');
    await flushPromises();
    expect(wrapper.get('[data-testid="save-button"]').attributes('disabled')).toBeUndefined();
    await wrapper.get('[data-testid="save-button"]').trigger('click');
    await flushPromises();
    expect(onSaveLayout).toHaveBeenCalledTimes(1);
    expect(onSaveLayout).toHaveBeenCalledWith(currentPage.value);
  });

  it('resets through the confirm modal with a no-arg save call', async () => {
    const { wrapper, onSaveLayout } = await mountPageEditor(DetailsPageEditor, {
      currentPage: tablePage(),
      currentPageType: 'Table',
      originalPage: tablePage(),
    });
    await wrapper.get('[data-testid="reset-button"]').trigger('click');
    await flushPromises();
    clickBody('.ant-modal-confirm-btns .ant-btn-primary');
    await flushPromises();
    expect(onSaveLayout).toHaveBeenCalledTimes(1);
    expect(onSaveLayout).toHaveBeenCalledWith();
  });

  it('discards through the leave modal and navigates away', async () => {
    const { wrapper, router, currentPage } = await mountPageEditor(DetailsPageEditor, {
      currentPage: tablePage(),
      currentPageType: 'Table',
      originalPage: tablePage(),
    });
    const layoutOf = () =>
      (currentPage.value?.tabs?.[0] as unknown as Record<string, unknown>)
        .layout as Array<Record<string, unknown>>;
    const topLevelKey = String(layoutOf().find((item) => item.x === 6)?.i);
    await wrapper.get(`[data-testid="widget-remove-${topLevelKey}"]`).trigger('click');
    await flushPromises();
    const navigation = router.push('/other');
    await flushPromises();
    expect(bodyEl('[data-testid="customize-leave-discard"]')).toBeTruthy();
    clickBody('[data-testid="customize-leave-discard"]');
    await navigation;
    await flushPromises();
    expect(router.currentRoute.value.path).toBe('/other');
  });

  it('saves and leaves through the leave modal', async () => {
    const { wrapper, router, currentPage, onSaveLayout } = await mountPageEditor(
      DetailsPageEditor,
      {
        currentPage: tablePage(),
        currentPageType: 'Table',
        originalPage: tablePage(),
      },
    );
    const layoutOf = () =>
      (currentPage.value?.tabs?.[0] as unknown as Record<string, unknown>)
        .layout as Array<Record<string, unknown>>;
    const topLevelKey = String(layoutOf().find((item) => item.x === 6)?.i);
    await wrapper.get(`[data-testid="widget-remove-${topLevelKey}"]`).trigger('click');
    await flushPromises();
    const navigation = router.push('/other');
    await flushPromises();
    clickBody('[data-testid="customize-leave-save-exit"]');
    await navigation;
    await flushPromises();
    expect(onSaveLayout).toHaveBeenCalledTimes(1);
    expect(router.currentRoute.value.path).toBe('/other');
  });

  it('stays on the page when the leave-flow save rejects', async () => {
    const { wrapper, router, currentPage, onSaveLayout } = await mountPageEditor(
      DetailsPageEditor,
      {
        currentPage: tablePage(),
        currentPageType: 'Table',
        originalPage: tablePage(),
        saveImpl: async () => {
          throw new Error('save failed');
        },
      },
    );
    const layoutOf = () =>
      (currentPage.value?.tabs?.[0] as unknown as Record<string, unknown>)
        .layout as Array<Record<string, unknown>>;
    const topLevelKey = String(layoutOf().find((item) => item.x === 6)?.i);
    await wrapper.get(`[data-testid="widget-remove-${topLevelKey}"]`).trigger('click');
    await flushPromises();
    const navigation = router.push('/other');
    await flushPromises();
    clickBody('[data-testid="customize-leave-save-exit"]');
    await flushPromises();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(onSaveLayout).toHaveBeenCalledTimes(1);
    expect(router.currentRoute.value.path).toBe('/');
    expect(bodyEl('[data-testid="customize-leave-discard"]')).toBeTruthy();
    // Release the pending navigation so the harness can unmount cleanly.
    clickBody('[data-testid="customize-leave-discard"]');
    await navigation;
  });
});
