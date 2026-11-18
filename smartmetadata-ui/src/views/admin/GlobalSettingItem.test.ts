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
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createI18n } from 'vue-i18n';
import GlobalSettingItem from './GlobalSettingItem.vue';

function mountItem(props: {
  value?: number;
  min?: number;
  max?: number;
  step?: number;
  onUpdate?: (value: number) => Promise<void>;
}) {
  const i18n = createI18n({
    legacy: false,
    locale: 'en-US',
    messages: {
      'en-US': {
        settings: {
          searchPrefs: {
            value: 'Value',
            cancel: 'Cancel',
            save: 'Save',
            editField: 'Edit {field}',
          },
        },
      },
    },
  });
  const onUpdate = props.onUpdate ?? vi.fn().mockResolvedValue(undefined);
  const wrapper = mount(GlobalSettingItem, {
    attachTo: document.body,
    props: {
      label: 'Max Results',
      value: props.value ?? 1000,
      min: props.min,
      max: props.max,
      step: props.step,
      onUpdate,
    },
    global: { plugins: [i18n] },
  });
  return { wrapper, onUpdate };
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  document.body.innerHTML = '';
});

async function openEditor(wrapper: ReturnType<typeof mountItem>['wrapper']) {
  await wrapper.find('[data-testid="global-setting-edit-icon-Max Results"]').trigger('click');
}

async function setEditorValue(
  wrapper: ReturnType<typeof mountItem>['wrapper'],
  value: string,
) {
  const input = wrapper.find('[data-testid="value-input"]');
  await input.setValue(value);
}

async function save(wrapper: ReturnType<typeof mountItem>['wrapper']) {
  await wrapper.find('[data-testid="inline-save-btn"]').trigger('click');
  await flushPromises();
}

describe('GlobalSettingItem', () => {
  it('renders the label, value, and edit affordance', () => {
    const { wrapper } = mountItem({ value: 1000 });
    expect(wrapper.find('[data-testid="global-setting-label"]').text()).toBe('Max Results');
    expect(wrapper.find('[data-testid="global-setting-value-Max Results"]').text()).toBe('1000');
    expect(
      wrapper.find('[data-testid="global-setting-edit-icon-Max Results"]').exists(),
    ).toBe(true);
  });

  it('clamps the saved value to the configured range', async () => {
    const { wrapper, onUpdate } = mountItem({ value: 1000, min: 100, max: 10000 });
    await openEditor(wrapper);
    await setEditorValue(wrapper, '50');
    await save(wrapper);
    expect(onUpdate).toHaveBeenCalledWith(100);

    await openEditor(wrapper);
    await setEditorValue(wrapper, '20000');
    await save(wrapper);
    expect(onUpdate).toHaveBeenCalledWith(10000);
  });

  it('truncates decimals when no step is configured', async () => {
    const { wrapper, onUpdate } = mountItem({ value: 1000, min: 100, max: 10000 });
    await openEditor(wrapper);
    await setEditorValue(wrapper, '1500.9');
    await save(wrapper);
    expect(onUpdate).toHaveBeenCalledWith(1500);
  });

  it('treats a cleared input as a cancelled edit', async () => {
    const { wrapper, onUpdate } = mountItem({ value: 1000, min: 100, max: 10000 });
    await openEditor(wrapper);
    await setEditorValue(wrapper, '');
    await save(wrapper);
    expect(onUpdate).not.toHaveBeenCalled();
    expect(wrapper.find('[data-testid="value-input"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="global-setting-value-Max Results"]').text()).toBe('1000');
  });

  it('reverts to the prop value and rethrows when the update rejects', async () => {
    const onUpdate = vi.fn().mockRejectedValue(new Error('save down'));
    const { wrapper } = mountItem({ value: 1000, onUpdate });
    const rejections: unknown[] = [];
    const handler = (reason: unknown) => {
      rejections.push(reason);
    };
    process.on('unhandledRejection', handler);
    try {
      await openEditor(wrapper);
      await setEditorValue(wrapper, '2000');
      await save(wrapper);
    } finally {
      process.off('unhandledRejection', handler);
    }
    expect(rejections).toHaveLength(1);
    await openEditor(wrapper);
    expect((wrapper.find('[data-testid="value-input"]').element as HTMLInputElement).value).toBe(
      '1000',
    );
  });

  it('does not re-sync the draft from the prop while closed', async () => {
    const { wrapper } = mountItem({ value: 1000 });
    await openEditor(wrapper);
    await setEditorValue(wrapper, '2000');
    await save(wrapper);
    await wrapper.setProps({ value: 3000 });
    await openEditor(wrapper);
    expect((wrapper.find('[data-testid="value-input"]').element as HTMLInputElement).value).toBe(
      '2000',
    );
  });

  it('restores focus to the edit button after closing the editor', async () => {
    const { wrapper } = mountItem({ value: 1000 });
    await openEditor(wrapper);
    expect(document.activeElement).toBe(
      wrapper.find('[data-testid="value-input"]').element,
    );
    await save(wrapper);
    expect(document.activeElement).toBe(
      wrapper.find('[data-testid="global-setting-edit-icon-Max Results"]').element,
    );
  });

  it('cancel restores the prop value without saving', async () => {
    const { wrapper, onUpdate } = mountItem({ value: 1000 });
    await openEditor(wrapper);
    await setEditorValue(wrapper, '2000');
    await wrapper.find('[data-testid="inline-cancel-btn"]').trigger('click');
    expect(onUpdate).not.toHaveBeenCalled();
    await openEditor(wrapper);
    expect((wrapper.find('[data-testid="value-input"]').element as HTMLInputElement).value).toBe(
      '1000',
    );
  });
});
