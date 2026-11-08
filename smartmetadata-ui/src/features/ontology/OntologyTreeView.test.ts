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
import { buildOntologyTreeIndex } from './ontologyTree';
import OntologyTreeView from './OntologyTreeView.vue';

const index = buildOntologyTreeIndex({
  nodes: [
    { id: 'parent', label: 'Party', fullyQualifiedName: 'sales.Party' },
    { id: 'child', label: 'Customer', fullyQualifiedName: 'sales.Customer' },
    { id: 'grandchild', label: 'VIP Customer', fullyQualifiedName: 'sales.VIPCustomer' },
    { id: 'lonely', label: 'Lonely' },
  ],
  edges: [
    { id: 'e1', relationType: 'subClassOf', source: 'child', target: 'parent' },
    { id: 'e2', relationType: 'subClassOf', source: 'grandchild', target: 'child' },
  ],
});

function mountTree(props: Record<string, unknown> = {}) {
  return mount(OntologyTreeView, {
    props: { index, ...props },
    global: { plugins: [Antd, createTestI18n()] },
  });
}

describe('OntologyTreeView', () => {
  it('renders connected hierarchy plus the unconnected section', () => {
    const wrapper = mountTree();
    const concepts = wrapper.find('[data-testid="ontology-tree-concepts"]');
    expect(concepts.text()).toContain('Concepts (3)');
    expect(wrapper.find('[data-testid="ontology-tree-term-parent"]').text()).toContain('Party');
    expect(wrapper.find('[data-testid="ontology-tree-term-parent"]').text()).toContain('sales.Party');
    expect(wrapper.find('[data-testid="ontology-tree-term-child"]').text()).toContain('1 children');
    expect(wrapper.find('[data-testid="ontology-tree-term-child"]').text()).toContain('2 relations');
    expect(wrapper.find('[data-testid="ontology-tree-term-grandchild"]').exists()).toBe(true);
    const unconnected = wrapper.find('[data-testid="ontology-tree-unconnected"]');
    expect(unconnected.text()).toContain('Not connected (1)');
    expect(wrapper.find('[data-testid="ontology-tree-term-lonely"]').exists()).toBe(true);
  });

  it('collapses a parent row and hides its children until expanded again', async () => {
    const wrapper = mountTree();
    await wrapper.find('[data-testid="ontology-tree-toggle-parent"]').trigger('click');
    expect(wrapper.find('[data-testid="ontology-tree-term-child"]').exists()).toBe(false);
    await wrapper.find('[data-testid="ontology-tree-toggle-parent"]').trigger('click');
    expect(wrapper.find('[data-testid="ontology-tree-term-child"]').exists()).toBe(true);
  });

  it('collapse-all hides every child row; expand-all restores them', async () => {
    const wrapper = mountTree();
    await wrapper.find('[data-testid="ontology-tree-collapse-all"]').trigger('click');
    expect(wrapper.find('[data-testid="ontology-tree-term-child"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="ontology-tree-term-grandchild"]').exists()).toBe(false);
    await wrapper.find('[data-testid="ontology-tree-expand-all"]').trigger('click');
    expect(wrapper.find('[data-testid="ontology-tree-term-child"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="ontology-tree-term-grandchild"]').exists()).toBe(true);
  });

  it('emits select-node on row click and marks the selected row', async () => {
    const wrapper = mountTree({ selectedNodeId: 'child' });
    expect(wrapper.find('[data-testid="ontology-tree-term-child"]').classes()).toContain('ontology-tree-row-selected');
    await wrapper.find('[data-testid="ontology-tree-term-grandchild"]').trigger('click');
    expect(wrapper.emitted('select-node')).toEqual([['grandchild']]);
  });

  it('filters rows to matches plus ancestors while searching', () => {
    const wrapper = mountTree({ searchQuery: 'vip' });
    expect(wrapper.find('[data-testid="ontology-tree-term-grandchild"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="ontology-tree-term-parent"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="ontology-tree-term-lonely"]').exists()).toBe(false);
  });

  it('shows the tree empty message for an empty index', () => {
    const empty = buildOntologyTreeIndex({ nodes: [], edges: [] });
    const wrapper = mountTree({ index: empty });
    expect(wrapper.find('[data-testid="ontology-tree-view"]').text()).toContain('No concepts in this graph.');
  });
});
