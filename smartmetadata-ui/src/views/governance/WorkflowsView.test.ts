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
import Antd, { message } from 'ant-design-vue';
import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryHistory, createRouter } from 'vue-router';
import { createTestI18n } from '@/test/i18n';
import NextPrevious from '@/components/shared/NextPrevious.vue';
import PermissionPlaceholder from '@/components/shared/PermissionPlaceholder.vue';
import SomethingWentWrongPlaceholder from '@/components/shared/SomethingWentWrongPlaceholder.vue';
import WorkflowsView from './WorkflowsView.vue';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function mountPage() {
  const pinia = createPinia();
  setActivePinia(pinia);
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/govern/workflows', name: 'workflows', component: WorkflowsView },
      {
        path: '/govern/workflows/:fqn',
        name: 'workflow-detail',
        component: { template: '<div>detail stub</div>' },
      },
    ],
  });
  return { pinia, router };
}

async function mountList() {
  const { pinia, router } = mountPage();
  await router.push('/govern/workflows');
  await router.isReady();
  const wrapper = mount(WorkflowsView, {
    global: { plugins: [pinia, router, Antd, createTestI18n()] },
  });
  await flushPromises();
  return { wrapper, router };
}

function drawerEl(testId: string): HTMLElement | null {
  // The create form lives in an antd Drawer teleported to
  // document.body; scope to the open drawer.
  return document.querySelector(`.ant-drawer-open [data-testid="${testId}"]`);
}

async function openCreateDrawer(wrapper: Awaited<ReturnType<typeof mountList>>['wrapper']) {
  await wrapper.find('[data-testid="workflows-create"]').trigger('click');
  await flushPromises();
  expect(drawerEl('workflows-create-name')).not.toBeNull();
}

async function setDrawerValue(testId: string, value: string) {
  const input = drawerEl(testId) as HTMLInputElement | null;
  expect(input).not.toBeNull();
  await new DOMWrapper(input!).setValue(value);
  await flushPromises();
}

async function clickDrawerSave() {
  const save = drawerEl('workflows-create-drawer-save');
  expect(save).not.toBeNull();
  save!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  await flushPromises();
}

