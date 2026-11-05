/**
 * Copyright 2026 SmartMetadata authors.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { flushPromises, mount } from '@vue/test-utils';
import Antd from 'ant-design-vue';
import { describe, expect, it, vi } from 'vitest';
import { createTestI18n } from '@/test/i18n';
import OntologyCanvasPanel from './OntologyCanvasPanel.vue';

const mocks = vi.hoisted(() => ({
  replaceMock: vi.fn(async (_id: string, request: { operations: unknown[] }) => ({
    id: 'd1',
    name: 'draft',
    state: 'DRAFT',
    operations: request.operations,
  })),
}));
const replaceMock = mocks.replaceMock;

vi.mock('@/api/ontology', () => ({
  listOntologyConcepts: vi.fn(async () => ({
    data: [
      { id: 'child', name: 'Child', owners: [], superClasses: [{ id: 'parent', name: 'Parent' }] },
      { id: 'parent', name: 'Parent', owners: [] },
    ],
    paging: { total: 2 },
  })),
}));

vi.mock('@/api/ontologyEdit', () => ({
  listOntologyChangeSets: vi.fn(async () => ({
    data: [{ id: 'd1', name: 'draft', state: 'DRAFT', operations: [] }],
    paging: { total: 1 },
  })),
  // The factory is hoisted above the module scope, so it must read the
  // hoisted container, not the module-level alias declared below it.
  replaceOntologyChangeOperations: mocks.replaceMock,
}));

const canvasStub = {
  name: 'OntologyGraphCanvas',
  props: ['graph', 'canEdit'],
  template: '<div data-testid="canvas-stub">{{ graph.nodes.length }}-{{ graph.edges.length }}-{{ canEdit }}</div>',
};

function mountPanel() {
  return mount(OntologyCanvasPanel, {
    props: {
      ontologyId: 'o1',
      ontologyFqn: 'onto',
      lease: { sessionId: 's1', version: 1 },
      canEdit: true,
    },
    global: {
      plugins: [Antd, createTestI18n()],
      stubs: { OntologyGraphCanvas: canvasStub },
    },
  });
}

describe('OntologyCanvasPanel', () => {
  it('renders server concepts as graph data and appends a canvas relation as a draft operation', async () => {
    const wrapper = mountPanel();
    await flushPromises();
    expect(wrapper.find('[data-testid="canvas-stub"]').text()).toBe('2-1-true');
    const canvas = wrapper.findComponent({ name: 'OntologyGraphCanvas' });
    canvas.vm.$emit('create-relation', { fromId: 'parent', toId: 'child', relationType: 'subClassOf' });
    await flushPromises();
    expect(replaceMock).toHaveBeenCalledTimes(1);
    const request = replaceMock.mock.calls[0]?.[1] as { operations: Array<Record<string, unknown>> };
    expect(request.operations[0]?.operationType).toBe('ADD_RELATIONSHIP');
    expect(request.operations[0]?.relationship).toEqual({
      fromTerm: { id: 'parent', type: 'ontologyConcept' },
      toTerm: { id: 'child', type: 'ontologyConcept' },
      relationshipType: { name: 'subClassOf', type: 'relationshipType' },
    });
  });

  it('appends a canvas-added concept as an UPSERT_CONCEPT draft operation', async () => {
    const wrapper = mountPanel();
    await flushPromises();
    await wrapper.find('[data-testid="ontology-canvas-new-concept"]').setValue('NewConcept');
    await wrapper.find('[data-testid="ontology-canvas-add-concept"]').trigger('click');
    await flushPromises();
    const request = replaceMock.mock.calls[0]?.[1] as { operations: Array<Record<string, unknown>> };
    expect(request.operations[0]?.operationType).toBe('UPSERT_CONCEPT');
    expect(request.operations[0]?.concept).toEqual({ name: 'NewConcept' });
  });
});
