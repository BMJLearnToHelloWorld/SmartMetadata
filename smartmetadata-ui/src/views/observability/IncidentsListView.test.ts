/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { DOMWrapper, flushPromises, mount } from '@vue/test-utils';
import Antd from 'ant-design-vue';
import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryHistory, createRouter } from 'vue-router';
import { createTestI18n } from '@/test/i18n';
import IncidentsListView from './IncidentsListView.vue';

const listFromSearch = vi.fn();
const getByStateId = vi.fn();
const patchIncident = vi.fn();
const createIncident = vi.fn();
const listTestCases = vi.fn();
const postAggregate = vi.fn();
const getUserByNameMock = vi.fn();
const getTeamByNameMock = vi.fn();
const searchUsersMock = vi.fn();
const listTeamsMock = vi.fn();
const resolveTaskMock = vi.fn();
const createTaskMock = vi.fn();

const permState = vi.hoisted(() => ({
  isAdmin: false,
  resourceOps: {} as Record<string, boolean>,
  rowOps: {} as Record<string, boolean>,
  rejectResource: false,
}));
const domainState = vi.hoisted(() => ({
  activeDomain: null as { fullyQualifiedName: string } | null,
}));

vi.mock('@/api/testIncidents', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/api/testIncidents')>();
  return {
    ...actual,
    listTestCaseIncidentsFromSearch: (...args: unknown[]) => listFromSearch(...args),
    getTestCaseIncidentByStateId: (...args: unknown[]) => getByStateId(...args),
    patchTestIncident: (...args: unknown[]) => patchIncident(...args),
    createTestIncident: (...args: unknown[]) => createIncident(...args),
  };
});
vi.mock('@/api/testCases', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/api/testCases')>();
  return { ...actual, listTestCasesBySearch: (...args: unknown[]) => listTestCases(...args) };
});
vi.mock('@/api/search', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/api/search')>();
  return { ...actual, postAggregateFieldOptions: (...args: unknown[]) => postAggregate(...args) };
});
vi.mock('@/api/users', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/api/users')>();
  return {
    ...actual,
    getUserByName: (...args: unknown[]) => getUserByNameMock(...args),
    searchUsers: (...args: unknown[]) => searchUsersMock(...args),
  };
});
vi.mock('@/api/teams', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/api/teams')>();
  return {
    ...actual,
    getTeamByName: (...args: unknown[]) => getTeamByNameMock(...args),
    listTeams: (...args: unknown[]) => listTeamsMock(...args),
  };
});
vi.mock('@/api/tasks', () => ({
  resolveTask: (...args: unknown[]) => resolveTaskMock(...args),
  createTask: (...args: unknown[]) => createTaskMock(...args),
}));
vi.mock('@/stores/permissions', () => ({
  usePermissionStore: () => ({
    isAdminUser: permState.isAdmin,
    getResourcePermission: vi.fn(async () => {
      if (permState.rejectResource) {
        throw new Error('permission service down');
      }
      return permState.resourceOps;
    }),
    getEntityPermissionByFqn: vi.fn(async () => permState.rowOps),
  }),
}));
vi.mock('@/stores/domain', () => ({
  useDomainStore: () => ({ activeDomain: domainState.activeDomain }),
}));

const alice = { id: 'alice', name: 'alice', type: 'user', displayName: 'Alice' };
const bob = { id: 'bob', name: 'bob', type: 'user', displayName: 'Bob' };

const inc1 = {
  id: 'inc1',
  stateId: 'task-1',
  timestamp: 1760000000000,
  testCaseResolutionStatusType: 'New',
  severity: 'Severity2',
  testCaseReference: { id: 'tc-1', name: 'row_count', fullyQualifiedName: 'svc.db.schema.orders.row_count', displayName: 'Row count' },
  testCaseResolutionStatusDetails: { assignee: alice },
};
const inc2 = {
  id: 'inc2',
  stateId: 'task-2',
  timestamp: 1760001000000,
  testCaseResolutionStatusType: 'Assigned',
  severity: undefined,
  testCaseReference: { id: 'tc-2', name: 'null_check', fullyQualifiedName: 'svc.db.schema.orders.null_check', displayName: 'Null check' },
  testCaseResolutionStatusDetails: { assignee: bob },
};
const rows = [inc1, inc2];

