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
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createTestI18n } from '@/test/i18n';
import AddAssetsModal from './AddAssetsModal.vue';

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('AddAssetsModal', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    document.body.innerHTML = '';
  });

  it('searches, hides already-attached assets, and confirms the selected refs', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('/api/v1/search/query')) {
          return jsonResponse({
            hits: {
              total: { value: 2 },
              hits: [
                {
                  _id: 'a1',
                  _source: {
                    id: 'a1',
                    name: 'orders',
                    displayName: 'Orders',
                    fullyQualifiedName: 'svc.db.orders',
                    entityType: 'table',
                  },
                },
                {
                  _id: 'a2',
                  _source: {
                    id: 'a2',
                    name: 'customers',
                    displayName: 'Customers',
                    fullyQualifiedName: 'svc.db.customers',
                    entityType: 'table',
                  },
                },
              ],
            },
          });
        }
        return new Response('not found', { status: 404 });
      }),
    );
    const wrapper = mount(AddAssetsModal, {
      props: { open: true, ownerName: 'Churn', existingFqns: ['svc.db.customers'] },
      global: { plugins: [Antd, createTestI18n()] },
      attachTo: document.body,
    });
    const searchRoot = document.querySelector('[data-testid="add-assets-search"]');
    expect(searchRoot).not.toBeNull();
    // Ant forwards the test id to the input itself, not the search wrapper.
    const input =
      searchRoot instanceof HTMLInputElement
        ? searchRoot
        : (searchRoot?.querySelector('input') as HTMLInputElement | null);
    expect(input).not.toBeNull();
    if (input) {
      input.value = 'orders';
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }
    const searchButton = document.querySelector(
      '.ant-input-search-button',
    ) as HTMLElement | null;
    expect(searchButton).not.toBeNull();
    searchButton?.click();
    await flushPromises();
    // The already-attached customers hit is filtered out; only orders remains.
    expect(document.body.textContent).toContain('Orders');
    expect(document.body.textContent).not.toContain('Customers');
    const checkbox = document.querySelector('input[type="checkbox"]') as HTMLInputElement | null;
    expect(checkbox).not.toBeNull();
    if (checkbox) {
      checkbox.checked = true;
      checkbox.dispatchEvent(new Event('change', { bubbles: true }));
    }
    await flushPromises();
    const okButton = document.querySelector(
      '.ant-modal-footer .ant-btn-primary',
    ) as HTMLElement | null;
    expect(okButton).not.toBeNull();
    okButton?.click();
    await flushPromises();
    const confirmed = wrapper.emitted('confirm')?.[0]?.[0] as unknown[];
    expect(confirmed).toHaveLength(1);
    const ref = confirmed[0] as { id: string; type: string; fullyQualifiedName: string };
    expect(ref.id).toBe('a1');
    expect(ref.type).toBe('table');
    expect(ref.fullyQualifiedName).toBe('svc.db.orders');
    wrapper.unmount();
  });
});
