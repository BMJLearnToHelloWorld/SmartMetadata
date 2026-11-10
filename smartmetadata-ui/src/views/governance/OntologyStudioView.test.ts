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
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryHistory, createRouter } from 'vue-router';
import { createTestI18n } from '@/test/i18n';
import OntologyStudioView from './OntologyStudioView.vue';

const permState = vi.hoisted(() => ({
  isAdmin: false,
  ops: {} as Record<string, boolean>,
  ontologies: [{ id: 'o1', name: 'onto', displayName: 'Onto', fullyQualifiedName: 'onto' }],
}));

vi.mock('@/stores/permissions', () => ({
  usePermissionStore: () => ({
    isAdminUser: permState.isAdmin,
    getEntityPermissionByFqn: vi.fn(async () => permState.ops),
  }),
}));

vi.mock('@/api/ontology', () => ({
  listOntologies: vi.fn(async () => ({
    data: permState.ontologies,
    paging: { total: permState.ontologies.length },
  })),
}));

// The panels run their own network loads; stub them so this test proves
// the studio's own wiring (select + permission gate → lock bar) without
// re-testing each panel's behaviour here.
const panelStub = { template: '<div />' };

async function mountStudio(path = '/govern/ontology/studio') {
  const pinia = createPinia();
  setActivePinia(pinia);
  // The studio reads route.query.ontology for the explorer's Edit
  // deep-link, so it mounts under a router like it does in production.
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/govern/ontology/studio', name: 'ontology-studio', component: OntologyStudioView }],
  });
  await router.push(path);
  await router.isReady();
  return mount(OntologyStudioView, {
    global: {
      plugins: [pinia, router, Antd, createTestI18n()],
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
  beforeEach(() => {
    permState.isAdmin = false;
    permState.ops = {};
    permState.ontologies = [{ id: 'o1', name: 'onto', displayName: 'Onto', fullyQualifiedName: 'onto' }];
  });

  it('disables editing when the caller has no grant and is not admin', async () => {
    permState.isAdmin = false;
    permState.ops = {};
    const wrapper = await mountStudio();
    await flushPromises();
    expect(wrapper.find('[data-testid="ontology-studio"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="ontology-edit-lock-denied"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="ontology-edit-lock-acquire"]').exists()).toBe(false);
  });

  it('enables the lease acquire button for an admin', async () => {
    permState.isAdmin = true;
    permState.ops = {};
    const wrapper = await mountStudio();
    await flushPromises();
    expect(wrapper.find('[data-testid="ontology-edit-lock-denied"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="ontology-edit-lock-acquire"]').exists()).toBe(true);
  });

  it('preselects the ontology named by ?ontology= instead of the first one', async () => {
    permState.ontologies = [
      { id: 'o1', name: 'onto', displayName: 'Onto', fullyQualifiedName: 'onto' },
      { id: 'o2', name: 'second', displayName: 'Second', fullyQualifiedName: 'second' },
    ];
    const wrapper = await mountStudio('/govern/ontology/studio?ontology=o2');
    await flushPromises();
    expect(wrapper.find('[data-testid="ontology-studio-detail"]').exists()).toBe(true);
    expect(wrapper.find('.ant-select-selection-item').text()).toContain('Second');
  });

  it('falls back to the first ontology when ?ontology= names nothing loaded', async () => {
    permState.ontologies = [
      { id: 'o1', name: 'onto', displayName: 'Onto', fullyQualifiedName: 'onto' },
      { id: 'o2', name: 'second', displayName: 'Second', fullyQualifiedName: 'second' },
    ];
    const wrapper = await mountStudio('/govern/ontology/studio?ontology=missing');
    await flushPromises();
    expect(wrapper.find('.ant-select-selection-item').text()).toContain('Onto');
  });
});
