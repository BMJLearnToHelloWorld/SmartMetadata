/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { defineComponent, h } from 'vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { WorkflowFlowNode, WorkflowNodeSubType } from '@/types/governance';
import TaskNodeFormRenderer from './TaskNodeFormRenderer.vue';
import { mountWithBuilder } from '../testHarness';

function flowNode(subType: WorkflowNodeSubType, config: Record<string, unknown> = {}): WorkflowFlowNode {
  return {
    id: `${subType}_1`,
    type: subType === 'endEvent' ? 'endEvent' : 'automatedTask',
    position: { x: 0, y: 0 },
    data: {
      name: `${subType}_1`,
      label: subType,
      displayName: subType,
      subType,
      config,
    },
  };
}

async function mountRenderer(node: WorkflowFlowNode) {
  const onSave = vi.fn();
  const onClose = vi.fn();
  const Host = defineComponent({
    setup: () =>
      () =>
        h(TaskNodeFormRenderer, {
          node,
          isEnforceMode: false,
          onSave,
          onClose,
          entityTypes: ['glossaryTerm'],
        }),
  });
  const mounted = await mountWithBuilder(Host, {
    path: '/workflows/approve-glossary-term/workflow?mode=edit',
  });
  return { ...mounted, onSave, onClose };
}

describe('TaskNodeFormRenderer', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    document.body.innerHTML = '';
    localStorage.clear();
  });

  it('dispatches the end node to EndNodeForm', { timeout: 15000 }, async () => {
    const { wrapper } = await mountRenderer(flowNode('endEvent'));
    expect(wrapper.find('[data-testid="workflow-name-input"]').exists()).toBe(true);
  });

  it('dispatches setEntityAttributeTask to SetActionForm', { timeout: 15000 }, async () => {
    const { wrapper } = await mountRenderer(
      flowNode('setEntityAttributeTask', { fieldName: 'tags', fieldValue: '[]' }),
    );
    expect(wrapper.find('[data-testid="field-name-select"]').exists()).toBe(true);
  });

  it('dispatches checkEntityAttributesTask to CheckConditionForm', { timeout: 15000 }, async () => {
    const { wrapper } = await mountRenderer(flowNode('checkEntityAttributesTask'));
    expect(wrapper.find('[data-testid="query-builder-section"]').exists()).toBe(true);
    expect(wrapper.text()).toContain('Rules to Check');
  });

  it('dispatches checkChangeDescriptionTask to CheckChangeDescriptionForm', { timeout: 15000 }, async () => {
    const { wrapper } = await mountRenderer(flowNode('checkChangeDescriptionTask'));
    expect(
      wrapper.find('[data-testid="check-change-desc-condition-builder"]').exists(),
    ).toBe(true);
  });

  it('dispatches dataCompletenessTask to DataCompletenessForm', { timeout: 15000 }, async () => {
    const { wrapper } = await mountRenderer(flowNode('dataCompletenessTask'));
    expect(wrapper.find('[data-testid="fields-to-check-select"]').exists()).toBe(true);
  });

  it('dispatches rollbackEntityTask to RevertBackForm', { timeout: 15000 }, async () => {
    const { wrapper } = await mountRenderer(flowNode('rollbackEntityTask'));
    expect(wrapper.text()).toContain('Revert Changes');
  });

  it('dispatches collectMetadataTask to CollectMetadataForm', { timeout: 15000 }, async () => {
    const { wrapper } = await mountRenderer(flowNode('collectMetadataTask'));
    expect(wrapper.find('[data-testid="collect-metadata-stage"]').exists()).toBe(true);
  });

  it('dispatches userApprovalTask to UserApprovalForm', { timeout: 15000 }, async () => {
    const { wrapper } = await mountRenderer(
      flowNode('userApprovalTask', {
        assignees: { addReviewers: true, addOwners: false, candidates: [] },
      }),
    );
    expect(wrapper.text()).toContain('Approval Threshold');
  });

  it('dispatches sinkTask to SinkTaskForm', { timeout: 15000 }, async () => {
    const { wrapper } = await mountRenderer(flowNode('sinkTask'));
    expect(wrapper.find('[data-testid="sink-repository-url-input"]').exists()).toBe(true);
  });

  it('falls back to the read-only schema form for other subtypes', { timeout: 15000 }, async () => {
    const { wrapper } = await mountRenderer(
      flowNode('runAppTask', { appName: 'DataInsightsApp' }),
    );
    // SchemaBasedNodeForm has no save button; Cancel reads 'Close'.
    expect(wrapper.find('[data-testid="save-node-configuration-button"]').exists()).toBe(
      false,
    );
    expect(wrapper.text()).toContain('App Name');
    // Input values are not in textContent; read the input itself.
    const inputs = wrapper.findAll('input');
    expect(inputs.some((i) => (i.element as HTMLInputElement).value === 'DataInsightsApp')).toBe(
      true,
    );
    expect(wrapper.text()).toContain('Close');
  });
});
