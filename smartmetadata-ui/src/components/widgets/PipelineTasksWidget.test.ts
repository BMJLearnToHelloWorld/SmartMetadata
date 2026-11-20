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
import { describe, expect, it, vi } from 'vitest';
import { createTestI18n } from '@/test/i18n';
import EntityDescriptionCell from '@/components/shared/EntityDescriptionCell.vue';
import TaskTagCell from './TaskTagCell.vue';
import PipelineTasksWidget from './PipelineTasksWidget.vue';
import type { AssetTagOption } from '@/types/governance';
import type { PipelineTask } from '@/types/api';

vi.mock('@vue-flow/core', async () => (await import('@/test/vueFlowStub')).vueFlowStubs['@vue-flow/core']());
vi.mock('@vue-flow/background', async () => (await import('@/test/vueFlowStub')).vueFlowStubs['@vue-flow/background']());
vi.mock('@vue-flow/controls', async () => (await import('@/test/vueFlowStub')).vueFlowStubs['@vue-flow/controls']());
vi.mock('@vue-flow/minimap', async () => (await import('@/test/vueFlowStub')).vueFlowStubs['@vue-flow/minimap']());

const TASKS: PipelineTask[] = [
  {
    name: 'extract',
    displayName: 'Extract',
    fullyQualifiedName: 'airflow.daily_etl.extract',
    description: 'Pulls raw rows',
    taskType: 'AirflowOperator',
    downstreamTasks: ['load'],
    tags: [
      { tagFQN: 'PII.Sensitive', name: 'Sensitive', source: 'Classification', labelType: 'Manual', state: 'Confirmed' },
      { tagFQN: 'Glossary.Term', name: 'Term', source: 'Glossary', labelType: 'Manual', state: 'Confirmed' },
    ],
    owners: [{ name: 'alice', type: 'user', displayName: 'Alice' }],
  },
  {
    name: 'load',
    downstreamTasks: [],
    tags: [],
    owners: [],
  },
];

const TAG_OPTIONS: AssetTagOption[] = [
  { tagFQN: 'PII.Sensitive', name: 'Sensitive', source: 'Classification' },
  { tagFQN: 'PII.Public', name: 'Public', source: 'Classification' },
  { tagFQN: 'Glossary.Term', name: 'Term', source: 'Glossary' },
];

function mountWidget(overrides: Record<string, unknown> = {}) {
  const onTaskDescriptionUpdate = vi.fn(async () => {});
  const onTaskTagChange = vi.fn(async () => {});
  const wrapper = mount(PipelineTasksWidget, {
    attachTo: document.body,
    props: {
      tasks: TASKS,
      taskGraph: { nodes: [], edges: [] },
      deleted: false,
      canEditDescription: true,
      canEditTags: true,
      canEditGlossaryTerms: true,
      tagOptions: TAG_OPTIONS,
      onTaskDescriptionUpdate,
      onTaskTagChange,
      ...overrides,
    },
    global: { plugins: [Antd, createTestI18n()] },
  });
  return { wrapper, onTaskDescriptionUpdate, onTaskTagChange };
}

async function switchToDag(wrapper: ReturnType<typeof mountWidget>['wrapper']): Promise<void> {
  const option = [...wrapper.findAll('.ant-segmented-item')].find((item) =>
    item.text().includes('Dag'),
  );
  expect(option).toBeDefined();
  await option!.trigger('click');
  await flushPromises();
}

