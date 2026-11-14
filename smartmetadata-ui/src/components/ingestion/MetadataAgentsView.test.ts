/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0.
 */
import { flushPromises, mount } from '@vue/test-utils';
import Antd from 'ant-design-vue';
import { afterEach, describe, expect, it } from 'vitest';
import { createMemoryHistory, createRouter } from 'vue-router';
import { createTestI18n } from '@/test/i18n';
import type { Agent, IngestionPipeline } from '@/types/ingestion';
import AddAgentButton from './AddAgentButton.vue';
import AgentGroup from './AgentGroup.vue';
import MetadataAgentsView from './MetadataAgentsView.vue';

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

async function mountView(options: { showAddAgent?: boolean; orchestratorUnavailable?: boolean } = {}) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', name: 'home', component: { template: '<div />' } },
      {
        path: '/ingestion/services/:kind/:id/add/:ingestionType',
        name: 'ingestion-service-add-ingestion',
        component: { template: '<div>add</div>' },
      },
    ],
  });
  await router.push('/');
  await router.isReady();
  const wrapper = mount(MetadataAgentsView, {
    props: {
      agents: [agent()],
      pipelinesByFqn: new Map([['pg.metadata', pipeline()]]),
      permissionsById: new Map(),
      isAdminUser: true,
      orchestratorUnavailable: options.orchestratorUnavailable ?? false,
      isPending: false,
      isLoading: false,
      isRefreshing: false,
      canCreateAgent: true,
      actionStatusPending: false,
      showAddAgent: options.showAddAgent ?? true,
      supportedTypes: ['metadata'],
      isDataInsightExists: false,
      serviceKind: 'database',
      serviceId: 's1',
    },
    attachTo: document.body,
    global: { plugins: [Antd, createTestI18n(), router] },
  });
  await flushPromises();
  return wrapper;
}

describe('MetadataAgentsView (official MetadataAgentsView)', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('renders the single agent group with the Add Agent slot', async () => {
    const wrapper = await mountView();
    expect(wrapper.find('[data-testid="metadata-agents-view"]').exists()).toBe(true);
    expect(wrapper.findComponent(AgentGroup).exists()).toBe(true);
    const button = wrapper.findComponent(AddAgentButton);
    expect(button.exists()).toBe(true);
    expect(button.props()).toMatchObject({
      types: ['metadata'],
      disabled: false,
      serviceKind: 'database',
      serviceId: 's1',
    });
    wrapper.unmount();
  });

  it('disables the Add Agent button while the orchestrator is unavailable', async () => {
    const wrapper = await mountView({ orchestratorUnavailable: true });
    expect(wrapper.findComponent(AddAgentButton).props('disabled')).toBe(true);
    wrapper.unmount();
  });

  it('omits the Add Agent slot when the gate is off', async () => {
    const wrapper = await mountView({ showAddAgent: false });
    expect(wrapper.findComponent(AddAgentButton).exists()).toBe(false);
    wrapper.unmount();
  });

  it('forwards every group event upward', async () => {
    const wrapper = await mountView();
    const group = wrapper.findComponent(AgentGroup);
    const pipe = pipeline();
    const agentValue = agent();
    group.vm.$emit('refresh');
    group.vm.$emit('action', 'run', pipe);
    group.vm.$emit('logs', pipe);
    group.vm.$emit('runDetails', agentValue, 'r1');
    group.vm.$emit('viewHistory', agentValue);
    await flushPromises();
    expect(wrapper.emitted('refresh')).toEqual([[]]);
    expect(wrapper.emitted('action')).toEqual([['run', pipe]]);
    expect(wrapper.emitted('logs')).toEqual([[pipe]]);
    expect(wrapper.emitted('runDetails')).toEqual([[agentValue, 'r1']]);
    expect(wrapper.emitted('viewHistory')).toEqual([[agentValue]]);
    wrapper.unmount();
  });
});
