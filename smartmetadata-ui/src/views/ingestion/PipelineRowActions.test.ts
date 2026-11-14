/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0.
 */
import { flushPromises, mount } from '@vue/test-utils';
import Antd, { Menu } from 'ant-design-vue';
import { defineComponent, h } from 'vue';
import { afterEach, describe, expect, it } from 'vitest';
import { createTestI18n } from '@/test/i18n';
import type { IngestionPipeline } from '@/types/ingestion';
import PipelineRowActions from './PipelineRowActions.vue';

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

const FULL_OPS = { Trigger: true, EditAll: true, Delete: true, Deploy: true };

function mountActions(
  options: {
    pipelineValue?: IngestionPipeline;
    ops?: Record<string, boolean>;
    orchestratorUnavailable?: boolean;
    variant?: 'row' | 'card';
    active?: boolean;
    showView?: boolean;
  } = {},
) {
  const Harness = defineComponent({
    render() {
      return h(
        Menu,
        null,
        {
          default: () =>
            h(PipelineRowActions, {
              pipeline: options.pipelineValue ?? pipeline(),
              ops: options.ops,
              isAdminUser: false,
              orchestratorUnavailable: options.orchestratorUnavailable ?? false,
              variant: options.variant,
              active: options.active,
              showView: options.showView,
              onToggle: (...args: unknown[]) => this.$emit('toggle', ...args),
              onDeploy: (...args: unknown[]) => this.$emit('deploy', ...args),
              onEdit: (...args: unknown[]) => this.$emit('edit', ...args),
              onKill: (...args: unknown[]) => this.$emit('kill', ...args),
              onDelete: (...args: unknown[]) => this.$emit('delete', ...args),
              onRun: (...args: unknown[]) => this.$emit('run', ...args),
              onLogs: (...args: unknown[]) => this.$emit('logs', ...args),
              onView: (...args: unknown[]) => this.$emit('view', ...args),
            }),
        },
      );
    },
  });
  return mount(Harness, {
    attachTo: document.body,
    global: { plugins: [Antd, createTestI18n()] },
  });
}

function isDisabled(wrapper: ReturnType<typeof mountActions>, testId: string): boolean {
  const item = wrapper.find(`[data-testid="${testId}"]`);
  expect(item.exists()).toBe(true);
  return item.attributes('aria-disabled') === 'true';
}

describe('PipelineRowActions card variant (official AgentOverflowMenu composition)', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('renders pause/resume + kill-or-redeploy + edit + delete, without view/logs/run', async () => {
    const wrapper = mountActions({ variant: 'card', ops: FULL_OPS, showView: true });
    await flushPromises();
    expect(wrapper.find('[data-testid="pause-button"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="re-deploy-button"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="edit-button"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="delete-button"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="row-overflow-view"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="logs-button"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="run-button"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it('shows kill instead of re-deploy while the agent is active', async () => {
    const wrapper = mountActions({ variant: 'card', active: true, ops: FULL_OPS });
    await flushPromises();
    expect(wrapper.find('[data-testid="kill-button"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="re-deploy-button"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="deploy-button"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it('shows Deploy for an undeployed pipeline and Re-deploy once deployed', async () => {
    const undeployed = mountActions({
      variant: 'card',
      ops: FULL_OPS,
      pipelineValue: pipeline({ deployed: false }),
    });
    await flushPromises();
    expect(undeployed.find('[data-testid="deploy-button"]').exists()).toBe(true);
    expect(undeployed.find('[data-testid="re-deploy-button"]').exists()).toBe(false);
    undeployed.unmount();

    const deployed = mountActions({ variant: 'card', ops: FULL_OPS });
    await flushPromises();
    expect(deployed.find('[data-testid="re-deploy-button"]').exists()).toBe(true);
    expect(deployed.find('[data-testid="deploy-button"]').exists()).toBe(false);
    deployed.unmount();
  });

  it('shows Resume for a paused pipeline', async () => {
    const wrapper = mountActions({
      variant: 'card',
      ops: FULL_OPS,
      pipelineValue: pipeline({ enabled: false }),
    });
    await flushPromises();
    expect(wrapper.find('[data-testid="resume-button"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="pause-button"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it('keeps edit and delete enabled while the orchestrator is down but disables kill', async () => {
    const wrapper = mountActions({
      variant: 'card',
      active: true,
      ops: FULL_OPS,
      orchestratorUnavailable: true,
    });
    await flushPromises();
    expect(isDisabled(wrapper, 'kill-button')).toBe(true);
    expect(isDisabled(wrapper, 'edit-button')).toBe(false);
    expect(isDisabled(wrapper, 'delete-button')).toBe(false);
    wrapper.unmount();
  });

  it('disables the toggle while the pipeline is undeployed', async () => {
    const wrapper = mountActions({
      variant: 'card',
      ops: FULL_OPS,
      pipelineValue: pipeline({ deployed: false }),
    });
    await flushPromises();
    expect(isDisabled(wrapper, 'pause-button')).toBe(true);
    wrapper.unmount();
  });

  it('emits the card actions', async () => {
    const wrapper = mountActions({ variant: 'card', ops: FULL_OPS });
    await flushPromises();
    await wrapper.find('[data-testid="re-deploy-button"]').trigger('click');
    await wrapper.find('[data-testid="edit-button"]').trigger('click');
    await wrapper.find('[data-testid="delete-button"]').trigger('click');
    const actions = wrapper.findComponent(PipelineRowActions);
    expect(actions.emitted('deploy')).toEqual([[expect.objectContaining({ id: 'p1' })]]);
    expect(actions.emitted('edit')).toEqual([[expect.objectContaining({ id: 'p1' })]]);
    expect(actions.emitted('delete')).toEqual([[expect.objectContaining({ id: 'p1' })]]);
    wrapper.unmount();
  });
});

describe('PipelineRowActions row variant (regression)', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('keeps the row composition with view, logs, run, and kill', async () => {
    const wrapper = mountActions({ ops: FULL_OPS, showView: true });
    await flushPromises();
    expect(wrapper.find('[data-testid="row-overflow-view"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="logs-button"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="run-button"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="kill-button"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="row-overflow-edit"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="row-overflow-delete"]').exists()).toBe(true);
    wrapper.unmount();
  });
});
