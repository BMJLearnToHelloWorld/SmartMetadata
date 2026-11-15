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
import RestoreEntityModal from './RestoreEntityModal.vue';

async function mountModal(props: Record<string, unknown> = {}) {
  const wrapper = mount(RestoreEntityModal, {
    props: {
      open: true,
      entityName: 'warehouse',
      entityTypeLabel: 'Database Service',
      ...props,
    },
    attachTo: document.body,
    global: { plugins: [Antd, createTestI18n()] },
  });
  await flushPromises();
  return wrapper;
}

describe('RestoreEntityModal', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('renders the pin restore title and body', async () => {
    const wrapper = await mountModal();
    expect(document.body.textContent).toContain('Restore Database Service');
    expect(document.body.textContent).toContain('Are you sure you want to restore warehouse?');
    wrapper.unmount();
  });

  it('emits confirm on OK and cancel on Cancel', async () => {
    const wrapper = await mountModal();
    const ok = document.body.querySelector('.ant-modal-footer .ant-btn-primary') as HTMLElement | null;
    expect(ok).not.toBeNull();
    ok!.click();
    await flushPromises();
    expect(wrapper.emitted('confirm')).toHaveLength(1);
    const cancel = document.body.querySelector(
      '.ant-modal-footer .ant-btn-default',
    ) as HTMLElement | null;
    expect(cancel).not.toBeNull();
    cancel!.click();
    await flushPromises();
    expect(wrapper.emitted('cancel')).toHaveLength(1);
    wrapper.unmount();
  });

  it('locks dismissal while restoring', async () => {
    const wrapper = await mountModal({ loading: true });
    const modal = wrapper.findComponent(Modal);
    expect(modal.props('confirmLoading')).toBe(true);
    expect(modal.props('maskClosable')).toBe(false);
    // The X button stays even while restoring: pin SimpleModal always
    // renders its close button; only overlay/Escape dismissal is
    // locked by isDismissable=false.
    expect(modal.props('closable')).toBe(true);
    expect(modal.props('keyboard')).toBe(false);
    expect(modal.props('cancelButtonProps')).toMatchObject({ disabled: true });
    wrapper.unmount();
  });

  it('locks overlay/Escape dismissal when idle and keeps Cancel enabled', async () => {
    const wrapper = await mountModal();
    const modal = wrapper.findComponent(Modal);
    expect(modal.props('maskClosable')).toBe(false);
    expect(modal.props('keyboard')).toBe(false);
    expect(modal.props('closable')).toBe(true);
    expect(modal.props('cancelButtonProps')).toMatchObject({ disabled: false });
    wrapper.unmount();
  });
});
