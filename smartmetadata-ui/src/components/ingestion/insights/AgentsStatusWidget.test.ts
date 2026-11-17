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
import { describe, expect, it } from 'vitest';
import { createTestI18n } from '@/test/i18n';
import AgentsStatusWidget, { type AgentsInfo } from './AgentsStatusWidget.vue';

function info(overrides: Partial<AgentsInfo> = {}): AgentsInfo {
  return { label: 'Metadata', status: 'Successful', isCollateAgent: false, agentType: 'metadata', ...overrides };
}

function mountWidget(props: Record<string, unknown> = {}) {
  return mount(AgentsStatusWidget, {
    props: { agentsInfo: [], isLoading: false, ...props },
    global: { plugins: [Antd, createTestI18n()] },
  });
}

describe('AgentsStatusWidget (official AgentsStatusWidget)', () => {
  it('starts collapsed and expands on header click', async () => {
    const wrapper = mountWidget({ agentsInfo: [info()] });
    expect(wrapper.find('[data-testid="agent-status-card-Metadata"]').exists()).toBe(false);
    await wrapper.find('.ant-collapse-header').trigger('click');
    expect(wrapper.find('[data-testid="agent-status-card-Metadata"]').exists()).toBe(true);
    expect(wrapper.text()).toContain('Agents Status');
  });

  it('summarizes counts by status in Successful/Running/Failed/Pending order, omitting empty statuses', () => {
    const wrapper = mountWidget({
      agentsInfo: [
        info({ label: 'Metadata', status: 'Successful' }),
        info({ label: 'Lineage', status: 'Successful', agentType: 'lineage' }),
        info({ label: 'Usage', status: 'Running', agentType: 'usage' }),
        info({ label: 'Profiler', status: 'Pending', agentType: 'profiler' }),
      ],
    });
    const items = wrapper.findAll('[data-testid^="agent-status-summary-item-"]');
    expect(items.map((item) => item.attributes('data-testid'))).toEqual([
      'agent-status-summary-item-Successful',
      'agent-status-summary-item-Running',
      'agent-status-summary-item-Pending',
    ]);
    expect(items[0].find('[data-testid="pipeline-count"]').text()).toBe('2');
    expect(items[1].find('[data-testid="pipeline-count"]').text()).toBe('1');
    expect(wrapper.find('[data-testid="agent-status-widget-view-more"]').text()).toContain('View more');
  });

  it('shows a skeleton in the expand area while loading', () => {
    const wrapper = mountWidget({ isLoading: true });
    expect(wrapper.find('[data-testid="agent-status-widget-expand-icon"] .ant-skeleton').exists()).toBe(true);
  });

  it('shows the workflow running message for each AutoPilot status', () => {
    const cases: Array<[string, string]> = [
      ['RUNNING', 'AutoPilot agents are running.'],
      ['FAILURE', 'AutoPilot agents run failed.'],
      ['FINISHED', 'AutoPilot agents run completed successfully.'],
      ['EXCEPTION', 'AutoPilot agents encountered an exception.'],
    ];
    for (const [status, message] of cases) {
      const wrapper = mountWidget({
        agentsInfo: [info()],
        liveAutoPilotStatusData: { id: 'w1', status },
      });
      expect(wrapper.find('[data-testid="agents-status-message"]').text()).toBe(message);
    }
  });

  it('shows the no-agents message only when empty, idle and without workflow status', () => {
    expect(
      mountWidget().find('[data-testid="agents-status-message"]').text(),
    ).toBe('No AutoPilot agents present.');
    expect(
      mountWidget({ agentsInfo: [info()] }).find('[data-testid="agents-status-message"]').text(),
    ).toBe('');
    expect(
      mountWidget({ liveAutoPilotStatusData: { id: 'w1', status: 'CANCELLED' } })
        .find('[data-testid="agents-status-message"]')
        .text(),
    ).toBe('');
  });

  it('shows a message skeleton while loading', () => {
    const wrapper = mountWidget({ isLoading: true });
    expect(wrapper.find('.agents-status-widget__message .ant-skeleton').exists()).toBe(true);
    expect(wrapper.find('[data-testid="agents-status-message"]').exists()).toBe(false);
  });

  it('renders the empty placeholder when expanded with no agents', async () => {
    const wrapper = mountWidget();
    await wrapper.find('.ant-collapse-header').trigger('click');
    expect(wrapper.find('[data-testid="no-data-placeholder"]').exists()).toBe(true);
  });

  it('renders eight skeleton cards while loading', async () => {
    const wrapper = mountWidget({ isLoading: true });
    await wrapper.find('.ant-collapse-header').trigger('click');
    expect(wrapper.findAll('.agents-status-widget__skeleton-card')).toHaveLength(8);
  });

  it('renders one card per agent with its label', async () => {
    const wrapper = mountWidget({
      agentsInfo: [
        info({ label: 'Metadata' }),
        info({ label: 'Profiler', status: 'Failed', agentType: 'profiler' }),
      ],
    });
    await wrapper.find('.ant-collapse-header').trigger('click');
    expect(wrapper.find('[data-testid="agent-status-card-Metadata"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="agent-status-card-Profiler"]').exists()).toBe(true);
  });
});
