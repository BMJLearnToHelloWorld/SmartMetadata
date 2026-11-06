/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import WorkflowSidebar from './WorkflowSidebar.vue';
import { mountWithBuilder } from './testHarness';

/**
 * Official WorkflowSidebar: the palette sections come from
 * NODE_TYPE_MAPPINGS (automated without a category, sinks, user tasks;
 * the lifecycle collect-metadata task is not offered), and dragging an
 * item writes the node type + label to the dataTransfer under official's
 * keys. Items disable when isNodeDragEnabled says no.
 */

afterEach(() => {
  vi.unstubAllGlobals();
});

function dragDataTransfer() {
  return {
    setData: vi.fn(),
    effectAllowed: '',
  };
}

describe('WorkflowSidebar', () => {
  it('renders the palette sections from NODE_TYPE_MAPPINGS', async () => {
    const { wrapper } = await mountWithBuilder(WorkflowSidebar, {
      path: '/workflows/approve-glossary-term/workflow?mode=edit',
    });

    expect(
      wrapper.find('[data-testid="workflow-node-sidebar"]').exists(),
    ).toBe(true);
    expect(
      wrapper.find('[data-testid="workflow-start-node-draggable"]').exists(),
    ).toBe(true);
    expect(
      wrapper.find('[data-testid="workflow-end-node-draggable"]').exists(),
    ).toBe(true);
    // Automated tasks without a category: check, detect-change, set,
    // data-completeness, revert, policy (6). The lifecycle collect task
    // is not offered in the palette.
    expect(
      wrapper.find('[data-testid="workflow-automated-tasks-section"]')
        .findAll('[data-testid^="workflow-task-item-"]'),
    ).toHaveLength(6);
    expect(
      wrapper
        .find('[data-testid="workflow-task-item-collectMetadataTask"]')
        .exists(),
    ).toBe(false);
    // Sinks: the git sink only, marked Beta.
    const sinks = wrapper.find('[data-testid="workflow-sinks-section"]');
    expect(
      sinks.findAll('[data-testid^="workflow-task-item-"]'),
    ).toHaveLength(1);
    expect(sinks.text()).toContain('Beta');
    // User tasks: the approval task only.
    expect(
      wrapper
        .find('[data-testid="workflow-user-tasks-section"]')
        .findAll('[data-testid^="workflow-task-item-"]'),
    ).toHaveLength(1);
  });

  it('writes the node type and label to the dataTransfer on dragstart', async () => {
    const { wrapper } = await mountWithBuilder(WorkflowSidebar, {
      path: '/workflows/approve-glossary-term/workflow?mode=edit',
    });
    const dataTransfer = dragDataTransfer();
    const item = wrapper.find(
      '[data-testid="workflow-task-item-checkEntityAttributesTask"]',
    );
    await item.trigger('dragstart', { dataTransfer });
    expect(dataTransfer.setData).toHaveBeenCalledWith(
      'application/reactflow',
      'automatedTask',
    );
    expect(dataTransfer.setData).toHaveBeenCalledWith(
      'application/reactflow-label',
      'Check Condition',
    );
    expect(dataTransfer.effectAllowed).toBe('move');
  });

  it('prevents dragging a disabled item when no start node exists', async () => {
    const { wrapper } = await mountWithBuilder(WorkflowSidebar, {
      path: '/workflows/approve-glossary-term/workflow?mode=edit',
      definition: {
        name: 'empty',
        description: 'No nodes yet',
        nodes: [],
        edges: [],
      },
      fqn: 'empty',
    });
    const dataTransfer = dragDataTransfer();
    const item = wrapper.find(
      '[data-testid="workflow-task-item-checkEntityAttributesTask"]',
    );
    expect(item.classes()).toContain('workflow-sidebar__item--disabled');
    await item.trigger('dragstart', { dataTransfer });
    expect(dataTransfer.setData).not.toHaveBeenCalled();
  });

  it('enables the start item when no start node exists', async () => {
    const { wrapper } = await mountWithBuilder(WorkflowSidebar, {
      path: '/workflows/approve-glossary-term/workflow?mode=edit',
      definition: {
        name: 'empty',
        description: 'No nodes yet',
        nodes: [],
        edges: [],
      },
      fqn: 'empty',
    });
    const start = wrapper.find(
      '[data-testid="workflow-start-node-draggable"]',
    );
    expect(start.classes()).not.toContain(
      'workflow-sidebar__event--disabled',
    );
    expect(start.attributes('draggable')).toBe('true');
  });
});
