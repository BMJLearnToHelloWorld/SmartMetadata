/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { mount } from '@vue/test-utils';
import Antd from 'ant-design-vue';
import { describe, expect, it } from 'vitest';
import { createMemoryHistory, createRouter } from 'vue-router';
import { defineComponent, h } from 'vue';
import { createTestI18n } from '@/test/i18n';
import DataInsightLayout from './DataInsightLayout.vue';

const stub = { template: '<div />' };

function mountLayout(tabKey: string) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/insights/data-assets', name: 'insights-data-assets', component: stub },
      { path: '/insights/app-analytics', name: 'insights-app-analytics', component: stub },
      { path: '/insights/kpis', name: 'insights-kpis', component: stub },
    ],
  });
  const host = defineComponent({
    render() {
      return h(
        DataInsightLayout,
        { tabKey },
        { default: () => 'PAGE BODY' },
      );
    },
  });
  return mount(host, {
    global: { plugins: [router, Antd, createTestI18n()] },
    attachTo: document.body,
  });
}

describe('DataInsightLayout (pin DataInsightPage.component.tsx:148-184)', () => {
  it('renders the left panel with pin testids and the page slot', () => {
    const wrapper = mountLayout('data-assets');
    expect(wrapper.find('[data-testid="data-insight-left-panel"]').exists()).toBe(true);
    expect(wrapper.text()).toContain('Data Insight');
    expect(wrapper.text()).toContain('PAGE BODY');
    expect(wrapper.find('[data-testid="data-insight-tab-data-assets"]').attributes('aria-current')).toBe('page');
    wrapper.unmount();
  });

  it('sizes the panels per pin (first 280px / flex 0.13, second 800px / flex 0.87)', () => {
    const wrapper = mountLayout('kpis');
    // Both panels carry pin's shared className as testid, as in pin;
    // the first element is the left panel, the second the content.
    const panels = wrapper.findAll('[data-testid="content-resizable-panel-container"]');
    expect(panels).toHaveLength(2);
    const firstStyle = (panels[0]?.element as HTMLElement).getAttribute('style') ?? '';
    const secondStyle = (panels[1]?.element as HTMLElement).getAttribute('style') ?? '';
    expect(firstStyle).toContain('min-width: 280px');
    // The component formats 13.00%; the DOM serialises it back as 13%.
    expect(firstStyle).toContain('calc(13% - 1.04px)');
    expect(secondStyle).toContain('min-width: 800px');
    wrapper.unmount();
  });

  it('collapses the left panel from the splitter, keeping the content (pin ResizableLeftPanels)', async () => {
    const wrapper = mountLayout('app-analytics');
    await wrapper.find('[data-testid="sidebar-collapse"]').trigger('click');
    expect(wrapper.find('[data-testid="data-insight-left-panel"]').exists()).toBe(false);
    expect(wrapper.text()).toContain('PAGE BODY');
    expect(wrapper.find('[data-testid="sidebar-toggle"]').exists()).toBe(true);
    await wrapper.find('[data-testid="sidebar-toggle"]').trigger('click');
    expect(wrapper.find('[data-testid="data-insight-left-panel"]').exists()).toBe(true);
    wrapper.unmount();
  });
});
