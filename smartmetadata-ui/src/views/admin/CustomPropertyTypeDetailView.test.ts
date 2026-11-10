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
import Antd, { Modal, Select, Switch } from 'ant-design-vue';
import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryHistory, createRouter } from 'vue-router';
import { createTestI18n } from '@/test/i18n';
import CustomPropertyTypeDetailView from './CustomPropertyTypeDetailView.vue';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

async function mountDefs(entityType = 'table') {
  const pinia = createPinia();
  setActivePinia(pinia);
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      {
        path: '/admin/settings/custom-properties',
        name: 'admin-settings-custom-properties',
        component: { template: '<div>types</div>' },
      },
      {
        path: '/admin/settings/custom-properties/:entityType',
        name: 'admin-settings-custom-property-type',
        component: CustomPropertyTypeDetailView,
        props: true,
      },
    ],
  });
  await router.push(`/admin/settings/custom-properties/${entityType}`);
  await router.isReady();
  const wrapper = mount(CustomPropertyTypeDetailView, {
    props: { entityType },
    global: {
      plugins: [pinia, router, Antd, createTestI18n()],
    },
  });
  await flushPromises();
  return { wrapper };
}

describe('CustomPropertyTypeDetailView', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('/api/v1/metadata/types?') && url.includes('category=field')) {
          return jsonResponse({
            data: [{ id: 'f1', name: 'integer', category: 'field', displayName: 'Integer' }],
            paging: { total: 1 },
          });
        }
        if (url.includes('/api/v1/metadata/types/name/table')) {
          return jsonResponse({
            id: 'tid',
            name: 'table',
            customProperties: [
              {
                name: 'retentionDays',
                displayName: 'Retention days',
                description: 'How long to keep rows',
                propertyType: { name: 'integer' },
              },
            ],
          });
        }
        if (url.includes('/api/v1/metadata/types/name/')) {
          return jsonResponse({ id: 'tid2', name: entityTypeFrom(url), customProperties: [] });
        }
        return new Response('not found', { status: 404 });
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    localStorage.clear();
  });

  // 20s cap, not the 5s default: this mount first-renders the Ant tab bar,
  // the multi-select type filter and the table after two sequential fetches,
  // so under parallel workers it exceeds 5s — and under peak VM load (load
  // avg > 5 on 4 CPUs) even 10s: quiet single-run ~2.3s, loaded single-run
  // 9.1s. Baseline (pre-stage-2, no tabs/filter) was ~1.2s quiet.
  // Assertions are unchanged; the cap still fails a genuinely hung fetch.
  it('renders definitions and exposes add definition action', async () => {
    const { wrapper } = await mountDefs();
    expect(wrapper.find('[data-testid="entity-detail-shell"]').exists()).toBe(true);
    expect(wrapper.text()).toContain('retentionDays');
    expect(wrapper.text()).toContain('integer');
    expect(wrapper.find('[data-testid="admin-custom-property-defs-table"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="add-custom-property"]').exists()).toBe(true);
  }, 20000);

  it('shows Empty when the type has no definitions but still allows add', async () => {
    // Stage 2: the shell-level empty is gone — the tabs always render and
    // the empty state lives inside the Custom Properties tab (same strength).
    const { wrapper } = await mountDefs('topic');
    expect(wrapper.find('[data-testid="entity-detail-empty"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="entity-detail-tabs"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="custom-property-defs-empty"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="admin-custom-property-defs-table"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="add-custom-property"]').exists()).toBe(true);
    // The Schema tab stays reachable with zero definitions and shows `{}`.
    expect(wrapper.find('[data-testid="custom-property-type-schema"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="custom-property-type-schema"]').text()).toBe('{}');
  });

  // 20s cap (same load evidence as the first test in this file: this mount
  // took ~4.9s under peak VM load and timed out at the 5s default in a
  // parallel run). Assertions are unchanged.
  it('PUTs a custom property definition to /v1/metadata/types/{id}', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('/api/v1/metadata/types/tid') && String(init?.method || '').toUpperCase() === 'PUT') {
        return jsonResponse({
          id: 'tid',
          name: 'table',
          customProperties: [
            { name: 'ownerTeam', description: 'Owning team', propertyType: { name: 'string' } },
          ],
        });
      }
      if (url.includes('category=field')) {
        return jsonResponse({
          data: [
            { id: 'f1', name: 'integer', category: 'field' },
            { id: 'f2', name: 'string', category: 'field' },
          ],
          paging: { total: 2 },
        });
      }
      if (url.includes('/api/v1/metadata/types/name/table')) {
        return jsonResponse({ id: 'tid', name: 'table', customProperties: [] });
      }
      return new Response('not found', { status: 404 });
    });
    vi.stubGlobal('fetch', fetchMock);
    const { wrapper } = await mountDefs();
    await wrapper.get('[data-testid="add-custom-property"]').trigger('click');
    await flushPromises();
    await wrapper.get('[data-testid="custom-property-name"]').setValue('ownerTeam');
    await wrapper.get('[data-testid="custom-property-description"]').setValue('Owning team');
    const modalOk = wrapper.findAll('.ant-modal-footer button').find((b) => b.classes().includes('ant-btn-primary'));
    expect(modalOk).toBeTruthy();
    await modalOk!.trigger('click');
    await flushPromises();
    const putCalls = fetchMock.mock.calls.filter(
      (call) =>
        String(call[0]).includes('/api/v1/metadata/types/tid') &&
        String((call[1] as RequestInit | undefined)?.method || '').toUpperCase() === 'PUT',
    );
    expect(putCalls.length).toBeGreaterThanOrEqual(1);
  }, 20000);

  it('renders the Schema tab read-only from the type schema', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('category=field')) {
          return jsonResponse({
            data: [{ id: 'f1', name: 'integer', category: 'field', displayName: 'Integer' }],
            paging: { total: 1 },
          });
        }
        if (url.includes('/api/v1/metadata/types/name/table')) {
          return jsonResponse({
            id: 'tid',
            name: 'table',
            schema: '{"type":"object","properties":{"x":{"type":"string"}}}',
            customProperties: [
              { name: 'retentionDays', displayName: 'Retention days', description: 'd', propertyType: { name: 'integer' } },
              { name: 'ownerTeam', displayName: 'Owner team', description: 'd', propertyType: { name: 'string' } },
              { name: 'tier', displayName: 'Tier', description: 'd', propertyType: { name: 'string' } },
            ],
          });
        }
        return new Response('not found', { status: 404 });
      }),
    );
    const { wrapper } = await mountDefs();
    const schema = wrapper.find('[data-testid="custom-property-type-schema"]');
    expect(schema.exists()).toBe(true);
    expect(schema.element.tagName).toBe('PRE');
    expect(JSON.parse(schema.text())).toEqual({
      type: 'object',
      properties: { x: { type: 'string' } },
    });
    expect(wrapper.find('[data-testid="custom-property-type-schema-error"]').exists()).toBe(false);
    // The Custom Properties tab carries the definitions count badge.
    const tabLabels = wrapper.findAll('.ant-tabs-tab').map((tab) => tab.text());
    expect(tabLabels).toContain('Custom property definitions (3)');
    expect(tabLabels).toContain('Schema');
  });

  it('shows an explicit error instead of a blank page for invalid schema JSON', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('category=field')) {
          return jsonResponse({ data: [], paging: { total: 0 } });
        }
        if (url.includes('/api/v1/metadata/types/name/table')) {
          return jsonResponse({ id: 'tid', name: 'table', schema: 'not-json{', customProperties: [] });
        }
        return new Response('not found', { status: 404 });
      }),
    );
    const { wrapper } = await mountDefs();
    expect(wrapper.find('[data-testid="custom-property-type-schema-error"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="custom-property-type-schema"]').exists()).toBe(false);
  });

  // 20s cap (same load evidence as the first test in this file: this mount
  // took ~3.9s under peak VM load). Assertions are unchanged.
  it('renders the Configuration column with chips, +N, and — for no config', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('category=field')) {
          return jsonResponse({
            data: [{ id: 'f1', name: 'integer', category: 'field', displayName: 'Integer' }],
            paging: { total: 1 },
          });
        }
        if (url.includes('/api/v1/metadata/types/name/table')) {
          return jsonResponse({
            id: 'tid',
            name: 'table',
            customProperties: [
              { name: 'retentionDays', displayName: 'Retention days', description: 'd', propertyType: { name: 'integer' } },
              {
                name: 'tier',
                displayName: 'Tier',
                description: 'Service tier',
                propertyType: { name: 'string' },
                customPropertyConfig: {
                  config: { values: ['gold', 'silver', 'bronze', 'basic'], multiSelect: true },
                },
              },
            ],
          });
        }
        return new Response('not found', { status: 404 });
      }),
    );
    const { wrapper } = await mountDefs();
    expect(wrapper.find('[data-testid="enum-config"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="enum-config"]').text()).toContain('Values · Multi-select');
    expect(wrapper.findAll('[data-testid="config-value"]')).toHaveLength(3);
    expect(wrapper.find('[data-testid="config-hidden-count"]').text()).toBe('+1');
    expect(wrapper.findAll('[data-testid="no-config"]').length).toBeGreaterThanOrEqual(1);
  }, 20000);

  it('searches by name and display name after a 300ms debounce, never by description', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('category=field')) {
          return jsonResponse({
            data: [{ id: 'f1', name: 'integer', category: 'field', displayName: 'Integer' }],
            paging: { total: 1 },
          });
        }
        if (url.includes('/api/v1/metadata/types/name/table')) {
          return jsonResponse({
            id: 'tid',
            name: 'table',
            customProperties: [
              {
                name: 'retentionDays',
                displayName: 'Retention days',
                description: 'How long to keep rows',
                propertyType: { name: 'integer' },
              },
              {
                name: 'ownerTeam',
                displayName: 'Owner team',
                description: 'retention policy owner',
                propertyType: { name: 'string' },
              },
            ],
          });
        }
        return new Response('not found', { status: 404 });
      }),
    );
    const { wrapper } = await mountDefs();
    const search = wrapper.find(
      '[data-testid="custom-property-search"] input, input[data-testid="custom-property-search"]',
    );
    await search.setValue('owner');
    await new Promise((resolve) => setTimeout(resolve, 350));
    await flushPromises();
    expect(wrapper.text()).toContain('ownerTeam');
    expect(wrapper.text()).not.toContain('retentionDays');
    expect(wrapper.find('[data-testid="custom-property-no-results"]').exists()).toBe(false);
    // 'keep rows' lives only in retentionDays' description: no match.
    await search.setValue('keep rows');
    await new Promise((resolve) => setTimeout(resolve, 350));
    await flushPromises();
    expect(wrapper.find('[data-testid="admin-custom-property-defs-table"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="custom-property-no-results"]').exists()).toBe(true);
  });

  it('filters by property type and drops a type whose last property was deleted', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (String(init?.method || '').toUpperCase() === 'PATCH') {
        return jsonResponse({ id: 'tid', name: 'table', customProperties: [] });
      }
      if (url.includes('category=field')) {
        return jsonResponse({
          data: [{ id: 'f1', name: 'integer', category: 'field' }],
          paging: { total: 1 },
        });
      }
      if (url.includes('/api/v1/metadata/types/name/table')) {
        return jsonResponse({
          id: 'tid',
          name: 'table',
          customProperties: [
            { name: 'retentionDays', displayName: 'Retention days', description: 'd', propertyType: { name: 'integer' } },
            { name: 'ownerTeam', displayName: 'Owner team', description: 'd', propertyType: { name: 'string' } },
          ],
        });
      }
      return new Response('not found', { status: 404 });
    });
    vi.stubGlobal('fetch', fetchMock);
    vi.spyOn(Modal, 'confirm').mockImplementation((config) => {
      void Promise.resolve(config.onOk?.());
      return { destroy: vi.fn(), update: vi.fn() } as never;
    });
    const { wrapper } = await mountDefs();
    const filter = wrapper
      .findAllComponents(Select)
      .find((c) => c.attributes('data-testid') === 'custom-property-type-filter');
    expect(filter).toBeTruthy();
    await filter!.vm.$emit('change', ['integer']);
    await flushPromises();
    expect(wrapper.text()).toContain('retentionDays');
    expect(wrapper.text()).not.toContain('ownerTeam');
    // Delete the only integer property: the filter converges, so the page
    // shows the "no definitions" empty state, not the "no results" one.
    await wrapper.find('[data-testid="delete-custom-property-retentionDays"]').trigger('click');
    await flushPromises();
    expect(wrapper.find('[data-testid="custom-property-defs-empty"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="custom-property-no-results"]').exists()).toBe(false);
  });

  it('deletes via confirm + index-addressed JSON Patch and removes the row', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (String(init?.method || '').toUpperCase() === 'PATCH') {
        return jsonResponse({
          id: 'tid',
          name: 'table',
          customProperties: [
            { name: 'ownerTeam', displayName: 'Owner team', description: 'd', propertyType: { name: 'string' } },
          ],
        });
      }
      if (url.includes('category=field')) {
        return jsonResponse({
          data: [{ id: 'f1', name: 'integer', category: 'field' }],
          paging: { total: 1 },
        });
      }
      if (url.includes('/api/v1/metadata/types/name/table')) {
        return jsonResponse({
          id: 'tid',
          name: 'table',
          customProperties: [
            { name: 'retentionDays', displayName: 'Retention days', description: 'd', propertyType: { name: 'integer' } },
            { name: 'ownerTeam', displayName: 'Owner team', description: 'd', propertyType: { name: 'string' } },
          ],
        });
      }
      return new Response('not found', { status: 404 });
    });
    vi.stubGlobal('fetch', fetchMock);
    const confirmSpy = vi.spyOn(Modal, 'confirm').mockImplementation((config) => {
      expect(config.title).toBe('Delete');
      expect(config.content).toContain('retentionDays');
      void Promise.resolve(config.onOk?.());
      return { destroy: vi.fn(), update: vi.fn() } as never;
    });
    const { wrapper } = await mountDefs();
    await wrapper.find('[data-testid="delete-custom-property-retentionDays"]').trigger('click');
    await flushPromises();
    expect(confirmSpy).toHaveBeenCalledTimes(1);
    const patchCalls = fetchMock.mock.calls.filter(
      (call) =>
        String(call[0]).includes('/api/v1/metadata/types/tid') &&
        String((call[1] as RequestInit | undefined)?.method || '').toUpperCase() === 'PATCH',
    );
    expect(patchCalls).toHaveLength(1);
    expect(JSON.parse(String((patchCalls[0]![1] as RequestInit).body))).toEqual([
      { op: 'test', path: '/customProperties/0/name', value: 'retentionDays' },
      { op: 'remove', path: '/customProperties/0' },
    ]);
    expect(wrapper.text()).not.toContain('retentionDays');
    expect(wrapper.text()).toContain('ownerTeam');
  });

  // 20s caps (same load evidence as the first test in this file: mounts
  // take ~1–5s quiet and up to ~9s under peak VM load).
  describe('stage 3 config write side', () => {
    const FIELD_TYPES = [
      { id: 'f-int', name: 'integer', category: 'field', displayName: 'Integer' },
      { id: 'f-enum', name: 'enum', category: 'field', displayName: 'Enum' },
      { id: 'f-date', name: 'date-cp', category: 'field', displayName: 'Date' },
      { id: 'f-ref', name: 'entityReference', category: 'field', displayName: 'Entity Reference' },
      { id: 'f-table', name: 'table-cp', category: 'field', displayName: 'Table' },
      { id: 'f-string', name: 'string', category: 'field', displayName: 'String' },
    ];

    function stage3Fetch(defs: unknown[], updated?: unknown) {
      return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        const method = String(init?.method || '').toUpperCase();
        if (url.includes('category=field')) {
          return jsonResponse({ data: FIELD_TYPES, paging: { total: FIELD_TYPES.length } });
        }
        if ((method === 'PUT' || method === 'PATCH') && url.includes('/api/v1/metadata/types/tid')) {
          return jsonResponse(updated ?? { id: 'tid', name: 'table', customProperties: defs });
        }
        if (url.includes('/api/v1/metadata/types/name/')) {
          return jsonResponse({ id: 'tid', name: 'table', customProperties: defs });
        }
        return new Response('not found', { status: 404 });
      });
    }

    function putBodies(fetchMock: ReturnType<typeof vi.fn>): unknown[] {
      return fetchMock.mock.calls
        .filter(
          (call) =>
            String(call[0]).includes('/api/v1/metadata/types/tid') &&
            String((call[1] as RequestInit | undefined)?.method || '').toUpperCase() === 'PUT',
        )
        .map((call) => JSON.parse(String((call[1] as RequestInit).body)));
    }

    function patchBodies(fetchMock: ReturnType<typeof vi.fn>): unknown[] {
      return fetchMock.mock.calls
        .filter(
          (call) =>
            String(call[0]).includes('/api/v1/metadata/types/tid') &&
            String((call[1] as RequestInit | undefined)?.method || '').toUpperCase() === 'PATCH',
        )
        .map((call) => JSON.parse(String((call[1] as RequestInit).body)));
    }

    function formSelect(wrapper: ReturnType<typeof mount>, testid: string) {
      const select = wrapper
        .findAllComponents(Select)
        .find((c) => c.attributes('data-testid') === testid);
      expect(select).toBeTruthy();
      return select!;
    }

    async function selectFormType(
      wrapper: ReturnType<typeof mount>,
      id: string,
    ): Promise<void> {
      const select = formSelect(wrapper, 'custom-property-type');
      await select.vm.$emit('update:value', id);
      await select.vm.$emit('change', id);
      await flushPromises();
    }

    async function clickModalOk(wrapper: ReturnType<typeof mount>): Promise<void> {
      const modalOk = wrapper
        .findAll('.ant-modal-footer button')
        .find((b) => b.classes().includes('ant-btn-primary'));
      expect(modalOk).toBeTruthy();
      await modalOk!.trigger('click');
      await flushPromises();
    }

    async function openCreate(wrapper: ReturnType<typeof mount>): Promise<void> {
      await wrapper.get('[data-testid="add-custom-property"]').trigger('click');
      await flushPromises();
    }

    it('creates an enum property with config and echoes it in the Configuration column', async () => {
      const created = {
        name: 'tier',
        displayName: '',
        description: 'Service tier',
        propertyType: { name: 'enum' },
        customPropertyConfig: { config: { values: ['gold', 'silver'], multiSelect: true } },
      };
      const fetchMock = stage3Fetch([], { id: 'tid', name: 'table', customProperties: [created] });
      vi.stubGlobal('fetch', fetchMock);
      const { wrapper } = await mountDefs();
      await openCreate(wrapper);
      await selectFormType(wrapper, 'f-enum');
      await wrapper.get('[data-testid="custom-property-name"]').setValue('tier');
      await wrapper.get('[data-testid="custom-property-description"]').setValue('Service tier');
      const enumSelect = formSelect(wrapper, 'custom-property-enum-config');
      await enumSelect.vm.$emit('update:value', ['gold', 'silver']);
      const multiSelect = wrapper.findComponent(Switch);
      await multiSelect.vm.$emit('update:checked', true);
      await clickModalOk(wrapper);
      expect(putBodies(fetchMock)).toEqual([
        {
          name: 'tier',
          description: 'Service tier',
          propertyType: { id: 'f-enum', type: 'type', name: 'enum' },
          customPropertyConfig: { config: { multiSelect: true, values: ['gold', 'silver'] } },
        },
      ]);
      expect(wrapper.find('[data-testid="enum-config"]').exists()).toBe(true);
      expect(wrapper.find('[data-testid="enum-config"]').text()).toContain('Values · Multi-select');
    }, 20000);

    it('creates a date property with a format config', async () => {
      const fetchMock = stage3Fetch([]);
      vi.stubGlobal('fetch', fetchMock);
      const { wrapper } = await mountDefs();
      await openCreate(wrapper);
      await selectFormType(wrapper, 'f-date');
      await wrapper.get('[data-testid="custom-property-name"]').setValue('reviewedOn');
      await wrapper.get('[data-testid="custom-property-description"]').setValue('Review date');
      const formatSelect = formSelect(wrapper, 'custom-property-format-config');
      await formatSelect.vm.$emit('update:value', 'dd-MM-yyyy');
      await clickModalOk(wrapper);
      expect(putBodies(fetchMock)).toEqual([
        {
          name: 'reviewedOn',
          description: 'Review date',
          propertyType: { id: 'f-date', type: 'type', name: 'date-cp' },
          customPropertyConfig: { config: 'dd-MM-yyyy' },
        },
      ]);
    }, 20000);

    it('creates an entity-reference property with the selected types', async () => {
      const fetchMock = stage3Fetch([]);
      vi.stubGlobal('fetch', fetchMock);
      const { wrapper } = await mountDefs();
      await openCreate(wrapper);
      await selectFormType(wrapper, 'f-ref');
      await wrapper.get('[data-testid="custom-property-name"]').setValue('ownerRef');
      await wrapper.get('[data-testid="custom-property-description"]').setValue('Owner reference');
      const refSelect = formSelect(wrapper, 'custom-property-entity-ref-config');
      await refSelect.vm.$emit('update:value', ['table', 'user']);
      await clickModalOk(wrapper);
      expect(putBodies(fetchMock)).toEqual([
        {
          name: 'ownerRef',
          description: 'Owner reference',
          propertyType: { id: 'f-ref', type: 'type', name: 'entityReference' },
          customPropertyConfig: { config: ['table', 'user'] },
        },
      ]);
    }, 20000);

    it('creates a table property with column names', async () => {
      const fetchMock = stage3Fetch([]);
      vi.stubGlobal('fetch', fetchMock);
      const { wrapper } = await mountDefs();
      await openCreate(wrapper);
      await selectFormType(wrapper, 'f-table');
      await wrapper.get('[data-testid="custom-property-name"]').setValue('breakdown');
      await wrapper.get('[data-testid="custom-property-description"]').setValue('Breakdown table');
      const columnsSelect = formSelect(wrapper, 'custom-property-columns');
      await columnsSelect.vm.$emit('update:value', ['col_a', 'col_b']);
      await clickModalOk(wrapper);
      expect(putBodies(fetchMock)).toEqual([
        {
          name: 'breakdown',
          description: 'Breakdown table',
          propertyType: { id: 'f-table', type: 'type', name: 'table-cp' },
          customPropertyConfig: { config: { columns: ['col_a', 'col_b'] } },
        },
      ]);
    }, 20000);

    it('blocks submit when a conditional field is missing', async () => {
      const fetchMock = stage3Fetch([]);
      vi.stubGlobal('fetch', fetchMock);
      const { wrapper } = await mountDefs();
      await openCreate(wrapper);
      await selectFormType(wrapper, 'f-enum');
      await wrapper.get('[data-testid="custom-property-name"]').setValue('tier');
      await wrapper.get('[data-testid="custom-property-description"]').setValue('Service tier');
      // No enum values: validation reports the first issue, nothing is sent.
      await clickModalOk(wrapper);
      expect(putBodies(fetchMock)).toHaveLength(0);
    }, 20000);

    it('blocks a case-insensitively duplicate name, an invalid name, and a too-long name', async () => {
      const fetchMock = stage3Fetch([
        { name: 'retentionDays', description: 'd', propertyType: { name: 'integer' } },
      ]);
      vi.stubGlobal('fetch', fetchMock);
      const { wrapper } = await mountDefs();
      await openCreate(wrapper);
      const nameInput = () => wrapper.get('[data-testid="custom-property-name"]');
      await wrapper.get('[data-testid="custom-property-description"]').setValue('d');
      await nameInput().setValue('RetentionDays');
      await clickModalOk(wrapper);
      expect(putBodies(fetchMock)).toHaveLength(0);
      await nameInput().setValue('bad:name');
      await clickModalOk(wrapper);
      expect(putBodies(fetchMock)).toHaveLength(0);
      await nameInput().setValue('x'.repeat(257));
      await clickModalOk(wrapper);
      expect(putBodies(fetchMock)).toHaveLength(0);
      await nameInput().setValue('tier2');
      await clickModalOk(wrapper);
      expect(putBodies(fetchMock)).toHaveLength(1);
    }, 20000);

    it('edits an enum property via PATCH with an additive config change', async () => {
      const saved = {
        name: 'tier',
        displayName: 'Tier',
        description: 'Service tier',
        propertyType: { name: 'enum' },
        customPropertyConfig: { config: { values: ['gold'], multiSelect: false } },
      };
      const updated = {
        ...saved,
        customPropertyConfig: { config: { values: ['gold', 'silver'], multiSelect: false } },
      };
      const fetchMock = stage3Fetch([saved], {
        id: 'tid',
        name: 'table',
        customProperties: [updated],
      });
      vi.stubGlobal('fetch', fetchMock);
      const { wrapper } = await mountDefs();
      await wrapper.get('[data-testid="edit-custom-property-tier"]').trigger('click');
      await flushPromises();
      // The type is frozen in edit and the saved enum values are prefilled.
      expect(formSelect(wrapper, 'custom-property-type').props('disabled')).toBe(true);
      expect(formSelect(wrapper, 'custom-property-enum-config').props('value')).toEqual(['gold']);
      const enumSelect = formSelect(wrapper, 'custom-property-enum-config');
      await enumSelect.vm.$emit('update:value', ['gold', 'silver']);
      await clickModalOk(wrapper);
      expect(putBodies(fetchMock)).toHaveLength(0);
      expect(patchBodies(fetchMock)).toEqual([
        [
          { op: 'test', path: '/customProperties/0/name', value: 'tier' },
          {
            op: 'replace',
            path: '/customProperties/0/customPropertyConfig',
            value: { config: { multiSelect: false, values: ['gold', 'silver'] } },
          },
        ],
      ]);
    }, 20000);

    it('edit hides format and columns controls (official edit scope)', async () => {
      const saved = {
        name: 'reviewedOn',
        displayName: '',
        description: 'Review date',
        propertyType: { name: 'date-cp' },
        customPropertyConfig: { config: 'dd-MM-yyyy' },
      };
      vi.stubGlobal('fetch', stage3Fetch([saved]));
      const { wrapper } = await mountDefs();
      await wrapper.get('[data-testid="edit-custom-property-reviewedOn"]').trigger('click');
      await flushPromises();
      expect(wrapper.find('[data-testid="custom-property-format-config"]').exists()).toBe(false);
      expect(wrapper.find('[data-testid="custom-property-columns"]').exists()).toBe(false);
      expect(wrapper.find('[data-testid="custom-property-enum-config"]').exists()).toBe(false);
      expect(wrapper.find('[data-testid="custom-property-entity-ref-config"]').exists()).toBe(false);
      expect(formSelect(wrapper, 'custom-property-type').props('disabled')).toBe(true);
    }, 20000);

    it('switching property type clears the previous type condition values', async () => {
      vi.stubGlobal('fetch', stage3Fetch([]));
      const { wrapper } = await mountDefs();
      await openCreate(wrapper);
      await selectFormType(wrapper, 'f-enum');
      const enumSelect = formSelect(wrapper, 'custom-property-enum-config');
      await enumSelect.vm.$emit('update:value', ['gold']);
      await selectFormType(wrapper, 'f-date');
      expect(wrapper.find('[data-testid="custom-property-enum-config"]').exists()).toBe(false);
      expect(wrapper.find('[data-testid="custom-property-format-config"]').exists()).toBe(true);
      await selectFormType(wrapper, 'f-enum');
      expect(formSelect(wrapper, 'custom-property-enum-config').props('value')).toEqual([]);
    }, 20000);

    it('shows the Applies To badge only for tableColumn', async () => {
      vi.stubGlobal('fetch', stage3Fetch([]));
      const { wrapper } = await mountDefs('tableColumn');
      await openCreate(wrapper);
      const badge = wrapper.find('[data-testid="custom-property-applies-to"]');
      expect(badge.exists()).toBe(true);
      expect(badge.text()).toContain('Applies To');
      expect(badge.text()).toContain('Table Column');
      vi.stubGlobal('fetch', stage3Fetch([]));
      const { wrapper: tableWrapper } = await mountDefs('table');
      await openCreate(tableWrapper);
      expect(tableWrapper.find('[data-testid="custom-property-applies-to"]').exists()).toBe(false);
    }, 20000);
  });

  it('treats deleting an already-gone property as deleted, not a failure', async () => {
    let gets = 0;
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (String(init?.method || '').toUpperCase() === 'PATCH') {
        return jsonResponse({ id: 'tid', name: 'table', customProperties: [] });
      }
      if (url.includes('category=field')) {
        return jsonResponse({
          data: [{ id: 'f1', name: 'integer', category: 'field' }],
          paging: { total: 1 },
        });
      }
      if (url.includes('/api/v1/metadata/types/name/table')) {
        gets += 1;
        return jsonResponse({
          id: 'tid',
          name: 'table',
          customProperties:
            gets === 1
              ? [{ name: 'retentionDays', description: 'd', propertyType: { name: 'integer' } }]
              : [],
        });
      }
      return new Response('not found', { status: 404 });
    });
    vi.stubGlobal('fetch', fetchMock);
    vi.spyOn(Modal, 'confirm').mockImplementation((config) => {
      void Promise.resolve(config.onOk?.());
      return { destroy: vi.fn(), update: vi.fn() } as never;
    });
    const { wrapper } = await mountDefs();
    await wrapper.find('[data-testid="delete-custom-property-retentionDays"]').trigger('click');
    await flushPromises();
    const patchCalls = fetchMock.mock.calls.filter(
      (call) =>
        String((call[1] as RequestInit | undefined)?.method || '').toUpperCase() === 'PATCH',
    );
    expect(patchCalls).toHaveLength(0);
    expect(wrapper.find('[data-testid="custom-property-defs-empty"]').exists()).toBe(true);
  });
});

function entityTypeFrom(url: string): string {
  const marker = '/metadata/types/name/';
  const start = url.indexOf(marker);
  if (start < 0) {
    return 'unknown';
  }
  const rest = url.slice(start + marker.length);
  return decodeURIComponent(rest.split(/[/?]/)[0] || 'unknown');
}
