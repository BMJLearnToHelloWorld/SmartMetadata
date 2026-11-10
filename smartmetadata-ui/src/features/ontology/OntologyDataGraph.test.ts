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
import type { OntologyGraphData } from './ontologyGraph';
import OntologyDataGraph from './OntologyDataGraph.vue';

function graph(): OntologyGraphData {
  return {
    nodes: [
      {
        id: 't1',
        label: 'Customer',
        type: 'glossaryTerm',
        assetCount: 5,
        loadedAssetCount: 2,
      },
      { id: 'a1', label: 'customers', type: 'dataAsset', serviceLabel: 'table' },
      { id: 'a2', label: 'orders', type: 'dataAsset', serviceLabel: 'table' },
      { id: 't2', label: 'Order', type: 'glossaryTerm', assetCount: 0, loadedAssetCount: 0 },
    ],
    edges: [
      { id: 'a1|t1|hasGlossaryTerm', source: 'a1', target: 't1', label: 'tagged-with', relationType: 'hasGlossaryTerm', edgeKind: 'assetBinding' },
      { id: 'a2|t1|hasGlossaryTerm', source: 'a2', target: 't1', label: 'tagged-with', relationType: 'hasGlossaryTerm', edgeKind: 'assetBinding' },
      { id: 'r1', source: 't1', target: 't2', label: 'relatedTo', relationType: 'relatedTo' },
    ],
  };
}

function mountGraph(data: OntologyGraphData, extra: Record<string, unknown> = {}) {
  return mount(OntologyDataGraph, {
    props: { data, variant: 'glossary', ...extra },
    global: { plugins: [Antd, createTestI18n()] },
  });
}

describe('OntologyDataGraph', () => {
  it('renders one card per seed with its asset rows and a relation legend', () => {
    const wrapper = mountGraph(graph());
    expect(wrapper.find('[data-testid="ontology-data-graph"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="ontology-data-cluster-t1"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="ontology-data-cluster-t2"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="ontology-data-asset-a1"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="ontology-data-asset-a2"]').exists()).toBe(true);
    const legend = wrapper.find('[data-testid="ontology-data-graph-legend"]');
    expect(legend.text()).toContain('relatedTo');
  });

  it('emits load-more for a cluster with unloaded assets', async () => {
    const wrapper = mountGraph(graph());
    const button = wrapper.find('[data-testid="ontology-data-load-more-t1"]');
    expect(button.exists()).toBe(true);
    await button.trigger('click');
    expect(wrapper.emitted('load-more')).toEqual([['t1']]);
    // The fully loaded cluster shows no load-more button.
    expect(wrapper.find('[data-testid="ontology-data-load-more-t2"]').exists()).toBe(false);
  });

  it('emits select-node when a cluster card is clicked', async () => {
    const wrapper = mountGraph(graph());
    await wrapper.find('[data-testid="ontology-data-cluster-select-t1"]').trigger('click');
    expect(wrapper.emitted('select-node')).toEqual([['t1']]);
  });

  it('shows the load-more-terms button only when more terms exist', async () => {
    const wrapper = mountGraph(graph(), { hasMoreTerms: true });
    const button = wrapper.find('[data-testid="ontology-data-load-more-terms"]');
    expect(button.exists()).toBe(true);
    await button.trigger('click');
    expect(wrapper.emitted('load-more-terms')).toEqual([[]]);
    expect(mountGraph(graph(), { hasMoreTerms: false }).find('[data-testid="ontology-data-load-more-terms"]').exists()).toBe(false);
  });

  it('renders the empty state when there are no seeds', () => {
    const wrapper = mountGraph({ nodes: [], edges: [] });
    expect(wrapper.find('[data-testid="ontology-data-graph-empty"]').exists()).toBe(true);
  });
});
