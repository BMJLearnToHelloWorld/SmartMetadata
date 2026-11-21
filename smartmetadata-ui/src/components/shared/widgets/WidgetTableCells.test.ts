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
import WidgetPartitionedKeysCell from './WidgetPartitionedKeysCell.vue';
import WidgetTableAliasesCell from './WidgetTableAliasesCell.vue';
import WidgetTableConstraintsCell from './WidgetTableConstraintsCell.vue';
import WidgetTableConstraintsModal from './WidgetTableConstraintsModal.vue';

async function tick(ms = 10) {
  await new Promise((resolve) => setTimeout(resolve, ms));
  await nextTick();
}

/** The antd Modal teleports to document.body; query it there. */
function bodyEl(testid: string): HTMLElement | null {
  return document.body.querySelector(`[data-testid="${testid}"]`);
}

describe('WidgetPartitionedKeysCell', () => {
  it('renders partition columns with -- for a missing type', () => {
    const wrapper = mount(WidgetPartitionedKeysCell, {
      props: {
        columns: [
          { columnName: 'ds', intervalType: 'TIME_UNIT' },
          { columnName: 'region' },
        ],
      },
      global: { plugins: [Antd, createTestI18n()] },
    });
    expect(wrapper.find('[data-testid="asset-partitioned-keys-table"]').exists()).toBe(true);
    expect(wrapper.text()).toContain('ds');
    expect(wrapper.text()).toContain('TIME_UNIT');
    expect(wrapper.text()).toContain('--');
    wrapper.unmount();
  });

  it('renders nothing without columns', () => {
    const wrapper = mount(WidgetPartitionedKeysCell, {
      props: { columns: [] },
      global: { plugins: [Antd, createTestI18n()] },
    });
    expect(wrapper.html()).toBe('<!--v-if-->');
    wrapper.unmount();
  });
});

describe('WidgetTableAliasesCell', () => {
  it('renders the last FQN segment with the full FQN as title', () => {
    const wrapper = mount(WidgetTableAliasesCell, {
      props: { aliases: ['svc.db.schema.orders', 'svc.db.schema."my.table"'] },
      global: { plugins: [Antd, createTestI18n()] },
    });
    expect(wrapper.find('[data-testid="table-aliases-table"]').exists()).toBe(true);
    expect(wrapper.text()).toContain('orders');
    expect(wrapper.text()).toContain('my.table');
    expect(wrapper.find('[title="svc.db.schema.orders"]').exists()).toBe(true);
    wrapper.unmount();
  });

  it('renders nothing without aliases', () => {
    const wrapper = mount(WidgetTableAliasesCell, {
      props: { aliases: [] },
      global: { plugins: [Antd, createTestI18n()] },
    });
    expect(wrapper.html()).toBe('<!--v-if-->');
    wrapper.unmount();
  });
});

describe('WidgetTableConstraintsCell', () => {
  function mountCell(props: Record<string, unknown> = {}) {
    return mount(WidgetTableConstraintsCell, {
      props: {
        constraints: [
          { constraintType: 'PRIMARY_KEY', columns: ['id'] },
          {
            constraintType: 'FOREIGN_KEY',
            columns: ['user_id'],
            referredColumns: ['svc.db.schema.users.id'],
            relationshipType: 'MANY_TO_ONE',
          },
        ],
        columnNames: ['id', 'user_id'],
        hasEditAccess: true,
        onSave: vi.fn(),
        onReferredTableClick: vi.fn(),
        ...props,
      },
      global: { plugins: [Antd, createTestI18n()] },
      attachTo: document.body,
    });
  }

  it('renders key constraints and foreign-key referred columns as links', async () => {
    const onReferredTableClick = vi.fn();
    const wrapper = mountCell({ onReferredTableClick });
    expect(wrapper.find('[data-testid="PRIMARY_KEY-container"]').exists()).toBe(true);
    expect(wrapper.text()).toContain('Primary key');
    expect(wrapper.text()).toContain('id');
    const link = wrapper.find('[data-testid="referred-column-name-fqn"] a');
    expect(link.exists()).toBe(true);
    expect(link.text()).toBe('svc.db.schema.users.id');
    await link.trigger('click');
    expect(onReferredTableClick).toHaveBeenCalledWith('svc.db.schema.users');
    wrapper.unmount();
  });

  it('shows the add button with access when there are no constraints', () => {
    const wrapper = mountCell({ constraints: [] });
    expect(wrapper.find('[data-testid="table-constraints-add-button"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="edit-table-constraint-button"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it('hides edit controls without access', () => {
    const wrapper = mountCell({ hasEditAccess: false });
    expect(wrapper.find('[data-testid="edit-table-constraint-button"]').exists()).toBe(false);
    wrapper.unmount();
  });
});

describe('WidgetTableConstraintsModal', () => {
  function mountModal(props: Record<string, unknown> = {}) {
    return mount(WidgetTableConstraintsModal, {
      props: {
        open: true,
        constraints: [{ constraintType: 'PRIMARY_KEY', columns: ['id'] }],
        columnNames: ['id', 'user_id'],
        onSave: vi.fn(),
        onClose: vi.fn(),
        ...props,
      },
      global: { plugins: [Antd, createTestI18n()] },
      attachTo: document.body,
    });
  }

  it('opens on the saved primary key and saves the edited columns', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    const onClose = vi.fn();
    const wrapper = mountModal({ onSave, onClose });
    await tick();
    const vm = wrapper.vm as unknown as {
      keyValues: Record<string, string[]>;
    };
    expect(vm.keyValues.primaryConstraints).toEqual(['id']);
    vm.keyValues.primaryConstraints = ['id', 'user_id'];
    await nextTick();
    bodyEl('save-btn')!.click();
    await tick();
    expect(onSave).toHaveBeenCalledWith([
      { columns: ['id', 'user_id'], constraintType: 'PRIMARY_KEY' },
    ]);
    expect(onClose).toHaveBeenCalled();
    bodyEl('cancel-btn')!.click();
    await tick();
    wrapper.unmount();
    document.body.innerHTML = '';
  });

  it('saves a complete foreign-key row and drops incomplete ones', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    const wrapper = mountModal({ constraints: [], onSave });
    await tick();
    const vm = wrapper.vm as unknown as {
      constraintType: string;
      foreignRows: Array<{ columns?: string; relationshipType?: string; referredColumns?: string }>;
    };
    vm.constraintType = 'FOREIGN_KEY';
    await nextTick();
    vm.foreignRows = [
      { columns: 'user_id', relationshipType: 'MANY_TO_ONE', referredColumns: 'svc.db.schema.users.id' },
      { columns: 'order_id', relationshipType: undefined, referredColumns: 'svc.db.schema.orders.id' },
    ];
    await nextTick();
    bodyEl('save-btn')!.click();
    await tick();
    expect(onSave).toHaveBeenCalledWith([
      {
        columns: ['user_id'],
        relationshipType: 'MANY_TO_ONE',
        referredColumns: ['svc.db.schema.users.id'],
        constraintType: 'FOREIGN_KEY',
      },
    ]);
    bodyEl('cancel-btn')!.click();
    await tick();
    wrapper.unmount();
    document.body.innerHTML = '';
  });
});
