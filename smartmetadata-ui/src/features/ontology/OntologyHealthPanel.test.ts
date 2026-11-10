/**
 * Copyright 2026 SmartMetadata authors.
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
import type { OntologyHealthSummary } from '@/types/ontologyDataGraph';
import OntologyHealthPanel from './OntologyHealthPanel.vue';

function health(overrides: Partial<OntologyHealthSummary> = {}): OntologyHealthSummary {
  return {
    connectedPercent: 50,
    connectedTermCount: 1,
    isolatedTerms: [
      { id: 't2', label: 'Beta', type: 'glossaryTermIsolated' },
      { id: 't3', label: 'Gamma', type: 'glossaryTermIsolated' },
    ],
    totalTermCount: 2,
    ...overrides,
  };
}

function mountPanel(props: Record<string, unknown>) {
  return mount(OntologyHealthPanel, {
    props: { health: health(), placement: 'floating', ...props },
    global: { plugins: [Antd, createTestI18n()] },
  });
}

describe('OntologyHealthPanel', () => {
  it('shows the connected percent and the isolated count in summary view', () => {
    const wrapper = mountPanel({});
    expect(wrapper.find('[data-testid="ontology-health-panel"]').exists()).toBe(true);
    expect(wrapper.text()).toContain('50%');
    expect(wrapper.text()).toContain('2 isolated terms');
  });

  it('opens the isolated list and emits connect for a term', async () => {
    const wrapper = mountPanel({});
    await wrapper.find('[data-testid="ontology-health-review"]').trigger('click');
    const terms = wrapper.findAll('[data-testid="ontology-health-isolated-term"]');
    expect(terms).toHaveLength(2);
    await wrapper.find('[data-testid="ontology-health-connect"]').trigger('click');
    expect(wrapper.emitted('connect')).toEqual([[{ id: 't2', label: 'Beta', type: 'glossaryTermIsolated' }]]);
  });

  it('uses the endpoint isolated count when the prop is given', () => {
    const wrapper = mountPanel({ isolatedTermCount: 7 });
    expect(wrapper.text()).toContain('7 isolated terms');
  });

  it('shows the all-connected state when nothing is isolated', () => {
    const wrapper = mountPanel({ health: health({ connectedPercent: 100, connectedTermCount: 2, isolatedTerms: [], totalTermCount: 2 }) });
    expect(wrapper.text()).toContain('All terms are connected.');
  });

  it('minimizes to the percent only', async () => {
    const wrapper = mountPanel({});
    await wrapper.find('[data-testid="ontology-health-minimize"]').trigger('click');
    expect(wrapper.text()).toContain('50%');
    expect(wrapper.find('[data-testid="ontology-health-review"]').exists()).toBe(false);
  });
});
