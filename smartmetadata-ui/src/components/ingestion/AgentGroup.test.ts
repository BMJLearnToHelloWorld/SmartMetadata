/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0.
 */
import { flushPromises, mount } from '@vue/test-utils';
import Antd from 'ant-design-vue';
import { afterEach, describe, expect, it } from 'vitest';
import { createTestI18n } from '@/test/i18n';
import type { Agent, IngestionPipeline } from '@/types/ingestion';
import AgentCard from './AgentCard.vue';
import AgentGroup from './AgentGroup.vue';

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

function pipeline(overrides: Partial<IngestionPipeline> = {}): IngestionPipeline {
  return {
    id: 'p1',
    name: 'pg-metadata',
    fullyQualifiedName: 'pg.metadata',
    pipelineType: 'metadata',
    deployed: true,
    enabled: true,
    ...overrides,
  };
}

function mountGroup(
  options: {
    agents?: Agent[];
    pipelinesByFqn?: Map<string, IngestionPipeline>;
    isLoading?: boolean;
    isRefreshing?: boolean;
    canCreateAgent?: boolean;
    actionStatusPending?: boolean;
    withSlot?: boolean;
  } = {},
) {
  return mount(AgentGroup, {
    props: {
      agents: options.agents ?? [],
      pipelinesByFqn: options.pipelinesByFqn ?? new Map(),
      permissionsById: new Map(),
      isAdminUser: true,
      orchestratorUnavailable: false,
      isPending: false,
      isLoading: options.isLoading ?? false,
      isRefreshing: options.isRefreshing ?? false,
      canCreateAgent: options.canCreateAgent ?? false,
      actionStatusPending: options.actionStatusPending ?? false,
    },
    slots: options.withSlot ? { 'add-agent': '<button data-testid="slot-add-agent">Slot</button>' } : {},
    attachTo: document.body,
    global: { plugins: [Antd, createTestI18n()] },
  });
}

describe('AgentGroup (official AgentGroup)', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('renders the group header with the running count only while agents run', async () => {
    const wrapper = mountGroup({
      agents: [agent({ status: 'running' }), agent({ fqn: 'b', status: 'success' })],
      pipelinesByFqn: new Map([['pg.metadata', pipeline()]]),
    });
    await flushPromises();
    expect(wrapper.text()).toContain('Metadata Agents');
    expect(wrapper.find('[data-testid="agent-group-running-count"]').text()).toContain('1 running');
    wrapper.unmount();

    const idle = mountGroup({ agents: [agent()], pipelinesByFqn: new Map([['pg.metadata', pipeline()]]) });
    await flushPromises();
    expect(idle.find('[data-testid="agent-group-running-count"]').exists()).toBe(false);
    idle.unmount();
  });

  it('emits refresh from the header button and spins it while refreshing', async () => {
    const wrapper = mountGroup({});
    await flushPromises();
    await wrapper.find('[data-testid="agent-group-refresh"]').trigger('click');
    expect(wrapper.emitted('refresh')).toEqual([[]]);
    wrapper.unmount();

    const refreshing = mountGroup({ isRefreshing: true });
    await flushPromises();
    expect(refreshing.find('[data-testid="agent-group-refresh"]').classes()).toContain(
      'ant-btn-loading',
    );
    refreshing.unmount();
  });

  it('shows skeleton cards while loading and the empty placeholder when empty', async () => {
    const loading = mountGroup({ isLoading: true });
    await flushPromises();
    expect(loading.find('[data-testid="agent-group-skeleton"]').exists()).toBe(true);
    expect(loading.findComponent(AgentCard).exists()).toBe(false);
    loading.unmount();

    const empty = mountGroup({});
    await flushPromises();
    expect(empty.find('[data-testid="agent-group-empty-placeholder"]').exists()).toBe(true);
    expect(empty.text()).toContain('No agents set up yet');
    empty.unmount();
  });

  it('renders one card per agent with a pipeline and skips agents without one', async () => {
    const wrapper = mountGroup({
      agents: [agent(), agent({ fqn: 'pg.ghost', id: 'p2' })],
      pipelinesByFqn: new Map([['pg.metadata', pipeline()]]),
    });
    await flushPromises();
    expect(wrapper.findAllComponents(AgentCard)).toHaveLength(1);
    wrapper.unmount();
  });

  it('renders the add-agent slot, or its skeleton while the status is pending', async () => {
    const slotted = mountGroup({ withSlot: true });
    await flushPromises();
    expect(slotted.find('[data-testid="slot-add-agent"]').exists()).toBe(true);
    slotted.unmount();

    const pending = mountGroup({ withSlot: true, actionStatusPending: true });
    await flushPromises();
    expect(pending.find('[data-testid="add-agent-skeleton"]').exists()).toBe(true);
    expect(pending.find('[data-testid="slot-add-agent"]').exists()).toBe(false);
    pending.unmount();
  });

  it('falls back to an inert Add button when no slot is provided and creation is allowed', async () => {
    const wrapper = mountGroup({ canCreateAgent: true });
    await flushPromises();
    expect(wrapper.text()).toContain('Add Agent');
    wrapper.unmount();

    const denied = mountGroup({ canCreateAgent: false });
    await flushPromises();
    expect(denied.text()).not.toContain('Add Agent');
    denied.unmount();
  });

  it('forwards card actions, logs, and history events upward', async () => {
    const wrapper = mountGroup({
      agents: [agent()],
      pipelinesByFqn: new Map([['pg.metadata', pipeline()]]),
    });
    await flushPromises();
    await wrapper.find('[data-testid="run-agent-button"]').trigger('click');
    expect(wrapper.emitted('action')).toEqual([['run', expect.objectContaining({ id: 'p1' })]]);
    await wrapper.find('[data-testid="logs-button"]').trigger('click');
    expect(wrapper.emitted('logs')).toEqual([[expect.objectContaining({ id: 'p1' })]]);
    await wrapper.find('[data-testid="view-run-history-button"]').trigger('click');
    expect(wrapper.emitted('viewHistory')).toEqual([[expect.objectContaining({ fqn: 'pg.metadata' })]]);
    wrapper.unmount();
  });
});
