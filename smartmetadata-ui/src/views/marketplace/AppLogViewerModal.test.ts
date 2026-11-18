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
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createI18n } from 'vue-i18n';
import AppLogViewerModal from './AppLogViewerModal.vue';

function mountModal(props: Record<string, unknown> = {}) {
  return mount(AppLogViewerModal, {
    props: {
      open: true,
      title: 'Logs',
      logs: 'line one\nerror line\nline three',
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
              label: {
                'search-entity': 'Search {entity}',
                'log-lowercase-plural': 'logs',
                matches: 'matches',
                copy: 'Copy',
                copied: 'Copied',
                download: 'Download',
                'jump-to-end': 'Jump to end',
                close: 'Close',
              },
            },
          },
        }),
      ],
    },
    attachTo: document.body,
  });
}

describe('AppLogViewerModal', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('renders the log text and the toolbar', () => {
    const wrapper = mountModal();
    expect(document.body.textContent).toContain('line one');
    expect(document.body.querySelector('[data-testid="log-viewer-search"]')).toBeTruthy();
    expect(document.body.querySelector('[data-testid="log-viewer-copy"]')).toBeTruthy();
    expect(document.body.querySelector('[data-testid="log-viewer-jump-to-end"]')).toBeTruthy();
    // No download button without an onDownload handler.
    expect(document.body.querySelector('[data-testid="log-viewer-download"]')).toBeNull();
    wrapper.unmount();
  });

  it('filters lines by search text and shows the match count', async () => {
    const wrapper = mountModal();
    const search = document.body.querySelector('[data-testid="log-viewer-search"]') as HTMLElement;
    const inputEl = (search.tagName === 'INPUT' ? search : search.querySelector('input')) as HTMLInputElement;
    inputEl.value = 'error';
    inputEl.dispatchEvent(new Event('input', { bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(document.body.querySelector('[data-testid="log-viewer-match-count"]')?.textContent).toContain(
      '1 matches',
    );
    expect(document.body.textContent).toContain('error line');
    expect(document.body.textContent).not.toContain('line one');
    wrapper.unmount();
  });

  it('copies the full log text and shows the Copied state', async () => {
    const writeText = vi.fn(async () => {});
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    });
    const wrapper = mountModal();
    (document.body.querySelector('[data-testid="log-viewer-copy"]') as HTMLElement).click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(writeText).toHaveBeenCalledWith('line one\nerror line\nline three');
    expect(document.body.querySelector('[data-testid="log-viewer-copy"]')?.textContent).toContain(
      'Copied',
    );
    wrapper.unmount();
  });

  it('calls onDownload and onClose from the toolbar and footer', async () => {
    const onDownload = vi.fn();
    const onClose = vi.fn();
    const wrapper = mountModal({ onDownload, onClose });
    (document.body.querySelector('[data-testid="log-viewer-download"]') as HTMLElement).click();
    expect(onDownload).toHaveBeenCalledTimes(1);
    const closeButton = [...document.body.querySelectorAll('button')].find(
      (button) => button.textContent === 'Close',
    ) as HTMLElement;
    closeButton.click();
    expect(onClose).toHaveBeenCalledTimes(1);
    wrapper.unmount();
  });
});
