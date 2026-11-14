/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0.
 */
import { flushPromises, mount } from '@vue/test-utils';
import Antd, { Progress } from 'ant-design-vue';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { ensureCronstrueLoaded } from '@/ingestion/scheduleDescription';
import { createTestI18n } from '@/test/i18n';
import type { Agent, IngestionPipeline } from '@/types/ingestion';
import AgentCard from './AgentCard.vue';

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

const FULL_OPS = { Trigger: true, EditAll: true, Delete: true };

function mountCard(
  agentValue: Agent,
  options: {
    pipelineValue?: IngestionPipeline;
    ops?: Record<string, boolean>;
    isAdminUser?: boolean;
    orchestratorUnavailable?: boolean;
    isPending?: boolean;
  } = {},
) {
  return mount(AgentCard, {
    props: {
      agent: agentValue,
      pipeline: options.pipelineValue ?? pipeline(),
      ops: options.ops,
      isAdminUser: options.isAdminUser ?? false,
      orchestratorUnavailable: options.orchestratorUnavailable ?? false,
      isPending: options.isPending ?? false,
    },
    attachTo: document.body,
    global: { plugins: [Antd, createTestI18n()] },
  });
}

describe('AgentCard (official AgentCard)', () => {
  beforeAll(async () => {
    await ensureCronstrueLoaded();
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('renders the identity block with the schedule description', async () => {
    const wrapper = mountCard(agent({ schedule: '0 0 * * 0' }));
    await flushPromises();
    expect(wrapper.find('[data-testid="agent-card-pg.metadata"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="pipeline-name"]').text()).toBe('Metadata Agent');
    expect(wrapper.find('[data-testid="pipeline-type"]').text()).toBe('Metadata');
    expect(wrapper.find('[data-testid="agent-schedule"]').text()).toContain('At 12:00 AM');
    wrapper.unmount();
  });

  it('replaces the pill and metrics with the paused badge when disabled', async () => {
    const wrapper = mountCard(agent({ enabled: false, status: 'success' }));
    await flushPromises();
    expect(wrapper.find('[data-testid="paused-pipeline-badge"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="paused-pipeline-badge"]').text()).toBe('Paused');
    expect(wrapper.find('[data-testid="pipeline-status"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it('shows the running progress bar clamped to at least 2 percent', async () => {
    const wrapper = mountCard(agent({ status: 'running', pct: 0, assets: 5, eta: 90 }));
    await flushPromises();
    expect(wrapper.find('[data-testid="pipeline-status"]').text()).toBe('Running');
    const bar = wrapper.findComponent(Progress);
    expect(bar.exists()).toBe(true);
    expect(bar.props('percent')).toBe(2);
    expect(wrapper.text()).toContain('5 assets ingested');
    // The card uses the pin's long ETA form, not the summary's short one.
    expect(wrapper.text()).toContain('~1m 30s left');
    wrapper.unmount();
  });

  it('shows recent-run dots with the latest at full opacity and opens details on click', async () => {
    const wrapper = mountCard(
      agent({
        status: 'success',
        recentRuns: [
          { id: 'r1', status: 'success' },
          { id: 'r2', status: 'failed' },
        ],
      }),
    );
    await flushPromises();
    const dots = wrapper.findAll('[data-testid="agent-run-dot"]');
    expect(dots).toHaveLength(2);
    expect((dots[0]?.element as HTMLElement).style.opacity).toBe('0.55');
    expect((dots[1]?.element as HTMLElement).style.opacity).toBe('1');
    await dots[0]?.trigger('click');
    expect(wrapper.emitted('runDetails')).toEqual([[expect.objectContaining({ fqn: 'pg.metadata' }), 'r1']]);
    await wrapper.find('[data-testid="view-run-history-button"]').trigger('click');
    expect(wrapper.emitted('viewHistory')).toEqual([[expect.objectContaining({ fqn: 'pg.metadata' })]]);
    wrapper.unmount();
  });

  it('shows the diagnose button for failed agents and never the logs button', async () => {
    const wrapper = mountCard(agent({ status: 'failed' }), { orchestratorUnavailable: true });
    await flushPromises();
    const diagnose = wrapper.find('[data-testid="diagnose-button"]');
    expect(diagnose.exists()).toBe(true);
    expect((diagnose.element as HTMLButtonElement).disabled).toBe(false);
    expect(wrapper.find('[data-testid="logs-button"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="agent-card-pg.metadata"]').classes()).toContain('agent-card--failed');
    await diagnose.trigger('click');
    expect(wrapper.emitted('runDetails')).toEqual([
      [expect.objectContaining({ fqn: 'pg.metadata' }), undefined],
    ]);
    wrapper.unmount();
  });

  it('shows error and warning metrics only when nonzero', async () => {
    const withAlerts = mountCard(agent({ errors: 3, warnings: 2 }));
    await flushPromises();
    expect(withAlerts.find('[data-testid="agent-errors-metric"]').text()).toContain('3 errors');
    expect(withAlerts.find('[data-testid="agent-warnings-metric"]').text()).toContain('2 warnings');
    withAlerts.unmount();
    const clean = mountCard(agent());
    await flushPromises();
    expect(clean.find('[data-testid="agent-errors-metric"]').exists()).toBe(false);
    expect(clean.find('[data-testid="agent-warnings-metric"]').exists()).toBe(false);
    clean.unmount();
  });

  it('runs only with the trigger bit, an enabled agent, and a non-active status', async () => {
    const runnable = mountCard(agent(), { ops: FULL_OPS });
    await flushPromises();
    const runButton = runnable.find('[data-testid="run-agent-button"]');
    expect(runButton.exists()).toBe(true);
    await runButton.trigger('click');
    expect(runnable.emitted('action')).toEqual([['run', expect.objectContaining({ id: 'p1' })]]);
    runnable.unmount();

    const denied = mountCard(agent(), { ops: undefined });
    await flushPromises();
    expect(denied.find('[data-testid="run-agent-button"]').exists()).toBe(false);
    denied.unmount();

    const running = mountCard(agent({ status: 'running' }), { ops: FULL_OPS });
    await flushPromises();
    expect(running.find('[data-testid="run-agent-button"]').exists()).toBe(false);
    running.unmount();
  });

  it('disables the run and logs buttons while the orchestrator is unavailable', async () => {
    const wrapper = mountCard(agent(), { ops: FULL_OPS, orchestratorUnavailable: true });
    await flushPromises();
    expect(
      (wrapper.find('[data-testid="run-agent-button"]').element as HTMLButtonElement).disabled,
    ).toBe(true);
    const logs = wrapper.find('[data-testid="logs-button"]');
    expect((logs.element as HTMLButtonElement).disabled).toBe(true);
    wrapper.unmount();
  });

  it('emits logs for the pipeline', async () => {
    const wrapper = mountCard(agent());
    await flushPromises();
    await wrapper.find('[data-testid="logs-button"]').trigger('click');
    expect(wrapper.emitted('logs')).toEqual([[expect.objectContaining({ id: 'p1' })]]);
    wrapper.unmount();
  });

  it('renders the actions skeleton while pending instead of the action row', async () => {
    const wrapper = mountCard(agent(), { ops: FULL_OPS, isPending: true });
    await flushPromises();
    expect(wrapper.find('[data-testid="agent-card-actions-skeleton"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="logs-button"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="run-agent-button"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="more-actions"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it('exposes the overflow menu with the card actions', async () => {
    const wrapper = mountCard(agent(), { ops: FULL_OPS });
    await flushPromises();
    const trigger = wrapper.find('[data-testid="more-actions"]');
    expect(trigger.exists()).toBe(true);
    expect(trigger.attributes('aria-label')).toBe('More actions');
    await trigger.trigger('click');
    await flushPromises();
    const menu = document.querySelector('[data-testid="actions-dropdown"]');
    expect(menu).not.toBeNull();
    expect(menu?.querySelector('[data-testid="pause-button"]')).not.toBeNull();
    expect(menu?.querySelector('[data-testid="re-deploy-button"]')).not.toBeNull();
    expect(menu?.querySelector('[data-testid="edit-button"]')).not.toBeNull();
    expect(menu?.querySelector('[data-testid="delete-button"]')).not.toBeNull();
    expect(menu?.querySelector('[data-testid="logs-button"]')).toBeNull();
    wrapper.unmount();
  });

  it('maps the overflow toggle to pause or resume from the pipeline enabled flag', async () => {
    const enabled = mountCard(agent(), { ops: FULL_OPS, pipelineValue: pipeline({ enabled: true }) });
    await flushPromises();
    await enabled.find('[data-testid="more-actions"]').trigger('click');
    await flushPromises();
    document.querySelector<HTMLElement>('[data-testid="pause-button"]')?.click();
    await flushPromises();
    expect(enabled.emitted('action')).toEqual([['pause', expect.objectContaining({ id: 'p1' })]]);
    enabled.unmount();
    document.body.innerHTML = '';

    const paused = mountCard(agent({ enabled: false }), {
      ops: FULL_OPS,
      pipelineValue: pipeline({ enabled: false }),
    });
    await flushPromises();
    await paused.find('[data-testid="more-actions"]').trigger('click');
    await flushPromises();
    document.querySelector<HTMLElement>('[data-testid="resume-button"]')?.click();
    await flushPromises();
    expect(paused.emitted('action')).toEqual([['resume', expect.objectContaining({ id: 'p1' })]]);
    paused.unmount();
  });
});
