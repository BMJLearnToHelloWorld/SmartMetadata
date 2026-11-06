/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { defineComponent, h, nextTick } from 'vue';
import { Modal } from 'ant-design-vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { WorkflowDefinitionFull } from '@/types/governance';
import WorkflowHeader from './WorkflowHeader.vue';
import { approvalFixture, mountWithBuilder } from './testHarness';

async function mountHeader(options: {
  path?: string;
  definition?: WorkflowDefinitionFull;
} = {}) {
  const props = {
    title: 'Approve Glossary Term',
    workflowName: 'approve-glossary-term',
  };
  const HeaderHost = defineComponent({
    setup: () => () => h(WorkflowHeader, props),
  });
  return mountWithBuilder(HeaderHost, options);
}

describe('WorkflowHeader', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    document.body.innerHTML = '';
    localStorage.clear();
  });

  it('shows Edit + manage in view mode, no edit controls', { timeout: 15000 }, async () => {
    const { wrapper } = await mountHeader();
    expect(wrapper.find('[data-testid="workflow-header"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="workflow-title"]').text()).toBe(
      'Approve Glossary Term',
    );
    expect(wrapper.find('[data-testid="edit-workflow-button"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="edit-workflow-title-button"]').exists()).toBe(
      false,
    );
    expect(wrapper.find('[data-testid="workflow-manage-button"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="cancel-workflow-button"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="test-workflow-button"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="save-workflow-button"]').exists()).toBe(false);
    // The fixture trigger is event-based, so there is no run button.
    expect(wrapper.find('[data-testid="run-workflow-button"]').exists()).toBe(false);
  });

  it('shows edit controls + title edit in edit mode, no Edit button', { timeout: 15000 }, async () => {
    const { wrapper } = await mountHeader({
      path: '/workflows/approve-glossary-term/workflow?mode=edit',
    });
    expect(wrapper.find('[data-testid="edit-workflow-button"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="edit-workflow-title-button"]').exists()).toBe(
      true,
    );
    expect(wrapper.find('[data-testid="cancel-workflow-button"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="test-workflow-button"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="save-workflow-button"]').exists()).toBe(true);
    // In edit mode the manage menu (suspend/delete) is not offered.
    expect(wrapper.find('[data-testid="workflow-manage-button"]').exists()).toBe(false);
  });

  it('shows the suspended badge for a suspended definition', { timeout: 15000 }, async () => {
    const { wrapper } = await mountHeader({
      definition: { ...approvalFixture(), suspended: true },
    });
    expect(wrapper.find('[data-testid="workflow-suspended-badge"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="workflow-suspended-badge"]').text()).toBe(
      'Suspended',
    );
  });

  it('shows the system badge and no title edit for a no-op workflow', { timeout: 15000 }, async () => {
    const { wrapper } = await mountHeader({
      path: '/workflows/approve-glossary-term/workflow?mode=edit',
      // isNoOp derives from the trigger type, not the definition type.
      definition: {
        ...approvalFixture(),
        type: 'noOp',
        trigger: { type: 'noOp' },
      },
    });
    expect(wrapper.find('[data-testid="system-workflow-badge"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="edit-workflow-title-button"]').exists()).toBe(
      false,
    );
  });

  it('opens the edit-title modal with the locked name and editable display name', { timeout: 15000 }, async () => {
    const { wrapper } = await mountHeader({
      path: '/workflows/approve-glossary-term/workflow?mode=edit',
    });
    await wrapper.find('[data-testid="edit-workflow-title-button"]').trigger('click');
    await nextTick();
    // The antd Modal teleports to document.body.
    const modalEl = document.body.querySelector('.ant-modal') as HTMLElement;
    expect(modalEl).not.toBeNull();
    const inputs = Array.from(modalEl.querySelectorAll('input')) as HTMLInputElement[];
    expect(inputs).toHaveLength(2);
    expect(inputs[0].disabled).toBe(true);
    expect(inputs[0].value).toBe('approve-glossary-term');
    expect(inputs[1].disabled).toBe(false);
    expect(inputs[1].value).toBe('Approve Glossary Term');
    const cancelButton = document.body.querySelector(
      '[data-testid="cancel-button"]',
    ) as HTMLElement;
    // The modal's open state is a prop on the Modal component; the DOM
    // wrap lingers in jsdom because @vue/test-utils stubs transitions.
    // (The header also renders the controls' discard Modal — pick this
    // one by its title.)
    const modal = wrapper
      .findAllComponents(Modal)
      .find((m) => String(m.props('title') ?? '').includes('Display Name'));
    expect(modal).toBeDefined();
    expect(modal!.props('open')).toBe(true);
    cancelButton.click();
    await nextTick();
    expect(modal!.props('open')).toBe(false);
  });
});
