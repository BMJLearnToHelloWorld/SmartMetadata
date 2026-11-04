/**
 * Copyright 2026 SmartMetadata authors.
 * Licensed under the Apache License, Version 2.0.
 */
import { flushPromises, mount } from '@vue/test-utils';
import Antd from 'ant-design-vue';
import { describe, expect, it, vi } from 'vitest';
import { createTestI18n } from '@/test/i18n';
import CsvJobsTray from './CsvJobsTray.vue';

const listCsvAsyncJobs = vi.fn();
const cancelCsvAsyncJob = vi.fn();

vi.mock('@/api/csvJobs', () => ({
  CSV_JOBS_REFRESH_EVENT: 'csv-jobs-refresh',
  listCsvAsyncJobs: (...args: unknown[]) => listCsvAsyncJobs(...args),
}));
vi.mock('@/api/csvImport', () => ({
  cancelCsvAsyncJob: (...args: unknown[]) => cancelCsvAsyncJob(...args),
}));
vi.mock('@/features/csv/csv', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/features/csv/csv')>();
  return { ...actual, downloadTextFile: vi.fn() };
});

describe('CsvJobsTray', () => {
  it('opens on the refresh event and lists jobs with cancel for active ones', async () => {
    listCsvAsyncJobs.mockResolvedValue([
      { jobId: 'j1', status: 'RUNNING', progress: 2, total: 5, operation: 'IMPORT', entityType: 'metric' },
      { jobId: 'j2', status: 'COMPLETED', operation: 'EXPORT', entityType: 'table' },
    ]);
    cancelCsvAsyncJob.mockResolvedValue({ jobId: 'j1', status: 'CANCELLED' });
    const wrapper = mount(CsvJobsTray, {
      global: { plugins: [Antd, createTestI18n()] },
    });
    await flushPromises();
    window.dispatchEvent(new Event('csv-jobs-refresh'));
    await flushPromises();
    expect(wrapper.text()).toContain('RUNNING');
    expect(wrapper.text()).toContain('COMPLETED');
    expect(wrapper.text()).toContain('(1)');
    const buttons = wrapper.findAll('button');
    const cancel = buttons.find((button) => button.text() === 'Cancel');
    expect(cancel).toBeTruthy();
    await cancel?.trigger('click');
    await flushPromises();
    expect(cancelCsvAsyncJob).toHaveBeenCalledWith('j1');
  });

  it('dismisses a job for the session', async () => {
    listCsvAsyncJobs.mockResolvedValue([
      { jobId: 'j1', status: 'COMPLETED', operation: 'IMPORT', entityType: 'metric' },
    ]);
    const wrapper = mount(CsvJobsTray, {
      global: { plugins: [Antd, createTestI18n()] },
    });
    await wrapper.find('[data-testid="csv-jobs-tray-button"]').trigger('click');
    await flushPromises();
    expect(wrapper.find('[data-testid="csv-jobs-tray-job-j1"]').exists()).toBe(true);
    const dismiss = wrapper
      .findAll('button')
      .find((button) => button.text() === 'Dismiss');
    await dismiss?.trigger('click');
    await flushPromises();
    expect(wrapper.find('[data-testid="csv-jobs-tray-job-j1"]').exists()).toBe(false);
  });
});
