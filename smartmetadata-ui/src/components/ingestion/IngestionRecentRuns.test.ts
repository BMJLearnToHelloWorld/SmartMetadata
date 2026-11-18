/**
 * Copyright 2026 SmartMetadata authors.
 * Licensed under the Apache License, Version 2.0.
 */
import { describe, expect, it } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import Antd from 'ant-design-vue';
import { createI18n } from 'vue-i18n';
import IngestionRecentRuns from './IngestionRecentRuns.vue';
import type { PipelineStatus } from '@/types/ingestion';

const i18n = createI18n({
  legacy: false,
  locale: 'en',
  messages: {
    en: {
      settings: {
        services: {
          pipeline: {
            tooltip: {
              executionDate: 'Execution Date',
              startDate: 'Start Date',
              endDate: 'End Date',
            },
          },
        },
      },
    },
  },
});

function status(overrides: Partial<PipelineStatus>): PipelineStatus {
  return { runId: 'r1', pipelineState: 'success', ...overrides };
}

describe('IngestionRecentRuns', () => {
  it('renders -- when there are no runs', () => {
    const wrapper = mount(IngestionRecentRuns, {
      props: { statuses: [] },
      global: { plugins: [Antd, i18n] },
    });
    const empty = wrapper.find('[data-testid="pipeline-status"]');
    expect(empty.exists()).toBe(true);
    expect(empty.text()).toBe('--');
  });

  it('sorts ascending by timestamp and keeps the last 5', () => {
    const statuses = [500, 100, 600, 200, 300, 400, 700].map((timestamp, index) =>
      status({ runId: `r${index}`, timestamp, pipelineState: 'success' }),
    );
    const wrapper = mount(IngestionRecentRuns, {
      props: { statuses },
      global: { plugins: [Antd, i18n] },
    });
    const badges = wrapper.findAll('[data-testid="pipeline-status"]');
    expect(badges).toHaveLength(5);
    // Only the latest (last) badge shows state text.
    expect(badges[4].text()).toBe('Success');
    expect(badges[0].text()).toBe('');
    expect(badges[3].text()).toBe('');
  });

  it('does not mutate the input array', () => {
    const statuses = [status({ runId: 'a', timestamp: 300 }), status({ runId: 'b', timestamp: 100 })];
    mount(IngestionRecentRuns, {
      props: { statuses },
      global: { plugins: [Antd, i18n] },
    });
    expect(statuses.map((item) => item.runId)).toEqual(['a', 'b']);
  });

  it('shows state text only on the latest badge and opens details on click', async () => {
    const wrapper = mount(IngestionRecentRuns, {
      props: {
        statuses: [
          status({ runId: 'old', timestamp: 100, pipelineState: 'failed' }),
          status({ runId: 'new', timestamp: 200, pipelineState: 'running' }),
        ],
      },
      global: { plugins: [Antd, i18n] },
      attachTo: document.body,
    });
    const badges = wrapper.findAll('[data-testid="pipeline-status"]');
    expect(badges).toHaveLength(2);
    expect(badges[1].text()).toBe('Running');
    await badges[1].trigger('click');
    await flushPromises();
    expect(document.querySelector('.ant-modal')).not.toBeNull();
    wrapper.unmount();
  });

  it('renders a skeleton while loading', () => {
    const wrapper = mount(IngestionRecentRuns, {
      props: { statuses: [], loading: true },
      global: { plugins: [Antd, i18n] },
    });
    expect(wrapper.find('.ant-skeleton').exists()).toBe(true);
    expect(wrapper.find('[data-testid="pipeline-status"]').exists()).toBe(false);
  });
});
