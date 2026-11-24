/**
 * Copyright 2026 SmartMetadata authors.
 * Licensed under the Apache License, Version 2.0.
 * You may use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { flushPromises, mount } from '@vue/test-utils';
import Antd from 'ant-design-vue';
import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryHistory, createRouter } from 'vue-router';
import { createTestI18n } from '@/test/i18n';
import ClassificationDetailView from './ClassificationDetailView.vue';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

async function mountClassification(id: string) {
  const pinia = createPinia();
  setActivePinia(pinia);
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/governance/classifications', name: 'governance-classifications', component: { template: '<div>list</div>' } },
    ],
  });
  await router.push('/governance/classifications');
  await router.isReady();
  const wrapper = mount(ClassificationDetailView, {
    props: { id },
    global: {
      plugins: [pinia, router, Antd, createTestI18n()],
    },
  });
  await flushPromises();
  await flushPromises();
  return wrapper;
}

function isDisabled(wrapper: Awaited<ReturnType<typeof mountClassification>>, testid: string): boolean {
  return (wrapper.find(`[data-testid="${testid}"]`).element as HTMLButtonElement).disabled;
}

describe('ClassificationDetailView permission gates (pin TagsPage / ClassificationDetails)', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('/v1/permissions/classification/')) {
          return jsonResponse({
            resource: 'classification',
            permissions: [
              { operation: 'EditAll', access: 'allow' },
              { operation: 'Delete', access: 'allow' },
            ],
          });
        }
        if (url.includes('/v1/permissions/tag')) {
          return jsonResponse({
            resource: 'tag',
            permissions: [{ operation: 'Create', access: 'allow' }],
          });
        }
        if (url.includes('/api/v1/classifications/')) {
          // The stub encodes the classification state in the id.
          const disabled = url.includes('disabled-classification');
          return jsonResponse({
            id: disabled ? 'disabled-classification' : 'c1',
            name: 'pii',
            displayName: 'PII',
            disabled,
            owners: [],
          });
        }
        if (url.includes('/api/v1/tags')) {
          return jsonResponse({ data: [] });
        }
        return jsonResponse({}, 404);
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('enables edit, delete and create-tag on an enabled classification', async () => {
    const wrapper = await mountClassification('c1');
    expect(isDisabled(wrapper, 'edit-classification')).toBe(false);
    expect(isDisabled(wrapper, 'delete-classification')).toBe(false);
    expect(isDisabled(wrapper, 'create-tag')).toBe(false);
    expect(isDisabled(wrapper, 'classification-disabled')).toBe(false);
  });

  it('disables edit, delete and create-tag on a disabled classification, but keeps the disable switch usable', async () => {
    // Pin ClassificationDetails: showEditOption requires !disabled
    // (:360-365); the ManageButton delete requires !disabled (:641);
    // the add-tag button isDisabled={isClassificationDisabled} (:612).
    // The switch itself stays usable — it is the edit-path toggle that
    // re-enables the classification (:437-447).
    const wrapper = await mountClassification('disabled-classification');
    expect(isDisabled(wrapper, 'edit-classification')).toBe(true);
    expect(isDisabled(wrapper, 'delete-classification')).toBe(true);
    expect(isDisabled(wrapper, 'create-tag')).toBe(true);
    expect(isDisabled(wrapper, 'classification-disabled')).toBe(false);
  });

  describe('without a classification grant', () => {
    it('disables every write action including the switch', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn(async (input: RequestInfo | URL) => {
          const url = String(input);
          if (url.includes('/v1/permissions/')) {
            return jsonResponse({ resource: 'classification', permissions: [] });
          }
          if (url.includes('/api/v1/classifications/')) {
            return jsonResponse({ id: 'c1', name: 'pii', displayName: 'PII', disabled: false, owners: [] });
          }
          if (url.includes('/api/v1/tags')) {
            return jsonResponse({ data: [] });
          }
          return jsonResponse({}, 404);
        }),
      );
      const wrapper = await mountClassification('c1');
      expect(isDisabled(wrapper, 'edit-classification')).toBe(true);
      expect(isDisabled(wrapper, 'delete-classification')).toBe(true);
      expect(isDisabled(wrapper, 'create-tag')).toBe(true);
      expect(isDisabled(wrapper, 'classification-disabled')).toBe(true);
    });
  });
});
