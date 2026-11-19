/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { mount } from '@vue/test-utils';
import Antd from 'ant-design-vue';
import { createPinia, setActivePinia } from 'pinia';
import { defineComponent, h } from 'vue';
import { describe, expect, it, vi } from 'vitest';
import { createMemoryHistory, createRouter } from 'vue-router';
import { createTestI18n } from '@/test/i18n';
import type { AuditLogEntry } from '@/api/auditLogs';
import AuditLogList from './AuditLogList.vue';

const RowStub = defineComponent({
  props: { log: { type: Object, default: () => ({}) } },
  setup(props) {
    return () =>
      h('div', { 'data-testid': 'row-stub' }, (props.log as AuditLogEntry).userName ?? '');
  },
});

function mountList(props: {
  logs: AuditLogEntry[];
  isLoading: boolean;
  hasActiveSearch: boolean;
  hasActiveFilters: boolean;
  onClearFilters?: () => void;
}) {
  const pinia = createPinia();
  setActivePinia(pinia);
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/', name: 'home', component: { template: '<div>home</div>' } }],
  });
  return mount(AuditLogList, {
    props,
    global: {
      plugins: [pinia, router, Antd, createTestI18n()],
      stubs: { AuditLogListItem: RowStub },
    },
  });
}

describe('AuditLogList', () => {
  it('renders the skeleton with five rows while loading', () => {
    const wrapper = mountList({
      logs: [],
      isLoading: true,
      hasActiveSearch: false,
      hasActiveFilters: false,
    });
    expect(wrapper.find('[data-testid="audit-log-list-skeleton"]').exists()).toBe(true);
    expect(wrapper.findAll('.audit-log-skeleton__row')).toHaveLength(5);
    expect(wrapper.find('[data-testid="audit-log-list"]').exists()).toBe(false);
  });

  it('renders the search empty state with a clear action', async () => {
    const onClear = vi.fn();
    const wrapper = mountList({
      logs: [],
      isLoading: false,
      hasActiveSearch: true,
      hasActiveFilters: true,
      onClearFilters: onClear,
    });
    expect(wrapper.text()).toContain('No matching results');
    expect(wrapper.text()).toContain('Check the spelling, or try a shorter or more general term.');
    const buttons = wrapper.findAll('button');
    const clear = buttons.find((button) => button.text().includes('Clear all'));
    expect(clear).toBeDefined();
    await clear!.trigger('click');
    expect(onClear).toHaveBeenCalledTimes(1);
  });

  it('renders the filtered empty state when only filters are active', () => {
    const wrapper = mountList({
      logs: [],
      isLoading: false,
      hasActiveSearch: false,
      hasActiveFilters: true,
      onClearFilters: vi.fn(),
    });
    expect(wrapper.text()).toContain('No results for these filters');
    expect(wrapper.text()).toContain('Nothing matches the current filters. Adjust them, or clear all to see everything.');
  });

  it('renders the plain empty state with no action when nothing is active', () => {
    const wrapper = mountList({
      logs: [],
      isLoading: false,
      hasActiveSearch: false,
      hasActiveFilters: false,
      onClearFilters: vi.fn(),
    });
    expect(wrapper.text()).toContain('No Audit Logs Yet');
    expect(wrapper.text()).toContain('Metadata change events will appear here as entities are created and modified.');
    expect(wrapper.findAll('button')).toHaveLength(0);
  });

  it('renders one row per log', () => {
    const wrapper = mountList({
      logs: [
        { id: 1, userName: 'alice' },
        { changeEventId: 'evt-2', userName: 'bob' },
        { userName: 'carol' },
      ],
      isLoading: false,
      hasActiveSearch: false,
      hasActiveFilters: false,
    });
    expect(wrapper.find('[data-testid="audit-log-list"]').exists()).toBe(true);
    expect(wrapper.findAll('[data-testid="row-stub"]').map((row) => row.text())).toEqual([
      'alice',
      'bob',
      'carol',
    ]);
  });
});
