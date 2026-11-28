/**
 * Copyright 2026 SmartMetadata authors.
 * Licensed under the Apache License, Version 2.0.
 */
import { flushPromises, mount } from '@vue/test-utils';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { createTestI18n } from '@/test/i18n';
import FailedTestCaseSampleData from './FailedTestCaseSampleData.vue';
import type { TestCase } from '@/types/quality';

const getSample = vi.fn();
const deleteSample = vi.fn();
const canMock = vi.fn(() => true);

vi.mock('@/api/testCases', () => ({
  getTestCaseFailedSampleData: (...args: unknown[]) => getSample(...args),
  deleteTestCaseFailedSampleData: (...args: unknown[]) => deleteSample(...args),
}));

vi.mock('vue-router', () => ({
  useRoute: () => ({ params: {} }),
  RouterLink: { name: 'RouterLink', template: '<a><slot /></a>' },
}));

vi.mock('@/composables/useEntityPermissions', () => ({
  useEntityPermissions: () => ({
    can: (op: string) => canMock(op),
    canEditAll: { value: true },
  }),
}));

const baseCase: TestCase = {
  id: 'tc-1',
  name: 'col_vals',
  fullyQualifiedName: 'suite.case',
  entityLink: '<#E::table::svc.db.schema.tbl::columns::status>',
  testCaseResult: { timestamp: 1, testCaseStatus: 'Failed' },
};

function mountPanel(testCase: TestCase = baseCase) {
  return mount(FailedTestCaseSampleData, {
    props: { testCase },
    global: { plugins: [createTestI18n()] },
  });
}

describe('FailedTestCaseSampleData', () => {
  beforeEach(() => {
    getSample.mockReset();
    deleteSample.mockReset();
    canMock.mockReset();
    canMock.mockReturnValue(true);
  });

  it('skips fetch without ViewSampleData permission', async () => {
    canMock.mockImplementation((op: string) => op !== 'ViewSampleData');
    mountPanel();
    await flushPromises();
    expect(getSample).not.toHaveBeenCalled();
  });

  it('renders table after successful fetch', async () => {
    getSample.mockResolvedValue({
      columns: ['status', 'diffType'],
      rows: [['bad', '+']],
    });
    const wrapper = mountPanel();
    await flushPromises();
    expect(getSample).toHaveBeenCalledWith('tc-1');
    expect(wrapper.find('[data-testid="failed-sample-data"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="sample-data-table"]').exists()).toBe(true);
    wrapper.unmount();
  });

  it('treats 404 as empty without error toast', async () => {
    const { ApiError } = await import('@/api/client');
    getSample.mockRejectedValue(new ApiError(404, '', 'Not found'));
    const wrapper = mountPanel();
    await flushPromises();
    expect(wrapper.find('[data-testid="failed-sample-data"]').exists()).toBe(false);
    wrapper.unmount();
  });
});