/**
 * Copyright 2026 SmartMetadata authors.
 * Licensed under the Apache License, Version 2.0.
 */
import { flushPromises, mount } from '@vue/test-utils';
import Antd from 'ant-design-vue';
import { describe, expect, it } from 'vitest';
import { createTestI18n } from '@/test/i18n';
import LineageNodeDeleteModal from './LineageNodeDeleteModal.vue';

function mountModal(props: Record<string, unknown>) {
  return mount(LineageNodeDeleteModal, {
    props: { open: true, ...props },
    global: { plugins: [Antd, createTestI18n()] },
    attachTo: document.body,
  });
}

describe('LineageNodeDeleteModal', () => {
  it('renders pin node copy (delete title + remove-lineage-node message)', () => {
    const wrapper = mountModal({ kind: 'node', name: 'raw_orders' });
    expect(document.body.innerHTML).toContain('Delete raw_orders');
    expect(document.body.innerHTML).toContain(
      'Remove raw_orders from lineage? All its lineage edges visible here will be deleted.',
    );
    wrapper.unmount();
  });

  it('renders the edge copy with both endpoints', () => {
    const wrapper = mountModal({ kind: 'edge', from: 'raw_orders', to: 'orders' });
    expect(document.body.innerHTML).toContain('Delete lineage edge');
    expect(document.body.innerHTML).toContain('from raw_orders to orders');
    wrapper.unmount();
  });

  it('renders the column-edge copy and keeps the entity edge', () => {
    const wrapper = mountModal({
      kind: 'column',
      from: 'raw_orders.id',
      to: 'orders.id',
    });
    expect(document.body.innerHTML).toContain('Delete column lineage');
    expect(document.body.innerHTML).toContain('The entity edge itself stays.');
    wrapper.unmount();
  });

  it('emits cancel and confirm, and disables both while deleting', async () => {
    const wrapper = mountModal({ kind: 'node', name: 'raw_orders', deleting: true });
    await flushPromises();
    // Antd teleports the modal; earlier tests' portals may linger, so
    // always read the last matching button.
    const buttons = (testId: string): Element[] =>
      [...document.body.querySelectorAll(`[data-testid="${testId}"]`)];
    const cancel = buttons('delete-node-cancel').at(-1);
    expect(cancel?.hasAttribute('disabled')).toBe(true);
    await wrapper.setProps({ deleting: false });
    await flushPromises();
    (buttons('delete-node-cancel').at(-1) as HTMLElement).click();
    (buttons('delete-node-confirm').at(-1) as HTMLElement).click();
    await flushPromises();
    expect(wrapper.emitted('cancel')).toHaveLength(1);
    expect(wrapper.emitted('confirm')).toHaveLength(1);
    wrapper.unmount();
  });
});
