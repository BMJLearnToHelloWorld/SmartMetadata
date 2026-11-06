/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { defineComponent, ref } from 'vue';
import { flushPromises, mount } from '@vue/test-utils';
import { createMemoryHistory, createRouter } from 'vue-router';
import { describe, expect, it } from 'vitest';
import type { WorkflowDefinitionFull } from '@/types/governance';
import { useWorkflowMode } from '@/composables/useWorkflowMode';
import {
  getWorkflowCapabilities,
  getWorkflowCardFooter,
  getWorkflowEditorLink,
  getWorkflowPath,
  getWorkflowsPageSection,
  getWorkflowsPageTabs,
} from '@/utils/workflowCapabilities';

/**
 * The product mirror of official WorkflowOssRestrictions.test.tsx: the OSS
 * capability set is restrictive, and the mode derivations follow from it.
 */

describe('getWorkflowCapabilities (OSS defaults)', () => {
  it('returns the restrictive OSS set', () => {
    expect(getWorkflowCapabilities()).toEqual({
      allowCreateWorkflow: false,
      allowDeleteWorkflow: false,
      allowStructuralGraphEdits: false,
      showWorkflowNodePalette: false,
      allowFullStartNodeConfiguration: false,
      allowStartNodeFilterScheduleAndBatchEdit: true,
      allowScheduledTrigger: false,
      allowViewModeDrag: true,
    });
  });

  it('returns null / [] / undefined for the Collate-only surface', () => {
    expect(getWorkflowsPageSection()).toBeNull();
    expect(getWorkflowCardFooter()).toBeNull();
    expect(getWorkflowsPageTabs()).toEqual([]);
    expect(getWorkflowEditorLink()).toBeUndefined();
    expect(
      getWorkflowPath({ name: 'w', description: 'd' }),
    ).toBeUndefined();
  });
});

function periodicOnDemandDefinition(): WorkflowDefinitionFull {
  return {
    name: 'nightly',
    description: 'Nightly batch',
    type: 'periodicBatchEntity',
    trigger: {
      type: 'periodicBatchEntity',
      config: {
        entityTypes: ['table'],
        schedule: { scheduleTimeline: 'None' },
      },
    },
  };
}

function mountMode(
  path: string,
  definition: WorkflowDefinitionFull | null,
  fqn: string | undefined,
) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/workflows/:fqn/:tab', component: { template: '<div />' } }],
  });
  const TestComponent = defineComponent({
    template: '<div />',
    setup() {
      const fqnRef = ref(fqn);
      const defRef = ref(definition);
      const mode = useWorkflowMode(fqnRef, defRef);
      return { mode };
    },
  });
  const wrapper = mount(TestComponent, {
    global: { plugins: [router] },
  });
  return { wrapper, router };
}

