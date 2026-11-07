/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { defineComponent, h, nextTick } from 'vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useWorkflowBuilderContext } from '@/composables/useWorkflowBuilder';
import type { WorkflowDefinitionFull } from '@/types/governance';
import { getWorkflowCapabilities } from '@/utils/workflowCapabilities';
import WorkflowDetailView from '@/views/governance/WorkflowDetailView.vue';
import NodeConfigSidebar from './NodeConfigSidebar.vue';
import NodeFormSidebar from './NodeFormSidebar.vue';
import WorkflowHeader from './WorkflowHeader.vue';
import { approvalFixture, mountWithBuilder } from './testHarness';

/**
 * Official WorkflowOssRestrictions.test.tsx (pin a3012259ca), ported to the
 * product's Vue components: the OSS capability set is not just a hook
 * return value (workflowCapabilities.test.ts asserts the capabilities
 * themselves) — the UI must actually hide the palette, never offer node
 * or workflow deletion, lock the schedule type, and expose no create
 * entry. The product renders the delete affordance inside the header
 * manage menu (official renders it as a header button), so the header
 * assertions open that menu; the capability assertions stay hook-level,
 * exactly like official's mode-state describe. One deliberate deviation:
 * allowCreateWorkflow is true by product decision (Bai 2026-11-07,
 * option B) — creation is offered on the list page, never on the builder
 * surface, so the "no create entry" assertions below still hold.
 */

function bodyEl(testid: string): HTMLElement | null {
  return document.body.querySelector(`[data-testid="${testid}"]`);
}

function isSelectDisabled(testid: string): boolean {
  const el = bodyEl(testid);
  expect(el).not.toBeNull();
  // antd-vue marks a disabled Select on its root with ant-select-disabled;
  // there is no disabled attribute on the root to read.
  return el!.classList.contains('ant-select-disabled');
}

function isInputDisabled(testid: string): boolean {
  const el = bodyEl(testid) as HTMLInputElement | HTMLTextAreaElement | null;
  expect(el).not.toBeNull();
  return el!.disabled;
}

function isButtonDisabled(testid: string): boolean {
  const el = bodyEl(testid) as HTMLButtonElement | null;
  expect(el).not.toBeNull();
  return el!.disabled;
}

function periodicFixture(): WorkflowDefinitionFull {
  return {
    ...approvalFixture(),
    trigger: {
      type: 'periodicBatchEntity',
      config: {
        entityTypes: ['table'],
        schedule: { scheduleTimeline: 'None', cronExpression: '' },
      },
    },
  };
}

async function mountDetailView(
  mode: 'view' | 'edit',
  definition?: WorkflowDefinitionFull,
) {
  return mountWithBuilder(WorkflowDetailView, {
    path: `/workflows/approve-glossary-term/workflow?mode=${mode}`,
    definition,
  });
}

/**
 * The detail view creates its OWN builder instance (WorkflowDetailView
 * calls useWorkflowBuilder), so driving the harness builder's actions
 * cannot open the sidebars mounted inside it. The sidebar tests therefore
 * mount the sidebar directly under the harness — exactly the pattern
 * NodeConfigSidebar.test.ts uses — where the sidebar shares the harness
 * builder instance the test drives.
 */
async function mountStartSidebar(
  mode: 'view' | 'edit',
  definition?: WorkflowDefinitionFull,
) {
  const Host = defineComponent({
    setup: () => () => h(NodeConfigSidebar),
  });
  return mountWithBuilder(Host, {
    path: `/workflows/approve-glossary-term/workflow?mode=${mode}`,
    definition,
  });
}

async function mountTaskSidebar(mode: 'view' | 'edit') {
  const Host = defineComponent({
    setup: () => {
      const builder = useWorkflowBuilderContext();
      return () =>
        h(NodeFormSidebar, {
          node: builder.state.state.selectedNode,
          isOpen: builder.state.state.isConfigSidebarOpen,
          onClose: () => builder.actions.handleConfigSidebarClose(),
        });
    },
  });
  return mountWithBuilder(Host, {
    path: `/workflows/approve-glossary-term/workflow?mode=${mode}`,
  });
}

async function clickNode(
  mounted: Awaited<ReturnType<typeof mountStartSidebar>>,
  nodeId: string,
) {
  const node = mounted.builder.state.state.nodes.find((n) => n.id === nodeId);
  expect(node).toBeDefined();
  mounted.builder.actions.handleNodeClick(
    { stopPropagation: () => undefined } as unknown as MouseEvent,
    node!,
  );
  await nextTick();
}

async function mountHeader(mode: 'view' | 'edit') {
  const HeaderHost = defineComponent({
    setup: () => () =>
      h(WorkflowHeader, {
        title: 'Approve Glossary Term',
        workflowName: 'approve-glossary-term',
      }),
  });
  return mountWithBuilder(HeaderHost, {
    path: `/workflows/approve-glossary-term/workflow?mode=${mode}`,
  });
}

