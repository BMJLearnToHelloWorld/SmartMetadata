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
import { describe, expect, it, vi } from 'vitest';
import { createTestI18n } from '@/test/i18n';
import ConceptEditorPanel from './ConceptEditorPanel.vue';

vi.mock('@/api/ontologyEdit', () => ({
  createOntologyAxiom: vi.fn(),
  createOntologyConcept: vi.fn(),
  createOntologyProperty: vi.fn(),
  deleteGlossaryTermWithImpact: vi.fn(async () => ({})),
  patchOntologyConcept: vi.fn(),
  previewGlossaryTermDeleteImpact: vi.fn(async () => ({
    impactToken: 'tok-1',
    children: [{ id: 'c1', name: 'child' }],
    boundAssetCount: 2,
    mappingCount: 1,
    boundAssets: [],
  })),
}));

import { deleteGlossaryTermWithImpact, previewGlossaryTermDeleteImpact } from '@/api/ontologyEdit';

function mountPanel() {
  return mount(ConceptEditorPanel, {
    props: { ontologyFqn: 'onto', canEdit: true },
    global: { plugins: [Antd, createTestI18n()] },
  });
}

describe('ConceptEditorPanel impact delete', () => {
  it('previews, then executes the delete with the preview token and reassignment target', async () => {
    const wrapper = mountPanel();
    await wrapper.get('[data-testid="ontology-impact-term-id"]').setValue('t1');
    await wrapper.get('[data-testid="ontology-impact-preview"]').trigger('click');
    await flushPromises();
    expect(previewGlossaryTermDeleteImpact).toHaveBeenCalledWith('t1');
    expect(wrapper.find('[data-testid="ontology-impact-result"]').exists()).toBe(true);

    // Official guard: children exist and neither cascade nor a target is
    // chosen, so the confirm button stays disabled.
    const deleteButton = wrapper.get('[data-testid="ontology-impact-delete"]');
    expect((deleteButton.element as HTMLButtonElement).disabled).toBe(true);

    await wrapper.get('[data-testid="ontology-impact-reassign-id"]').setValue('t2');
    await flushPromises();
    expect((deleteButton.element as HTMLButtonElement).disabled).toBe(false);

    await deleteButton.trigger('click');
    await flushPromises();
    expect(deleteGlossaryTermWithImpact).toHaveBeenCalledWith('t1', {
      cascadeConfirmed: false,
      hardDelete: false,
      impactToken: 'tok-1',
      reassignChildrenTo: { id: 't2', type: 'glossaryTerm' },
    });
    expect(wrapper.emitted('term-deleted')).toEqual([['t1']]);
    expect(wrapper.find('[data-testid="ontology-impact-result"]').exists()).toBe(false);
    wrapper.unmount();
  });
});
