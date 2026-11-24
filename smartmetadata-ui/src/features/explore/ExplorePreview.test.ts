/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { mount } from '@vue/test-utils';
import Antd from 'ant-design-vue';
import { describe, expect, it } from 'vitest';
import { createTestI18n } from '@/test/i18n';
import type { SearchHit } from '@/types/api';
import ExplorePreview from './ExplorePreview.vue';

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
  return mount(ExplorePreview, {
    props: { hit },
    global: { plugins: [Antd, createTestI18n()] },
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

describe('ExplorePreview D26 governance detail navigation', () => {
  function governanceHit(entityType: string, id?: string): SearchHit {
    return {
      name: 'term',
      fullyQualifiedName: 'biz.term',
      entityType,
      owners: [],
      tags: [],
      domains: [],
      dataProducts: [],
      ...(id ? { id } : {}),
    };
  }

  it.each(['glossaryTerm', 'tag', 'dataProduct'])(
    'opens a %s hit instead of showing the unwired marker',
    (entityType) => {
      const hit = governanceHit(entityType, `${entityType}-1`);
      const wrapper = mountPreview(hit);
      expect(wrapper.find('[data-testid="explore-preview-open"]').exists()).toBe(true);
      expect(wrapper.text()).not.toContain('Detail page not wired for this type');
      wrapper.find('[data-testid="explore-preview-open"]').trigger('click');
      expect(wrapper.emitted('open')).toBeTruthy();
      expect(wrapper.emitted('open')?.[0]).toEqual([hit]);
      wrapper.unmount();
    },
  );

  it('keeps the unwired marker for a governance hit without an id', () => {
    const wrapper = mountPreview(governanceHit('tag'));
    expect(wrapper.find('[data-testid="explore-preview-open"]').exists()).toBe(false);
    expect(wrapper.text()).toContain('Detail page not wired for this type');
    wrapper.unmount();
  });
});

describe('ExplorePreview D25 lineage entry', () => {
  it('emits openLineage for a lineage-capable hit', async () => {
    const hit = hitWith(undefined);
    const wrapper = mountPreview(hit);
    const lineage = wrapper.find('[data-testid="explore-preview-lineage"]');
    expect(lineage.exists()).toBe(true);
    expect(lineage.text()).toContain('Open lineage');
    await lineage.trigger('click');
    expect(wrapper.emitted('openLineage')).toBeTruthy();
    expect(wrapper.emitted('openLineage')?.[0]).toEqual([hit]);
    wrapper.unmount();
  });

  it.each(['glossaryTerm', 'tag', 'dataProduct'])(
    'shows no lineage entry for a %s hit',
    (entityType) => {
      const wrapper = mountPreview({
        name: 'term',
        fullyQualifiedName: 'biz.term',
        entityType,
        owners: [],
        tags: [],
        domains: [],
        dataProducts: [],
        id: `${entityType}-1`,
      });
      expect(wrapper.find('[data-testid="explore-preview-lineage"]').exists()).toBe(false);
      wrapper.unmount();
    },
  );
});
