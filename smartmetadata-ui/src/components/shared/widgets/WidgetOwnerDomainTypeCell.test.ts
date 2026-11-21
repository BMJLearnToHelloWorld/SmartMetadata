/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may
 * not use this file except in compliance with the License. You may obtain
 * a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { mount } from '@vue/test-utils';
import Antd from 'ant-design-vue';
import { describe, expect, it, vi } from 'vitest';
import { nextTick } from 'vue';
import { createTestI18n } from '@/test/i18n';
import WidgetOwnerCell from './WidgetOwnerCell.vue';
import WidgetDomainTypeCell from './WidgetDomainTypeCell.vue';

async function tick(ms = 10) {
  await new Promise((resolve) => setTimeout(resolve, ms));
  await nextTick();
}

/** The antd Modal teleports to document.body; query it there. */
function bodyEl(testid: string): HTMLElement | null {
  return document.body.querySelector(`[data-testid="${testid}"]`);
}

const OWNER_OPTIONS = [
  { key: 'user:u1', id: 'u1', type: 'user' as const, label: 'Alice' },
  { key: 'team:t1', id: 't1', type: 'team' as const, label: 'Data Team' },
];

describe('WidgetOwnerCell', () => {
  function mountCell(props: Record<string, unknown> = {}) {
    return mount(WidgetOwnerCell, {
      props: {
        owners: [{ id: 'u1', name: 'Alice', type: 'user' }],
        ownerOptions: OWNER_OPTIONS,
        hasEditAccess: true,
        onSave: vi.fn(),
        ...props,
      },
      global: { plugins: [Antd, createTestI18n()] },
      attachTo: document.body,
    });
  }

  it('renders owner names and hides the edit button without access', () => {
    const wrapper = mountCell({ hasEditAccess: false });
    expect(wrapper.text()).toContain('Alice');
    expect(wrapper.find('[data-testid="edit-owner"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it('shows a placeholder without access when there are no owners', () => {
    const wrapper = mountCell({ owners: [], hasEditAccess: false });
    expect(wrapper.text()).toContain('—');
    expect(wrapper.find('[data-testid="add-owner"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it('saves the picked owners as id/type pairs', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    const wrapper = mountCell({ owners: [], onSave });
    await wrapper.find('[data-testid="add-owner"]').trigger('click');
    await tick();
    // The Modal teleports to document.body, so its content is
    // outside the wrapper subtree.
    expect(bodyEl('widget-owner-select')).not.toBeNull();
    // Drive the selection through the component's v-model: pick both options.
    const vm = wrapper.vm as unknown as { selectedKeys: string[] };
    vm.selectedKeys = ['user:u1', 'team:t1'];
    await nextTick();
    bodyEl('widget-owner-save')!.click();
    await tick();
    expect(onSave).toHaveBeenCalledWith([
      { id: 'u1', type: 'user' },
      { id: 't1', type: 'team' },
    ]);
    wrapper.unmount();
    document.body.innerHTML = '';
  });

  it('keeps the modal open when the save fails', async () => {
    const onSave = vi.fn().mockRejectedValue(new Error('boom'));
    const wrapper = mountCell({ owners: [], onSave });
    await wrapper.find('[data-testid="add-owner"]').trigger('click');
    await tick();
    const vm = wrapper.vm as unknown as { selectedKeys: string[] };
    vm.selectedKeys = ['user:u1'];
    await nextTick();
    bodyEl('widget-owner-save')!.click();
    await tick();
    expect(bodyEl('widget-owner-select')).not.toBeNull();
    // Close the modal before unmounting so antd teardown runs attached.
    bodyEl('cancel-btn')!.click();
    await tick();
    wrapper.unmount();
    document.body.innerHTML = '';
  });
});

describe('WidgetDomainTypeCell', () => {
  function mountCell(props: Record<string, unknown> = {}) {
    return mount(WidgetDomainTypeCell, {
      props: { domainType: 'Source-aligned', hasEditAccess: true, onSave: vi.fn(), ...props },
      global: { plugins: [Antd, createTestI18n()] },
      attachTo: document.body,
    });
  }

  it('renders the type and hides the edit button without access', () => {
    const wrapper = mountCell({ hasEditAccess: false });
    expect(wrapper.find('[data-testid="domain-type-label"]').text()).toBe('Source-aligned');
    expect(wrapper.find('[data-testid="edit-domainType-button"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it('shows the add button when there is no type yet', () => {
    const wrapper = mountCell({ domainType: '' });
    expect(wrapper.find('[data-testid="domain-type-label"]').text()).toBe('—');
    expect(wrapper.find('[data-testid="add-domainType-button"]').exists()).toBe(true);
    wrapper.unmount();
  });

  it('saves a changed type and skips the save when unchanged', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    const wrapper = mountCell({ onSave });
    await wrapper.find('[data-testid="edit-domainType-button"]').trigger('click');
    await tick();
    const vm = wrapper.vm as unknown as { selected: string };
    vm.selected = 'Aggregate';
    await nextTick();
    bodyEl('widget-domain-type-save')!.click();
    await tick();
    expect(onSave).toHaveBeenCalledWith('Aggregate');
    wrapper.unmount();
    document.body.innerHTML = '';
  });
});
