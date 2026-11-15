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
import Antd, { Modal } from 'ant-design-vue';
import { afterEach, describe, expect, it } from 'vitest';
import { createTestI18n } from '@/test/i18n';
import DeleteEntityModal from './DeleteEntityModal.vue';

async function mountModal(props: Record<string, unknown> = {}) {
  const wrapper = mount(DeleteEntityModal, {
    props: {
      open: true,
      entityName: 'Warehouse',
      entityTypeLabel: 'Database Service',
      ...props,
    },
    attachTo: document.body,
    global: { plugins: [Antd, createTestI18n()] },
  });
  await flushPromises();
  return wrapper;
}

function clickModalOk(): void {
  const ok = document.body.querySelector('.ant-modal-footer .ant-btn-primary') as HTMLElement | null;
  expect(ok).not.toBeNull();
  ok!.click();
}

describe('DeleteEntityModal', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('renders the pin header and both choices with distinct copy', async () => {
    const wrapper = mountModal();
    const mounted = await wrapper;
    expect(document.body.textContent).toContain('Delete "Warehouse" Database Service');
    expect(document.body.textContent).toContain('Soft Delete');
    expect(document.body.textContent).toContain(
      'Turn off this database service. You can restore it later.',
    );
    expect(document.body.textContent).toContain('Permanently Delete');
    expect(document.body.textContent).toContain(
      "Delete this database service and all its metadata forever. This can't be undone.",
    );
    // The soft copy must not claim irreversibility; only the permanent
    // copy carries the "can't be undone" wording (G8).
    const soft = document.body.querySelector('[data-testid="delete-option-soft"]');
    expect(soft?.textContent).not.toContain("can't be undone");
    const hard = document.body.querySelector('[data-testid="delete-option-hard"]');
    expect(hard?.textContent).toContain("can't be undone");
    mounted.unmount();
  });

  it('confirms soft delete by default', async () => {
    const wrapper = await mountModal();
    clickModalOk();
    await flushPromises();
    expect(wrapper.emitted('confirm')).toEqual([['soft-delete']]);
    wrapper.unmount();
  });

  it('confirms hard delete when the permanent option is selected', async () => {
    const wrapper = await mountModal();
    const hard = document.body.querySelector('[data-testid="delete-option-hard"]') as HTMLElement | null;
    expect(hard).not.toBeNull();
    hard!.click();
    await flushPromises();
    clickModalOk();
    await flushPromises();
    expect(wrapper.emitted('confirm')).toEqual([['hard-delete']]);
    wrapper.unmount();
  });

  it('renders the hard-only variant without a radio choice when soft delete is disallowed', async () => {
    const wrapper = await mountModal({ allowSoftDelete: false });
    expect(document.body.querySelector('[data-testid="delete-type-options"]')).toBeNull();
    expect(document.body.querySelector('[data-testid="delete-entity-hard-only-message"]')).not.toBeNull();
    // Pin DeleteModal header: "Delete {entityTitle}" — no quotes, no
    // entity type (unlike the radio variant's header).
    expect(document.body.textContent).toContain('Delete Warehouse');
    expect(document.body.textContent).not.toContain('Delete "Warehouse"');
    expect(document.body.textContent).toContain(
      "Delete this warehouse and all its metadata forever. This can't be undone.",
    );
    clickModalOk();
    await flushPromises();
    expect(wrapper.emitted('confirm')).toEqual([['hard-delete']]);
    wrapper.unmount();
  });

  it('disables both buttons and locks dismissal while loading', async () => {
    const wrapper = await mountModal({ loading: true });
    const modal = wrapper.findComponent(Modal);
    expect(modal.props('confirmLoading')).toBe(true);
    expect(modal.props('maskClosable')).toBe(false);
    expect(modal.props('closable')).toBe(false);
    expect(modal.props('keyboard')).toBe(false);
    expect(modal.props('cancelButtonProps')).toMatchObject({ disabled: true });
    wrapper.unmount();
  });

  it('resets to soft delete on cancel and on reopen', async () => {
    const wrapper = await mountModal();
    const hard = document.body.querySelector('[data-testid="delete-option-hard"]') as HTMLElement | null;
    hard!.click();
    await flushPromises();
    const cancel = document.body.querySelector(
      '.ant-modal-footer .ant-btn-default',
    ) as HTMLElement | null;
    expect(cancel).not.toBeNull();
    cancel!.click();
    await flushPromises();
    expect(wrapper.emitted('cancel')).toHaveLength(1);
    await wrapper.setProps({ open: false });
    await wrapper.setProps({ open: true });
    await flushPromises();
    clickModalOk();
    await flushPromises();
    expect(wrapper.emitted('confirm')).toEqual([['soft-delete']]);
    wrapper.unmount();
  });
});
