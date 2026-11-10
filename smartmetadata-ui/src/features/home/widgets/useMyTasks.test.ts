/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may
 * not use this file except in compliance with the License. You may obtain
 * a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { defineComponent, h } from 'vue';
import { resetWidgetLoadCache } from '@/features/home/widgetLoad';
import { useMyTasks, type MyTasks } from './useMyTasks';

const listMyAssignedTasks = vi.fn();
vi.mock('@/api/tasks', () => ({
  listMyAssignedTasks: (...args: unknown[]) => listMyAssignedTasks(...args),
}));

let exposed: MyTasks | undefined;
const Harness = defineComponent({
  setup() {
    exposed = useMyTasks();
    return () => h('div', { 'data-testid': 'harness' });
  },
});

describe('useMyTasks', () => {
  beforeEach(() => {
    resetWidgetLoadCache();
    vi.clearAllMocks();
    exposed = undefined;
  });

  it('requests the open page and counts buckets over it', async () => {
    listMyAssignedTasks.mockResolvedValue({
      data: [
        { id: '1', category: 'Incident', assignees: [], comments: [] },
        { id: '2', category: 'DataAccess', assignees: [], comments: [] },
        { id: '3', category: 'Custom', assignees: [], comments: [] },
      ],
      paging: { total: 250 },
    });
    mount(Harness);
    await flushPromises();
    expect(listMyAssignedTasks).toHaveBeenCalledWith({
      fields: 'assignees,createdBy,about,payload',
      limit: 100,
      statusGroup: 'open',
    });
    expect(exposed?.tasks.value).toHaveLength(3);
    expect(exposed?.total.value).toBe(250);
    expect(exposed?.counts.value).toEqual({
      all: 250,
      incidents: 1,
      access: 1,
      approvals: 0,
    });
    expect(exposed?.isError.value).toBe(false);
  });

  it('reports an error when the request fails', async () => {
    listMyAssignedTasks.mockRejectedValue(new Error('boom'));
    mount(Harness);
    await flushPromises();
    expect(exposed?.isError.value).toBe(true);
    expect(exposed?.tasks.value).toEqual([]);
  });
});
