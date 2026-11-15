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
import { getDerivedPermissionFlags } from '@/api/permissions';
import { deleteQuery, type DataQuery } from '@/api/queries';
import { confirmDelete } from '@/features/crud/confirmDelete';
import { createTestI18n } from '@/test/i18n';
import QueryCardExtraOption from './QueryCardExtraOption.vue';

vi.mock('@/api/queries', () => ({
  deleteQuery: vi.fn(async () => undefined),
}));

vi.mock('@/features/crud/confirmDelete', () => ({
  confirmDelete: vi.fn(async () => true),
}));

const QUERY: DataQuery = {
  id: 'q1',
  query: 'select 1\nselect 2\nselect 3',
  votes: {
    upVotes: 2,
    downVotes: 1,
    upVoters: [{ id: 'u1', type: 'user', name: 'alice' }],
    downVoters: [],
  },
};

function mountOption(query: DataQuery, ops: Record<string, boolean>, currentUserId = 'u1') {
  return mount(QueryCardExtraOption, {
    props: { query, permission: getDerivedPermissionFlags(ops), currentUserId },
    attachTo: document.body,
    global: { plugins: [Antd, createTestI18n()] },
  });
}

async function openMenu(wrapper: ReturnType<typeof mountOption>) {
  await wrapper.find('[data-testid="query-btn"]').trigger('click');
  await flushPromises();
  await nextTick();
}

afterEach(() => {
  document.body.innerHTML = '';
  vi.clearAllMocks();
});

describe('QueryCardExtraOption', () => {
  it('shows the SQL line count with singular/plural labels', () => {
    const wrapper = mountOption(QUERY, {});
    expect(wrapper.find('[data-testid="query-line"]').text()).toBe('3 Lines');
    wrapper.unmount();
    const single = mountOption({ ...QUERY, query: 'select 1' }, {});
    expect(single.find('[data-testid="query-line"]').text()).toBe('1 Line');
    single.unmount();
  });

  it('shows vote counts and marks the current user vote active', () => {
    const wrapper = mountOption(QUERY, {});
    expect(wrapper.find('[data-testid="up-vote-btn"]').text()).toContain('2');
    expect(wrapper.find('[data-testid="down-vote-btn"]').text()).toContain('1');
    expect(wrapper.find('[data-testid="up-vote-btn"]').classes()).toContain('ant-btn-primary');
    expect(wrapper.find('[data-testid="down-vote-btn"]').classes()).not.toContain('ant-btn-primary');
    wrapper.unmount();
  });

  it('clicking the current vote removes it, clicking the other casts it', async () => {
    const wrapper = mountOption(QUERY, {});
    await wrapper.find('[data-testid="up-vote-btn"]').trigger('click');
    expect(wrapper.emitted('vote')).toEqual([['unVoted']]);
    await wrapper.find('[data-testid="down-vote-btn"]').trigger('click');
    expect(wrapper.emitted('vote')).toEqual([['unVoted'], ['votedDown']]);
    wrapper.unmount();
  });

  it('disables edit/delete menu items without the matching permission', async () => {
    const wrapper = mountOption(QUERY, {});
    await openMenu(wrapper);
    const edit = document.body.querySelector('[data-testid="edit-query"]');
    const del = document.body.querySelector('[data-testid="delete-query"]');
    expect(edit?.className).toContain('disabled');
    expect(del?.className).toContain('disabled');
    wrapper.unmount();
  });

  it('emits edit from an enabled menu item', async () => {
    const wrapper = mountOption(QUERY, { EditQueries: true });
    await openMenu(wrapper);
    (document.body.querySelector('[data-testid="edit-query"]') as HTMLElement).click();
    await flushPromises();
    expect(wrapper.emitted('edit')).toHaveLength(1);
    wrapper.unmount();
  });

  it('confirms then deletes and emits deleted', async () => {
    const wrapper = mountOption(QUERY, { Delete: true });
    await openMenu(wrapper);
    (document.body.querySelector('[data-testid="delete-query"]') as HTMLElement).click();
    await flushPromises();
    expect(confirmDelete).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Delete Query',
        content: 'Once you delete this Query, it will be removed permanently.',
        okText: 'Delete',
        cancelText: 'Cancel',
      }),
    );
    expect(deleteQuery).toHaveBeenCalledWith('q1');
    expect(wrapper.emitted('deleted')).toHaveLength(1);
    wrapper.unmount();
  });

  it('does not delete when the confirm is dismissed', async () => {
    vi.mocked(confirmDelete).mockResolvedValueOnce(false);
    const wrapper = mountOption(QUERY, { Delete: true });
    await openMenu(wrapper);
    (document.body.querySelector('[data-testid="delete-query"]') as HTMLElement).click();
    await flushPromises();
    expect(deleteQuery).not.toHaveBeenCalled();
    expect(wrapper.emitted('deleted')).toBeUndefined();
    wrapper.unmount();
  });
});
