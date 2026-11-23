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
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryHistory, createRouter } from 'vue-router';
import { createTestI18n } from '@/test/i18n';
import type { SearchHit } from '@/types/api';
import ExplorePreview from './ExplorePreview.vue';

vi.mock('@/api/lineage', () => ({
  getLineagePagingData: vi.fn(),
}));

import { getLineagePagingData } from '@/api/lineage';

const getMock = getLineagePagingData as unknown as ReturnType<typeof vi.fn>;

function hitWith(usageSummary: SearchHit['usageSummary']): SearchHit {
  return {
    name: 'orders',
    fullyQualifiedName: 'svc.db.schema.orders',
    entityType: 'table',
    owners: [],
    tags: [],
    domains: [],
    dataProducts: [],
    usageSummary,
  };
}

function mountPreview(hit: SearchHit | null) {
  // Q-TAB-4: the mounted LineageSection calls useRouter on click, so the
  // preview mounts with a memory router.
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', name: 'home', component: { template: '<div>home</div>' } },
      {
        path: '/lineage/:entityType/:fqn',
        name: 'lineage',
        component: { template: '<div>lineage</div>' },
      },
    ],
  });
  return mount(ExplorePreview, {
    props: { hit },
    global: { plugins: [Antd, router, createTestI18n()] },
  });
}

describe('ExplorePreview usage row', () => {
  it('shows the non-literal percentile when a weekly rank is present', () => {
    const wrapper = mountPreview(hitWith({ weeklyStats: { count: 20, percentileRank: 45 } }));
    expect(wrapper.text()).toContain('Usage');
    expect(wrapper.text()).toContain('45th pctile');
    wrapper.unmount();
  });

  it('shows the NO_DATA marker when usageSummary is present without a rank', () => {
    const wrapper = mountPreview(hitWith({}));
    const overview = wrapper.find('[data-testid="explore-preview-overview"]');
    expect(overview.text()).toContain('Usage');
    expect(overview.text()).toContain('-');
    expect(overview.text()).not.toContain('pctile');
    wrapper.unmount();
  });

  it('shows no Usage row when the hit carries no usageSummary key', () => {
    const wrapper = mountPreview(hitWith(undefined));
    expect(wrapper.find('[data-testid="explore-preview-overview"]').exists()).toBe(false);
    wrapper.unmount();
  });
});

describe('ExplorePreview Generated-tag rendering', () => {
  it('renders a Generated tag plain, with no badge class (pin gate, D-F1)', () => {
    const wrapper = mountPreview({
      ...hitWith(undefined),
      tags: [{ tagFQN: 'PII.Email', name: 'Email', source: 'Classification', labelType: 'Generated' }],
    });
    const chips = wrapper.findAll('.ant-tag');
    expect(chips.map((chip) => chip.text().trim())).toContain('Email');
    for (const chip of chips) {
      expect(chip.classes()).not.toContain('asset-overview__generated-tag');
    }
    wrapper.unmount();
  });
});

describe('ExplorePreview lineage section (Q-TAB-4)', () => {
  beforeEach(() => {
    getMock.mockReset();
    getMock.mockResolvedValue({
      upstreamDepthInfo: [{ depth: 1, entityCount: 1 }],
      downstreamDepthInfo: [{ depth: 1, entityCount: 4 }],
      maxUpstreamDepth: 1,
      maxDownstreamDepth: 1,
      totalUpstreamEntities: 1,
      totalDownstreamEntities: 4,
    });
  });

  it('renders the lineage section after overview for a lineage type', async () => {
    const wrapper = mountPreview(hitWith({ weeklyStats: { count: 20, percentileRank: 45 } }));
    await flushPromises();
    const section = wrapper.find('[data-testid="explore-preview-lineage"]');
    expect(section.exists()).toBe(true);
    expect(wrapper.find('[data-testid="upstream-count"]').text()).toBe('1');
    expect(wrapper.find('[data-testid="downstream-count"]').text()).toBe('4');
    // Pin section order: description, overview, lineage, owners.
    const blocks = wrapper.findAll('.preview__block');
    const testIds = blocks.map((block) => block.attributes('data-testid'));
    expect(testIds.indexOf('explore-preview-overview')).toBeLessThan(
      testIds.indexOf('explore-preview-lineage'),
    );
    expect(testIds.indexOf('explore-preview-lineage')).toBeLessThan(
      testIds.indexOf('explore-preview-owners'),
    );
    wrapper.unmount();
  });

  it('omits the lineage section for types outside the pin set (metric)', async () => {
    const wrapper = mountPreview({ ...hitWith(undefined), entityType: 'metric' });
    await flushPromises();
    expect(wrapper.find('[data-testid="explore-preview-lineage"]').exists()).toBe(false);
    expect(getMock).not.toHaveBeenCalled();
    wrapper.unmount();
  });
});
