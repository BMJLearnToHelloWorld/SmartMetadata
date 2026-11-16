/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { flushPromises, mount } from '@vue/test-utils';
import Antd from 'ant-design-vue';
import { describe, expect, it } from 'vitest';
import { createTestI18n } from '@/test/i18n';
import FileOrInputField from './FileOrInputField.vue';

function mountField(props: Record<string, unknown> = {}) {
  return mount(FileOrInputField, {
    props: {
      label: 'CA Certificate',
      acceptedFileTypes: ['.pem', '.crt', '.cer'],
      ...props,
    },
    global: { plugins: [Antd, createTestI18n()] },
  });
}

async function dropFile(wrapper: ReturnType<typeof mountField>, file: File): Promise<void> {
  const dataTransfer = { files: [file] } as unknown as DataTransfer;
  await wrapper.find('[data-testid="credential-file-dropzone"]').trigger('drop', { dataTransfer });
  // FileReader resolves on the task queue, not microtasks: poll until
  // the read settles (value emitted or validation rejected).
  const start = Date.now();
  while (Date.now() - start < 3000) {
    if (wrapper.emitted('update:modelValue') ?? wrapper.emitted('validation-error')) {
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
    await flushPromises();
  }
  await flushPromises();
}

describe('FileOrInputField (official CredentialFileInput, fileOrInput)', () => {
  it('shows the drop zone with format hint, the or-divider, and the paste textarea', () => {
    const wrapper = mountField();
    expect(wrapper.find('[data-testid="credential-file-dropzone"]').text()).toContain(
      'Click to upload',
    );
    expect(wrapper.find('.file-or-input-format-hint').text()).toBe('.pem, .crt, .cer (max. 1 MB)');
    expect(wrapper.find('.file-or-input-divider').text()).toBe('or');
    expect(wrapper.find('[data-testid="file-or-input-textarea"]').exists()).toBe(true);
  });

  it('reads a dropped file as the value and shows its chip', async () => {
    const wrapper = mountField();
    await dropFile(wrapper, new File(['cert-text'], 'ca.pem', { type: 'text/plain' }));
    expect(wrapper.emitted('update:modelValue')).toEqual([['cert-text']]);
    expect(wrapper.find('[data-testid="credential-file-name"]').text()).toBe('ca.pem');
    expect(wrapper.find('[data-testid="credential-file-dropzone"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="file-or-input-textarea"]').exists()).toBe(false);
  });

  it('rejects unaccepted extensions and oversize files without reading', async () => {
    const wrapper = mountField();
    await dropFile(wrapper, new File(['x'], 'key.der', { type: 'application/x-x509-ca-cert' }));
    expect(wrapper.emitted('update:modelValue')).toBeUndefined();
    expect(wrapper.emitted('validation-error')?.at(-1)?.[1]).toBe('unacceptedType');
    expect(wrapper.find('[role="alert"]').text()).toContain('.pem, .crt, .cer');
    const big = new File([new Uint8Array(11)], 'big.pem');
    const small = mountField({ maxSizeBytes: 10 });
    await dropFile(small, big);
    expect(small.emitted('validation-error')?.at(-1)?.[1]).toBe('sizeLimit');
  });

  it('rejects binary content', async () => {
    const wrapper = mountField();
    await dropFile(wrapper, new File([new Uint8Array([0xff, 0xfe])], 'key.pem'));
    expect(wrapper.emitted('update:modelValue')).toBeUndefined();
    expect(wrapper.emitted('validation-error')?.at(-1)?.[1]).toBe('binary');
  });

  it('emits pasted content and undefined when cleared', async () => {
    const wrapper = mountField();
    const textarea = wrapper.find('[data-testid="file-or-input-textarea"]');
    await textarea.setValue('pasted-cert');
    expect(wrapper.emitted('update:modelValue')).toEqual([['pasted-cert']]);
    // Close the v-model loop, as a parent would, before clearing.
    await wrapper.setProps({ modelValue: 'pasted-cert' });
    await textarea.setValue('');
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([undefined]);
  });

  it('shows the stored-credential row for a masked value and clears on remove', async () => {
    const wrapper = mountField({ hasStoredValue: true });
    expect(wrapper.find('[data-testid="credential-stored-value"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="credential-file-dropzone"]').exists()).toBe(false);
    await wrapper.find('[data-testid="credential-file-remove"]').trigger('click');
    expect(wrapper.emitted('update:modelValue')).toEqual([[undefined]]);
  });

  it('clears the chip when the value is cleared from outside', async () => {
    const wrapper = mountField({ modelValue: 'cert-text' });
    await dropFile(wrapper, new File(['cert-text'], 'ca.pem', { type: 'text/plain' }));
    expect(wrapper.find('[data-testid="credential-file-chip"]').exists()).toBe(true);
    await wrapper.setProps({ modelValue: undefined });
    expect(wrapper.find('[data-testid="credential-file-chip"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="credential-file-dropzone"]').exists()).toBe(true);
  });

  it('hides the textarea in the upload-only variant', () => {
    const wrapper = mountField({ allowManualInput: false });
    expect(wrapper.find('[data-testid="file-or-input-textarea"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="credential-file-dropzone"]').exists()).toBe(true);
  });
});
