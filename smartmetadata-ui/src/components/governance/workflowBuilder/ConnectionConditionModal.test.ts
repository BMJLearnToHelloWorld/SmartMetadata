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
import { Select } from 'ant-design-vue';
import ConnectionConditionModal from './ConnectionConditionModal.vue';
import { approvalFixture, mountWithBuilder } from './testHarness';
import type { WorkflowDefinitionFull } from '@/types/governance';

/**
 * Official ConnectionConditionModal: approve/reject for a user-approval
 * source, the node's quality bands for a data-completeness source,
 * True/False otherwise; save creates the edge with the chosen condition,
 * cancel closes without touching the graph.
 */

afterEach(() => {
  vi.unstubAllGlobals();
});

function completenessFixture(): WorkflowDefinitionFull {
  return {
    name: 'completeness',
    description: 'Data completeness check',
    type: 'eventBasedEntity',
    trigger: {
      type: 'eventBasedEntity',
      config: { entityTypes: ['table'], events: ['Created', 'Updated'] },
    },
    nodes: [
      { type: 'startEvent', subType: 'startEvent', name: 'start', displayName: 'start' },
      {
        type: 'automatedTask',
        subType: 'dataCompletenessTask',
        name: 'dataCompletenessTask_1',
        displayName: 'Data Completeness',
        config: {
          fieldsToCheck: ['description'],
          qualityBands: [
            { name: 'Gold', minimumScore: 90 },
            { name: 'Silver', minimumScore: 75 },
          ],
        },
      },
      { type: 'endEvent', subType: 'endEvent', name: 'endEvent_1', displayName: 'End' },
    ],
    edges: [
      { from: 'start', to: 'dataCompletenessTask_1' },
      { from: 'dataCompletenessTask_1', to: 'endEvent_1', condition: 'Gold' },
    ],
  };
}

describe('ConnectionConditionModal', () => {
  it('renders nothing when closed', async () => {
    const { wrapper } = await mountWithBuilder(ConnectionConditionModal);
    expect(
      wrapper.find('[data-testid="connection-condition-modal"]').exists(),
    ).toBe(false);
  });

  it('offers approve/reject for a user-approval source and saves the edge', async () => {
    const { wrapper, builder } = await mountWithBuilder(
      ConnectionConditionModal,
      {
        path: '/workflows/approve-glossary-term/workflow?mode=edit',
        definition: approvalFixture(),
      },
    );
    builder.state.setPendingConnection({
      source: 'userApprovalTask_1',
      target: 'endEvent_1',
      sourceHandle: null,
      targetHandle: null,
    });
    builder.state.setIsConnectionModalOpen(true);
    await wrapper.vm.$nextTick();

    const modal = wrapper.find(
      '[data-testid="connection-condition-modal"]',
    );
    expect(modal.exists()).toBe(true);
    // The options live on the Select (its dropdown renders in a portal);
    // the selected value's label shows in the closed select.
    expect(wrapper.findComponent(Select).props('options')).toEqual([
      { value: 'approve', label: 'Approve' },
      { value: 'reject', label: 'Reject' },
    ]);
    expect(modal.text()).toContain('Approve');

    // Save with the default (approve) condition. The approval→end edge
    // already exists as 'reject', but deserialized edges carry serializer
    // ids, not the reactflow__edge- scheme the duplicate check looks for,
    // so the save appends a second edge — the same behavior as official.
    const edgesBefore = builder.state.state.edges.length;
    await wrapper
      .find('[data-testid="save-connection-button"]')
      .trigger('click');
    expect(builder.state.state.isConnectionModalOpen).toBe(false);
    expect(builder.state.state.edges).toHaveLength(edgesBefore + 1);
    const saved = builder.state.state.edges.find(
      (e) => e.id === 'reactflow__edge-userApprovalTask_1-endEvent_1',
    );
    expect(saved?.label).toBe('approve');
    expect(saved?.data?.condition).toBe('approve');
  });

  it('saves a new edge with the chosen condition for a fresh connection', async () => {
    const { wrapper, builder } = await mountWithBuilder(
      ConnectionConditionModal,
      {
        path: '/workflows/approve-glossary-term/workflow?mode=edit',
        definition: approvalFixture(),
      },
    );
    builder.state.setPendingConnection({
      source: 'start',
      target: 'endEvent_1',
      sourceHandle: null,
      targetHandle: null,
    });
    builder.state.setIsConnectionModalOpen(true);
    await wrapper.vm.$nextTick();

    const modal = wrapper.find(
      '[data-testid="connection-condition-modal"]',
    );
    expect(wrapper.findComponent(Select).props('options')).toEqual([
      { value: 'TRUE', label: 'True' },
      { value: 'FALSE', label: 'False' },
    ]);
    expect(modal.text()).toContain('True');

    await wrapper
      .find('[data-testid="save-connection-button"]')
      .trigger('click');
    const saved = builder.state.state.edges.find(
      (e) => e.id === 'reactflow__edge-start-endEvent_1',
    );
    expect(saved?.label).toBe('TRUE');
    expect(saved?.data?.condition).toBe('TRUE');
    expect(builder.state.state.isConnectionModalOpen).toBe(false);
  });

  it('offers the node quality bands for a data-completeness source', async () => {
    const { wrapper, builder } = await mountWithBuilder(
      ConnectionConditionModal,
      {
        path: '/workflows/completeness/workflow?mode=edit',
        definition: completenessFixture(),
        fqn: 'completeness',
      },
    );
    builder.state.setPendingConnection({
      source: 'dataCompletenessTask_1',
      target: 'endEvent_1',
      sourceHandle: null,
      targetHandle: null,
    });
    builder.state.setIsConnectionModalOpen(true);
    await wrapper.vm.$nextTick();

    const modal = wrapper.find(
      '[data-testid="connection-condition-modal"]',
    );
    expect(modal.exists()).toBe(true);
    expect(wrapper.findComponent(Select).props('options')).toEqual([
      { label: 'Gold', value: 'Gold' },
      { label: 'Silver', value: 'Silver' },
    ]);
    expect(modal.text()).toContain('Gold');
  });

  it('cancels without touching the graph', async () => {
    const { wrapper, builder } = await mountWithBuilder(
      ConnectionConditionModal,
      {
        path: '/workflows/approve-glossary-term/workflow?mode=edit',
        definition: approvalFixture(),
      },
    );
    builder.state.setPendingConnection({
      source: 'start',
      target: 'endEvent_1',
      sourceHandle: null,
      targetHandle: null,
    });
    builder.state.setIsConnectionModalOpen(true);
    await wrapper.vm.$nextTick();
    const edgesBefore = builder.state.state.edges.length;

    const buttons = wrapper.findAll('.workflow-connection-modal__actions button');
    await buttons[0].trigger('click');
    expect(builder.state.state.isConnectionModalOpen).toBe(false);
    expect(builder.state.state.pendingConnection).toBeNull();
    expect(builder.state.state.edges).toHaveLength(edgesBefore);
  });
});
