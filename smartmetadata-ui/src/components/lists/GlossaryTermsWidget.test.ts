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
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryHistory, createRouter } from 'vue-router';
import { VERSION_VIEW_GLOSSARY_PERMISSION } from '@/composables/useEntityPermissions';
import { createTestI18n } from '@/test/i18n';
import type { Glossary, GlossaryTerm } from '@/types/governance';
import GlossaryTermsWidget from './GlossaryTermsWidget.vue';

const {
  listFirstLevelMock,
  searchGlossaryTermsMock,
  listGlossaryTermsMock,
  listChildrenLazyMock,
  patchGlossaryTermMock,
  listTasksMock,
  resolveTaskMock,
  getEntityPermissionByFqnMock,
} = vi.hoisted(() => ({
  listFirstLevelMock: vi.fn(),
  searchGlossaryTermsMock: vi.fn(),
  listGlossaryTermsMock: vi.fn(),
  listChildrenLazyMock: vi.fn(),
  patchGlossaryTermMock: vi.fn(),
  listTasksMock: vi.fn(),
  resolveTaskMock: vi.fn(),
  getEntityPermissionByFqnMock: vi.fn(),
}));

vi.mock('@/api/glossaryTerms', () => ({
  listFirstLevelGlossaryTermsPaginated: listFirstLevelMock,
  searchGlossaryTermsPaginated: searchGlossaryTermsMock,
  listGlossaryTerms: listGlossaryTermsMock,
  listGlossaryTermChildrenLazy: listChildrenLazyMock,
  patchGlossaryTerm: patchGlossaryTermMock,
}));

vi.mock('@/api/tasks', () => ({
  listTasks: listTasksMock,
  resolveTask: resolveTaskMock,
}));

vi.mock('@/stores/permissions', () => ({
  usePermissionStore: () => ({
    isAdminUser: false,
    getResourcePermission: vi.fn(),
    getEntityPermissionById: vi.fn(),
    getEntityPermissionByFqn: getEntityPermissionByFqnMock,
  }),
}));

vi.mock('@/stores/auth', () => ({
  useAuthStore: () => ({ user: { id: 'u1', name: 'user1' } }),
}));

const GLOSSARY: Glossary = {
  id: 'g1',
  name: 'glossary',
  fullyQualifiedName: 'g',
  owners: [],
  reviewers: [],
  tags: [],
  domains: [],
};

function term(overrides: Partial<GlossaryTerm>): GlossaryTerm {
  return {
    id: 't1',
    name: 'a',
    fullyQualifiedName: 'g.a',
    relatedTerms: [],
    owners: [],
    reviewers: [],
    domains: [],
    synonyms: [],
    references: [],
    tags: [],
    ...overrides,
  };
}

const TERM_A = term({ id: 't1', name: 'a', fullyQualifiedName: 'g.a', status: 'Approved', childrenCount: 1 });
const TERM_B = term({
  id: 't2',
  name: 'b',
  fullyQualifiedName: 'g.b',
  status: 'InReview',
  childrenCount: 0,
  reviewers: [{ id: 'u1', name: 'user1' }],
});
const TERM_A1 = term({
  id: 't3',
  name: 'a1',
  fullyQualifiedName: 'g.a.a1',
  parent: { id: 't1', name: 'a', fullyQualifiedName: 'g.a', type: 'glossaryTerm' },
  status: 'Draft',
  childrenCount: 0,
});

async function mountWidget(props: Record<string, unknown> = {}) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/governance/terms/:id', name: 'governance-term', component: { template: '<div />' } },
      { path: '/bulk/edit/:entityType/:fqn', name: 'bulk-edit', component: { template: '<div />' } },
    ],
  });
  await router.push('/governance/glossary/g1');
  await router.isReady();
  const wrapper = mount(GlossaryTermsWidget, {
    props: { glossary: GLOSSARY, ...props },
    global: { plugins: [router, Antd, createTestI18n()] },
  });
  await flushPromises();
  return { wrapper, router };
}

function rowFor(wrapper: ReturnType<typeof mount>, name: string) {
  const rows = wrapper.findAll('tbody tr');
  const row = rows.find((item) => item.text().includes(name));
  if (!row) {
    throw new Error(`no table row for ${name}`);
  }
  return row;
}

