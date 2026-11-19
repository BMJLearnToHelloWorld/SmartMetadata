/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import Antd, { message } from 'ant-design-vue';
import { mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createI18n } from 'vue-i18n';
import AppStopRunModal from './AppStopRunModal.vue';

const stopApp = vi.hoisted(() => vi.fn());
vi.mock('@/api/apps', () => ({ stopApp }));

function mountModal(props: Record<string, unknown> = {}) {
  return mount(AppStopRunModal, {
    props: {
      appName: 'SearchIndexingApplication',
      isModalOpen: true,
      displayName: 'Search Indexing',
      onClose: vi.fn(),
      ...props,
    },
    global: {
      plugins: [
        Antd,
        createI18n({
          legacy: false,
          locale: 'en',
          messages: {
            en: {
              label: { stop: 'Stop', cancel: 'Cancel', confirm: 'Confirm' },
              message: {
                'are-you-sure-action-property': 'Are you sure you want to {action} {propertyName}?',
                'application-stop': '{pipelineName} stop is in progresss.',
              },
            },
          },
        }),
      ],
    },
    attachTo: document.body,
  });
}

function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

describe('AppStopRunModal', () => {
  beforeEach(() => {
    vi.spyOn(message, 'error').mockImplementation(() => undefined as never);
    vi.spyOn(message, 'success').mockImplementation(() => undefined as never);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetAllMocks();
  });

  it('renders the pin title with a space before the question mark', () => {
    const wrapper = mountModal();
    expect(document.body.querySelector('[data-testid="stop-modal"]')?.textContent).toContain(
      'Stop Search Indexing ?',
    );
    expect(document.body.querySelector('[data-testid="stop-modal-body"]')?.textContent).toContain(
      'Are you sure you want to Stop Search Indexing?',
    );
    wrapper.unmount();
  });

  it('stops, toasts, refreshes, and closes on confirm', async () => {
    stopApp.mockResolvedValue(undefined);
    const onClose = vi.fn();
    const onStopWorkflowsUpdate = vi.fn();
    const wrapper = mountModal({ onClose, onStopWorkflowsUpdate, runId: 'run-1' });
    (document.body.querySelector('[data-testid="stop-modal-confirm"]') as HTMLElement).click();
    await flush();
    expect(stopApp).toHaveBeenCalledWith('SearchIndexingApplication', 'run-1');
    expect(message.success).toHaveBeenCalledWith('Search Indexing stop is in progresss.');
    expect(onStopWorkflowsUpdate).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
    wrapper.unmount();
  });

  it('closes without refreshing when the stop fails', async () => {
    stopApp.mockRejectedValue(new Error('boom'));
    const onClose = vi.fn();
    const onStopWorkflowsUpdate = vi.fn();
    const wrapper = mountModal({ onClose, onStopWorkflowsUpdate });
    (document.body.querySelector('[data-testid="stop-modal-confirm"]') as HTMLElement).click();
    await flush();
    expect(message.error).toHaveBeenCalledWith('boom');
    expect(onStopWorkflowsUpdate).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledTimes(1);
    wrapper.unmount();
  });
});
