/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 */
import { flushPromises, mount } from '@vue/test-utils';
import Antd from 'ant-design-vue';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createTestI18n } from '@/test/i18n';
import GlossaryTermFilterPicker from './GlossaryTermFilterPicker.vue';

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('GlossaryTermFilterPicker', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    document.body.innerHTML = '';
  });

  it('staged apply commits glossary FQNs (pin GlossaryTermPicker commitMode)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('/api/v1/glossaries')) {
          return jsonResponse({
            data: [{ id: 'g1', name: 'Business', displayName: 'Business', fullyQualifiedName: 'Business' }],
            paging: { total: 1 },
          });
        }
        if (url.includes('/api/v1/glossaryTerms')) {
          return jsonResponse({
            data: [
              {
                id: 't1',
                name: 'Customer',
                displayName: 'Customer',
                fullyQualifiedName: 'Business.Customer',
                childrenCount: 0,
              },
            ],
            paging: { total: 1 },
          });
        }
        return new Response('not found', { status: 404 });
      }),
    );

    const wrapper = mount(GlossaryTermFilterPicker, {
      props: { modelValue: [] },
      attachTo: document.body,
      global: { plugins: [Antd, createTestI18n()] },
    });

    await wrapper.get('[data-testid="dq-dashboard-filter-glossary"]').trigger('click');
    await flushPromises();
    await flushPromises();

    const panel = document.body.querySelector('[data-testid="glossary-term-filter-picker-panel"]');
    expect(panel).toBeTruthy();

    const treeSelect = wrapper.findComponent({ name: 'ATreeSelect' });
    await treeSelect.vm.$emit('update:value', ['Business.Customer']);
    const applyButton = document.body.querySelector('[data-testid="glossary-term-filter-apply"]') as HTMLElement;
    applyButton?.click();
    await flushPromises();

    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual([['Business.Customer']]);
  });
});