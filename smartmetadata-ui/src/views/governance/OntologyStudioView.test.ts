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
import { createPinia, setActivePinia } from 'pinia';
import { describe, expect, it, vi } from 'vitest';
import { createTestI18n } from '@/test/i18n';
import OntologyStudioView from './OntologyStudioView.vue';

const permState = vi.hoisted(() => ({ isAdmin: false, ops: {} as Record<string, boolean> }));

vi.mock('@/stores/permissions', () => ({
  usePermissionStore: () => ({
    isAdminUser: permState.isAdmin,
    getEntityPermissionByFqn: vi.fn(async () => permState.ops),
  }),
}));

vi.mock('@/api/ontology', () => ({
  listOntologies: vi.fn(async () => ({
    data: [{ id: 'o1', name: 'onto', displayName: 'Onto', fullyQualifiedName: 'onto' }],
    paging: { total: 1 },
  })),
}));

// The panels run their own network loads; stub them so this test proves
// the studio's own wiring (select + permission gate → lock bar) without
// re-testing each panel's behaviour here.
const panelStub = { template: '<div />' };

function mountStudio() {
  const pinia = createPinia();
  setActivePinia(pinia);
  return mount(OntologyStudioView, {
    global: {
      plugins: [pinia, Antd, createTestI18n()],
      stubs: {
        ChangeSetPanel: panelStub,
        OntologyCanvasPanel: panelStub,
        ConceptEditorPanel: panelStub,
        BulkAuthoringPanel: panelStub,
        AiSuggestionsPanel: panelStub,
        ReasoningPanel: panelStub,
        PackInstallPanel: panelStub,
        PublicationPanel: panelStub,
        ReviewTasksPanel: panelStub,
      },
    },
  });
}

describe('OntologyStudioView', () => {
  it('disables editing when the caller has no grant and is not admin', async () => {
    permState.isAdmin = false;
    permState.ops = {};
    const wrapper = mountStudio();
    await flushPromises();
    expect(wrapper.find('[data-testid="ontology-studio"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="ontology-edit-lock-denied"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="ontology-edit-lock-acquire"]').exists()).toBe(false);
  });

  it('enables the lease acquire button for an admin', async () => {
    permState.isAdmin = true;
    permState.ops = {};
    const wrapper = mountStudio();
    await flushPromises();
    expect(wrapper.find('[data-testid="ontology-edit-lock-denied"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="ontology-edit-lock-acquire"]').exists()).toBe(true);
  });
});