describe('GlossaryTermsWidget', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listFirstLevelMock.mockResolvedValue({ data: [TERM_A, TERM_B], total: 2 });
    searchGlossaryTermsMock.mockResolvedValue({ total: 0, hits: [] });
    listGlossaryTermsMock.mockResolvedValue({ data: [TERM_A, TERM_A1], total: 2 });
    listChildrenLazyMock.mockResolvedValue({ data: [TERM_A1] });
    patchGlossaryTermMock.mockResolvedValue({});
    listTasksMock.mockResolvedValue({
      data: [
        {
          id: 'task1',
          about: { type: 'glossaryTerm', fullyQualifiedName: 'g.b' },
          assignees: [{ id: 'u1', name: 'user1' }],
          status: 'Open',
        },
      ],
      total: 1,
    });
    resolveTaskMock.mockResolvedValue({ id: 'task1', status: 'Closed', assignees: [] });
    getEntityPermissionByFqnMock.mockResolvedValue({ ViewBasic: true, Create: true, EditAll: true });
  });

  it('lists first-level terms with status and fetches the approval tasks', async () => {
    const { wrapper } = await mountWidget();
    expect(listFirstLevelMock).toHaveBeenCalledWith('g', 50, undefined, undefined, undefined);
    expect(listTasksMock).toHaveBeenCalledWith(
      expect.objectContaining({ aboutEntity: 'g', status: 'Open', category: 'Approval', type: 'RequestApproval' }),
    );
    expect(wrapper.text()).toContain('Approved');
    expect(wrapper.text()).toContain('InReview');
    wrapper.unmount();
  });

  it('lazy-loads children on row expand', async () => {
    const { wrapper } = await mountWidget();
    expect(wrapper.findAll('tbody tr')).toHaveLength(2);
    await wrapper.find('.ant-table-row-expand-icon').trigger('click');
    await flushPromises();
    expect(listChildrenLazyMock).toHaveBeenCalledWith('g.a', 50, undefined);
    expect(wrapper.findAll('tbody tr')).toHaveLength(3);
    wrapper.unmount();
  });

  it('appends the next children page via load-more without duplicating the first page', async () => {
    const termA2 = term({
      id: 't4',
      name: 'a2',
      fullyQualifiedName: 'g.a.a2',
      parent: { id: 't1', name: 'a', fullyQualifiedName: 'g.a', type: 'glossaryTerm' },
      status: 'Approved',
      childrenCount: 0,
    });
    listChildrenLazyMock
      .mockResolvedValueOnce({ data: [TERM_A1], after: 'a1' })
      .mockResolvedValue({ data: [termA2] });
    const { wrapper } = await mountWidget();
    await wrapper.find('.ant-table-row-expand-icon').trigger('click');
    await flushPromises();
    expect(listChildrenLazyMock).toHaveBeenCalledWith('g.a', 50, undefined);
    const more = wrapper.find('[data-testid="load-more-children"]');
    expect(more.exists()).toBe(true);
    await more.trigger('click');
    await flushPromises();
    // The cursor captured on the pseudo row must be the page-2 cursor:
    // re-fetching page 1 would duplicate a1.
    expect(listChildrenLazyMock).toHaveBeenLastCalledWith('g.a', 50, 'a1');
    expect(wrapper.text()).toContain('a2');
    expect(wrapper.findAll('tbody tr').filter((row) => row.text().includes('a1'))).toHaveLength(1);
    expect(wrapper.find('[data-testid="load-more-children"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it('builds the whole tree on expand-all', async () => {
    const { wrapper } = await mountWidget();
    await wrapper.find('[data-testid="expand-collapse-all-button"]').trigger('click');
    await flushPromises();
    expect(listGlossaryTermsMock).toHaveBeenCalledWith({ glossary: 'g1', limit: 50, after: undefined });
    expect(wrapper.text()).toContain('a1');
    wrapper.unmount();
  });

  it('approves an InReview term through its open task and flips its status', async () => {
    const { wrapper } = await mountWidget();
    const approve = wrapper.find('[data-testid="approve-term-b"]');
    expect(approve.exists()).toBe(true);
    await approve.trigger('click');
    await flushPromises();
    expect(resolveTaskMock).toHaveBeenCalledWith('task1', { newValue: 'approved', resolutionType: 'Approved' });
    expect(wrapper.find('[data-testid="approve-term-b"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it('rejects through the comment dialog', async () => {
    const { wrapper } = await mountWidget();
    await wrapper.find('[data-testid="reject-term-b"]').trigger('click');
    await flushPromises();
    const textarea = document.querySelector('textarea[data-testid="reject-comment"]') as HTMLTextAreaElement;
    expect(textarea).not.toBeNull();
    textarea.value = 'not good';
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    await flushPromises();
    const okButton = document.querySelector('.ant-modal-footer .ant-btn-primary') as HTMLElement;
    okButton.click();
    await flushPromises();
    expect(resolveTaskMock).toHaveBeenCalledWith('task1', {
      comment: 'not good',
      newValue: 'rejected',
      resolutionType: 'Rejected',
    });
    wrapper.unmount();
  });

  it('refetches with the selected status filter', async () => {
    const { wrapper } = await mountWidget();
    const select = wrapper.findComponent(Select);
    await select.vm.$emit('change', ['Draft']);
    await flushPromises();
    expect(listFirstLevelMock).toHaveBeenLastCalledWith('g', 50, undefined, 'Draft', undefined);
    wrapper.unmount();
  });

  it('shows the bulk-edit button with EditAll and navigates to the bulk-edit route', async () => {
    const { wrapper, router } = await mountWidget();
    await wrapper.find('[data-testid="bulk-edit-table"]').trigger('click');
    await flushPromises();
    expect(router.currentRoute.value.name).toBe('bulk-edit');
    expect(router.currentRoute.value.params).toMatchObject({ entityType: 'glossaryTerm', fqn: 'g' });
    wrapper.unmount();
  });

  it('emits add-term for a child only on Approved rows and edit-term from the row action', async () => {
    const { wrapper } = await mountWidget();
    expect(wrapper.find('[data-testid="add-sub-term-a"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="add-sub-term-b"]').exists()).toBe(false);
    await wrapper.find('[data-testid="add-sub-term-a"]').trigger('click');
    expect(wrapper.emitted('add-term')?.[0]?.[0]).toMatchObject({ fullyQualifiedName: 'g.a' });
    await wrapper.find('[data-testid="edit-term-b"]').trigger('click');
    expect(wrapper.emitted('edit-term')?.[0]?.[0]).toMatchObject({ fullyQualifiedName: 'g.b' });
    wrapper.unmount();
  });

  it('opens the move confirmation when a term is dropped on another term', async () => {
    const { wrapper } = await mountWidget();
    const rowA = rowFor(wrapper, 'a');
    const rowB = rowFor(wrapper, 'b');
    await rowA.trigger('dragstart');
    await rowB.trigger('dragover');
    await rowB.trigger('drop');
    await flushPromises();
    expect(document.body.textContent).toContain('Move the term');
    expect(document.body.textContent).toContain('Move a under b.');
    wrapper.unmount();
  });

  it('shows the empty placeholder with an add CTA when the glossary has no terms', async () => {
    listFirstLevelMock.mockResolvedValue({ data: [], total: 0 });
    const { wrapper } = await mountWidget();
    expect(wrapper.text()).toContain('No terms yet.');
    expect(wrapper.find('[data-testid="add-term"]').exists()).toBe(true);
    wrapper.unmount();
  });

  it('hides add and bulk-edit when official VERSION_VIEW_GLOSSARY_PERMISSION is passed, even if the live store would grant them', async () => {
    const { wrapper } = await mountWidget({ permissions: VERSION_VIEW_GLOSSARY_PERMISSION });
    expect(wrapper.find('[data-testid="add-term"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="bulk-edit-table"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="add-sub-term-a"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="edit-term-b"]').exists()).toBe(false);
    expect(getEntityPermissionByFqnMock).not.toHaveBeenCalled();
    wrapper.unmount();
  });
});
