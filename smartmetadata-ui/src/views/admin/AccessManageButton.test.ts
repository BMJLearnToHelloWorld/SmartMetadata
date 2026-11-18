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
import { defineComponent, h } from 'vue';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createTestI18n } from '@/test/i18n';
import AccessManageButton from './AccessManageButton.vue';

const ModalStub = defineComponent({
  props: { open: Boolean, title: String, width: Number, closable: Boolean, maskClosable: Boolean, keyboard: Boolean },
  emits: ['cancel'],
  setup(props, { slots }) {
    return () =>
      props.open
        ? h('div', { 'data-testid': 'modal-stub' }, [
            h('div', { 'data-testid': 'modal-title' }, props.title),
            slots.default?.(),
            slots.footer?.(),
          ])
        : null;
  },
});

const DropdownStub = defineComponent({
  props: { open: Boolean },
  emits: ['update:open'],
  setup(props, { slots, emit }) {
    return () =>
      h('div', { 'data-testid': 'dropdown-stub' }, [
        h(
          'div',
          {
            'data-testid': 'dropdown-trigger',
            onClick: () => emit('update:open', true),
          },
          slots.default?.(),
        ),
        props.open ? slots.overlay?.() : null,
      ]);
  },
});

function mountManage(props: Partial<{
  displayName: string;
  deleted: boolean;
  canDelete: boolean;
  editDisplayNamePermission: boolean;
  onEditDisplayName: (data: { name: string; displayName: string }) => Promise<unknown> | unknown;
  onDelete: () => Promise<boolean>;
  afterDeleteAction: () => void;
}>) {
  return mount(AccessManageButton, {
    props: {
      name: 'DataSteward',
      entityTypeLabel: 'Role',
      canDelete: true,
      editDisplayNamePermission: true,
      onEditDisplayName: vi.fn(async () => undefined),
      onDelete: vi.fn(async () => true),
      afterDeleteAction: vi.fn(),
      ...props,
    },
    global: {
      plugins: [Antd, createTestI18n()],
      stubs: { AModal: ModalStub, ADropdown: DropdownStub },
    },
  });
}

async function openMenu(wrapper: ReturnType<typeof mountManage>) {
  await wrapper.get('[data-testid="manage-button"]').trigger('click');
}

describe('AccessManageButton', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders nothing when neither rename nor delete is available', () => {
    const wrapper = mountManage({
      canDelete: false,
      editDisplayNamePermission: false,
    });
    expect(wrapper.find('[data-testid="manage-button"]').exists()).toBe(false);
  });

  it('hides rename when deleted and hides delete without the grant', async () => {
    const deleted = mountManage({ deleted: true });
    await openMenu(deleted);
    expect(deleted.find('[data-testid="rename-button"]').exists()).toBe(false);
    expect(deleted.find('[data-testid="delete-button"]').exists()).toBe(true);
    const noDelete = mountManage({ canDelete: false });
    await openMenu(noDelete);
    expect(noDelete.find('[data-testid="rename-button"]').exists()).toBe(true);
    expect(noDelete.find('[data-testid="delete-button"]').exists()).toBe(false);
  });

  it('opens the rename modal with the name disabled and the display name editable', async () => {
    const wrapper = mountManage({ displayName: 'Data Steward' });
    await openMenu(wrapper);
    await wrapper.get('[data-testid="rename-button"]').trigger('click');
    const modal = wrapper.getComponent(ModalStub);
    expect(modal.props('width')).toBe(520);
    expect(modal.props('closable')).toBe(false);
    const nameInput = wrapper.find('[data-testid="name"]');
    expect((nameInput.element as HTMLInputElement).disabled).toBe(true);
    expect((nameInput.element as HTMLInputElement).value).toBe('DataSteward');
    expect((wrapper.find('[data-testid="displayName"]').element as HTMLInputElement).value).toBe(
      'Data Steward',
    );
  });

  it('saves the display name and closes the modal', async () => {
    const onEditDisplayName = vi.fn(async () => undefined);
    const wrapper = mountManage({ displayName: 'Old', onEditDisplayName });
    await openMenu(wrapper);
    await wrapper.get('[data-testid="rename-button"]').trigger('click');
    await wrapper.get('[data-testid="displayName"]').setValue('New Name');
    await wrapper.get('[data-testid="save-button"]').trigger('click');
    await flushPromises();
    expect(onEditDisplayName).toHaveBeenCalledWith({ name: 'DataSteward', displayName: 'New Name' });
    expect(wrapper.find('[data-testid="modal-stub"]').exists()).toBe(false);
  });

  it('rejects an over-long display name and keeps the modal open', async () => {
    const onEditDisplayName = vi.fn(async () => undefined);
    const wrapper = mountManage({ onEditDisplayName });
    await openMenu(wrapper);
    await wrapper.get('[data-testid="rename-button"]').trigger('click');
    await wrapper.get('[data-testid="displayName"]').setValue('x'.repeat(129));
    await wrapper.get('[data-testid="save-button"]').trigger('click');
    await flushPromises();
    expect(onEditDisplayName).not.toHaveBeenCalled();
    expect(wrapper.find('[data-testid="modal-stub"]').exists()).toBe(true);
  });

  it('deletes through the confirm and runs afterDeleteAction on success', async () => {
    const onDelete = vi.fn(async () => true);
    const afterDeleteAction = vi.fn();
    const configs: Array<{ onOk?: () => unknown }> = [];
    vi.spyOn(Modal, 'confirm').mockImplementation((config) => {
      configs.push(config as { onOk?: () => unknown });
      return { destroy: vi.fn(), update: vi.fn() } as never;
    });
    const wrapper = mountManage({ displayName: 'Data Steward', onDelete, afterDeleteAction });
    await openMenu(wrapper);
    await wrapper.get('[data-testid="delete-button"]').trigger('click');
    await flushPromises();
    expect(configs).toHaveLength(1);
    await configs[0]!.onOk?.();
    await flushPromises();
    expect(onDelete).toHaveBeenCalledTimes(1);
    expect(afterDeleteAction).toHaveBeenCalledTimes(1);
  });

  it('does not run afterDeleteAction when the delete fails', async () => {
    const afterDeleteAction = vi.fn();
    const configs: Array<{ onOk?: () => unknown }> = [];
    vi.spyOn(Modal, 'confirm').mockImplementation((config) => {
      configs.push(config as { onOk?: () => unknown });
      return { destroy: vi.fn(), update: vi.fn() } as never;
    });
    const wrapper = mountManage({ onDelete: async () => false, afterDeleteAction });
    await openMenu(wrapper);
    await wrapper.get('[data-testid="delete-button"]').trigger('click');
    await flushPromises();
    await configs[0]!.onOk?.();
    await flushPromises();
    expect(afterDeleteAction).not.toHaveBeenCalled();
  });
});
