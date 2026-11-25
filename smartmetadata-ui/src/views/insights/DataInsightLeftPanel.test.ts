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
import { createTestI18n } from '@/test/i18n';
import DataInsightLeftPanel from './DataInsightLeftPanel.vue';

const stub = { template: '<div />' };

function mountPanel(currentKey: string) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/insights/data-assets', name: 'insights-data-assets', component: stub },
      { path: '/insights/app-analytics', name: 'insights-app-analytics', component: stub },
      { path: '/insights/kpis', name: 'insights-kpis', component: stub },
    ],
  });
  const wrapper = mount(DataInsightLeftPanel, {
    props: { currentKey },
    global: { plugins: [router, Antd, createTestI18n()] },
  });
  return wrapper;
}

describe('DataInsightLeftPanel (pin DataInsightLeftPanel.tsx:33-48)', () => {
  it('renders the three pin tabs as links to their routes', () => {
    const wrapper = mountPanel('data-assets');
    const nav = wrapper.find('[data-testid="data-insight-left-panel"]');
    expect(nav.exists()).toBe(true);
    expect(nav.attributes('aria-label')).toBe('Data Insight');
    const links = [
      ['data-assets', '/insights/data-assets', 'Data Assets'],
      ['app-analytics', '/insights/app-analytics', 'App analytics'],
      ['kpis', '/insights/kpis', 'KPIs'],
    ] as const;
    for (const [key, href, label] of links) {
      const link = wrapper.find(`[data-testid="data-insight-tab-${key}"]`);
      expect(link.exists()).toBe(true);
      expect(link.attributes('href')).toBe(href);
      expect(link.text()).toContain(label);
    }
    expect(wrapper.find('[data-testid="data-insight-tab-online-users"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it('marks only the current tab (pin NavItemBase current)', () => {
    const wrapper = mountPanel('app-analytics');
    const current = wrapper.find('[data-testid="data-insight-tab-app-analytics"]');
    expect(current.attributes('aria-current')).toBe('page');
    expect(current.classes()).toContain('data-insight-left-panel__item--current');
    for (const key of ['data-assets', 'kpis']) {
      const link = wrapper.find(`[data-testid="data-insight-tab-${key}"]`);
      expect(link.attributes('aria-current')).toBeUndefined();
      expect(link.classes()).not.toContain('data-insight-left-panel__item--current');
    }
    wrapper.unmount();
  });
});
