/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import Antd from 'ant-design-vue';
import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import { createI18n } from 'vue-i18n';
import AppLogsViewer from './AppLogsViewer.vue';

const MESSAGES = {
  en: {
    label: {
      status: 'Status',
      'index-states': 'Index States',
      'total-index-sent': 'Total Index Sent',
      'entity-index': '{entity} Index',
      success: 'Success',
      failed: 'Failed',
      'warning-plural': 'Warnings',
      latency: 'Latency',
      'wall-clock': 'Wall Clock',
      'last-updated': 'Last Updated',
      'overall-stat-plural': 'Overall Stats',
      'reader-stat-plural': 'Reader Stats',
      'process-stat-plural': 'Process Stats',
      'sink-stat-plural': 'Sink Stats',
      'vector-stat-plural': 'Vector Stats',
      name: 'Name',
      'entity-record-plural': '{entity} Records',
      total: 'Total',
      'vector-embedding-plural': 'Vector Embeddings',
      'reader-avg': 'Reader Avg',
      'process-avg': 'Process Avg',
      'sink-avg': 'Sink Avg',
      'vector-avg': 'Vector Avg',
      server: 'Server',
      processed: 'Processed',
      'partition-plural': 'Partitions',
      'server-stat-plural': 'Server Stats',
      'view-entity': 'View {entity}',
      'log-plural': 'Logs',
      'view-reindex-failure-plural': 'View Reindex Failures',
      'search-entity': 'Search {entity}',
      'log-lowercase-plural': 'logs',
      matches: 'matches',
      copy: 'Copy',
      copied: 'Copied',
      download: 'Download',
      'jump-to-end': 'Jump to end',
      close: 'Close',
    },
  },
};

const stepStats = {
  totalRecords: 100,
  successRecords: 90,
  failedRecords: 10,
  warningRecords: 2,
  totalTimeMs: 1000,
  readerTimeMs: 100,
  processTimeMs: 200,
  sinkTimeMs: 300,
  vectorTimeMs: 50,
  vectorSuccessRecords: 5,
  vectorFailedRecords: 1,
};

const data = {
  id: 'run-1',
  appId: 'app-1',
  appName: 'SearchIndexingApplication',
  status: 'success',
  timestamp: 1700000060000,
  startTime: 1700000000000,
  endTime: 1700000060000,
  successContext: {
    stats: {
      jobStats: stepStats,
      readerStats: stepStats,
      processStats: stepStats,
      sinkStats: stepStats,
      vectorStats: stepStats,
      entityStats: {
        table: stepStats,
        dashboard: { ...stepStats, totalRecords: 5, successRecords: 5, failedRecords: 0 },
      },
    },
    serverStats: {
      'server-1': {
        processedRecords: 100,
        successRecords: 90,
        failedRecords: 10,
        completedPartitions: 2,
        totalPartitions: 3,
      },
    },
    serverCount: 1,
  },
  failureContext: { failure: { message: 'index boom' } },
};

function mountViewer(record: Record<string, unknown> = data) {
  return mount(AppLogsViewer, {
    props: { data: record as never },
    global: {
      plugins: [Antd, createI18n({ legacy: false, locale: 'en', messages: MESSAGES })],
      stubs: {
        ReindexFailuresDrawer: {
          props: ['visible', 'appName'],
          template: '<div class="reindex-drawer-stub" :data-visible="String(visible)" />',
        },
      },
    },
    attachTo: document.body,
  });
}

describe('AppLogsViewer', () => {
  it('renders overall and stage stat cards with latency and last-updated segments', () => {
    const wrapper = mountViewer();
    expect(wrapper.find('[data-testid="stats-component-overall stats"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="stats-component-reader stats"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="stats-component-process stats"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="stats-component-sink stats"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="stats-component-vector stats"]').exists()).toBe(true);
    const latency = wrapper.find('[data-testid="stage-latency"]');
    expect(latency.exists()).toBe(true);
    expect(latency.text()).toContain('ms');
    expect(wrapper.text()).toContain('Last Updated');
    expect(wrapper.text()).toContain('Success');
    wrapper.unmount();
  });

  it('renders the server stats card and the entity stats table', () => {
    const wrapper = mountViewer();
    expect(wrapper.find('[data-testid="server-stats-card"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="server-stats-table"]').exists()).toBe(true);
    expect(wrapper.text()).toContain('server-1');
    expect(wrapper.text()).toContain('2/3');
    expect(wrapper.find('[data-testid="app-entity-stats-history-table"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="entity-reader-avg"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="entity-process-avg"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="entity-sink-avg"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="entity-vector-avg"]').exists()).toBe(true);
    wrapper.unmount();
  });

  it('opens the failure-logs viewer only when failure logs exist', async () => {
    const wrapper = mountViewer();
    expect(wrapper.find('[data-testid="view-logs-button"]').exists()).toBe(true);
    await wrapper.find('[data-testid="view-logs-button"]').trigger('click');
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(document.body.textContent).toContain('index boom');
    wrapper.unmount();
    document.body.innerHTML = '';

    const noFailure = mountViewer({ ...data, failureContext: undefined });
    expect(noFailure.find('[data-testid="view-logs-button"]').exists()).toBe(false);
    noFailure.unmount();
  });

  it('opens the reindex failures drawer only when failed records exist', async () => {
    const wrapper = mountViewer();
    expect(wrapper.find('[data-testid="view-reindex-failures-button"]').exists()).toBe(true);
    await wrapper.find('[data-testid="view-reindex-failures-button"]').trigger('click');
    expect(wrapper.find('.reindex-drawer-stub').attributes('data-visible')).toBe('true');
    wrapper.unmount();

    const cleanStats = { ...stepStats, failedRecords: 0 };
    const noFailures = mountViewer({
      ...data,
      successContext: { stats: { jobStats: cleanStats } },
      failureContext: undefined,
    });
    expect(noFailures.find('[data-testid="view-reindex-failures-button"]').exists()).toBe(false);
    noFailures.unmount();
  });

  it('omits the latency segment when the success count is missing', () => {
    const wrapper = mountViewer({
      ...data,
      successContext: {
        stats: { jobStats: { totalRecords: 10, failedRecords: 10, totalTimeMs: 1000 } },
      },
      failureContext: undefined,
    });
    expect(wrapper.find('[data-testid="stage-latency"]').exists()).toBe(false);
    wrapper.unmount();
  });
});
