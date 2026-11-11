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
import { createTestI18n } from '@/test/i18n';
import type { PipelineStatus } from '@/types/ingestion';
import IngestionRunDetailsModal from './IngestionRunDetailsModal.vue';

const STATUS: PipelineStatus = {
  runId: 'r1',
  pipelineState: 'failed',
  timestamp: 1710000000000,
  startDate: 1710000000000,
  endDate: 1710000060000,
  status: [
    {
      name: 'ingest',
      records: 10,
      filtered: 2,
      updated_records: 3,
      warnings: 1,
      errors: 4,
      failures: [{ name: 'bad-row', error: 'boom', stackTrace: 'trace here' }],
    },
    { name: 'clean', records: 5 },
  ],
};

describe('IngestionRunDetailsModal (P-03)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    document.body.innerHTML = '';
  });

  it('titles the run by state and time and renders the official step columns', async () => {
    const wrapper = mount(IngestionRunDetailsModal, {
      props: { open: true, status: STATUS },
      attachTo: document.body,
      global: { plugins: [Antd, createTestI18n()] },
    });
    await flushPromises();
    expect(document.body.textContent).toContain('Run status: Failed');
    expect(document.body.textContent).toContain('ingest');
    expect(document.body.textContent).toContain('clean');
    expect(document.body.querySelector('[data-testid="log-ingest"]')).not.toBeNull();
    expect(document.body.querySelector('[data-testid="log-clean"]')).toBeNull();
    wrapper.unmount();
  });

  it('expands a failed step to show the error and stackTrace', async () => {
    const wrapper = mount(IngestionRunDetailsModal, {
      props: { open: true, status: STATUS },
      attachTo: document.body,
      global: { plugins: [Antd, createTestI18n()] },
    });
    await flushPromises();
    expect(document.body.textContent).not.toContain('trace here');
    const logsButton = document.body.querySelector('[data-testid="log-ingest"]') as HTMLElement | null;
    expect(logsButton).not.toBeNull();
    logsButton!.click();
    await flushPromises();
    expect(document.body.textContent).toContain('bad-row');
    expect(document.body.textContent).toContain('boom');
    expect(document.body.textContent).toContain('trace here');
    wrapper.unmount();
  });

  it('shows the no-steps placeholder when the run recorded nothing', async () => {
    const wrapper = mount(IngestionRunDetailsModal, {
      props: { open: true, status: { runId: 'r2', pipelineState: 'success', timestamp: 1710000000000 } },
      attachTo: document.body,
      global: { plugins: [Antd, createTestI18n()] },
    });
    await flushPromises();
    expect(document.body.textContent).toContain('No steps recorded for this run');
    wrapper.unmount();
  });
});
