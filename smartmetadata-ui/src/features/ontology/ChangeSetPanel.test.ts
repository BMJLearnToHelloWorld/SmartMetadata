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
import Antd, { Select } from 'ant-design-vue';
import { describe, expect, it, vi } from 'vitest';
import { createTestI18n } from '@/test/i18n';
import ChangeSetPanel from './ChangeSetPanel.vue';

const draft = {
  id: 'cs-1',
  name: 'draft-1',
  displayName: 'Draft 1',
  fullyQualifiedName: 'draft-1',
  description: 'd',
  state: 'DRAFT',
  operations: [{ id: 'op-1', operationType: 'UPSERT_CONCEPT', state: 'ACTIVE', rationale: 'new' }],
  undoCursor: 1,
};

vi.mock('@/api/ontologyEdit', () => ({
  applyOntologyChangeSet: vi.fn(async () => draft),
  createOntologyChangeSet: vi.fn(async () => draft),
  deleteOntologyChangeSet: vi.fn(async () => undefined),
  discardOntologyChangeSet: vi.fn(async () => draft),
  getOntologyChangeSet: vi.fn(async () => draft),
  listOntologyChangeSets: vi.fn(async () => ({ data: [draft], paging: { total: 1 } })),
  redoOntologyChangeSet: vi.fn(async () => draft),
  replaceOntologyChangeOperations: vi.fn(async () => draft),
  submitOntologyChangeSet: vi.fn(async () => draft),
  undoOntologyChangeSet: vi.fn(async () => draft),
}));

import {
  createOntologyChangeSet,
  replaceOntologyChangeOperations,
  undoOntologyChangeSet,
} from '@/api/ontologyEdit';

function mountPanel(props: Record<string, unknown>) {
  return mount(ChangeSetPanel, {
    props: { ontologyId: 'o1', ontologyFqn: 'onto', lease: null, canEdit: true, canApply: true, ...props },
    global: { plugins: [Antd, createTestI18n()] },
  });
}

// Antd Select renders a div + a teleported dropdown that jsdom does not
// open reliably, so drive selection by emitting the v-model update the
// real component emits on selection (same strength: the panel's watcher
// loads the selected draft, exactly as a real selection would).
async function selectFirstDraft(wrapper: ReturnType<typeof mountPanel>): Promise<void> {
  const select = wrapper.findComponent(Select);
  if (!select.exists()) {
    throw new Error('draft select did not render');
  }
  (select.vm as unknown as { $emit: (event: string, value: string) => void }).$emit('update:value', 'cs-1');
  await flushPromises();
}

describe('ChangeSetPanel', () => {
  it('creates a draft from the form', async () => {
    const wrapper = mountPanel({});
    await flushPromises();
    await wrapper.get('[data-testid="ontology-draft-name"]').setValue('draft-2');
    await wrapper.get('[data-testid="ontology-draft-display-name"]').setValue('Draft 2');
    await wrapper.get('[data-testid="ontology-draft-description"]').setValue('desc');
    await wrapper.get('[data-testid="ontology-draft-create"]').trigger('click');
    await flushPromises();
    expect(createOntologyChangeSet).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'draft-2', displayName: 'Draft 2', description: 'desc' }),
    );
  });

  it('hides the operation form without a lease and shows the lock note', async () => {
    const wrapper = mountPanel({});
    await flushPromises();
    await selectFirstDraft(wrapper);
    await flushPromises();
    expect(wrapper.find('[data-testid="ontology-op-add-form"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="ontology-draft-lock-required"]').exists()).toBe(true);
  });

  it('appends an operation through replace with the lease', async () => {
    const wrapper = mountPanel({ lease: { sessionId: 'sess-9', version: 1 } });
    await flushPromises();
    await selectFirstDraft(wrapper);
    await flushPromises();
    await wrapper.get('[data-testid="ontology-op-target"]').setValue('concept-1');
    await wrapper.get('[data-testid="ontology-op-rationale"]').setValue('add');
    await wrapper.get('[data-testid="ontology-op-add"]').trigger('click');
    await flushPromises();
    expect(replaceOntologyChangeOperations).toHaveBeenCalledWith(
      'cs-1',
      expect.objectContaining({
        lease: { sessionId: 'sess-9', version: 1 },
        undoCursor: 2,
      }),
    );
    const operations = (replaceOntologyChangeOperations as unknown as { mock: { calls: unknown[][] } }).mock.calls[0]?.[1] as { operations: { id: string; operationType: string }[] };
    expect(operations.operations).toHaveLength(2);
    expect(operations.operations[1]?.operationType).toBe('UPSERT_CONCEPT');
  });

  it('sends undo with the lease', async () => {
    const wrapper = mountPanel({ lease: { sessionId: 'sess-9', version: 1 } });
    await flushPromises();
    await selectFirstDraft(wrapper);
    await flushPromises();
    await wrapper.get('[data-testid="ontology-draft-undo"]').trigger('click');
    await flushPromises();
    expect(undoOntologyChangeSet).toHaveBeenCalledWith('cs-1', { sessionId: 'sess-9', version: 1 });
  });
});