describe('PipelineTasksWidget (pin PipelineTaskTab)', () => {
  it('renders the task table with name, type, description, owners and tags', async () => {
    const { wrapper } = mountWidget();
    expect(wrapper.find('[data-testid="task-table"]').exists()).toBe(true);
    expect(wrapper.text()).toContain('Extract');
    expect(wrapper.text()).toContain('AirflowOperator');
    // The description cell renders through the Tiptap preview editor, which
    // mounts asynchronously.
    await vi.waitFor(() => {
      expect(wrapper.text()).toContain('Pulls raw rows');
    });
    expect(wrapper.text()).toContain('Alice');
    expect(wrapper.text()).toContain('Sensitive');
    expect(wrapper.text()).toContain('Term');
    // A task without a type renders the empty dash, not a blank cell.
    expect(wrapper.text()).toContain('load');
    wrapper.unmount();
  });

  it('renders the empty state when the pipeline has no tasks', () => {
    const { wrapper } = mountWidget({ tasks: [] });
    expect(wrapper.find('[data-testid="pipeline-task-empty"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="task-table"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it('switches to the Dag view and renders the task graph', async () => {
    const { wrapper } = mountWidget();
    expect(wrapper.find('[data-testid="pipeline-task-graph"]').exists()).toBe(false);
    await switchToDag(wrapper);
    expect(wrapper.find('[data-testid="pipeline-task-graph"]').exists()).toBe(true);
    wrapper.unmount();
  });

  it('passes the description save through with the task and its full-list index', async () => {
    const { wrapper, onTaskDescriptionUpdate } = mountWidget();
    const cells = wrapper.findAllComponents(EntityDescriptionCell);
    expect(cells.length).toBe(2);
    await (cells[1].props('onDescriptionUpdate') as (description: string) => Promise<void>)('Loaded rows');
    expect(onTaskDescriptionUpdate).toHaveBeenCalledTimes(1);
    expect(onTaskDescriptionUpdate).toHaveBeenCalledWith(TASKS[1], 1, 'Loaded rows');
    wrapper.unmount();
  });

  it('passes tag changes through with the task and the edited source', async () => {
    const { wrapper, onTaskTagChange } = mountWidget();
    const cells = wrapper.findAllComponents(TaskTagCell);
    // Two tag cells per task (Classification + Glossary).
    expect(cells.length).toBe(4);
    await (cells[0].props('onChange') as (fqns: string[]) => void)(['PII.Sensitive', 'PII.Public']);
    expect(onTaskTagChange).toHaveBeenCalledWith(TASKS[0], 'Classification', ['PII.Sensitive', 'PII.Public']);
    await (cells[1].props('onChange') as (fqns: string[]) => void)([]);
    expect(onTaskTagChange).toHaveBeenCalledWith(TASKS[0], 'Glossary', []);
    wrapper.unmount();
  });

  it('opens the read-only task detail modal for a name without a source URL', async () => {
    const { wrapper } = mountWidget();
    const buttons = wrapper.findAll('button');
    const extractButton = buttons.find((button) => button.text() === 'Extract');
    expect(extractButton).toBeDefined();
    await extractButton!.trigger('click');
    await flushPromises();
    await vi.waitFor(() => {
      expect(document.body.textContent).toContain('airflow.daily_etl.extract');
    });
    expect(document.body.textContent).toContain('Pulls raw rows');
    wrapper.unmount();
  });

  it('renders an external link for a name with a source URL', () => {
    const { wrapper } = mountWidget({
      tasks: [{ ...TASKS[0], sourceUrl: 'https://example.invalid/extract' }, TASKS[1]],
    });
    const link = wrapper.find('a[href="https://example.invalid/extract"]');
    expect(link.exists()).toBe(true);
    expect(link.attributes('target')).toBe('_blank');
    wrapper.unmount();
  });

  it('hides the description edit affordance and the tag selects for a deleted pipeline', () => {
    const { wrapper } = mountWidget({ deleted: true });
    expect(wrapper.findAll('[data-testid="edit-description"]').length).toBe(0);
    // Read-only tag cells render chips, not selects. The tag selects carry
    // their own test ids; the pagination size-changer is a different Select.
    expect(wrapper.findAllComponents(TaskTagCell).length).toBe(4);
    expect(
      wrapper.find('[data-testid="task-tag-cell-extract-select-Classification"]').exists(),
    ).toBe(false);
    expect(
      wrapper.find('[data-testid="task-tag-cell-extract-select-Glossary"]').exists(),
    ).toBe(false);
    wrapper.unmount();
  });
});
