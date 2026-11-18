/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import Antd from 'ant-design-vue';
import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import AppConfirmationModal from './AppConfirmationModal.vue';

function mountModal(props: Record<string, unknown> = {}) {
  return mount(AppConfirmationModal, {
    props: {
      visible: true,
      header: 'Are you sure?',
      bodyText: 'Are you sure you want to disable Search Indexing?',
      cancelText: 'Cancel',
      confirmText: 'Ok',
      ...props,
    },
    global: { plugins: [Antd] },
    attachTo: document.body,
  });
}

describe('AppConfirmationModal', () => {
  it('renders the pin testids and texts', () => {
    const wrapper = mountModal();
    expect(document.body.querySelector('[data-testid="confirmation-modal"]')).toBeTruthy();
    expect(document.body.querySelector('[data-testid="modal-header"]')?.textContent).toContain(
      'Are you sure?',
    );
    expect(document.body.querySelector('[data-testid="body-text"]')?.textContent).toContain(
      'disable Search Indexing',
    );
    expect(document.body.querySelector('[data-testid="cancel"]')?.textContent).toContain('Cancel');
    expect(document.body.querySelector('[data-testid="save-button"]')?.textContent).toContain('Ok');
    wrapper.unmount();
  });

  it('emits cancel and confirm from the footer buttons', async () => {
    const wrapper = mountModal();
    (document.body.querySelector('[data-testid="cancel"]') as HTMLElement).click();
    expect(wrapper.emitted('cancel')).toHaveLength(1);
    (document.body.querySelector('[data-testid="save-button"]') as HTMLElement).click();
    expect(wrapper.emitted('confirm')).toHaveLength(1);
    wrapper.unmount();
  });

  it('switches the confirm testid to loading-button while loading', () => {
    const wrapper = mountModal({ isLoading: true });
    expect(document.body.querySelector('[data-testid="loading-button"]')).toBeTruthy();
    expect(document.body.querySelector('[data-testid="save-button"]')).toBeNull();
    wrapper.unmount();
  });

  it('renders nothing when not visible', () => {
    const wrapper = mountModal({ visible: false });
    expect(document.body.querySelector('[data-testid="confirmation-modal"]')).toBeNull();
    wrapper.unmount();
  });
});
