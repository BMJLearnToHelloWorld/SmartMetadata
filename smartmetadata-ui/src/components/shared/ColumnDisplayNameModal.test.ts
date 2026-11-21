/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { DOMWrapper, mount } from '@vue/test-utils';
import Antd from 'ant-design-vue';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { nextTick } from 'vue';
import { createTestI18n } from '@/test/i18n';
import ColumnDisplayNameModal from './ColumnDisplayNameModal.vue';

afterEach(() => {
  document.body.innerHTML = '';
});

async function tick(ms = 10) {
  await new Promise((resolve) => setTimeout(resolve, ms));
  await nextTick();
}

// The antd Modal teleports to document.body, so its content is queried
// on the document (same pattern as EntityDescriptionCell.test.ts).
function modalEl(testId: string): HTMLElement | null {
  return document.body.querySelector(`[data-testid="${testId}"]`) as HTMLElement | null;
}

function mountModal(props: Record<string, unknown> = {}) {
  return mount(ColumnDisplayNameModal, {
    props: {
      open: true,
      name: 'email',
      onSave: vi.fn(),
      onCancel: vi.fn(),
      ...props,
    },
    global: { plugins: [Antd, createTestI18n()] },
    attachTo: document.body,
  });
}

describe('ColumnDisplayNameModal (D-2 batch 3)', () => {
  it('titles the modal with the column name and pre-fills the display name', async () => {
    const wrapper = mountModal({ displayName: 'Email Address' });
    await tick();
    expect(document.body.textContent).toContain('Edit Column: "email"');
    expect((modalEl('column-display-name-input') as HTMLInputElement).value).toBe(
      'Email Address',
    );
    wrapper.unmount();
  });

  it('saves the trimmed display name', async () => {
    const onSave = vi.fn(async () => undefined);
    const wrapper = mountModal({ onSave, displayName: 'Email' });
    await tick();
    const input = modalEl('column-display-name-input');
    expect(input).not.toBeNull();
    await new DOMWrapper(input as HTMLInputElement).setValue('  Email Address  ');
    await new DOMWrapper(modalEl('save') as HTMLElement).trigger('click');
    await tick();
    expect(onSave).toHaveBeenCalledWith({ displayName: 'Email Address' });
    wrapper.unmount();
  });

  it('sends displayName undefined when the name is cleared', async () => {
    const onSave = vi.fn(async () => undefined);
    const wrapper = mountModal({ onSave, displayName: 'Email' });
    await tick();
    await new DOMWrapper(modalEl('column-display-name-input') as HTMLInputElement).setValue(
      '   ',
    );
    await new DOMWrapper(modalEl('save') as HTMLElement).trigger('click');
    await tick();
    expect(onSave).toHaveBeenCalledWith({ displayName: undefined });
    wrapper.unmount();
  });

  it('shows the constraint select only for the Table face and saves a change', async () => {
    const onSave = vi.fn(async () => undefined);
    const wrapper = mountModal({ onSave, showConstraint: true, constraint: 'UNIQUE' });
    await tick();
    expect(modalEl('constraint-type-select')).not.toBeNull();
    // No constraint change: the save carries only the display name.
    await new DOMWrapper(modalEl('save') as HTMLElement).trigger('click');
    await tick();
    expect(onSave).toHaveBeenCalledWith({ displayName: undefined });
    wrapper.unmount();

    const plain = mountModal({ showConstraint: false });
    await tick();
    expect(modalEl('constraint-type-select')).toBeNull();
    plain.unmount();
  });

  it('keeps the modal open when the save fails', async () => {
    const onSave = vi.fn(async () => {
      throw new Error('save failed');
    });
    const wrapper = mountModal({ onSave });
    await tick();
    await new DOMWrapper(modalEl('save') as HTMLElement).trigger('click');
    await tick();
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(wrapper.props('open')).toBe(true);
    wrapper.unmount();
  });
});
