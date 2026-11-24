/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { flushPromises, mount } from '@vue/test-utils';
import Antd from 'ant-design-vue';
import { afterEach, describe, expect, it } from 'vitest';
import { createTestI18n } from '@/test/i18n';
import FormModal from '@/components/shared/FormModal.vue';
import ExploreExportScopeModal, { type ExportScope } from './ExploreExportScopeModal.vue';

function mountModal(props: Partial<{
  exportScope: ExportScope;
  isSearchMode: boolean;
  isCountLoading: boolean;
  tabAssetsCount: number;
  pageResultCount: number;
  allAssetsCount: number;
  activeTabLabel: string;
  isExporting: boolean;
  isAllAssetsLimitExceeded: boolean;
  isTabScopeDisabled: boolean;
  exportError: string;
}> = {}) {
  const wrapper = mount(ExploreExportScopeModal, {
    props: {
      open: true,
      exportScope: 'all',
      isSearchMode: true,
      isCountLoading: false,
      tabAssetsCount: 5,
      pageResultCount: 3,
      allAssetsCount: 12,
      activeTabLabel: 'Table',
      isExporting: false,
      isAllAssetsLimitExceeded: false,
      isTabScopeDisabled: false,
      ...props,
    },
    global: { plugins: [Antd, createTestI18n()] },
  });
  return wrapper;
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('ExploreExportScopeModal (D10)', () => {
  it('shows the tab count on the visible card and the all-assets count on the all card', async () => {
    const wrapper = mountModal();
    await flushPromises();
    // Teleported to body by the shared FormModal (see FormModal.test.ts).
    expect(document.body.textContent).toContain('Table');
    expect(document.body.textContent).toContain('(5 Results)');
    expect(document.body.textContent).toContain('(12 Results)');
    expect(document.body.textContent).toContain('Export your filtered search results as a CSV report.');
    wrapper.unmount();
  });

  it('shows the page count on the visible card in browse mode', async () => {
    const wrapper = mountModal({ isSearchMode: false });
    await flushPromises();
    expect(document.body.textContent).toContain('Visible results');
    expect(document.body.textContent).toContain('(3 Results)');
    wrapper.unmount();
  });

  it('disables export while counts are loading', async () => {
    const wrapper = mountModal({ isCountLoading: true });
    await flushPromises();
    expect(wrapper.findComponent(FormModal).props('okDisabled')).toBe(true);
    wrapper.unmount();
  });

  it('disables export and shows the limit alert when all assets exceed 200000', async () => {
    const wrapper = mountModal({ allAssetsCount: 200001, isAllAssetsLimitExceeded: true });
    await flushPromises();
    expect(document.body.textContent).toContain('Export is limited to 200000 assets');
    expect(wrapper.findComponent(FormModal).props('okDisabled')).toBe(true);
    wrapper.unmount();
  });

  it('disables export when the visible scope has no tab count in search mode', async () => {
    const wrapper = mountModal({ exportScope: 'visible', tabAssetsCount: 0, isTabScopeDisabled: true });
    await flushPromises();
    expect(wrapper.findComponent(FormModal).props('okDisabled')).toBe(true);
    wrapper.unmount();
  });

  it('shows the inline export error', async () => {
    const wrapper = mountModal({ exportError: 'Export failed due to a server error.' });
    await flushPromises();
    expect(document.body.textContent).toContain('Export failed due to a server error.');
    wrapper.unmount();
  });

  it('emits the scope change when a scope card is clicked', async () => {
    const wrapper = mountModal();
    await flushPromises();
    (document.body.querySelector('[data-testid="export-scope-visible-card"]') as HTMLElement).click();
    await flushPromises();
    expect(wrapper.emitted('update:exportScope')).toEqual([['visible']]);
    wrapper.unmount();
  });

  it('emits ok from the Export button and cancel from the Cancel button', async () => {
    const wrapper = mountModal();
    await flushPromises();
    (document.body.querySelector('.ant-modal-footer .ant-btn-primary') as HTMLElement).click();
    await flushPromises();
    expect(wrapper.emitted('ok')).toHaveLength(1);
    (document.body.querySelector('.ant-modal-footer .ant-btn-default') as HTMLElement).click();
    await flushPromises();
    expect(wrapper.emitted('cancel')).toHaveLength(1);
    wrapper.unmount();
  });
});
