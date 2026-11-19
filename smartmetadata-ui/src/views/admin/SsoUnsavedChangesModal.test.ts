/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { mount } from '@vue/test-utils';
import { afterEach, describe, expect, it } from 'vitest';
import { createTestI18n } from '@/test/i18n';
import SsoUnsavedChangesModal from './SsoUnsavedChangesModal.vue';

afterEach(() => {
  document.body.innerHTML = '';
});

function mountModal(props: Record<string, unknown> = {}) {
  return mount(SsoUnsavedChangesModal, {
    attachTo: document.body,
    props: { open: true, ...props },
    global: { plugins: [createTestI18n('en-US')] },
  });
}

describe('SsoUnsavedChangesModal', () => {
  it('renders default title, description and buttons', async () => {
    const wrapper = mountModal();
    await wrapper.vm.$nextTick();
    expect(
      document.querySelector('[data-testid="unsaved-changes-modal-title"]')
        ?.textContent,
    ).toBe('Unsaved changes');
    expect(
      document.querySelector(
        '[data-testid="unsaved-changes-modal-description"]',
      )?.textContent,
    ).toBe('Do you want to save or discard changes?');
    expect(
      document.querySelector('[data-testid="unsaved-changes-modal-discard"]')
        ?.textContent,
    ).toBe('Discard');
    expect(
      document.querySelector('[data-testid="unsaved-changes-modal-save"]')
        ?.textContent,
    ).toBe('Save changes');
    wrapper.unmount();
  });

  it('renders provided texts and emits discard and save', async () => {
    const wrapper = mountModal({
      title: 'Custom title',
      description: 'Custom description',
      discardText: 'Throw away',
      saveText: 'Keep',
    });
    await wrapper.vm.$nextTick();
    expect(
      document.querySelector('[data-testid="unsaved-changes-modal-title"]')
        ?.textContent,
    ).toBe('Custom title');
    (
      document.querySelector(
        '[data-testid="unsaved-changes-modal-discard"]',
      ) as HTMLElement
    ).click();
    (
      document.querySelector(
        '[data-testid="unsaved-changes-modal-save"]',
      ) as HTMLElement
    ).click();
    expect(wrapper.emitted('discard')).toEqual([[]]);
    expect(wrapper.emitted('save')).toEqual([[]]);
    wrapper.unmount();
  });

  it('shows the save button loading state', async () => {
    const wrapper = mountModal({ loading: true });
    await wrapper.vm.$nextTick();
    expect(
      document
        .querySelector('[data-testid="unsaved-changes-modal-save"]')
        ?.classList.contains('ant-btn-loading'),
    ).toBe(true);
    wrapper.unmount();
  });

  it('renders nothing when closed', async () => {
    const wrapper = mountModal({ open: false });
    await wrapper.vm.$nextTick();
    expect(
      document.querySelector('[data-testid="unsaved-changes-modal"]'),
    ).toBeNull();
    wrapper.unmount();
  });
});
