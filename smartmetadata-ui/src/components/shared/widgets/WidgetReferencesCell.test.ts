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
import WidgetReferencesCell from './WidgetReferencesCell.vue';
import WidgetReferencesModal from './WidgetReferencesModal.vue';

async function tick(ms = 10) {
  await new Promise((resolve) => setTimeout(resolve, ms));
  await nextTick();
}

// The antd Modal teleports to document.body; query its content there.
function bodyEl(testid: string): HTMLElement | null {
  return document.body.querySelector(`[data-testid="${testid}"]`);
}

function setBodyInput(testid: string, value: string): void {
  const input = document.body.querySelector(
    `input[data-testid="${testid}"]`,
  ) as HTMLInputElement;
  expect(input).not.toBeNull();
  const setter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    'value',
  )!.set!;
  setter.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

function mountCell(props: Record<string, unknown> = {}) {
  return mount(WidgetReferencesCell, {
    props: {
      references: [{ name: 'Docs', endpoint: 'https://example.com/docs' }],
      hasEditAccess: true,
      onSave: vi.fn(),
      ...props,
    },
    global: { plugins: [Antd, createTestI18n()] },
    attachTo: document.body,
  });
}

function mountModal(props: Record<string, unknown> = {}) {
  return mount(WidgetReferencesModal, {
    props: {
      open: true,
      references: [{ name: 'Docs', endpoint: 'https://example.com/docs' }],
      onSave: vi.fn(),
      onClose: vi.fn(),
      ...props,
    },
    global: { plugins: [Antd, createTestI18n()] },
    attachTo: document.body,
  });
}

describe('WidgetReferencesCell', () => {
  it('renders safe URLs as external links and unsafe ones as plain text', () => {
    const wrapper = mountCell({
      references: [
        { name: 'Docs', endpoint: 'https://example.com/docs' },
        { name: 'Local', endpoint: 'javascript:alert(1)' },
      ],
    });
    const link = wrapper.find('[data-testid="reference-link-Docs"]');
    expect(link.exists()).toBe(true);
    expect(link.attributes('href')).toBe('https://example.com/docs');
    expect(link.attributes('target')).toBe('_blank');
    expect(wrapper.find('[data-testid="reference-link-Local"]').exists()).toBe(false);
    expect(wrapper.text()).toContain('Local');
    wrapper.unmount();
  });

  it('shows a placeholder without access when there are no references', () => {
    const wrapper = mountCell({ references: [], hasEditAccess: false });
    expect(wrapper.text()).toContain('—');
    expect(wrapper.find('[data-testid="term-references-add-button"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it('opens the modal from the edit button', async () => {
    const wrapper = mountCell();
    await wrapper.find('[data-testid="edit-button"]').trigger('click');
    await tick();
    // antd does not forward the Modal's data-testid onto the dialog
    // root, so assert on the modal's row content instead.
    expect(bodyEl('reference-name-0')).not.toBeNull();
    expect(bodyEl('reference-endpoint-0')).not.toBeNull();
    // Close the modal before unmounting: antd's controlled Input
    // schedules a nextTick read of its (then detached) input node.
    bodyEl('cancel-btn')!.click();
    await tick();
    wrapper.unmount();
    document.body.innerHTML = '';
  });
});

describe('WidgetReferencesModal', () => {
  it('rejects a non-http endpoint and keeps the modal open', async () => {
    const onSave = vi.fn();
    const wrapper = mountModal({ onSave });
    await tick();
    setBodyInput('reference-endpoint-0', 'ftp://example.com');
    await nextTick();
    bodyEl('save-btn')!.click();
    await tick();
    expect(onSave).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain('Must start with http:// or https://');
    bodyEl('cancel-btn')!.click();
    await tick();
    wrapper.unmount();
    document.body.innerHTML = '';
  });

  it('saves trimmed rows and drops rows missing a name', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    const onClose = vi.fn();
    const wrapper = mountModal({
      references: [{ name: 'Docs', endpoint: 'https://example.com' }],
      onSave,
      onClose,
    });
    await tick();
    bodyEl('add-references-button')!.click();
    await tick();
    setBodyInput('reference-name-1', '  Guide ');
    setBodyInput('reference-endpoint-1', 'https://example.com/guide');
    await nextTick();
    bodyEl('save-btn')!.click();
    await tick();
    expect(onSave).toHaveBeenCalledWith([
      { name: 'Docs', endpoint: 'https://example.com' },
      { name: 'Guide', endpoint: 'https://example.com/guide' },
    ]);
    expect(onClose).toHaveBeenCalled();
    bodyEl('cancel-btn')!.click();
    await tick();
    wrapper.unmount();
    document.body.innerHTML = '';
  });

  it('does not save when nothing changed', async () => {
    const onSave = vi.fn();
    const onClose = vi.fn();
    const wrapper = mountModal({ onSave, onClose });
    await tick();
    bodyEl('save-btn')!.click();
    await tick();
    expect(onSave).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
    bodyEl('cancel-btn')!.click();
    await tick();
    wrapper.unmount();
    document.body.innerHTML = '';
  });
});
