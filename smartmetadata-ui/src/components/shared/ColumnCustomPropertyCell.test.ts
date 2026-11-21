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
import type { SchemaRow } from '@/types/api';
import type { CustomPropertyDef } from '@/types/collaboration';
import ColumnCustomPropertyCell from './ColumnCustomPropertyCell.vue';

afterEach(() => {
  document.body.innerHTML = '';
});

async function tick(ms = 10) {
  await new Promise((resolve) => setTimeout(resolve, ms));
  await nextTick();
}

function mountCell(props: Record<string, unknown> = {}) {
  const record: SchemaRow = {
    key: 'email',
    name: 'email',
    dataType: 'VARCHAR',
    fullyQualifiedName: 't.email',
    extension: { 'x-review': 'done' },
  };
  const property: CustomPropertyDef = {
    name: 'x-review',
    displayName: 'Review',
    propertyType: 'string',
  };
  return mount(ColumnCustomPropertyCell, {
    props: {
      property,
      record,
      hasEditPermissions: true,
      onExtensionUpdate: vi.fn(async () => undefined),
      ...props,
    },
    global: { plugins: [Antd, createTestI18n()] },
    attachTo: document.body,
  });
}

describe('ColumnCustomPropertyCell (D-2 batch 3)', () => {
  it('renders the stored extension value as text', async () => {
    const wrapper = mountCell();
    await tick();
    expect(wrapper.text()).toContain('done');
    wrapper.unmount();
  });

  it('renders a dash for an empty value and offers the add button when editable', async () => {
    const wrapper = mountCell({
      record: {
        key: 'email',
        name: 'email',
        dataType: 'VARCHAR',
        fullyQualifiedName: 't.email',
        extension: {},
      } as SchemaRow,
    });
    await tick();
    expect(wrapper.text()).toContain('—');
    expect(wrapper.find('[data-testid="add-icon"]').exists()).toBe(true);
    wrapper.unmount();
  });

  it('offers no edit affordance when the viewer may not edit', async () => {
    const wrapper = mountCell({ hasEditPermissions: false });
    await tick();
    expect(wrapper.find('[data-testid="edit-icon"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="add-icon"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it('saves the edited value through onExtensionUpdate', async () => {
    const onExtensionUpdate = vi.fn(async () => undefined);
    const wrapper = mountCell({ onExtensionUpdate });
    await tick();
    await wrapper.find('[data-testid="edit-icon"]').trigger('click');
    await tick();
    const input = document.body.querySelector(
      '[data-testid="custom-property-text-input"]',
    ) as HTMLInputElement | null;
    expect(input).not.toBeNull();
    await new DOMWrapper(input as HTMLInputElement).setValue('reviewed');
    const save = document.body.querySelector('[data-testid="save"]') as HTMLElement | null;
    expect(save).not.toBeNull();
    await new DOMWrapper(save as HTMLElement).trigger('click');
    await tick();
    expect(onExtensionUpdate).toHaveBeenCalledTimes(1);
    const [row, extension] = onExtensionUpdate.mock.calls[0] as unknown as [
      SchemaRow,
      Record<string, unknown>,
    ];
    expect(row.name).toBe('email');
    expect(extension).toEqual({ 'x-review': 'reviewed' });
    wrapper.unmount();
  });
});
