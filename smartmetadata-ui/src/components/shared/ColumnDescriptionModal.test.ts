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
import ColumnDescriptionModal from './ColumnDescriptionModal.vue';

afterEach(() => {
  document.body.innerHTML = '';
});

async function tick(ms = 10) {
  await new Promise((resolve) => setTimeout(resolve, ms));
  await nextTick();
}

// The antd Modal teleports to document.body, so its footer buttons are
// queried on the document (same pattern as EntityDescriptionCell.test.ts).
function modalButton(testId: string): DOMWrapper<HTMLElement> | null {
  const el = document.body.querySelector(`[data-testid="${testId}"]`) as HTMLElement | null;
  return el ? new DOMWrapper(el) : null;
}

function mountModal(props: Record<string, unknown> = {}) {
  return mount(ColumnDescriptionModal, {
    props: {
      open: true,
      columnName: 'email',
      entityLabel: 'column',
      onSave: vi.fn(),
      onCancel: vi.fn(),
      ...props,
    },
    global: { plugins: [Antd, createTestI18n()] },
    attachTo: document.body,
  });
}

describe('ColumnDescriptionModal (D-2 batch 3)', () => {
  it('titles the modal with the column name and offers save/cancel', async () => {
    const wrapper = mountModal();
    await tick();
    expect(document.body.textContent).toContain('Edit Column: "email"');
    expect(modalButton('save')).not.toBeNull();
    expect(modalButton('cancel')).not.toBeNull();
    wrapper.unmount();
  });

  it('saves the trimmed editor content and keeps the modal open on failure', async () => {
    const onSave = vi.fn(async () => undefined);
    const wrapper = mountModal({ onSave });
    await tick();
    await modalButton('save')?.trigger('click');
    await tick();
    expect(onSave).toHaveBeenCalledWith('');
    wrapper.unmount();

    const failing = vi.fn(async () => {
      throw new Error('save failed');
    });
    const failingWrapper = mountModal({ onSave: failing });
    await tick();
    await modalButton('save')?.trigger('click');
    await tick();
    expect(failing).toHaveBeenCalledTimes(1);
    // The modal stays open (the parent closes it only on success).
    expect(failingWrapper.props('open')).toBe(true);
    failingWrapper.unmount();
  });

  it('cancels through onCancel', async () => {
    const onCancel = vi.fn();
    const wrapper = mountModal({ onCancel });
    await tick();
    await modalButton('cancel')?.trigger('click');
    expect(onCancel).toHaveBeenCalledTimes(1);
    wrapper.unmount();
  });

  it('uses the field placeholder for non-column faces', async () => {
    const wrapper = mountModal({ entityLabel: 'field' });
    await tick();
    expect(document.body.textContent).toContain('Edit Field: "email"');
    wrapper.unmount();
  });
});
