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
        if (url.includes('/v1/permissions/classification/name/')) {
          return jsonResponse({
            resource: 'classification',
            permissions: [{ operation: 'EditAll', access: 'allow' }],
          });
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

describe('ClassificationDetailView per-tag disable toggle (pin ClassificationUtils)', () => {
  // Tag rows the stub serves; the PATCH flips pii's disabled flag.
  let tagStates: Array<{ id: string; name: string; disabled: boolean }>;
  let patchCalls: Array<{ url: string; body: unknown }>;
  let grantEditAll: boolean;
  let patchFails: boolean;

  function toggleChecked(wrapper: Awaited<ReturnType<typeof mountClassification>>, name: string): string | undefined {
    return wrapper.find(`[data-testid="tag-disable-toggle-${name}"]`).attributes('aria-checked');
  }

  async function mountWithPermissions(id: string) {
    const wrapper = await mountClassification(id);
    // By-id permission fetch (pin TagsPage: the classification
    // permissions come from { id }, not the FQN): it starts at mount,
    // so the flush rounds only let it resolve before the toggle gate
    // settles.
    await flushPromises();
    await flushPromises();
    await wrapper.vm.$nextTick();
    return wrapper;
  }

  beforeEach(() => {
    tagStates = [
      { id: 't1', name: 'pii', disabled: false },
      { id: 't2', name: 'sensitive', disabled: true },
    ];
    patchCalls = [];
    grantEditAll = true;
    patchFails = false;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
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
        // By-id permission fetch: GET /v1/permissions/classification/<id>
        // (pin TagsPage passes { id } to useEntityPermissions).
        if (url.includes('/v1/permissions/classification/') && !url.includes('/name/')) {
          return jsonResponse({
            resource: 'classification',
            permissions: grantEditAll ? [{ operation: 'EditAll', access: 'allow' }] : [],
          });
        }
        if (url.includes('/api/v1/tags/') && init?.method === 'PATCH') {
          if (patchFails) {
            return jsonResponse({ message: 'boom' }, 500);
          }
          const body = JSON.parse(String(init.body)) as Array<Record<string, unknown>>;
          patchCalls.push({ url, body });
          const id = url.split('/').pop() ?? '';
          const tag = tagStates.find((t) => t.id === id);
          if (!tag) {
            return jsonResponse({}, 404);
          }
          tag.disabled = body[0]?.value === true;
          return jsonResponse({ ...tag });
        }
        if (url.includes('/api/v1/tags')) {
          return jsonResponse({
            data: tagStates.map((t) => ({ ...t, fullyQualifiedName: `pii.${t.name}` })),
          });
        }
        return jsonResponse({}, 404);
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders the Enabled column first with a per-tag toggle reflecting the flag', async () => {
    const wrapper = await mountWithPermissions('c1');
    // Scope to the tags table: the overview Descriptions renders its
    // own <th> labels first in DOM order, so an unscoped query reads
    // the overview pane, not the table.
    const headers = wrapper
      .find('[data-testid="classification-tags-table"]')
      .findAll('th')
      .map((th) => th.text().trim());
    expect(headers[0]).toBe('Enabled');
    expect(toggleChecked(wrapper, 'pii')).toBe('true');
    expect(toggleChecked(wrapper, 'sensitive')).toBe('false');
    expect(isDisabled(wrapper, 'tag-disable-toggle-pii')).toBe(false);
    expect(isDisabled(wrapper, 'tag-disable-toggle-sensitive')).toBe(false);
  });

  it('flips the flag via PATCH and refreshes the list on toggle', async () => {
    const wrapper = await mountWithPermissions('c1');
    await wrapper.find('[data-testid="tag-disable-toggle-pii"]').trigger('click');
    await flushPromises();
    await flushPromises();
    expect(patchCalls).toHaveLength(1);
    expect(patchCalls[0].url).toContain('/api/v1/tags/t1');
    expect(patchCalls[0].body).toEqual([{ op: 'replace', path: '/disabled', value: true }]);
    expect(toggleChecked(wrapper, 'pii')).toBe('false');
  });

  it('disables the toggle on a disabled classification even with EditAll', async () => {
    const wrapper = await mountWithPermissions('disabled-classification');
    expect(isDisabled(wrapper, 'tag-disable-toggle-pii')).toBe(true);
    expect(isDisabled(wrapper, 'tag-disable-toggle-sensitive')).toBe(true);
  });

  it('disables the toggle without an EditAll grant (fail-closed)', async () => {
    grantEditAll = false;
    const wrapper = await mountWithPermissions('c1');
    expect(isDisabled(wrapper, 'tag-disable-toggle-pii')).toBe(true);
    expect(isDisabled(wrapper, 'tag-disable-toggle-sensitive')).toBe(true);
  });

  it('keeps the flag and toasts the pin error when the PATCH fails', async () => {
    patchFails = true;
    const wrapper = await mountWithPermissions('c1');
    await wrapper.find('[data-testid="tag-disable-toggle-pii"]').trigger('click');
    await flushPromises();
    await flushPromises();
    expect(toggleChecked(wrapper, 'pii')).toBe('true');
    expect(document.body.textContent).toContain('Error while updating tag');
  });
});