describe('useWorkflowMode', () => {
  it('starts in view mode from ?mode=view and gates structural edits off', async () => {
    const { wrapper, router } = mountMode(
      '/workflows/nightly/workflow?mode=view',
      periodicOnDemandDefinition(),
      'nightly',
    );
    await router.push('/workflows/nightly/workflow?mode=view');
    await router.isReady();
    await flushPromises();
    const mode = (
      wrapper.vm as unknown as {
        mode: ReturnType<typeof useWorkflowMode>;
      }
    ).mode;
    expect(mode.mode.value).toBe('view');
    expect(mode.isViewMode.value).toBe(true);
    expect(mode.isFormDisabled.value).toBe(true);
    expect(mode.canEdit.value).toBe(false);
    expect(mode.canSave.value).toBe(false);
    expect(mode.canDelete.value).toBe(false);
    expect(mode.showDeleteButton.value).toBe(false);
    expect(mode.showEditButton.value).toBe(true);
    expect(mode.showSaveButton.value).toBe(false);
    expect(mode.showTestButton.value).toBe(false);
    // OSS: palette hidden, structural edits off, view-mode drag on.
    expect(mode.showWorkflowNodePalette.value).toBe(false);
    expect(mode.allowStructuralGraphEdits.value).toBe(false);
    expect(mode.canDragNodes.value).toBe(false);
    expect(mode.canDragNodesInViewMode.value).toBe(true);
    // Start-node filter/schedule/batch edit stays allowed in OSS.
    expect(mode.allowStartNodeFilterScheduleAndBatchEdit.value).toBe(true);
    expect(mode.allowFullStartNodeConfiguration.value).toBe(false);
    expect(mode.allowScheduledTrigger.value).toBe(false);
    // On-demand periodic workflow shows Run in view mode.
    expect(mode.showRunButton.value).toBe(true);
  });

  it('starts in edit mode from ?mode=edit with save/test/cancel shown', async () => {
    const { wrapper, router } = mountMode(
      '/workflows/nightly/workflow?mode=edit',
      periodicOnDemandDefinition(),
      'nightly',
    );
    await router.push('/workflows/nightly/workflow?mode=edit');
    await router.isReady();
    await flushPromises();
    const mode = (
      wrapper.vm as unknown as {
        mode: ReturnType<typeof useWorkflowMode>;
      }
    ).mode;
    expect(mode.mode.value).toBe('edit');
    expect(mode.isEditMode.value).toBe(true);
    expect(mode.canEdit.value).toBe(true);
    expect(mode.canSave.value).toBe(true);
    expect(mode.showSaveButton.value).toBe(true);
    expect(mode.showTestButton.value).toBe(true);
    expect(mode.showCancelButton.value).toBe(true);
    expect(mode.showEditButton.value).toBe(false);
    expect(mode.showRunButton.value).toBe(false);
    expect(mode.isFormDisabled.value).toBe(false);
  });

  it('defaults to view mode without ?mode= when a fqn exists', async () => {
    const { wrapper, router } = mountMode(
      '/workflows/nightly/workflow',
      periodicOnDemandDefinition(),
      'nightly',
    );
    await router.push('/workflows/nightly/workflow');
    await router.isReady();
    await flushPromises();
    const mode = (
      wrapper.vm as unknown as {
        mode: ReturnType<typeof useWorkflowMode>;
      }
    ).mode;
    expect(mode.mode.value).toBe('view');
  });

  it('defaults to edit mode without ?mode= when there is no fqn', async () => {
    const { wrapper, router } = mountMode(
      '/workflows/nightly/workflow',
      null,
      undefined,
    );
    await router.push('/workflows/nightly/workflow');
    await router.isReady();
    await flushPromises();
    const mode = (
      wrapper.vm as unknown as {
        mode: ReturnType<typeof useWorkflowMode>;
      }
    ).mode;
    expect(mode.mode.value).toBe('edit');
  });

  it('disables editing entirely for a noOp trigger', async () => {
    const noOp: WorkflowDefinitionFull = {
      name: 'noop',
      description: 'No-op workflow',
      type: 'noOp',
      trigger: { type: 'noOp', config: {} },
    };
    const { wrapper, router } = mountMode(
      '/workflows/noop/workflow?mode=edit',
      noOp,
      'noop',
    );
    await router.push('/workflows/noop/workflow?mode=edit');
    await router.isReady();
    await flushPromises();
    const mode = (
      wrapper.vm as unknown as {
        mode: ReturnType<typeof useWorkflowMode>;
      }
    ).mode;
    expect(mode.isNoOp.value).toBe(true);
    expect(mode.canEdit.value).toBe(false);
    expect(mode.canSave.value).toBe(false);
    expect(mode.showEditButton.value).toBe(false);
  });

  it('hides Run for a scheduled (non on-demand) periodic workflow', async () => {
    const scheduled = periodicOnDemandDefinition();
    (scheduled.trigger as { config: Record<string, unknown> }).config = {
      entityTypes: ['table'],
      schedule: { scheduleTimeline: 'Custom', cronExpression: '0 0 * * *' },
    };
    const { wrapper, router } = mountMode(
      '/workflows/nightly/workflow?mode=view',
      scheduled,
      'nightly',
    );
    await router.push('/workflows/nightly/workflow?mode=view');
    await router.isReady();
    await flushPromises();
    const mode = (
      wrapper.vm as unknown as {
        mode: ReturnType<typeof useWorkflowMode>;
      }
    ).mode;
    expect(mode.showRunButton.value).toBe(false);
  });
});