async function drain(): Promise<void> {
  await flushPromises();
  await flushPromises();
  await flushPromises();
}

async function mountView(query: Record<string, string> = {}) {
  const pinia = createPinia();
  setActivePinia(pinia);
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/observability/incidents', name: 'observability-incidents', component: IncidentsListView },
      { path: '/test-case/:fqn/:tab?', name: 'quality-test-case', component: { template: '<div>tc</div>' } },
      { path: '/assets/:entityType/:fqn', name: 'asset', component: { template: '<div>asset</div>' } },
    ],
  });
  await router.push({ path: '/observability/incidents', query });
  await router.isReady();
  const wrapper = mount(IncidentsListView, {
    global: { plugins: [pinia, router, Antd, createTestI18n()] },
  });
  await drain();
  return { wrapper, router };
}

async function openSelectIn(wrapper: { find: (s: string) => { find: (s: string) => { element: Element } } }, testid: string): Promise<void> {
  const root = wrapper.find(`[data-testid="${testid}"]`);
  const selector = root.find('.ant-select-selector').element as HTMLElement;
  selector.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
  selector.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  await flushPromises();
}

async function openSelectInBody(testid: string): Promise<void> {
  const root = document.body.querySelector(`[data-testid="${testid}"]`);
  const selector = root?.querySelector('.ant-select-selector') as HTMLElement | null;
  selector?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
  selector?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  await flushPromises();
}

async function clickOptionByText(text: string): Promise<void> {
  const option = Array.from(document.body.querySelectorAll('.ant-select-item-option')).find((el) =>
    el.textContent?.includes(text),
  ) as HTMLElement | undefined;
  expect(option).toBeDefined();
  option?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
  option?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  await flushPromises();
}

async function clickInBody(testid: string): Promise<void> {
  const els = [...document.querySelectorAll<HTMLElement>(`[data-testid="${testid}"]`)];
  const el = els.at(-1);
  expect(el).toBeDefined();
  el?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  await flushPromises();
}

function modalOkButton(): HTMLElement | null {
  // FormModal's own testid lands on the Modal's teleport anchor, not a
  // body element, so the OK button is found through the rendered footer.
  const buttons = [...document.body.querySelectorAll('.ant-modal-footer .ant-btn-primary')];
  return (buttons.at(-1) as HTMLElement | null) ?? null;
}

