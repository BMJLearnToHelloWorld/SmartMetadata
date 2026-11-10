/**
 * Copyright 2026 SmartMetadata authors.
 * Licensed under the Apache License, Version 2.0.
 */
import { flushPromises, mount } from '@vue/test-utils';
import Antd from 'ant-design-vue';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestI18n } from '@/test/i18n';
import CsvJobsTray from './CsvJobsTray.vue';

const listCsvAsyncJobs = vi.fn();
const cancelCsvAsyncJob = vi.fn();
const ownedCsvJobIds = new Set<string>();

vi.mock('@/api/csvJobs', () => ({
  CSV_JOBS_REFRESH_EVENT: 'csv-jobs-refresh',
  listCsvAsyncJobs: (...args: unknown[]) => listCsvAsyncJobs(...args),
  markCsvJobOwned: (jobId?: string) => {
    if (jobId) {
      ownedCsvJobIds.add(jobId);
    }
  },
  isCsvJobOwned: (jobId?: string) => (jobId ? ownedCsvJobIds.has(jobId) : false),
}));
vi.mock('@/api/csvImport', () => ({
  cancelCsvAsyncJob: (...args: unknown[]) => cancelCsvAsyncJob(...args),
}));
vi.mock('@/features/csv/csv', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/features/csv/csv')>();
  return { ...actual, downloadTextFile: vi.fn() };
});

describe('CsvJobsTray', () => {
  beforeEach(() => {
    ownedCsvJobIds.clear();
  });

  it('opens on the refresh event and lists jobs with cancel for active ones', async () => {
    // The first fetch pre-dismisses terminal jobs, so both fixtures
    // here are active — the pre-dismiss itself is covered below.
    listCsvAsyncJobs.mockResolvedValue([
      { jobId: 'j1', status: 'RUNNING', progress: 2, total: 5, operation: 'IMPORT', entityType: 'metric' },
      { jobId: 'j2', status: 'RUNNING', progress: 4, total: 4, operation: 'EXPORT', entityType: 'table' },
    ]);
    cancelCsvAsyncJob.mockResolvedValue({ jobId: 'j1', status: 'CANCELLED' });
    const wrapper = mount(CsvJobsTray, {
      global: { plugins: [Antd, createTestI18n()] },
    });
    await flushPromises();
    window.dispatchEvent(new Event('csv-jobs-refresh'));
    await flushPromises();
    expect(wrapper.text()).toContain('RUNNING');
    expect(wrapper.text()).toContain('(2)');
    const buttons = wrapper.findAll('button');
    const cancel = buttons.find((button) => button.text() === 'Cancel');
    expect(cancel).toBeTruthy();
    await cancel?.trigger('click');
    await flushPromises();
    expect(cancelCsvAsyncJob).toHaveBeenCalledWith('j1');
  });

  it('dismisses a job for the session', async () => {
    listCsvAsyncJobs.mockResolvedValue([
      { jobId: 'j1', status: 'RUNNING', progress: 1, total: 3, operation: 'IMPORT', entityType: 'metric' },
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

  it('pre-dismisses terminal jobs on the first fetch, unless they are owned', async () => {
    listCsvAsyncJobs.mockResolvedValue([
      { jobId: 'j1', status: 'COMPLETED', operation: 'IMPORT', entityType: 'metric' },
      { jobId: 'j2', status: 'RUNNING', progress: 1, total: 3, operation: 'EXPORT', entityType: 'metric' },
    ]);
    const wrapper = mount(CsvJobsTray, {
      global: { plugins: [Antd, createTestI18n()] },
    });
    await wrapper.find('[data-testid="csv-jobs-tray-button"]').trigger('click');
    await flushPromises();
    // The stale terminal job never surfaces; the active one does.
    expect(wrapper.find('[data-testid="csv-jobs-tray-job-j1"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="csv-jobs-tray-job-j2"]').exists()).toBe(true);
  });

  it('still surfaces an owned terminal job on the first fetch', async () => {
    ownedCsvJobIds.add('j1');
    listCsvAsyncJobs.mockResolvedValue([
      { jobId: 'j1', status: 'COMPLETED', operation: 'EXPORT', entityType: 'metric' },
    ]);
    const wrapper = mount(CsvJobsTray, {
      global: { plugins: [Antd, createTestI18n()] },
    });
    await wrapper.find('[data-testid="csv-jobs-tray-button"]').trigger('click');
    await flushPromises();
    expect(wrapper.find('[data-testid="csv-jobs-tray-job-j1"]').exists()).toBe(true);
  });
});
