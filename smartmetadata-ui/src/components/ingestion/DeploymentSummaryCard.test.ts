/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0.
 */
import { mount } from '@vue/test-utils';
import Antd, { Progress } from 'ant-design-vue';
import { describe, expect, it } from 'vitest';
import { createTestI18n } from '@/test/i18n';
import type { Agent } from '@/types/ingestion';
import DeploymentSummaryCard from './DeploymentSummaryCard.vue';

function agent(overrides: Partial<Agent> = {}): Agent {
  return {
    id: 'p1',
    fqn: 'pg.metadata',
    pipelineType: 'metadata',
    name: 'Metadata Agent',
    type: 'Metadata',
    unit: 'assets',
    verb: 'ingested',
    status: 'success',
    pct: 100,
    eta: 0,
    assets: 10,
    target: 10,
    errors: 0,
    warnings: 0,
    recentRuns: [],
    ...overrides,
  };
}

function mountCard(agents: Agent[], totalAgents?: number) {
  return mount(DeploymentSummaryCard, {
    props: { agents, totalAgents },
    global: { plugins: [Antd, createTestI18n()] },
  });
}

describe('DeploymentSummaryCard (official DeploymentSummaryCard)', () => {
  it('renders nothing when no agent is active', () => {
    const wrapper = mountCard([agent({ status: 'none' })], 1);
    expect(wrapper.find('[data-testid="deployment-summary-card"]').exists()).toBe(false);
  });

  it('shows the in-flight title, subtitle, stats, and progress bar', () => {
    const wrapper = mountCard(
      [
        agent({ fqn: 'a', status: 'running', pct: 50, assets: 20, eta: 90, lastRunAt: 2000 }),
        agent({ fqn: 'b', status: 'success', pct: 100, assets: 40, errors: 2, lastRunAt: 1000 }),
      ],
      3,
    );
    expect(wrapper.find('[data-testid="deployment-summary-title"]').text()).toBe(
      'Agents deploying & ingesting metadata',
    );
    expect(wrapper.text()).toContain('1 done · 1 running · 1 queued');
    expect(wrapper.find('[data-testid="summary-assets-ingested"]').text()).toContain('20');
    expect(wrapper.find('[data-testid="summary-assets-ingested"]').text()).toContain('assets ingested');
    expect(wrapper.find('[data-testid="summary-errors"]').text()).toContain('2');
    expect(wrapper.find('[data-testid="summary-eta-remaining"]').text()).toContain('est. remaining');
    // The summary uses the pin's short ETA form: bare duration, no wrapper.
    expect(wrapper.find('[data-testid="summary-eta-remaining"]').text()).toContain('1m 30s');
    expect(wrapper.find('[data-testid="summary-eta-remaining"]').text()).not.toContain('left');
    const bar = wrapper.findComponent(Progress);
    expect(bar.exists()).toBe(true);
    expect(bar.props('percent')).toBe(50);
    expect(wrapper.text()).toContain('50% complete across all agents');
    expect(wrapper.text()).toContain('You can leave this page');
  });

  it('hides the ETA stat when no running agent reports one', () => {
    const wrapper = mountCard([agent({ status: 'running', pct: 10, eta: null })], 1);
    expect(wrapper.find('[data-testid="summary-eta-remaining"]').exists()).toBe(false);
    expect(wrapper.findComponent(Progress).exists()).toBe(true);
  });

  it('shows the finished title with no progress section once all agents are done', () => {
    const wrapper = mountCard(
      [agent({ status: 'success' }), agent({ fqn: 'b', status: 'failed' })],
      2,
    );
    expect(wrapper.find('[data-testid="deployment-summary-title"]').text()).toBe('Deployment complete');
    expect(wrapper.text()).toContain('1 of 2 agents finished');
    expect(wrapper.text()).toContain('1 need attention');
    expect(wrapper.find('[data-testid="summary-eta-remaining"]').exists()).toBe(false);
    expect(wrapper.findComponent(Progress).exists()).toBe(false);
  });
});