describe('IncidentsListView (W2-2 classic list)', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    permState.isAdmin = false;
    permState.resourceOps = { ViewAll: true, EditStatus: true };
    permState.rowOps = { EditStatus: true };
    permState.rejectResource = false;
    domainState.activeDomain = null;
    document.body.innerHTML = '';
    listFromSearch.mockResolvedValue({ data: rows, total: 2 });
    getByStateId.mockImplementation(async (stateId: string) => rows.find((row) => row.stateId === stateId));
    patchIncident.mockResolvedValue(inc1);
    createIncident.mockResolvedValue(inc1);
    listTestCases.mockResolvedValue({ data: [inc1.testCaseReference], total: 1 });
    postAggregate.mockResolvedValue({
      aggregations: {
        'testCaseResolutionStatusDetails.assignee.id': {
          buckets: [
            {
              key: 'alice',
              'top_hits#top': {
                hits: { hits: [{ _source: { testCaseResolutionStatusDetails: { assignee: alice } } }] },
              },
            },
          ],
        },
      },
    });
    getUserByNameMock.mockResolvedValue(alice);
    getTeamByNameMock.mockRejectedValue(new Error('no such team'));
    searchUsersMock.mockResolvedValue({ data: [], total: 0 });
    listTeamsMock.mockResolvedValue({ data: [], total: 0 });
    resolveTaskMock.mockResolvedValue(undefined);
    createTaskMock.mockResolvedValue({ id: 'task-9' });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
    document.body.innerHTML = '';
  });

  it('renders six columns from /search/list with limit 10, latest and non-deleted', async () => {
    const { wrapper } = await mountView();
    expect(listFromSearch).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 10, offset: 0, latest: true, include: 'non-deleted', dateField: 'timestamp' }),
    );
    expect(listTestCases).toHaveBeenCalledWith({ q: '*', limit: 25 });
    for (const header of ['Test case name', 'Table', 'Last updated', 'Status', 'Severity', 'Assignee']) {
      expect(wrapper.text()).toContain(header);
    }
    expect(wrapper.text()).toContain('Row count');
    expect(wrapper.text()).toContain('Null check');
    expect(wrapper.text()).toContain('New');
    expect(wrapper.text()).toContain('Assigned');
    expect(wrapper.text()).toContain('Severity 2');
    expect(wrapper.find('[data-testid="incidents-table"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="incident-row-inc1"]').exists()).toBe(true);
    // The classic list has no severity filter control.
    expect(wrapper.find('[data-testid="incident-filter-severity"]').exists()).toBe(false);
  });

  it('shows the permission placeholder and fetches nothing without read access', async () => {
    permState.resourceOps = {};
    const { wrapper } = await mountView();
    expect(wrapper.find('[data-testid="incidents-no-permission"]').exists()).toBe(true);
    expect(listFromSearch).not.toHaveBeenCalled();
  });

  it('fails closed on a permission fetch failure and retries', async () => {
    permState.rejectResource = true;
    const { wrapper } = await mountView();
    expect(wrapper.find('[data-testid="incidents-permission-error"]').exists()).toBe(true);
    expect(listFromSearch).not.toHaveBeenCalled();
    permState.rejectResource = false;
    await wrapper.find('[data-testid="incidents-permission-retry"]').trigger('click');
    await drain();
    expect(wrapper.find('[data-testid="incidents-table"]').exists()).toBe(true);
    expect(listFromSearch).toHaveBeenCalled();
  });

  it('writes the status filter back to the URL and resets the page to 1', async () => {
    const { wrapper, router } = await mountView({ currentPage: '2' });
    expect(listFromSearch).toHaveBeenLastCalledWith(expect.objectContaining({ offset: 10 }));
    await openSelectIn(wrapper as never, 'incident-filter-status');
    await clickOptionByText('Acknowledged');
    await drain();
    expect(router.currentRoute.value.query.testCaseResolutionStatusType).toBe('Ack');
    expect(router.currentRoute.value.query.currentPage).toBeUndefined();
    expect(listFromSearch).toHaveBeenLastCalledWith(
      expect.objectContaining({ testCaseResolutionStatusType: 'Ack', offset: 0 }),
    );
  });

  it('reads filters from the URL on mount and clear-all drops all seven keys', async () => {
    const { wrapper, router } = await mountView({
      testCaseFQN: 'svc.db.schema.orders.row_count',
      testCaseResolutionStatusType: 'Ack',
      dateField: 'updatedAt',
    });
    expect(listFromSearch).toHaveBeenCalledWith(
      expect.objectContaining({
        testCaseFQN: 'svc.db.schema.orders.row_count',
        testCaseResolutionStatusType: 'Ack',
        dateField: 'updatedAt',
      }),
    );
    expect(wrapper.find('[data-testid="incident-clear-filters"]').exists()).toBe(true);
    await wrapper.find('[data-testid="incident-clear-filters"]').trigger('click');
    await drain();
    expect(router.currentRoute.value.query).toEqual({});
    expect(listFromSearch).toHaveBeenLastCalledWith(
      expect.objectContaining({ testCaseFQN: undefined, testCaseResolutionStatusType: undefined }),
    );
  });

  it('pages numerically: page 2 asks for offset 10', async () => {
    listFromSearch.mockResolvedValue({ data: rows, total: 25 });
    const { wrapper, router } = await mountView();
    expect(wrapper.find('[data-testid="entity-list-pagination"]').exists()).toBe(true);
    await wrapper.find('.ant-pagination-item-2').trigger('click');
    await drain();
    expect(router.currentRoute.value.query.currentPage).toBe('2');
    expect(listFromSearch).toHaveBeenLastCalledWith(expect.objectContaining({ offset: 10 }));
  });

  it('limits the status menu by current status: Assigned offers only Assigned/Resolved', async () => {
    const { wrapper } = await mountView();
    await wrapper.find('[data-testid="incident-status-inc2"]').trigger('click');
    await flushPromises();
    expect(document.querySelector('[data-testid="incident-status-option-Assigned"]')).not.toBeNull();
    expect(document.querySelector('[data-testid="incident-status-option-Resolved"]')).not.toBeNull();
    expect(document.querySelector('[data-testid="incident-status-option-New"]')).toBeNull();
    expect(document.querySelector('[data-testid="incident-status-option-Ack"]')).toBeNull();
  });

  it('submits an inline status change through resolveTask and echoes the read-back row', async () => {
    getByStateId.mockResolvedValueOnce({ ...inc1, testCaseResolutionStatusType: 'Ack' });
    const { wrapper } = await mountView();
    await wrapper.find('[data-testid="incident-status-inc1"]').trigger('click');
    await flushPromises();
    await clickInBody('incident-status-option-Ack');
    await drain();
    expect(resolveTaskMock).toHaveBeenCalledWith('task-1', { transitionId: 'ack' });
    expect(getByStateId).toHaveBeenCalledWith('task-1', 1);
    expect(wrapper.text()).toContain('Acknowledged');
  });

  it('requires reason and comment before resolving, then sends the resolve body', async () => {
    getByStateId.mockResolvedValueOnce({ ...inc1, testCaseResolutionStatusType: 'Resolved' });
    const { wrapper } = await mountView();
    await wrapper.find('[data-testid="incident-status-inc1"]').trigger('click');
    await flushPromises();
    await clickInBody('incident-status-option-Resolved');
    await flushPromises();
    expect(document.querySelector('[data-testid="incident-status-modal-reason"]')).not.toBeNull();
    const ok = modalOkButton();
    expect(ok?.classList.contains('ant-btn-disabled') || ok?.hasAttribute('disabled')).toBe(true);
    await openSelectInBody('incident-status-modal-reason');
    await clickOptionByText('FalsePositive');
    const comment = document.body.querySelector(
      '[data-testid="incident-status-modal-comment"]',
    ) as HTMLTextAreaElement | null;
    expect(comment).not.toBeNull();
    await new DOMWrapper(comment as HTMLTextAreaElement).setValue('Expected empty overnight');
    await flushPromises();
    modalOkButton()?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await drain();
    expect(resolveTaskMock).toHaveBeenCalledWith('task-1', {
      transitionId: 'resolve',
      resolutionType: 'Completed',
      comment: 'Expected empty overnight',
      payload: { testCaseFailureReason: 'FalsePositive' },
    });
    expect(wrapper.text()).toContain('Resolved');
  });

  it('opens the assignee picker for the Assigned target and assigns on confirm', async () => {
    getByStateId.mockResolvedValueOnce({ ...inc1, testCaseResolutionStatusType: 'Assigned' });
    const { wrapper } = await mountView();
    await wrapper.find('[data-testid="incident-status-inc1"]').trigger('click');
    await flushPromises();
    await clickInBody('incident-status-option-Assigned');
    await flushPromises();
    expect(document.querySelector('[data-testid="incident-status-modal-assignee"]')).not.toBeNull();
    await openSelectInBody('incident-status-modal-assignee');
    await clickOptionByText('Alice');
    await flushPromises();
    modalOkButton()?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await drain();
    expect(resolveTaskMock).toHaveBeenCalledWith('task-1', {
      transitionId: 'assign',
      payload: {
        assignees: [
          { id: 'alice', type: 'user', name: 'alice', fullyQualifiedName: 'alice', displayName: 'Alice' },
        ],
      },
    });
  });

  it('echoes a severity change on success and holds the row on failure', async () => {
    const { wrapper } = await mountView();
    await wrapper.find('[data-testid="incident-severity-inc1"]').trigger('click');
    await flushPromises();
    await clickInBody('incident-severity-option-Severity3');
    await drain();
    expect(patchIncident).toHaveBeenCalledWith('inc1', [
      { op: 'replace', path: '/severity', value: 'Severity3' },
    ]);
    expect(wrapper.text()).toContain('Severity 3');

    patchIncident.mockRejectedValueOnce(new Error('patch failed'));
    await wrapper.find('[data-testid="incident-severity-inc1"]').trigger('click');
    await flushPromises();
    await clickInBody('incident-severity-option-Severity1');
    await drain();
    expect(wrapper.text()).toContain('Severity 3');
  });

  it('edits the assignee inline through resolveTask and the read-back', async () => {
    getByStateId.mockResolvedValueOnce({ ...inc1, testCaseResolutionStatusDetails: { assignee: bob } });
    const { wrapper } = await mountView();
    await wrapper.find('[data-testid="incident-assignee-edit-inc1"]').trigger('click');
    await flushPromises();
    expect(document.querySelector('[data-testid="incident-assignee-modal-picker"]')).not.toBeNull();
    await openSelectInBody('incident-assignee-modal-picker');
    await clickOptionByText('Bob');
    await flushPromises();
    modalOkButton()?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await drain();
    expect(resolveTaskMock).toHaveBeenCalledWith(
      'task-1',
      expect.objectContaining({ transitionId: 'assign' }),
    );
    expect(getByStateId).toHaveBeenCalledWith('task-1', 1);
    expect(wrapper.text()).toContain('Bob');
  });

  it('hides the inline editors when the row has no EditStatus', async () => {
    permState.rowOps = {};
    const { wrapper } = await mountView();
    expect(wrapper.find('[data-testid="incident-status-inc1"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="incident-severity-inc1"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="incident-assignee-edit-inc1"]').exists()).toBe(false);
    expect(wrapper.text()).toContain('New');
  });

  it('degrades the assignee candidates to page rows when the aggregate fails', async () => {
    postAggregate.mockRejectedValueOnce(new Error('es down'));
    const { wrapper } = await mountView();
    expect(wrapper.find('[data-testid="incidents-table"]').exists()).toBe(true);
    await openSelectIn(wrapper as never, 'incident-filter-assignee');
    const options = Array.from(document.body.querySelectorAll('.ant-select-item-option')).map((el) =>
      el.textContent?.trim(),
    );
    expect(options).toContain('Alice');
    expect(options).toContain('Bob');
  });

  it('sends the active domain to the list and the aggregate', async () => {
    domainState.activeDomain = { fullyQualifiedName: 'finance' };
    await mountView();
    expect(listFromSearch).toHaveBeenCalledWith(expect.objectContaining({ domain: 'finance' }));
    const body = postAggregate.mock.calls[0][0] as Record<string, unknown>;
    expect(String(body.query)).toContain('finance');
  });

  it('opens the test-case detail alias path from the row link', async () => {
    const { wrapper, router } = await mountView();
    await wrapper.find('[data-testid="incident-row-inc1"]').trigger('click');
    await flushPromises();
    expect(router.currentRoute.value.path).toBe('/test-case/svc.db.schema.orders.row_count');
    expect(router.currentRoute.value.name).toBe('quality-test-case');
  });

  it('opens the table asset route with the quality tab from the table link', async () => {
    const { wrapper, router } = await mountView();
    const tableLink = wrapper
      .findAll('a')
      .find((link) => link.text() === 'orders');
    expect(tableLink).toBeDefined();
    await tableLink?.trigger('click');
    await flushPromises();
    expect(router.currentRoute.value.name).toBe('asset');
    expect(router.currentRoute.value.params).toMatchObject({ entityType: 'table', fqn: 'svc.db.schema.orders' });
    expect(router.currentRoute.value.query.tab).toBe('quality');
  });
});
