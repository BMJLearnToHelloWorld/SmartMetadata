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
import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestI18n } from '@/test/i18n';
import IntakeFormDesignerBody from './IntakeFormDesignerBody.vue';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

async function mountBody(initialValue: Record<string, unknown> = {}) {
  const pinia = createPinia();
  setActivePinia(pinia);
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/v1/metadata/types/name/dataProduct/customProperties')) {
        return jsonResponse({
          data: [{ name: 'priority', displayName: 'Priority' }],
        });
      }
      return jsonResponse({});
    }),
  );
  const wrapper = mount(IntakeFormDesignerBody, {
    props: {
      entityType: 'dataProduct',
      initialValue,
    },
    global: {
      plugins: [pinia, Antd, createTestI18n()],
    },
  });
  await flushPromises();
  return wrapper;
}

describe('IntakeFormDesignerBody', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('lists native fields and custom properties, and submits the built payload', async () => {
    const wrapper = await mountBody();
    expect(wrapper.text()).toContain('Display name');
    expect(wrapper.text()).toContain('Priority');
    const emittedBefore = wrapper.emitted('submit');
    expect(emittedBefore).toBeUndefined();
    const exposed = wrapper.vm as unknown as { submit: () => void };
    exposed.submit();
    const payload = wrapper.emitted('submit')?.[0]?.[0] as unknown as {
      formFields: unknown[];
      requiredFields: unknown[];
      entityType: string;
    };
    expect(payload.formFields).toEqual([]);
    expect(payload.requiredFields).toEqual([]);
    expect(payload.entityType).toBe('dataProduct');
  });

  it('keeps edits across the custom-property reload', async () => {
    const wrapper = await mountBody({
      formFields: [
        { fieldPath: 'displayName', fieldLabel: 'Display name', fieldKind: 'native', required: true },
      ],
    });
    expect(wrapper.text()).toContain('Display name');
    (wrapper.vm as unknown as { submit: () => void }).submit();
    const payload = wrapper.emitted('submit')?.[0]?.[0] as unknown as {
      formFields: Array<{ fieldPath: string }>;
    };
    expect(payload.formFields.map((field) => field.fieldPath)).toEqual(['displayName']);
  });
});
