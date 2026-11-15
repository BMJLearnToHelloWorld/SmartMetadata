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
import { afterEach, describe, expect, it, vi } from 'vitest';
import { nextTick } from 'vue';
import { createMemoryHistory, createRouter } from 'vue-router';
import type { JsonPatchOp } from '@/admin/jsonPatch';
import { getDerivedPermissionFlags } from '@/api/permissions';
import type { DataQuery } from '@/api/queries';
import { createTestI18n } from '@/test/i18n';
import QueryCard from './QueryCard.vue';

vi.mock('@/api/search', () => ({
  searchAssets: vi.fn(async () => ({ total: 0, hits: [], facets: [] })),
}));

const QUERY: DataQuery = {
  id: 'q1',
  query: 'select * from orders',
  queryDate: 1710000000000,
  duration: 1500,
  votes: { upVotes: 2, downVotes: 0, upVoters: [], downVoters: [] },
  queryUsedIn: [
    { id: 't1', type: 'table', name: 'orders', fullyQualifiedName: 'svc.db.schema.orders' },
    { id: 't2', type: 'table', name: 'customers', fullyQualifiedName: 'svc.db.schema.customers' },
    { id: 't3', type: 'table', name: 'accounts', fullyQualifiedName: 'svc.db.schema.accounts' },
    { id: 't4', type: 'table', name: 'returns', fullyQualifiedName: 'svc.db.schema.returns' },
  ],
};

async function mountCard(
  query: DataQuery,
  onQueryUpdate: (id: string, ops: JsonPatchOp[]) => Promise<DataQuery> = vi.fn(
    async (id: string) => ({ ...query, id }),
  ),
  initialUrl = '/asset/table/svc.db.schema.orders',
) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/asset/:entityType/:fqn', name: 'asset', component: { template: '<div />' } },
      { path: '/query-view/:fqn/:queryId', name: 'query-full-screen', component: { template: '<div />' } },
    ],
  });
  await router.push(initialUrl);
  await router.isReady();
  const wrapper = mount(QueryCard, {
    props: {
      query,
      selected: false,
      permission: getDerivedPermissionFlags({ EditQueries: true, Delete: true }),
      datasetFqn: 'svc.db.schema.orders',
      currentUserId: 'u1',
      onQueryUpdate,
    },
    attachTo: document.body,
    global: { plugins: [router, Antd, createTestI18n()] },
  });
  await flushPromises();
  return { wrapper, onQueryUpdate, router };
}

afterEach(() => {
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

describe('QueryCard', () => {
  it('renders the SQL and the duration with the runs-for prefix', async () => {
    const { wrapper } = await mountCard(QUERY);
    expect(wrapper.find('[data-testid="query-sql"]').text()).toContain('select * from orders');
    expect(wrapper.find('[data-testid="query-run-duration"]').text()).toContain('Runs for 1.500 sec');
    wrapper.unmount();
  });

  it('omits the duration element when the query has no duration', async () => {
    const { wrapper } = await mountCard({ ...QUERY, duration: undefined });
    expect(wrapper.find('[data-testid="query-run-duration"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it('shows the first 3 used-by tables plus an and-N-more trigger', async () => {
    const { wrapper } = await mountCard(QUERY);
    const footer = wrapper.find('[data-testid="query-used-by"]');
    expect(footer.text()).toContain('Query used by other tables');
    expect(footer.text()).toContain('orders');
    expect(footer.text()).toContain('customers');
    expect(footer.text()).toContain('accounts');
    expect(footer.text()).not.toContain('returns');
    expect(footer.text()).toContain('and 1 more');
    wrapper.unmount();
  });

  it('keeps the current URL search params on the expand link', async () => {
    const { wrapper } = await mountCard(
      QUERY,
      undefined,
      '/asset/table/svc.db.schema.orders?tab=table_queries&query=q1&queryFrom=2',
    );
    const href = wrapper.find('[data-testid="query-expand-btn"]').element.closest('a')?.getAttribute('href') ?? '';
    expect(href).toContain('/query-view/svc.db.schema.orders/q1');
    expect(href).toContain('tab=table_queries');
    expect(href).toContain('query=q1');
    expect(href).toContain('queryFrom=2');
    wrapper.unmount();
  });

  it('selects the query on a card click but not on a button click', async () => {
    const { wrapper } = await mountCard(QUERY);
    await wrapper.find('[data-testid="query-sql"]').trigger('click');
    expect(wrapper.emitted('select')).toEqual([['q1']]);
    await wrapper.find('[data-testid="query-copy-btn"]').trigger('click');
    expect(wrapper.emitted('select')).toHaveLength(1);
    wrapper.unmount();
  });

  it('copies the SQL to the clipboard', async () => {
    const writeText = vi.fn(async () => undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    const { wrapper } = await mountCard(QUERY);
    await wrapper.find('[data-testid="query-copy-btn"]').trigger('click');
    await flushPromises();
    expect(writeText).toHaveBeenCalledWith('select * from orders');
    wrapper.unmount();
  });

  it('forwards vote clicks with the target vote type', async () => {
    const { wrapper } = await mountCard(QUERY);
    await wrapper.find('[data-testid="up-vote-btn"]').trigger('click');
    expect(wrapper.emitted('vote')).toEqual([['votedUp']]);
    wrapper.unmount();
  });

  it('edits the SQL and patches only the changed field', async () => {
    const { wrapper, onQueryUpdate } = await mountCard(QUERY);
    await wrapper.find('[data-testid="query-btn"]').trigger('click');
    await flushPromises();
    await nextTick();
    (document.body.querySelector('[data-testid="edit-query"]') as HTMLElement).click();
    await flushPromises();
    const editor = wrapper.find('[data-testid="query-sql-editor"]');
    expect(editor.exists()).toBe(true);
    await editor.setValue('select * from orders where id > 10');
    await wrapper.find('[data-testid="query-save-btn"]').trigger('click');
    await flushPromises();
    expect(onQueryUpdate).toHaveBeenCalledTimes(1);
    const [id, ops] = vi.mocked(onQueryUpdate).mock.calls[0] as [string, JsonPatchOp[]];
    expect(id).toBe('q1');
    expect(ops).toEqual([
      { op: 'replace', path: '/query', value: 'select * from orders where id > 10' },
    ]);
    expect(wrapper.find('[data-testid="query-sql-editor"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it('skips the patch when nothing changed', async () => {
    const { wrapper, onQueryUpdate } = await mountCard(QUERY);
    await wrapper.find('[data-testid="query-btn"]').trigger('click');
    await flushPromises();
    await nextTick();
    (document.body.querySelector('[data-testid="edit-query"]') as HTMLElement).click();
    await flushPromises();
    await wrapper.find('[data-testid="query-save-btn"]').trigger('click');
    await flushPromises();
    expect(onQueryUpdate).not.toHaveBeenCalled();
    expect(wrapper.find('[data-testid="query-sql-editor"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it('stays in edit mode when the patch rejects', async () => {
    const failing = vi.fn(async () => {
      throw new Error('patch failed');
    });
    const { wrapper } = await mountCard(QUERY, failing);
    await wrapper.find('[data-testid="query-btn"]').trigger('click');
    await flushPromises();
    await nextTick();
    (document.body.querySelector('[data-testid="edit-query"]') as HTMLElement).click();
    await flushPromises();
    await wrapper.find('[data-testid="query-sql-editor"]').setValue('select 2');
    await wrapper.find('[data-testid="query-save-btn"]').trigger('click');
    await flushPromises();
    expect(wrapper.find('[data-testid="query-sql-editor"]').exists()).toBe(true);
    wrapper.unmount();
  });
});