describe('WorkflowsView', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    document.body.innerHTML = '';
    localStorage.clear();
  });

  it('renders workflow cards with cursor pagination and no total text', { timeout: 15000 }, async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse({
          data: [
            { id: 'w1', name: 'nightly-dq', displayName: 'Nightly DQ', description: 'Runs nightly checks' },
          ],
          paging: { total: 1 },
        }),
      ),
    );
    const { wrapper } = await mountList();
    expect(wrapper.find('[data-testid="workflows"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="workflow-card-w1"]').text()).toContain('Nightly DQ');
    expect(wrapper.text()).not.toContain('Total:');
    const pagination = wrapper.findComponent(NextPrevious);
    expect(pagination.exists()).toBe(true);
    expect(pagination.props('pageSize')).toBe(25);
    expect(pagination.props('pageSizeOptions')).toEqual([15, 25, 50]);
    expect(pagination.props('currentPage')).toBe(1);
    expect(wrapper.find('[data-testid="page-indicator"]').text()).toMatch(/1\b.*\b1/);
    expect(wrapper.find('[data-testid="next"]').attributes('disabled')).toBeDefined();
    expect(wrapper.find('[data-testid="previous"]').attributes('disabled')).toBeDefined();
  });

  it('renders the card title with the displayName ?? name chain', { timeout: 15000 }, async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse({
          data: [
            { id: 'w1', name: 'empty-label', displayName: '' },
            { id: 'w2', name: 'no-label' },
          ],
          paging: { total: 2 },
        }),
      ),
    );
    const { wrapper } = await mountList();
    // An empty displayName renders empty (never the name fallback);
    // a missing one renders the name. No em-dash placeholder.
    expect(
      wrapper.find('[data-testid="workflow-card-w1"] .workflows__card-title').text(),
    ).toBe('');
    expect(
      wrapper.find('[data-testid="workflow-card-w2"] .workflows__card-title').text(),
    ).toBe('no-label');
    expect(wrapper.text()).not.toContain('—');
    expect(
      wrapper.find('[data-testid="workflow-card-w1"] .workflows__card-description').text(),
    ).toBe('');
  });

  it('shows only the loader while loading', { timeout: 15000 }, async () => {
    let resolveFetch!: (response: Response) => void;
    const gate = new Promise<Response>((resolve) => {
      resolveFetch = resolve;
    });
    vi.stubGlobal('fetch', vi.fn(async () => gate));
    const { wrapper } = await mountList();
    expect(wrapper.find('.ant-spin').exists()).toBe(true);
    expect(wrapper.find('[data-testid="workflows-create"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="workflows-list"]').exists()).toBe(false);
    resolveFetch(jsonResponse({ data: [], paging: { total: 0 } }));
    await flushPromises();
    expect(wrapper.find('[data-testid="workflows-empty"]').exists()).toBe(true);
  });

  it('shows the three-feature empty state with description and gated CTA', { timeout: 15000 }, async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ data: [], paging: { total: 0 } })),
    );
    const { wrapper } = await mountList();
    const i18n = createTestI18n();
    const empty = wrapper.find('[data-testid="workflows-empty"]');
    expect(empty.exists()).toBe(true);
    expect(empty.text()).toContain('Pick a trigger');
    expect(empty.text()).toContain('Define the action');
    expect(empty.text()).toContain('Sit back');
    expect(empty.text()).toContain(i18n.global.t('workflows.emptyDescription'));
    expect(empty.text()).toContain(i18n.global.t('workflows.emptyTitle'));
    expect(wrapper.find('[data-testid="workflows-empty-create"]').exists()).toBe(true);
    // The header renders in the empty branch too.
    expect(wrapper.find('[data-testid="workflows-create"]').exists()).toBe(true);
  });

  it('shows the permission placeholder on 403', { timeout: 15000 }, async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('forbidden', { status: 403 })),
    );
    const { wrapper } = await mountList();
    const placeholder = wrapper.findComponent(PermissionPlaceholder);
    expect(placeholder.exists()).toBe(true);
    expect(placeholder.props('permissionValue')).toBe(
      createTestI18n().global.t('workflows.viewWorkflows'),
    );
    expect(wrapper.find('[data-testid="workflows-list"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="workflows-create"]').exists()).toBe(true);
  });

  it('shows the reload placeholder on other errors and reloads page 1', { timeout: 15000 }, async () => {
    const gets: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        gets.push(String(input));
        if (gets.length === 1) {
          return jsonResponse({ message: 'boom' }, 500);
        }
        return jsonResponse({ data: [], paging: { total: 0 } });
      }),
    );
    const { wrapper } = await mountList();
    const placeholder = wrapper.findComponent(SomethingWentWrongPlaceholder);
    expect(placeholder.exists()).toBe(true);
    expect(placeholder.props('title')).toBe(
      createTestI18n().global.t('workflows.entityFetchError'),
    );
    const onReload = placeholder.props('onReload') as unknown as () => void;
    expect(typeof onReload).toBe('function');
    onReload();
    await flushPromises();
    expect(gets).toHaveLength(2);
    expect(gets[1]).toContain('limit=25');
    expect(gets[1]).not.toContain('after=');
    expect(wrapper.find('[data-testid="workflows-empty"]').exists()).toBe(true);
  });

  it('pages with before/after cursors and disables at the ends', { timeout: 15000 }, async () => {
    const urls: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        urls.push(url);
        if (url.includes('after=page2')) {
          return jsonResponse({
            data: [{ id: 'w2', name: 'second', displayName: 'Second' }],
            paging: { total: 30, before: 'page1' },
          });
        }
        return jsonResponse({
          data: [{ id: 'w1', name: 'first', displayName: 'First' }],
          paging: { total: 30, after: 'page2' },
        });
      }),
    );
    const { wrapper } = await mountList();
    expect(wrapper.find('[data-testid="previous"]').attributes('disabled')).toBeDefined();
    expect(wrapper.find('[data-testid="next"]').attributes('disabled')).toBeUndefined();
    // Cursor total pages: max(ceil(30/25), 1 + 1, 1) = 2.
    expect(wrapper.find('[data-testid="page-indicator"]').text()).toMatch(/1\b.*\b2/);
    await wrapper.find('[data-testid="next"]').trigger('click');
    await flushPromises();
    expect(urls[1]).toContain('after=page2');
    expect(wrapper.find('[data-testid="workflow-card-w2"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="next"]').attributes('disabled')).toBeDefined();
    expect(wrapper.find('[data-testid="previous"]').attributes('disabled')).toBeUndefined();
    await wrapper.find('[data-testid="previous"]').trigger('click');
    await flushPromises();
    expect(urls[2]).toContain('before=page1');
    expect(wrapper.find('[data-testid="workflow-card-w1"]').exists()).toBe(true);
  });

  it('resets to page 1 when the page size changes', { timeout: 15000 }, async () => {
    const urls: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        urls.push(String(input));
        return jsonResponse({
          data: [{ id: 'w1', name: 'first', displayName: 'First' }],
          paging: { total: 30, after: 'page2' },
        });
      }),
    );
    const { wrapper } = await mountList();
    await wrapper.find('[data-testid="next"]').trigger('click');
    await flushPromises();
    expect(wrapper.findComponent(NextPrevious).props('currentPage')).toBe(2);
    const onShowSizeChange = wrapper.findComponent(NextPrevious).props('onShowSizeChange') as unknown as (
      size: number,
    ) => void;
    onShowSizeChange(50);
    await flushPromises();
    expect(urls[urls.length - 1]).toContain('limit=50');
    expect(urls[urls.length - 1]).not.toContain('after=');
    expect(wrapper.findComponent(NextPrevious).props('currentPage')).toBe(1);
    expect(wrapper.findComponent(NextPrevious).props('pageSize')).toBe(50);
  });

  it('navigates to the detail route when a card is clicked', { timeout: 15000 }, async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse({
          data: [
            {
              id: 'w1',
              name: 'nightly-dq',
              fullyQualifiedName: 'nightly-dq',
              displayName: 'Nightly DQ',
              description: 'Runs nightly checks',
            },
          ],
          paging: { total: 1 },
        }),
      ),
    );
    const { wrapper, router } = await mountList();
    await wrapper.find('[data-testid="workflow-card-w1"]').trigger('click');
    await flushPromises();
    expect(router.currentRoute.value.name).toBe('workflow-detail');
    expect(router.currentRoute.value.params.fqn).toBe('nightly-dq');
    expect(router.currentRoute.value.path).toBe('/govern/workflows/nightly-dq');
    expect(router.currentRoute.value.params.tab).toBeUndefined();
  });

  it('rejects an invalid workflow name and creates a valid one', { timeout: 15000 }, async () => {
    const posts: Array<{ url: string; body: Record<string, unknown> }> = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (init?.method === 'POST') {
          const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
          posts.push({ url, body });
          return jsonResponse({ id: 'w2', name: body.name, description: body.description });
        }
        return jsonResponse({ data: [], paging: { total: 0 } });
      }),
    );
    const { wrapper } = await mountList();
    await openCreateDrawer(wrapper);
    await setDrawerValue('workflows-create-name', 'bad name!');
    await setDrawerValue('workflows-create-description', 'Desc');
    await clickDrawerSave();
    expect(posts.length).toBe(0);
    const error = document.querySelector('.ant-drawer-open .ant-form-item-explain-error');
    expect(error?.textContent).toBe(createTestI18n().global.t('workflows.nameInvalid'));
    await setDrawerValue('workflows-create-name', 'weekly-sync');
    expect(document.querySelector('.ant-drawer-open .ant-form-item-explain-error')).toBeNull();
    await clickDrawerSave();
    expect(posts.length).toBe(1);
    expect(posts[0].url).toContain('/api/v1/governance/workflowDefinitions');
    expect(posts[0].body).toMatchObject({ name: 'weekly-sync', description: 'Desc' });
  });

  it('creates a workflow with the official minimal definition and opens the builder in edit mode', { timeout: 15000 }, async () => {
    const posts: Array<{ url: string; body: Record<string, unknown> }> = [];
    const successSpy = vi.spyOn(message, 'success');
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (init?.method === 'POST') {
          const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
          posts.push({ url, body });
          return jsonResponse({
            id: 'w2',
            name: body.name,
            fullyQualifiedName: body.name,
            description: body.description,
          });
        }
        return jsonResponse({ data: [], paging: { total: 0 } });
      }),
    );
    const { wrapper, router } = await mountList();
    await openCreateDrawer(wrapper);
    const drawerWrapper = document.querySelector('.ant-drawer-content-wrapper') as HTMLElement | null;
    expect(drawerWrapper?.style.width).toBe('640px');
    expect(drawerEl('workflows-create-drawer-save')?.textContent).toContain(
      createTestI18n().global.t('workflows.saveAndNext'),
    );
    await setDrawerValue('workflows-create-name', 'weekly-sync');
    await setDrawerValue('workflows-create-description', 'Desc');
    await clickDrawerSave();
    expect(posts.length).toBe(1);
    expect(posts[0].url).toContain('/api/v1/governance/workflowDefinitions');
    // Official handleModalSubmit (WorkflowsPage): the complete minimal
    // definition — empty nodes/edges plus a default event-based trigger.
    expect(posts[0].body).toEqual({
      description: 'Desc',
      displayName: 'weekly-sync',
      edges: [],
      name: 'weekly-sync',
      nodes: [],
      trigger: { config: {}, output: [], type: 'eventBasedEntity' },
    });
    // No success toast, per official.
    expect(successSpy).not.toHaveBeenCalled();
    expect(router.currentRoute.value.name).toBe('workflow-detail');
    expect(router.currentRoute.value.params.fqn).toBe('weekly-sync');
    expect(router.currentRoute.value.path).toBe('/govern/workflows/weekly-sync');
    expect(router.currentRoute.value.params.tab).toBeUndefined();
    expect(router.currentRoute.value.query.mode).toBe('edit');
  });

  it('submits with an empty description and validates the raw name', { timeout: 15000 }, async () => {
    const posts: Array<Record<string, unknown>> = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
        if (init?.method === 'POST') {
          posts.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
          return jsonResponse({ id: 'w2', name: 'weekly-sync' });
        }
        return jsonResponse({ data: [], paging: { total: 0 } });
      }),
    );
    const { wrapper } = await mountList();
    await openCreateDrawer(wrapper);
    // A name that only passes once trimmed fails on the raw value.
    await setDrawerValue('workflows-create-name', ' weekly-sync ');
    await clickDrawerSave();
    expect(posts.length).toBe(0);
    expect(document.querySelector('.ant-drawer-open .ant-form-item-explain-error')).not.toBeNull();
    await setDrawerValue('workflows-create-name', 'weekly-sync');
    await clickDrawerSave();
    expect(posts.length).toBe(1);
    expect(posts[0].description).toBe('');
    expect(posts[0].name).toBe('weekly-sync');
  });

  it('resets the create form on cancel', { timeout: 15000 }, async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ data: [], paging: { total: 0 } })),
    );
    const { wrapper } = await mountList();
    await openCreateDrawer(wrapper);
    await setDrawerValue('workflows-create-name', 'bad name!');
    await clickDrawerSave();
    expect(document.querySelector('.ant-drawer-open .ant-form-item-explain-error')).not.toBeNull();
    const cancel = drawerEl('workflows-create-drawer-cancel');
    cancel!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushPromises();
    await openCreateDrawer(wrapper);
    expect((drawerEl('workflows-create-name') as HTMLInputElement).value).toBe('');
    expect((drawerEl('workflows-create-description') as HTMLTextAreaElement).value).toBe('');
    expect(document.querySelector('.ant-drawer-open .ant-form-item-explain-error')).toBeNull();
  });

  it('toasts a create failure and keeps the drawer open', { timeout: 15000 }, async () => {
    const errorSpy = vi.spyOn(message, 'error');
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
        if (init?.method === 'POST') {
          return jsonResponse({ message: 'create boom' }, 500);
        }
        return jsonResponse({ data: [], paging: { total: 0 } });
      }),
    );
    const { wrapper, router } = await mountList();
    await openCreateDrawer(wrapper);
    await setDrawerValue('workflows-create-name', 'weekly-sync');
    await clickDrawerSave();
    expect(errorSpy).toHaveBeenCalledWith('create boom');
    expect(document.querySelector('.ant-drawer-open')).not.toBeNull();
    expect(router.currentRoute.value.name).toBe('workflows');
  });

  it('does not submit twice while creating', { timeout: 15000 }, async () => {
    let resolvePost!: (response: Response) => void;
    const postGate = new Promise<Response>((resolve) => {
      resolvePost = resolve;
    });
    let postCount = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
        if (init?.method === 'POST') {
          postCount += 1;
          return postGate;
        }
        return jsonResponse({ data: [], paging: { total: 0 } });
      }),
    );
    const { wrapper } = await mountList();
    await openCreateDrawer(wrapper);
    await setDrawerValue('workflows-create-name', 'weekly-sync');
    const save = drawerEl('workflows-create-drawer-save')!;
    save.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushPromises();
    expect(drawerEl('workflows-create-drawer-save')?.hasAttribute('disabled')).toBe(true);
    save.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushPromises();
    expect(postCount).toBe(1);
    resolvePost(jsonResponse({ id: 'w2', name: 'weekly-sync', fullyQualifiedName: 'weekly-sync' }));
    await flushPromises();
    expect(postCount).toBe(1);
  });
});
