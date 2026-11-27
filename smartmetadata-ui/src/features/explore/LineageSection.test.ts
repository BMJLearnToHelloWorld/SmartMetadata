/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0.
 */
import { flushPromises, mount } from '@vue/test-utils';
import Antd from 'ant-design-vue';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryHistory, createRouter } from 'vue-router';
import { createTestI18n } from '@/test/i18n';
import LineageSection from './LineageSection.vue';

vi.mock('@/api/lineage', () => ({
  getLineagePagingData: vi.fn(),
}));

import { getLineagePagingData } from '@/api/lineage';

const getMock = getLineagePagingData as unknown as ReturnType<typeof vi.fn>;

const PAGING = {
  upstreamDepthInfo: [
    { depth: 1, entityCount: 3 },
    { depth: 2, entityCount: 10 },
  ],
  downstreamDepthInfo: [{ depth: 1, entityCount: 2 }],
  maxUpstreamDepth: 2,
  maxDownstreamDepth: 1,
  totalUpstreamEntities: 13,
  totalDownstreamEntities: 2,
};

async function mountSection() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', name: 'home', component: { template: '<div>home</div>' } },
      {
        path: '/assets/:entityType/:fqn',
        name: 'asset',
        component: { template: '<div>asset</div>' },
      },
      {
        path: '/lineage/:entityType/:fqn',
        name: 'lineage',
        component: { template: '<div>lineage</div>' },
      },
    ],
  });
  await router.push('/');
  await router.isReady();
  const wrapper = mount(LineageSection, {
    props: { entityType: 'table', fqn: 'svc.db.schema.orders' },
    global: { plugins: [Antd, router, createTestI18n()] },
  });
  await flushPromises();
  return { wrapper, router };
}

describe('LineageSection (Q-TAB-4)', () => {
  beforeEach(() => {
    getMock.mockReset();
  });

  // E-3d retarget: the section click navigates to the entity detail
  // page's Lineage tab (pin `EntitySummaryPanel.handleLineageClick` →
  // `getEntityDetailsPath(type, fqn, EntityTabs.LINEAGE)`); the
  // full-page lineage graph was the previous destination.
  it('counts entities at depth 1 only and links to the detail-page Lineage tab', async () => {
    getMock.mockResolvedValue(PAGING);
    const { wrapper, router } = await mountSection();
    expect(getMock).toHaveBeenCalledWith({ fqn: 'svc.db.schema.orders', entityType: 'table' });
    // Depth-2 upstream (10) is NOT counted: pin counts depth 1 only.
    expect(wrapper.find('[data-testid="upstream-count"]').text()).toBe('3');
    expect(wrapper.find('[data-testid="downstream-count"]').text()).toBe('2');
    await wrapper.find('[data-testid="upstream-lineage"]').trigger('click');
    await flushPromises();
    expect(router.currentRoute.value.name).toBe('asset');
    expect(router.currentRoute.value.params.entityType).toBe('table');
    expect(router.currentRoute.value.params.fqn).toBe('svc.db.schema.orders');
    expect(router.currentRoute.value.query).toMatchObject({ tab: 'lineage' });
    wrapper.unmount();
  });

  it('shows the no-lineage message when both counts are zero', async () => {
    getMock.mockResolvedValue({
      upstreamDepthInfo: [],
      downstreamDepthInfo: [],
      maxUpstreamDepth: 0,
      maxDownstreamDepth: 0,
      totalUpstreamEntities: 0,
      totalDownstreamEntities: 0,
    });
    const { wrapper } = await mountSection();
    expect(wrapper.find('[data-testid="lineage-section-empty"]').text()).toContain('No lineage connections found');
    expect(wrapper.find('[data-testid="upstream-lineage"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="downstream-lineage"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it('shows the no-lineage message when the fetch fails', async () => {
    getMock.mockRejectedValue(new Error('boom'));
    const { wrapper } = await mountSection();
    expect(wrapper.find('[data-testid="lineage-section-empty"]').exists()).toBe(true);
    wrapper.unmount();
  });
});