describe('OSS workflow restrictions', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    document.body.innerHTML = '';
    localStorage.clear();
  });

  describe('mode state from OSS capabilities', () => {
    it(
      'hides the node palette and blocks structural graph edits in edit mode',
      { timeout: 15000 },
      async () => {
        const mounted = await mountDetailView('edit');
        expect(mounted.builder.mode.showWorkflowNodePalette.value).toBe(false);
        expect(mounted.builder.mode.allowStructuralGraphEdits.value).toBe(
          false,
        );
        expect(mounted.builder.mode.canDragNodes.value).toBe(false);
        expect(
          mounted.wrapper
            .find('[data-testid="workflow-node-sidebar"]')
            .exists(),
        ).toBe(false);
      },
    );

    it(
      'hides the node palette in view mode as well',
      { timeout: 15000 },
      async () => {
        const mounted = await mountDetailView('view');
        expect(
          mounted.wrapper
            .find('[data-testid="workflow-node-sidebar"]')
            .exists(),
        ).toBe(false);
      },
    );

    it(
      'never exposes workflow deletion; creation is offered on the list page, not the builder',
      { timeout: 15000 },
      async () => {
        const definition = approvalFixture();
        // Product decision (Bai 2026-11-07, option B): creation is allowed
        // and lives on the list page; the builder surface still offers no
        // create entry (asserted below).
        expect(getWorkflowCapabilities(definition).allowCreateWorkflow).toBe(
          true,
        );
        expect(getWorkflowCapabilities(definition).allowDeleteWorkflow).toBe(
          false,
        );
        for (const mode of ['view', 'edit'] as const) {
          const mounted = await mountDetailView(mode);
          expect(mounted.builder.mode.canDelete.value).toBe(false);
          expect(mounted.builder.mode.showDeleteButton.value).toBe(false);
          // No create entry anywhere on the builder surface.
          expect(
            mounted.wrapper
              .find('[data-testid="create-workflow-button"]')
              .exists(),
          ).toBe(false);
        }
      },
    );
  });

  describe('workflow header', () => {
    it(
      'view mode shows edit; delete and run are absent',
      { timeout: 15000 },
      async () => {
        const { wrapper } = await mountHeader('view');
        expect(
          wrapper.find('[data-testid="edit-workflow-button"]').exists(),
        ).toBe(true);
        // The delete affordance lives in the manage menu: open it and
        // assert the menu holds suspend only, never delete.
        await wrapper
          .find('[data-testid="workflow-manage-button"]')
          .trigger('click');
        await nextTick();
        expect(bodyEl('suspend-workflow-button')).not.toBeNull();
        expect(bodyEl('delete-workflow-button')).toBeNull();
        // The fixture trigger is event-based, so there is no run button.
        expect(
          wrapper.find('[data-testid="run-workflow-button"]').exists(),
        ).toBe(false);
      },
    );

    it(
      'edit mode shows save, cancel and validate; delete is absent',
      { timeout: 15000 },
      async () => {
        const { wrapper } = await mountHeader('edit');
        expect(
          wrapper.find('[data-testid="save-workflow-button"]').exists(),
        ).toBe(true);
        expect(
          wrapper.find('[data-testid="cancel-workflow-button"]').exists(),
        ).toBe(true);
        expect(
          wrapper.find('[data-testid="test-workflow-button"]').exists(),
        ).toBe(true);
        // In edit mode the manage menu (suspend/delete) is not offered.
        expect(
          wrapper.find('[data-testid="workflow-manage-button"]').exists(),
        ).toBe(false);
        expect(bodyEl('delete-workflow-button')).toBeNull();
      },
    );
  });

  describe('task node config sidebar', () => {
    it(
      'view mode is read-only: no save or delete-node buttons',
      { timeout: 15000 },
      async () => {
        const mounted = await mountTaskSidebar('view');
        await clickNode(mounted, 'userApprovalTask_1');
        expect(bodyEl('save-node-configuration-button')).toBeNull();
        expect(bodyEl('delete-node-button')).toBeNull();
      },
    );

    it(
      'edit mode enables save but never offers delete-node',
      { timeout: 15000 },
      async () => {
        const mounted = await mountTaskSidebar('edit');
        await clickNode(mounted, 'userApprovalTask_1');
        expect(isButtonDisabled('save-node-configuration-button')).toBe(false);
        expect(bodyEl('delete-node-button')).toBeNull();
      },
    );
  });

  describe('start node config (event-based)', () => {
    it.each([
      ['workflow-name-input', 'input'],
      ['data-asset', 'select'],
      ['trigger-type-select', 'select'],
      ['event-type-select', 'select'],
    ])(
      '%s is disabled',
      { timeout: 15000 },
      async (testId, kind) => {
        const mounted = await mountStartSidebar('edit');
        await clickNode(mounted, 'start');
        if (kind === 'input') {
          expect(isInputDisabled(testId)).toBe(true);
        } else {
          expect(isSelectDisabled(testId)).toBe(true);
        }
      },
    );

    it.each([
      ['workflow-description-input', 'input'],
      ['include-fields-select', 'select'],
      ['exclude-fields-select', 'select'],
    ])(
      '%s is enabled',
      { timeout: 15000 },
      async (testId, kind) => {
        const mounted = await mountStartSidebar('edit');
        await clickNode(mounted, 'start');
        if (kind === 'input') {
          expect(isInputDisabled(testId)).toBe(false);
        } else {
          expect(isSelectDisabled(testId)).toBe(false);
        }
      },
    );

    it(
      'add-event-filter-button is enabled',
      { timeout: 15000 },
      async () => {
        const mounted = await mountStartSidebar('edit');
        await clickNode(mounted, 'start');
        expect(isButtonDisabled('add-event-filter-button')).toBe(false);
      },
    );
  });

  describe('start node config (periodic-batch)', () => {
    it(
      'schedule-type-select is disabled',
      { timeout: 15000 },
      async () => {
        const mounted = await mountStartSidebar('edit', periodicFixture());
        await clickNode(mounted, 'start');
        expect(isSelectDisabled('schedule-type-select')).toBe(true);
      },
    );

    it(
      'batch-size-input is enabled',
      { timeout: 15000 },
      async () => {
        const mounted = await mountStartSidebar('edit', periodicFixture());
        await clickNode(mounted, 'start');
        expect(isInputDisabled('batch-size-input')).toBe(false);
      },
    );
  });
});
