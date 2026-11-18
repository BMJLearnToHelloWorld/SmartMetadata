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
import { describe, expect, it } from 'vitest';
import { createTestI18n } from '@/test/i18n';
import SsoSamlMetadataUpload from './SsoSamlMetadataUpload.vue';

function mountUpload(props: Record<string, unknown> = {}) {
  return mount(SsoSamlMetadataUpload, {
    props: { status: null, fileName: '', ...props },
    global: { plugins: [createTestI18n('en-US')] },
  });
}

describe('SsoSamlMetadataUpload', () => {
  it('renders the dropzone with upload, hint and drag labels', () => {
    const wrapper = mountUpload();
    const dropzone = wrapper.find('[data-testid="file-uploader"]');
    expect(dropzone.text()).toContain('upload');
    expect(dropzone.text()).toContain("We'll auto-fill SAML configuration fields after parsing");
    expect(dropzone.text()).toContain('or drag and drop an XML file here');
    const input = wrapper.find('[data-testid="file-upload-input"]');
    expect(input.attributes('accept')).toBe('.xml,application/xml,text/xml');
  });

  it('emits the picked file on input change', async () => {
    const wrapper = mountUpload();
    const file = new File(['<xml/>'], 'metadata.xml', { type: 'text/xml' });
    const input = wrapper.find<HTMLInputElement>(
      '[data-testid="file-upload-input"]',
    );
    Object.defineProperty(input.element, 'files', { value: [file] });
    await input.trigger('change');
    expect(wrapper.emitted('file-upload')).toEqual([[[file]]]);
  });

  it('emits dropped files through the same handler', async () => {
    const wrapper = mountUpload();
    const file = new File(['<xml/>'], 'metadata.xml', { type: 'text/xml' });
    await wrapper.find('[data-testid="file-uploader"]').trigger('drop', {
      dataTransfer: { files: [file] },
    });
    expect(wrapper.emitted('file-upload')).toEqual([[[file]]]);
  });

  it('renders the success status card with a change-file button', async () => {
    const wrapper = mountUpload({ status: 'success', fileName: 'meta.xml' });
    expect(wrapper.find('[data-testid="file-uploader"]').exists()).toBe(false);
    expect(wrapper.find('.metadata-upload-status-container').exists()).toBe(
      true,
    );
    const button = wrapper.find('[data-testid="change-metadata-xml-btn"]');
    await button.trigger('click');
    expect(wrapper.emitted('change-file')).toEqual([[]]);
  });

  it('renders the error status card', () => {
    const wrapper = mountUpload({ status: 'error', fileName: 'meta.xml' });
    expect(wrapper.find('.metadata-upload-status-container').exists()).toBe(
      true,
    );
    expect(wrapper.find('[data-testid="change-metadata-xml-btn"]').exists()).toBe(
      true,
    );
  });
});
