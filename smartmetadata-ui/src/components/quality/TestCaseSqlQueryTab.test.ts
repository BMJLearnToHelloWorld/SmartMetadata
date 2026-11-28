/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 */
import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestI18n } from '@/test/i18n';
import TestCaseSqlQueryTab from './TestCaseSqlQueryTab.vue';

vi.mock('@/api/permissions', () => ({
  getResourcePermission: vi.fn(async () => ({ Create: true })),
  toOperationPermissions: (permissions: Record<string, boolean>) => permissions,
}));

vi.mock('@/components/shared/SmCodeEditor.vue', () => ({
  default: {
    name: 'SmCodeEditor',
    props: ['value'],
    template: '<div data-testid="test-case-sql-editor">{{ value }}</div>',
  },
}));

describe('TestCaseSqlQueryTab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders QueryViewer with official test ids when SQL is present', async () => {
    const wrapper = mount(TestCaseSqlQueryTab, {
      props: {
        testCase: {
          id: 'tc1',
          name: 'row_count',
          fullyQualifiedName: 'svc.db.schema.orders.row_count',
          parameterValues: [],
          testSuites: [],
          inspectionQuery: 'SELECT COUNT(*) FROM orders',
        },
      },
      global: { plugins: [createTestI18n()] },
    });
    await flushPromises();
    expect(wrapper.find('[data-testid="test-case-sql-query"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="query-line"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="query-entity-copy-button"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="add-to-table-button"]').exists()).toBe(true);
  });

  it('shows version diff instead of viewer on version pages', async () => {
    const wrapper = mount(TestCaseSqlQueryTab, {
      props: {
        isVersionPage: true,
        changeDescription: {
          fieldsUpdated: [
            { field: 'inspectionQuery', oldValue: 'SELECT 1', newValue: 'SELECT 2' },
          ],
        },
        testCase: {
          id: 'tc1',
          name: 'row_count',
          parameterValues: [],
          testSuites: [],
          inspectionQuery: 'SELECT 2',
        },
      },
      global: { plugins: [createTestI18n()] },
    });
    await flushPromises();
    expect(wrapper.find('[data-testid="test-case-sql-query-version-diff"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="test-case-sql-query"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="add-to-table-button"]').exists()).toBe(false);
  });
});