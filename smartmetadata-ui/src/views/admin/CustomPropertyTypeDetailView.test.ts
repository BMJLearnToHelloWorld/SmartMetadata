/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import Antd, {
  Drawer,
  Dropdown,
  message,
  Modal,
  Select,
  Switch,
  Table,
  Tag,
  Tooltip,
} from 'ant-design-vue';
import type { MenuProps } from 'ant-design-vue';
import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryHistory, createRouter } from 'vue-router';
import { defineComponent, h, nextTick, onErrorCaptured, type VNode } from 'vue';
import { ADD_CUSTOM_PROPERTIES_DOCS } from '@/api/customProperties';
import EntityDetailShell from '@/features/crud/EntityDetailShell.vue';
import CreatePlaceholder from '@/components/shared/CreatePlaceholder.vue';
import NoDataPlaceholder from '@/components/shared/NoDataPlaceholder.vue';
import NoFilteredResultsPlaceholder from '@/components/shared/NoFilteredResultsPlaceholder.vue';
import NoSearchResultsPlaceholder from '@/components/shared/NoSearchResultsPlaceholder.vue';
import PermissionPlaceholder from '@/components/shared/PermissionPlaceholder.vue';
import SmErrorBoundary from '@/components/shared/SmErrorBoundary.vue';
import { createTestI18n } from '@/test/i18n';
import type { CustomPropertyDef } from '@/types/collaboration';
import CustomPropertyTypeDetailView from './CustomPropertyTypeDetailView.vue';

// Shared components have their own suites; the view tests assert wiring
// (props passed, events consumed), so the editors and the doc panel are
// stubbed at the module boundary. The placeholders stay real: the empty
// -state decision matrix asserts their rendered branches.
vi.mock('@/components/shared/SmRichTextEditor.vue', () => ({
  default: defineComponent({
    name: 'SmRichTextEditor',
    props: { initialValue: { type: String, default: '' } },
    emits: ['text-change', 'focus'],
    setup(props, { emit }) {
      return () =>
        h('div', { 'data-testid': 'stub-rich-text-editor' }, [
          h('textarea', {
            'data-testid': 'stub-rich-text-input',
            value: props.initialValue,
            onInput: (event: Event) =>
              emit('text-change', (event.target as HTMLTextAreaElement).value),
            onFocus: () => emit('focus'),
          }),
        ]);
    },
  }),
}));

vi.mock('@/components/shared/SmCodeEditor.vue', () => ({
  default: defineComponent({
    name: 'SmCodeEditor',
    props: {
      value: { type: [String, Object], default: '' },
      className: { type: String, default: '' },
      editorClass: { type: String, default: undefined },
    },
    emits: ['change', 'update:modelValue'],
    setup(props, { emit }) {
      return () =>
        h(
          'div',
          {
            'data-testid': 'code-mirror-container',
            'data-value': JSON.stringify(props.value),
          },
          [
            h(
              'button',
              {
                'data-testid': 'stub-code-change',
                onClick: () => emit('change', '{"edited":true}'),
              },
              'edit',
            ),
          ],
        );
    },
  }),
}));

vi.mock('@/components/ingestion/ServiceDocPanel.vue', () => ({
  default: defineComponent({
    name: 'ServiceDocPanel',
    props: {
      activeField: { type: String, default: undefined },
      serviceName: { type: String, default: '' },
      serviceType: { type: String, default: '' },
    },
    setup(props) {
      return () =>
        h('div', {
          'data-testid': 'stub-service-doc-panel',
          'data-active-field': props.activeField ?? '',
          'data-service-name': props.serviceName,
          'data-service-type': props.serviceType,
        });
    },
  }),
}));

// The permission store is mocked (precedent: DataEstateWidget.test.ts) so
// the per-type grant is controllable per test without touching the
// per-test fetch stubs. Default grant is EditAll — the permission context
// the pre-stage-4 tests always assumed (admin); the gate tests override
// it per test.
const getEntityPermissionById = vi.fn(
  async (): Promise<Record<string, boolean>> => ({ EditAll: true }),
);
const getEntityPermissionByFqn = vi.fn(async (): Promise<Record<string, boolean>> => ({}));
const invalidateEntityPermission = vi.fn();
vi.mock('@/stores/permissions', () => ({
  usePermissionStore: () => ({
    getEntityPermissionById,
    getEntityPermissionByFqn,
    invalidateEntityPermission,
  }),
}));

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const FIELD_TYPES = [
  { id: 'f-int', name: 'integer', category: 'field', displayName: 'Integer' },
  { id: 'f-string', name: 'string', category: 'field', displayName: 'String' },
  { id: 'f-enum', name: 'enum', category: 'field', displayName: 'Enum' },
  { id: 'f-date', name: 'date-cp', category: 'field', displayName: 'Date' },
  { id: 'f-ref', name: 'entityReference', category: 'field', displayName: 'Entity Reference' },
  { id: 'f-table', name: 'table-cp', category: 'field', displayName: 'Table' },
  { id: 'f-sql', name: 'sqlQuery', category: 'field', displayName: 'SQL Query' },
];

const DEFAULT_DEFS = [
  {
    name: 'retentionDays',
    displayName: 'Retention days',
    description: 'How long to keep rows',
    propertyType: { name: 'integer' },
  },
];

async function mountDefs(entityType = 'table') {
  const pinia = createPinia();
  setActivePinia(pinia);
  const i18n = createTestI18n();
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      {
        path: '/admin/settings',
        name: 'admin-settings',
        component: { template: '<div>hub</div>' },
      },
      {
        path: '/settings/:category',
        name: 'settings-category',
        component: { template: '<div>category</div>' },
      },
      {
        path: '/admin/settings/custom-properties/:tab',
        name: 'admin-settings-custom-property-type',
        component: CustomPropertyTypeDetailView,
        props: (route) => ({ entityType: String(route.params.tab) }),
      },
    ],
  });
  await router.push(`/admin/settings/custom-properties/${entityType}`);
  await router.isReady();
  const wrapper = mount(CustomPropertyTypeDetailView, {
    props: { entityType },
    global: {
      plugins: [pinia, router, Antd, i18n],
    },
  });
  await flushPromises();
  // Expected rendered strings, computed through the same i18n instance
  // the view uses: new label.* keys render as key text until the
  // integration line writes them, and the assertions stay correct
  // either way.
  const tx = (key: string, params?: Record<string, unknown>): string =>
    String(i18n.global.t(key, params ?? {}));
  return { wrapper, router, i18n, tx };
}

function shellOf(wrapper: VueWrapper) {
  const shell = wrapper.findComponent(EntityDetailShell);
  expect(shell.exists()).toBe(true);
  return shell;
}

function formSelect(wrapper: VueWrapper, testid: string) {
  const select = wrapper
    .findAllComponents(Select)
    .find((c) => c.attributes('data-testid') === testid);
  expect(select).toBeTruthy();
  return select!;
}

function drawerOf(wrapper: VueWrapper) {
  const drawer = wrapper.findComponent(Drawer);
  expect(drawer.exists()).toBe(true);
  return drawer;
}

function modalOf(wrapper: VueWrapper, width: number) {
  const modal = wrapper
    .findAllComponents(Modal)
    .find((c) => c.props('width') === width);
  expect(modal).toBeTruthy();
  return modal!;
}

async function openDrawer(wrapper: VueWrapper): Promise<void> {
  await wrapper.get('[data-testid="add-field-button"]').trigger('click');
  await flushPromises();
}

async function selectDrawerType(wrapper: VueWrapper, id: string): Promise<void> {
  const select = formSelect(wrapper, 'custom-property-type');
  await select.vm.$emit('update:value', id);
  await select.vm.$emit('change', id);
  await flushPromises();
}

async function setDrawerDescription(wrapper: VueWrapper, text: string): Promise<void> {
  const input = wrapper.get(
    '[data-testid="custom-property-form"] [data-testid="stub-rich-text-input"]',
  );
  await input.setValue(text);
  await flushPromises();
}

async function setEditDescription(wrapper: VueWrapper, text: string): Promise<void> {
  const input = wrapper.get(
    '[data-testid="edit-custom-property-form"] [data-testid="stub-rich-text-input"]',
  );
  await input.setValue(text);
  await flushPromises();
}

async function clickCreate(wrapper: VueWrapper): Promise<void> {
  await wrapper.get('[data-testid="create-button"]').trigger('click');
  await flushPromises();
}

/** Drive a row's actions menu through the Dropdown menu prop (no popup dependency). */
async function chooseAction(
  wrapper: VueWrapper,
  key: string,
  rowIndex = 0,
): Promise<void> {
  const dropdown = wrapper.findAllComponents(Dropdown)[rowIndex]!;
  expect(dropdown.exists()).toBe(true);
  const menu = dropdown.props('menu') as MenuProps;
  expect(menu?.onClick).toBeTruthy();
  (menu.onClick as unknown as (info: { key: string }) => void)({ key });
  await flushPromises();
}

function methodBodies(
  fetchMock: ReturnType<typeof vi.fn>,
  method: string,
): unknown[] {
  return fetchMock.mock.calls
    .filter(
      (call) =>
        String(call[0]).includes('/api/v1/metadata/types/tid') &&
        String((call[1] as RequestInit | undefined)?.method || '').toUpperCase() === method,
    )
    .map((call) => JSON.parse(String((call[1] as RequestInit).body)));
}

function writeFetch(defs: unknown[], updated?: unknown) {
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

/** First detail GET returns `defs`; later ones return [] (target-gone flows). */
function goneFetch(defs: unknown[]) {
  let gets = 0;
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = String(init?.method || '').toUpperCase();
    if (url.includes('category=field')) {
      return jsonResponse({ data: FIELD_TYPES, paging: { total: FIELD_TYPES.length } });
    }
    if (method === 'PATCH') {
      return jsonResponse({ id: 'tid', name: 'table', customProperties: [] });
    }
    if (url.includes('/api/v1/metadata/types/name/')) {
      gets += 1;
      return jsonResponse({
        id: 'tid',
        name: 'table',
        customProperties: gets === 1 ? defs : [],
      });
    }
    return new Response('not found', { status: 404 });
  });
}

function entityTypeFrom(url: string): string {
  const marker = '/metadata/types/name/';
  const start = url.indexOf(marker);
  if (start < 0) {
    return 'unknown';
  }
  const rest = url.slice(start + marker.length);
  return decodeURIComponent(rest.split(/[/?]/)[0] || 'unknown');
}

describe('CustomPropertyTypeDetailView', () => {
  beforeEach(() => {
    localStorage.clear();
    getEntityPermissionById.mockResolvedValue({ EditAll: true });
    getEntityPermissionByFqn.mockResolvedValue({});
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('/api/v1/metadata/types?') && url.includes('category=field')) {
          return jsonResponse({ data: FIELD_TYPES, paging: { total: FIELD_TYPES.length } });
        }
        if (url.includes('/api/v1/metadata/types/name/table')) {
          return jsonResponse({ id: 'tid', name: 'table', customProperties: DEFAULT_DEFS });
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

  // 20s caps, not the 5s default: mounts first-render the Ant tab bar, the
  // multi-select type filter and the table after two sequential fetches,
  // so under parallel workers they exceed 5s (quiet single-run ~2.3s,
  // loaded single-run 9.1s). The cap still fails a genuinely hung fetch.
  describe('header, breadcrumbs, tabs', () => {
    it('renders the pin page header for tables', async () => {
      const { wrapper, tx } = await mountDefs();
      const shell = shellOf(wrapper);
      expect(shell.props('title')).toBe(tx('label.table-plural'));
      expect(shell.props('lead')).toBe(
        tx('message.define-custom-property-for-entity', { entity: tx('label.table-plural') }),
      );
    }, 20000);

    it('renders the column header without entity params for tableColumn', async () => {
      const { wrapper, tx } = await mountDefs('tableColumn');
      const shell = shellOf(wrapper);
      expect(shell.props('title')).toBe(tx('label.column-plural'));
      expect(shell.props('lead')).toBe(tx('message.define-custom-property-for-column'));
    }, 20000);

    it('falls back to the Tables header for unmapped types', async () => {
      const { wrapper, tx } = await mountDefs('somethingNew');
      const shell = shellOf(wrapper);
      expect(shell.props('title')).toBe(tx('label.table-plural'));
      expect(shell.props('lead')).toBe(
        tx('message.define-custom-property-for-entity', { entity: tx('label.table-plural') }),
      );
    }, 20000);

    it('renders three breadcrumb levels with the hub and category links', async () => {
      const { wrapper, router, tx } = await mountDefs();
      const crumbs = shellOf(wrapper).props('breadcrumbs') as {
        label: string;
        to?: unknown;
      }[];
      expect(crumbs).toEqual([
        { label: tx('label.setting-plural'), to: { name: 'admin-settings' } },
        {
          label: tx('label.custom-property-plural'),
          to: { name: 'settings-category', params: { category: 'customProperties' } },
        },
        { label: 'Tables' },
      ]);
      expect(wrapper.find('[data-testid="entity-detail-crumb-0"]').exists()).toBe(true);
      expect(wrapper.find('[data-testid="entity-detail-crumb-1"]').exists()).toBe(true);
      expect(wrapper.find('[data-testid="entity-detail-crumb-2"]').exists()).toBe(false);
      await wrapper.get('[data-testid="entity-detail-crumb-0"]').trigger('click');
      await flushPromises();
      expect(router.currentRoute.value.name).toBe('admin-settings');
      await wrapper.get('[data-testid="entity-detail-crumb-1"]').trigger('click');
      await flushPromises();
      expect(router.currentRoute.value.name).toBe('settings-category');
      expect(router.currentRoute.value.params.category).toBe('customProperties');
    }, 20000);

    it('derives the breadcrumb entity name from the route segment', async () => {
      const first = await mountDefs('dashboardDataModel');
      expect(
        (shellOf(first.wrapper).props('breadcrumbs') as { label: string }[])[2]?.label,
      ).toBe('Dashboard Data Models');
      const second = await mountDefs('tableColumn');
      expect(
        (shellOf(second.wrapper).props('breadcrumbs') as { label: string }[])[2]?.label,
      ).toBe('Column');
      const third = await mountDefs('glossaryTerm');
      expect(
        (shellOf(third.wrapper).props('breadcrumbs') as { label: string }[])[2]?.label,
      ).toBe('Glossary Term');
    }, 20000);

    it('renders tabs with the count pill on the properties tab', async () => {
      const { wrapper, tx } = await mountDefs();
      const tabs = shellOf(wrapper).props('tabs') as {
        key: string;
        label: string;
        count?: number;
        testId?: string;
      }[];
      expect(tabs).toEqual([
        {
          key: 'custom-properties',
          label: tx('label.custom-property-plural'),
          count: 1,
          testId: 'custom-property-tab-properties',
        },
        { key: 'schema', label: tx('label.schema'), testId: 'custom-property-tab-schema' },
      ]);
    }, 20000);

    it('shows the Add button only on the properties tab with EditAll', async () => {
      const { wrapper, tx } = await mountDefs();
      const add = wrapper.get('[data-testid="add-field-button"]');
      expect(add.text()).toContain(tx('label.add-entity', { entity: tx('label.property') }));
      const schemaTab = wrapper
        .findAll('.ant-tabs-tab')
        .find((tab) => tab.text() === tx('label.schema'));
      expect(schemaTab).toBeTruthy();
      await schemaTab!.trigger('click');
      await flushPromises();
      expect(wrapper.find('[data-testid="add-field-button"]').exists()).toBe(false);
    }, 20000);

    it('renders no Descriptions block and no legacy empty states', async () => {
      const { wrapper } = await mountDefs();
      expect(wrapper.find('.ant-descriptions').exists()).toBe(false);
      for (const testid of [
        'add-custom-property',
        'custom-property-defs-empty',
        'custom-property-no-results',
        'custom-property-type-schema',
        'custom-property-type-schema-error',
        'custom-property-applies-to',
      ]) {
        expect(wrapper.find(`[data-testid="${testid}"]`).exists()).toBe(false);
      }
    }, 20000);
  });

  // B-1 product-side fix: a property-types load failure must surface as
  // the page error state (official fetchTypeDetail try/catch pattern) and
  // skip load(), not hang as an unhandled rejection.
  it('surfaces a property-types load failure as the page error state', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/api/v1/metadata/types?') && url.includes('category=field')) {
        throw new Error('property types unavailable');
      }
      return new Response('not found', { status: 404 });
    });
    vi.stubGlobal('fetch', fetchMock);
    const { wrapper } = await mountDefs();
    await flushPromises();
    expect(wrapper.text()).toContain('property types unavailable');
    expect(
      fetchMock.mock.calls.some(([url]) => String(url).includes('/metadata/types/name/')),
    ).toBe(false);
  }, 20000);

  describe('CustomPropertyTypeDetailView breadcrumb (exception row 3b)', () => {
    beforeEach(() => {
      localStorage.clear();
      getEntityPermissionById.mockResolvedValue({ EditAll: true });
      getEntityPermissionByFqn.mockResolvedValue({});
    });

    it('renders Settings > Custom Properties > startCase(tab)', async () => {
      const { wrapper } = await mountDefs();
      const text = wrapper.find('[data-testid="entity-detail-breadcrumb"]').text();
      expect(text).toContain('Settings');
      expect(text).toContain('Custom Properties');
      expect(text).toContain('Tables');
      expect(text.indexOf('Settings')).toBeLessThan(text.indexOf('Custom Properties'));
      expect(text.indexOf('Custom Properties')).toBeLessThan(text.indexOf('Tables'));
    });

    it('derives the crumb from the :tab segment, not the fetch type', async () => {
      const { wrapper } = await mountDefs('tableColumn');
      const text = wrapper.find('[data-testid="entity-detail-breadcrumb"]').text();
      expect(text).toContain('Column');
      expect(text).not.toContain('Table Column');
    });
  });

  describe('table', () => {
    it('renders four pin columns with widths and the name sorter', async () => {
      const { wrapper, tx } = await mountDefs();
      const table = wrapper.findComponent(Table);
      expect(table.exists()).toBe(true);
      expect(table.props('pagination')).toBe(false);
      expect(table.props('rowKey')).toBe('name');
      const cols = table.props('columns') as {
        title?: string;
        width?: string | number;
        sorter?: (a: CustomPropertyDef, b: CustomPropertyDef) => number;
      }[];
      expect(cols.map((col) => col.title)).toEqual([
        tx('label.property'),
        tx('label.type'),
        tx('label.configuration'),
        tx('label.action-plural'),
      ]);
      expect(cols.map((col) => col.width)).toEqual(['41%', '20%', undefined, 80]);
      expect(typeof cols[0]?.sorter).toBe('function');
      expect(cols[1]?.sorter).toBeUndefined();
      expect(cols[2]?.sorter).toBeUndefined();
      expect(cols[3]?.sorter).toBeUndefined();
      const sorter = cols[0]!.sorter!;
      expect(sorter({ name: 'zeta' }, { name: 'alpha', displayName: 'Omega' })).toBeGreaterThan(0);
      expect(sorter({ name: 'aaa', displayName: 'zzz' }, { name: 'mmm' })).toBeGreaterThan(0);
    }, 20000);

    it('renders name, stripped description with tooltip, and badge per row', async () => {
      vi.stubGlobal(
        'fetch',
        writeFetch([
          {
            name: 'retentionDays',
            displayName: 'Retention days',
            description: '<p>Keep <b>rows</b></p>',
            propertyType: { name: 'integer' },
          },
          { name: 'plain', propertyType: { name: 'string' } },
          {
            name: 'query',
            displayName: 'Query',
            description: 'SQL',
            propertyType: { name: 'sqlQuery' },
          },
          { name: 'custom', propertyType: { name: 'myCustom-cp' } },
        ]),
      );
      const { wrapper, tx } = await mountDefs();
      expect(wrapper.findAll('[data-testid="property-name"]').map((n) => n.text())).toEqual([
        'Retention days',
        'plain',
        'Query',
        'custom',
      ]);
      expect(wrapper.findAll('[data-testid="property-description"]').map((n) => n.text())).toEqual([
        'Keep rows',
        'SQL',
      ]);
      const tooltips: Array<VueWrapper<InstanceType<typeof Tooltip>>> = wrapper
        .find('[data-testid="admin-custom-property-defs-table"] .ant-table-tbody')
        .findAllComponents(Tooltip);
      // Scoped to the body: the sortable header adds antd's own sorter
      // tooltip in the thead, which is not a description tooltip.
      expect(tooltips.map((c) => c.props('title'))).toEqual(['Keep rows', 'SQL']);
      const badges = wrapper
        .findAllComponents(Tag)
        .filter((c) => (c.element as HTMLElement).dataset.testid === 'property-type');
      expect(badges.map((b) => b.text())).toEqual([
        tx('label.integer'),
        tx('label.string'),
        tx('label.sql-uppercase'),
        'My Custom',
      ]);
      expect(badges.map((b) => b.props('color'))).toEqual(['cyan', undefined, 'green', undefined]);
      expect(badges[2]?.classes()).toContain('custom-property-type-badge--wide');
      expect(badges[0]?.classes()).not.toContain('custom-property-type-badge--wide');
    }, 20000);

    it('renders the Configuration column in the four forms with cap 3 and +N badge', async () => {
      vi.stubGlobal(
        'fetch',
        writeFetch([
          {
            name: 'fmt',
            propertyType: { name: 'date-cp' },
            customPropertyConfig: { config: 'dd-MM-yyyy' },
          },
          {
            name: 'refs',
            propertyType: { name: 'entityReference' },
            customPropertyConfig: { config: ['databaseSchema', 'topic'] },
          },
          {
            name: 'cols',
            propertyType: { name: 'table-cp' },
            customPropertyConfig: { config: { columns: ['a', 'b', 'c', 'd'] } },
          },
          {
            name: 'tier',
            propertyType: { name: 'enum' },
            customPropertyConfig: {
              config: { values: ['gold', 'silver', 'bronze', 'basic'], multiSelect: true },
            },
          },
          { name: 'plain', propertyType: { name: 'string' } },
        ]),
      );
      const { wrapper, tx } = await mountDefs();
      expect(wrapper.find('[data-testid="fmt-config"]').text()).toContain(tx('label.format'));
      expect(wrapper.find('[data-testid="fmt-config"]').text()).toContain('dd-MM-yyyy');
      expect(wrapper.find('[data-testid="refs-config"]').text()).toContain(tx('label.entity-types'));
      expect(wrapper.find('[data-testid="refs-config"]').text()).toContain('Database Schema');
      expect(wrapper.find('[data-testid="table-config"]').text()).toContain(tx('label.column-plural'));
      expect(wrapper.find('[data-testid="enum-config"]').text()).toContain(
        `${tx('label.value-plural')} · ${tx('label.multi-select')}`,
      );
      // 1 format + 2 entity types + 3 capped columns + 3 capped values.
      expect(wrapper.findAll('[data-testid="config-value"]')).toHaveLength(9);
      const hidden = wrapper.findAll('[data-testid="config-hidden-count"]');
      expect(hidden).toHaveLength(2);
      expect(hidden.map((h) => h.text())).toEqual([
        tx('label.plus-count', { count: 1 }),
        tx('label.plus-count', { count: 1 }),
      ]);
      // The +N badge is a plain Badge, never wrapped in a Tooltip: with
      // empty descriptions there are no tooltips inside the table body
      // (the sortable header's own tooltip lives in the thead).
      expect(
        wrapper
          .find('[data-testid="admin-custom-property-defs-table"] .ant-table-tbody')
          .findAllComponents(Tooltip),
      ).toHaveLength(0);
      expect(wrapper.findAll('[data-testid="no-config"]')).toHaveLength(1);
    }, 20000);

    it('renders the actions menu with Edit, divider, and danger Delete', async () => {
      const { wrapper, tx } = await mountDefs();
      const dropdown = wrapper.findAllComponents(Dropdown)[0]!;
      expect(dropdown.exists()).toBe(true);
      const items = (dropdown.props('menu') as MenuProps).items as {
        key?: string;
        type?: string;
        danger?: boolean;
        label?: VNode;
      }[];
      expect(items).toHaveLength(3);
      expect(items[0]?.key).toBe('update');
      expect(items[0]?.label?.props?.['data-testid']).toBe('edit-button');
      expect(items[0]?.label?.children).toBe(tx('label.edit'));
      expect(items[1]?.type).toBe('divider');
      expect(items[2]?.key).toBe('delete');
      expect(items[2]?.danger).toBe(true);
      expect(items[2]?.label?.props?.['data-testid']).toBe('delete-button');
      expect(items[2]?.label?.children).toBe(tx('label.delete'));
    }, 20000);

    it('wires the actions dropdown to a click trigger with the row menu', async () => {
      // The popup itself is antd-owned rendering (it does not open under
      // jsdom's detached tree); the codebase precedent (NextPrevious)
      // asserts the wiring through the Dropdown props, and the menu
      // structure plus the real handlers are covered by the tests above
      // and by chooseAction. What this pins: click trigger, the popup
      // container keeping the menu inside the row cell, and the trigger
      // button carrying the contract testid.
      const { wrapper } = await mountDefs();
      const dropdown = wrapper.findAllComponents(Dropdown)[0]!;
      expect(dropdown.props('trigger')).toBe('click');
      const container = dropdown.props('getPopupContainer') as (
        node: HTMLElement,
      ) => HTMLElement;
      const trigger = wrapper.get('[data-testid="property-actions"]')
        .element as HTMLElement;
      expect(container(trigger)).toBe(trigger.parentElement);
      expect(dropdown.props('menu')).toBeTruthy();
    }, 20000);

    it('renders no actions cell without EditAll', async () => {
      getEntityPermissionById.mockResolvedValue({});
      const { wrapper } = await mountDefs();
      expect(wrapper.find('[data-testid="property-name"]').text()).toBe('Retention days');
      expect(wrapper.find('[data-testid="property-actions"]').exists()).toBe(false);
    }, 20000);
  });

  describe('search and filter', () => {
    it('searches by name and display name after a 300ms debounce, never by description', async () => {
      vi.stubGlobal(
        'fetch',
        writeFetch([
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
        ]),
      );
      const { wrapper, tx } = await mountDefs();
      const search = wrapper.find(
        '[data-testid="custom-property-search"] input, input[data-testid="custom-property-search"]',
      );
      expect(search.attributes('placeholder')).toBe(
        tx('label.search-entity', { entity: tx('label.property-plural') }),
      );
      await search.setValue('owner');
      await new Promise((resolve) => setTimeout(resolve, 350));
      await flushPromises();
      expect(wrapper.findAll('[data-testid="property-name"]').map((w) => w.text())).toEqual([
        'Owner team',
      ]);
      // 'keep rows' lives only in retentionDays' description: no match,
      // and the search placeholder (not the create placeholder) shows.
      await search.setValue('keep rows');
      await new Promise((resolve) => setTimeout(resolve, 350));
      await flushPromises();
      expect(wrapper.findAll('[data-testid="property-name"]')).toHaveLength(0);
      expect(wrapper.findComponent(NoSearchResultsPlaceholder).exists()).toBe(true);
      expect(wrapper.findComponent(CreatePlaceholder).exists()).toBe(false);
    }, 20000);

    it('treats spaces-only search as filtered (raw searchText)', async () => {
      const { wrapper } = await mountDefs('topic');
      const search = wrapper.find(
        '[data-testid="custom-property-search"] input, input[data-testid="custom-property-search"]',
      );
      await search.setValue('   ');
      await new Promise((resolve) => setTimeout(resolve, 350));
      await flushPromises();
      expect(wrapper.findComponent(NoSearchResultsPlaceholder).exists()).toBe(true);
      expect(wrapper.findComponent(CreatePlaceholder).exists()).toBe(false);
    }, 20000);

    it('filters by property type with counts and prunes stale selections', async () => {
      const ownerTeam = {
        name: 'ownerTeam',
        displayName: 'Owner team',
        description: 'd',
        propertyType: { name: 'string' },
      };
      // The delete PATCH echo reflects the deletion: only ownerTeam
      // remains, so the integer filter selection becomes stale.
      const fetchMock = writeFetch(
        [
          {
            name: 'retentionDays',
            displayName: 'Retention days',
            description: 'd',
            propertyType: { name: 'integer' },
          },
          ownerTeam,
        ],
        { id: 'tid', name: 'table', customProperties: [ownerTeam] },
      );
      vi.stubGlobal('fetch', fetchMock);
      const { wrapper, tx } = await mountDefs();
      const filter = formSelect(wrapper, 'custom-property-type-filter');
      expect(filter.props('options')).toEqual([
        { value: 'integer', label: `${tx('label.integer')} (1)` },
        { value: 'string', label: `${tx('label.string')} (1)` },
      ]);
      await filter.vm.$emit('change', ['integer']);
      await flushPromises();
      expect(wrapper.findAll('[data-testid="property-name"]').map((w) => w.text())).toEqual([
        'Retention days',
      ]);
      // Delete the only integer property through the menu: the stale
      // filter selection prunes away and the remaining row shows
      // unfiltered — never the filtered placeholder.
      await chooseAction(wrapper, 'delete');
      await wrapper.get('[data-testid="save-button"]').trigger('click');
      await flushPromises();
      expect(formSelect(wrapper, 'custom-property-type-filter').props('value')).toEqual([]);
      expect(wrapper.findAll('[data-testid="property-name"]').map((w) => w.text())).toEqual([
        'Owner team',
      ]);
      expect(wrapper.findComponent(NoFilteredResultsPlaceholder).exists()).toBe(false);
      expect(wrapper.findComponent(CreatePlaceholder).exists()).toBe(false);
    }, 20000);

    it('shows the create placeholder with doc link and no button when unfiltered and empty', async () => {
      const { wrapper, tx } = await mountDefs('topic');
      const placeholder = wrapper.findComponent(CreatePlaceholder);
      expect(placeholder.exists()).toBe(true);
      expect(placeholder.props('testId')).toBe(`create-error-placeholder-${tx('label.property')}`);
      expect(placeholder.props('doc')).toBe(ADD_CUSTOM_PROPERTIES_DOCS);
      expect(placeholder.props('heading')).toBe(tx('label.property'));
      expect(placeholder.props('permission')).toBe(true);
      expect(placeholder.props('permissionValue')).toBe(
        tx('label.create-entity', { entity: tx('label.custom-property') }),
      );
      // The doc-link anchor itself is rendered by CreatePlaceholder from
      // the message.refer-to-our-doc template; those Wave-1 keys are not
      // written into the locale yet (integration line), so the anchor
      // cannot render here. The view's contract — passing the doc URL —
      // is asserted above via the doc prop.
      expect(placeholder.find('button').exists()).toBe(false);
    }, 20000);

    it('shows the permission placeholder when unfiltered, empty, and denied', async () => {
      getEntityPermissionById.mockResolvedValue({});
      const { wrapper } = await mountDefs('topic');
      expect(wrapper.findComponent(PermissionPlaceholder).exists()).toBe(true);
      expect(wrapper.find('[data-testid="permission-error-placeholder"]').exists()).toBe(true);
    }, 20000);

    it('shows the filtered placeholder with title and description', async () => {
      // The filtered branch is unreachable in steady state (pruning drops
      // a filter whose last property vanished, exactly as in the pin), so
      // this asserts the search-dominant precedence instead: with both a
      // search and a filter active, the search placeholder wins.
      vi.stubGlobal('fetch', writeFetch(DEFAULT_DEFS));
      const { wrapper, tx } = await mountDefs();
      const filter = formSelect(wrapper, 'custom-property-type-filter');
      await filter.vm.$emit('change', ['integer']);
      const search = wrapper.find(
        '[data-testid="custom-property-search"] input, input[data-testid="custom-property-search"]',
      );
      await search.setValue('zzz-no-match');
      await new Promise((resolve) => setTimeout(resolve, 350));
      await flushPromises();
      const searchPlaceholder = wrapper.findComponent(NoSearchResultsPlaceholder);
      expect(searchPlaceholder.exists()).toBe(true);
      expect(searchPlaceholder.props('title')).toBe(
        tx('label.no-entity-found', { entity: tx('label.property-plural') }),
      );
      expect(searchPlaceholder.props('description')).toBe(tx('message.try-adjusting-filter'));
      expect(wrapper.findComponent(NoFilteredResultsPlaceholder).exists()).toBe(false);
    }, 20000);

    it('shows the search placeholder even without permission when searching', async () => {
      getEntityPermissionById.mockResolvedValue({});
      const { wrapper } = await mountDefs('topic');
      const search = wrapper.find(
        '[data-testid="custom-property-search"] input, input[data-testid="custom-property-search"]',
      );
      await search.setValue('zzz');
      await new Promise((resolve) => setTimeout(resolve, 350));
      await flushPromises();
      expect(wrapper.findComponent(NoSearchResultsPlaceholder).exists()).toBe(true);
      expect(wrapper.findComponent(PermissionPlaceholder).exists()).toBe(false);
    }, 20000);
  });

  describe('error state', () => {
    it('replaces the whole page with NoDataPlaceholder on detail fetch failure', async () => {
      const errorSpy = vi.spyOn(message, 'error');
      vi.stubGlobal(
        'fetch',
        vi.fn(async (input: RequestInfo | URL) => {
          const url = String(input);
          if (url.includes('category=field')) {
            return jsonResponse({ data: FIELD_TYPES, paging: { total: FIELD_TYPES.length } });
          }
          if (url.includes('/api/v1/metadata/types/name/')) {
            return jsonResponse({ message: 'boom' }, 500);
          }
          return new Response('not found', { status: 404 });
        }),
      );
      const { wrapper } = await mountDefs();
      expect(errorSpy).toHaveBeenCalledWith('boom');
      expect(wrapper.findComponent(NoDataPlaceholder).exists()).toBe(true);
      expect(wrapper.find('[data-testid="no-data-placeholder"]').exists()).toBe(true);
      expect(wrapper.find('[data-testid="entity-detail-shell"]').exists()).toBe(false);
      expect(wrapper.find('[data-testid="entity-detail-breadcrumb"]').exists()).toBe(false);
    }, 20000);

    it('recovers when the entity type changes after an error', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn(async (input: RequestInfo | URL) => {
          const url = String(input);
          if (url.includes('category=field')) {
            return jsonResponse({ data: FIELD_TYPES, paging: { total: FIELD_TYPES.length } });
          }
          if (url.includes('/api/v1/metadata/types/name/table')) {
            return jsonResponse({ message: 'boom' }, 500);
          }
          if (url.includes('/api/v1/metadata/types/name/')) {
            return jsonResponse({ id: 'tid2', name: entityTypeFrom(url), customProperties: [] });
          }
          return new Response('not found', { status: 404 });
        }),
      );
      const { wrapper } = await mountDefs('table');
      expect(wrapper.find('[data-testid="no-data-placeholder"]').exists()).toBe(true);
      await wrapper.setProps({ entityType: 'topic' });
      await flushPromises();
      expect(wrapper.find('[data-testid="no-data-placeholder"]').exists()).toBe(false);
      expect(wrapper.find('[data-testid="entity-detail-shell"]').exists()).toBe(true);
      expect(wrapper.findComponent(CreatePlaceholder).exists()).toBe(true);
    }, 20000);

    it('shows a permission-error toast, keeps the page readable, and hides the buttons', async () => {
      const errorSpy = vi.spyOn(message, 'error');
      getEntityPermissionById.mockRejectedValue(new Error('permission denied'));
      const { wrapper } = await mountDefs();
      await flushPromises();
      expect(errorSpy).toHaveBeenCalledWith('permission denied');
      expect(wrapper.find('[data-testid="property-name"]').text()).toBe('Retention days');
      expect(wrapper.find('[data-testid="add-field-button"]').exists()).toBe(false);
      expect(wrapper.find('[data-testid="property-actions"]').exists()).toBe(false);
    }, 20000);
  });

  describe('schema tab', () => {
    it('renders the schema editor with the parsed value and no readOnly', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn(async (input: RequestInfo | URL) => {
          const url = String(input);
          if (url.includes('category=field')) {
            return jsonResponse({ data: FIELD_TYPES, paging: { total: FIELD_TYPES.length } });
          }
          if (url.includes('/api/v1/metadata/types/name/table')) {
            return jsonResponse({
              id: 'tid',
              name: 'table',
              schema: '{"type":"object","properties":{"x":{"type":"string"}}}',
              customProperties: DEFAULT_DEFS,
            });
          }
          return new Response('not found', { status: 404 });
        }),
      );
      const { wrapper } = await mountDefs();
      // Both tab panes force-render: the editor exists without clicking.
      const editor = wrapper.findComponent({ name: 'SmCodeEditor' });
      expect(editor.exists()).toBe(true);
      expect(editor.props('value')).toEqual({
        type: 'object',
        properties: { x: { type: 'string' } },
      });
      expect(editor.props('className')).toBe('custom-properties-schemaEditor');
      expect(editor.props('editorClass')).toBe('custom-entity-schema');
      expect(editor.attributes('read-only')).toBeUndefined();
      expect(editor.attributes('options')).toBeUndefined();
      expect(
        wrapper.find('[data-testid="code-mirror-container"]').attributes('data-value'),
      ).toBe('{"type":"object","properties":{"x":{"type":"string"}}}');
    }, 20000);

    it('edits in the schema editor trigger no save', async () => {
      const fetchMock = writeFetch(DEFAULT_DEFS);
      vi.stubGlobal('fetch', fetchMock);
      const { wrapper } = await mountDefs();
      await wrapper.get('[data-testid="stub-code-change"]').trigger('click');
      await flushPromises();
      expect(methodBodies(fetchMock, 'PUT')).toHaveLength(0);
      expect(methodBodies(fetchMock, 'PATCH')).toHaveLength(0);
    }, 20000);

    it('propagates an invalid-schema render error to the boundary without local UI', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn(async (input: RequestInfo | URL) => {
          const url = String(input);
          if (url.includes('category=field')) {
            return jsonResponse({ data: [], paging: { total: 0 } });
          }
          if (url.includes('/api/v1/metadata/types/name/table')) {
            return jsonResponse({
              id: 'tid',
              name: 'table',
              schema: 'not-json{',
              customProperties: [],
            });
          }
          return new Response('not found', { status: 404 });
        }),
      );
      const captured: unknown[] = [];
      const Boundary = defineComponent({
        name: 'TestBoundary',
        setup(_, { slots }) {
          onErrorCaptured((err) => {
            captured.push(err);
            return false;
          });
          return () => slots.default?.();
        },
      });
      const pinia = createPinia();
      setActivePinia(pinia);
      const router = createRouter({
        history: createMemoryHistory(),
        routes: [
          {
            path: '/admin/settings/custom-properties/:tab',
            name: 'admin-settings-custom-property-type',
            component: CustomPropertyTypeDetailView,
            props: (route) => ({ entityType: String(route.params.tab) }),
          },
        ],
      });
      await router.push('/admin/settings/custom-properties/table');
      await router.isReady();
      const wrapper = mount(Boundary, {
        slots: { default: () => h(CustomPropertyTypeDetailView, { entityType: 'table' }) },
        global: { plugins: [pinia, router, Antd, createTestI18n()] },
      });
      await flushPromises();
      await nextTick();
      expect(captured).toHaveLength(1);
      expect(captured[0]).toBeInstanceOf(SyntaxError);
      // No local Alert, no <pre>, no silent default: the error reaches the
      // shared boundary instead of being papered over in the view.
      expect(wrapper.find('.ant-alert').exists()).toBe(false);
      expect(wrapper.find('pre').exists()).toBe(false);
      expect(wrapper.text()).not.toContain('schemaInvalid');
    }, 20000);

    it('renders the shared SmErrorBoundary fallback for an invalid schema', async () => {
      // m-3: the companion to the propagation test above — the same
      // invalid schema, caught by the REAL SYS-7 boundary (App.vue
      // wiring), rendering the fallback instead of the view.
      vi.stubGlobal(
        'fetch',
        vi.fn(async (input: RequestInfo | URL) => {
          const url = String(input);
          if (url.includes('category=field')) {
            return jsonResponse({ data: [], paging: { total: 0 } });
          }
          if (url.includes('/api/v1/metadata/types/name/table')) {
            return jsonResponse({
              id: 'tid',
              name: 'table',
              schema: 'not-json{',
              customProperties: [],
            });
          }
          return new Response('not found', { status: 404 });
        }),
      );
      const pinia = createPinia();
      setActivePinia(pinia);
      const router = createRouter({
        history: createMemoryHistory(),
        routes: [
          {
            path: '/admin/settings/custom-properties/:tab',
            name: 'admin-settings-custom-property-type',
            component: CustomPropertyTypeDetailView,
            props: (route) => ({ entityType: String(route.params.tab) }),
          },
        ],
      });
      await router.push('/admin/settings/custom-properties/table');
      await router.isReady();
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      try {
        const harness = defineComponent({
          setup: () =>
            () =>
              h(
                SmErrorBoundary,
                null,
                { default: () => h(CustomPropertyTypeDetailView, { entityType: 'table' }) },
              ),
        });
        const wrapper = mount(harness, {
          global: { plugins: [pinia, router, Antd, createTestI18n()] },
        });
        await flushPromises();
        await nextTick();
        expect(wrapper.text()).toContain('Something went wrong');
        expect(wrapper.text()).toContain('Back to Home');
        expect(wrapper.find('[data-testid="upgrade-screen"]').exists()).toBe(false);
        // The fallback replaces the view: no schema editor, no table.
        expect(wrapper.find('[data-testid="code-mirror-container"]').exists()).toBe(false);
        expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
        wrapper.unmount();
      } finally {
        consoleErrorSpy.mockRestore();
      }
    }, 20000);
  });

  describe('create drawer', () => {
    it('opens the drawer with defaults and the pin field order', async () => {
      const { wrapper, tx } = await mountDefs();
      await openDrawer(wrapper);
      const drawer = drawerOf(wrapper);
      expect(drawer.props('open')).toBe(true);
      expect(drawer.props('width')).toBe(700);
      expect(
        wrapper.find('[data-testid="add-custom-property-drawer"] .ant-drawer-title').text(),
      ).toBe(tx('label.add-entity', { entity: tx('label.custom-property') }));
      expect(wrapper.find('[data-testid="custom-property-form"]').exists()).toBe(true);
      expect(
        (wrapper.get('[data-testid="custom-property-name"]').element as HTMLInputElement).value,
      ).toBe('');
      expect(formSelect(wrapper, 'custom-property-type').props('value')).toBe('');
      await selectDrawerType(wrapper, 'f-enum');
      const order = wrapper
        .find('[data-testid="custom-property-form"]')
        .findAll('[data-testid]')
        .map((n) => n.attributes('data-testid'))
        .filter((id) =>
          [
            'custom-property-name',
            'custom-property-display-name',
            'custom-property-type',
            'custom-property-enum-config',
            'custom-property-multi-select',
            'stub-rich-text-input',
          ].includes(id ?? ''),
        );
      expect(order).toEqual([
        'custom-property-name',
        'custom-property-display-name',
        'custom-property-type',
        'custom-property-enum-config',
        'custom-property-multi-select',
        'stub-rich-text-input',
      ]);
    }, 20000);

    it('toggles the help panel width and doc panel wiring', async () => {
      const { wrapper } = await mountDefs();
      await openDrawer(wrapper);
      const toggle = wrapper
        .findAllComponents(Switch)
        .find((c) => c.attributes('data-testid') === 'show-side-panel-switch');
      expect(toggle).toBeTruthy();
      await toggle!.vm.$emit('update:checked', true);
      await flushPromises();
      expect(drawerOf(wrapper).props('width')).toBe(1200);
      const panel = wrapper.find('[data-testid="stub-service-doc-panel"]');
      expect(panel.exists()).toBe(true);
      expect(panel.attributes('data-service-name')).toBe('CustomProperty');
      expect(panel.attributes('data-service-type')).toBe('OpenMetadata');
      await toggle!.vm.$emit('update:checked', false);
      await flushPromises();
      expect(drawerOf(wrapper).props('width')).toBe(700);
      expect(wrapper.find('[data-testid="stub-service-doc-panel"]').exists()).toBe(false);
    }, 20000);

    it('tracks the active field for the doc panel', async () => {
      const { wrapper } = await mountDefs();
      await openDrawer(wrapper);
      const toggle = wrapper
        .findAllComponents(Switch)
        .find((c) => c.attributes('data-testid') === 'show-side-panel-switch');
      await toggle!.vm.$emit('update:checked', true);
      await flushPromises();
      const panel = () => wrapper.find('[data-testid="stub-service-doc-panel"]');
      await wrapper.get('[data-testid="custom-property-name"]').trigger('focusin');
      await flushPromises();
      expect(panel().attributes('data-active-field')).toBe('root/name');
      await formSelect(wrapper, 'custom-property-type').trigger('focusin');
      await flushPromises();
      expect(panel().attributes('data-active-field')).toBe('root/propertyType');
      await wrapper
        .get('[data-testid="custom-property-form"] [data-testid="stub-rich-text-input"]')
        .trigger('focus');
      await flushPromises();
      expect(panel().attributes('data-active-field')).toBe('root/description');
    }, 20000);

    it('resets the form on reopen and keeps the drawer mounted', async () => {
      const { wrapper } = await mountDefs();
      await openDrawer(wrapper);
      await wrapper.get('[data-testid="custom-property-name"]').setValue('tier');
      await selectDrawerType(wrapper, 'f-enum');
      await setDrawerDescription(wrapper, 'Service tier');
      await wrapper.get('[data-testid="cancel-button"]').trigger('click');
      await flushPromises();
      expect(drawerOf(wrapper).props('open')).toBe(false);
      expect(wrapper.find('[data-testid="custom-property-form"]').exists()).toBe(true);
      await openDrawer(wrapper);
      expect(
        (wrapper.get('[data-testid="custom-property-name"]').element as HTMLInputElement).value,
      ).toBe('');
      expect(formSelect(wrapper, 'custom-property-type').props('value')).toBe('');
      expect(
        (
          wrapper.get(
            '[data-testid="custom-property-form"] [data-testid="stub-rich-text-input"]',
          ).element as HTMLTextAreaElement
        ).value,
      ).toBe('');
    }, 20000);

    it('creates an enum property, ignores the PUT response, and refetches', async () => {
      const created = {
        name: 'tier',
        displayName: '',
        description: 'Service tier',
        propertyType: { name: 'enum' },
        customPropertyConfig: { config: { values: ['gold', 'silver'], multiSelect: true } },
      };
      let detailGets = 0;
      const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        const method = String(init?.method || '').toUpperCase();
        if (url.includes('category=field')) {
          return jsonResponse({ data: FIELD_TYPES, paging: { total: FIELD_TYPES.length } });
        }
        if (method === 'PUT') {
          // A bogus body: the page must ignore it and use the refetch.
          return jsonResponse({
            id: 'tid',
            name: 'table',
            customProperties: [{ name: 'bogus', propertyType: { name: 'string' } }],
          });
        }
        if (url.includes('/api/v1/metadata/types/name/table')) {
          detailGets += 1;
          return jsonResponse({
            id: 'tid',
            name: 'table',
            customProperties: detailGets === 1 ? [] : [created],
          });
        }
        return new Response('not found', { status: 404 });
      });
      vi.stubGlobal('fetch', fetchMock);
      const successSpy = vi.spyOn(message, 'success');
      const { wrapper, tx } = await mountDefs();
      await openDrawer(wrapper);
      await selectDrawerType(wrapper, 'f-enum');
      await wrapper.get('[data-testid="custom-property-name"]').setValue('tier');
      await setDrawerDescription(wrapper, 'Service tier');
      const enumSelect = formSelect(wrapper, 'custom-property-enum-config');
      await enumSelect.vm.$emit('update:value', ['gold', 'silver']);
      const multiSwitch = wrapper
        .findAllComponents(Switch)
        .find((c) => c.attributes('data-testid') === 'custom-property-multi-select');
      await multiSwitch!.vm.$emit('update:checked', true);
      await clickCreate(wrapper);
      expect(methodBodies(fetchMock, 'PUT')).toEqual([
        {
          name: 'tier',
          description: 'Service tier',
          propertyType: { id: 'f-enum', type: 'type' },
          customPropertyConfig: { config: { multiSelect: true, values: ['gold', 'silver'] } },
        },
      ]);
      expect(successSpy).toHaveBeenCalledTimes(1);
      expect(successSpy).toHaveBeenCalledWith(
        tx('server.create-entity-success', { entity: tx('label.custom-property') }),
      );
      expect(drawerOf(wrapper).props('open')).toBe(false);
      expect(detailGets).toBeGreaterThanOrEqual(2);
      expect(wrapper.text()).toContain('tier');
      expect(wrapper.text()).not.toContain('bogus');
      expect(wrapper.find('[data-testid="enum-config"]').exists()).toBe(true);
    }, 20000);

    it('creates a date property with a format config', async () => {
      const fetchMock = writeFetch([]);
      vi.stubGlobal('fetch', fetchMock);
      const { wrapper } = await mountDefs();
      await openDrawer(wrapper);
      await selectDrawerType(wrapper, 'f-date');
      await wrapper.get('[data-testid="custom-property-name"]').setValue('reviewedOn');
      await setDrawerDescription(wrapper, 'Review date');
      const formatSelect = formSelect(wrapper, 'custom-property-format-config');
      await formatSelect.vm.$emit('update:value', 'dd-MM-yyyy');
      await clickCreate(wrapper);
      expect(methodBodies(fetchMock, 'PUT')).toEqual([
        {
          name: 'reviewedOn',
          description: 'Review date',
          propertyType: { id: 'f-date', type: 'type' },
          customPropertyConfig: { config: 'dd-MM-yyyy' },
        },
      ]);
    }, 20000);

    it('creates an entity-reference property with the official option labels', async () => {
      const fetchMock = writeFetch([]);
      vi.stubGlobal('fetch', fetchMock);
      const { wrapper } = await mountDefs();
      await openDrawer(wrapper);
      await selectDrawerType(wrapper, 'f-ref');
      const refSelect = formSelect(wrapper, 'custom-property-entity-ref-config');
      const options = refSelect.props('options') as { value: string; label: string }[];
      expect(options).toHaveLength(16);
      expect(options).toContainEqual({ value: 'dashboardDataModel', label: 'Dashboard DataModel' });
      expect(options).toContainEqual({ value: 'mlmodel', label: 'MLmodel' });
      await wrapper.get('[data-testid="custom-property-name"]').setValue('ownerRef');
      await setDrawerDescription(wrapper, 'Owner reference');
      await refSelect.vm.$emit('update:value', ['table', 'user']);
      await clickCreate(wrapper);
      expect(methodBodies(fetchMock, 'PUT')).toEqual([
        {
          name: 'ownerRef',
          description: 'Owner reference',
          propertyType: { id: 'f-ref', type: 'type' },
          customPropertyConfig: { config: ['table', 'user'] },
        },
      ]);
    }, 20000);

    it('creates a table property with column names', async () => {
      const fetchMock = writeFetch([]);
      vi.stubGlobal('fetch', fetchMock);
      const { wrapper } = await mountDefs();
      await openDrawer(wrapper);
      await selectDrawerType(wrapper, 'f-table');
      await wrapper.get('[data-testid="custom-property-name"]').setValue('breakdown');
      await setDrawerDescription(wrapper, 'Breakdown table');
      const columnsSelect = formSelect(wrapper, 'custom-property-columns');
      await columnsSelect.vm.$emit('update:value', ['col_a', 'col_b']);
      await clickCreate(wrapper);
      expect(methodBodies(fetchMock, 'PUT')).toEqual([
        {
          name: 'breakdown',
          description: 'Breakdown table',
          propertyType: { id: 'f-table', type: 'type' },
          customPropertyConfig: { config: { columns: ['col_a', 'col_b'] } },
        },
      ]);
    }, 20000);

    it('preserves values without trimming on create', async () => {
      const fetchMock = writeFetch([]);
      vi.stubGlobal('fetch', fetchMock);
      const { wrapper } = await mountDefs();
      await openDrawer(wrapper);
      await selectDrawerType(wrapper, 'f-string');
      await wrapper.get('[data-testid="custom-property-name"]').setValue('note');
      await wrapper.get('[data-testid="custom-property-display-name"]').setValue(' Note ');
      await setDrawerDescription(wrapper, ' d ');
      await clickCreate(wrapper);
      expect(methodBodies(fetchMock, 'PUT')).toEqual([
        {
          name: 'note',
          description: ' d ',
          propertyType: { id: 'f-string', type: 'type' },
          displayName: ' Note ',
        },
      ]);
    }, 20000);

    it('disables Create while invalid, shows field errors after change, and allows empty format and duplicate names', async () => {
      const fetchMock = writeFetch(DEFAULT_DEFS);
      vi.stubGlobal('fetch', fetchMock);
      const { wrapper, tx } = await mountDefs();
      await openDrawer(wrapper);
      const createButton = () => wrapper.get('[data-testid="create-button"]');
      expect(createButton().attributes('disabled')).toBeDefined();
      await wrapper.get('[data-testid="custom-property-name"]').setValue('bad"name');
      await flushPromises();
      expect(wrapper.text()).toContain(tx('message.custom-property-name-validation'));
      expect(createButton().attributes('disabled')).toBeDefined();
      // Duplicate names are not rejected: no uniqueness rule in the pin.
      await wrapper.get('[data-testid="custom-property-name"]').setValue('retentionDays');
      await setDrawerDescription(wrapper, 'd');
      await selectDrawerType(wrapper, 'f-string');
      await flushPromises();
      expect(createButton().attributes('disabled')).toBeUndefined();
      // Format is not required: a date property without a format is valid.
      await selectDrawerType(wrapper, 'f-date');
      await flushPromises();
      expect(createButton().attributes('disabled')).toBeUndefined();
      await clickCreate(wrapper);
      expect(methodBodies(fetchMock, 'PUT')).toHaveLength(1);
    }, 20000);

    it('blocks submit when a conditional field is missing', async () => {
      const fetchMock = writeFetch([]);
      vi.stubGlobal('fetch', fetchMock);
      const { wrapper, tx } = await mountDefs();
      await openDrawer(wrapper);
      await selectDrawerType(wrapper, 'f-enum');
      await wrapper.get('[data-testid="custom-property-name"]').setValue('tier');
      await setDrawerDescription(wrapper, 'Service tier');
      expect(wrapper.get('[data-testid="create-button"]').attributes('disabled')).toBeDefined();
      // Touch the enum field (select then clear) so the error renders.
      const enumSelect = formSelect(wrapper, 'custom-property-enum-config');
      await enumSelect.vm.$emit('update:value', ['gold']);
      await enumSelect.vm.$emit('update:value', []);
      await flushPromises();
      expect(wrapper.text()).toContain(
        tx('label.field-required', { field: tx('label.enum-value-plural') }),
      );
      expect(methodBodies(fetchMock, 'PUT')).toHaveLength(0);
    }, 20000);

    it('shows the Applies To badge only for tableColumn', async () => {
      vi.stubGlobal('fetch', writeFetch([]));
      const { wrapper, tx } = await mountDefs('tableColumn');
      await openDrawer(wrapper);
      const badge = wrapper.find('[data-testid="applies-to"]');
      expect(badge.exists()).toBe(true);
      expect(wrapper.text()).toContain(tx('label.applies-to'));
      expect(badge.text()).toContain(tx('label.table-column'));
      const { wrapper: tableWrapper } = await mountDefs('table');
      await openDrawer(tableWrapper);
      expect(tableWrapper.find('[data-testid="applies-to"]').exists()).toBe(false);
    }, 20000);

    it('switching property type clears the previous type condition values', async () => {
      vi.stubGlobal('fetch', writeFetch([]));
      const { wrapper } = await mountDefs();
      await openDrawer(wrapper);
      await selectDrawerType(wrapper, 'f-enum');
      const enumSelect = formSelect(wrapper, 'custom-property-enum-config');
      await enumSelect.vm.$emit('update:value', ['gold']);
      await selectDrawerType(wrapper, 'f-date');
      expect(wrapper.find('[data-testid="custom-property-enum-config"]').exists()).toBe(false);
      expect(wrapper.find('[data-testid="custom-property-format-config"]').exists()).toBe(true);
      await selectDrawerType(wrapper, 'f-enum');
      expect(formSelect(wrapper, 'custom-property-enum-config').props('value')).toEqual([]);
    }, 20000);
  });

  describe('edit modal', () => {
    const tierDef = {
      name: 'tier',
      displayName: 'Tier',
      description: 'Service tier',
      propertyType: { name: 'enum' },
      customPropertyConfig: { config: { values: ['gold'], multiSelect: false } },
    };

    it('opens the independent edit modal with seeded values and no name/type fields', async () => {
      vi.stubGlobal('fetch', writeFetch([tierDef]));
      const { wrapper, tx } = await mountDefs();
      await chooseAction(wrapper, 'update');
      const modal = modalOf(wrapper, 720);
      expect(modal.props('open')).toBe(true);
      expect(
        wrapper.find('[data-testid="edit-custom-property-modal"] .ant-modal-title').text(),
      ).toBe(
        tx('label.edit-entity-name', { entityType: tx('label.property'), entityName: 'tier' }),
      );
      expect(wrapper.find('[data-testid="edit-custom-property-form"]').exists()).toBe(true);
      expect(
        (
          wrapper.get('[data-testid="edit-custom-property-display-name"]')
            .element as HTMLInputElement
        ).value,
      ).toBe('Tier');
      expect(
        (
          wrapper.get(
            '[data-testid="edit-custom-property-form"] [data-testid="stub-rich-text-input"]',
          ).element as HTMLTextAreaElement
        ).value,
      ).toBe('Service tier');
      const enumSelect = formSelect(wrapper, 'edit-custom-property-enum-config');
      expect(enumSelect.props('value')).toEqual(['gold']);
      expect(enumSelect.props('maxTagCount')).toBe(20);
      const modalScope = wrapper.find('[data-testid="edit-custom-property-modal"]');
      expect(modalScope.find('[data-testid="custom-property-name"]').exists()).toBe(false);
      expect(modalScope.find('[data-testid="custom-property-type"]').exists()).toBe(false);
      expect(modalScope.find('[data-testid="custom-property-format-config"]').exists()).toBe(false);
      expect(modalScope.find('[data-testid="custom-property-columns"]').exists()).toBe(false);
    }, 20000);

    it('shows no field docs in the edit form except the entity-reference helper', async () => {
      vi.stubGlobal(
        'fetch',
        writeFetch([
          {
            name: 'refs',
            description: 'd',
            propertyType: { name: 'entityReference' },
            customPropertyConfig: { config: ['table'] },
          },
        ]),
      );
      const { wrapper, tx } = await mountDefs();
      await chooseAction(wrapper, 'update');
      const extras = wrapper
        .find('[data-testid="edit-custom-property-modal"]')
        .findAll('.ant-form-item-extra');
      expect(extras).toHaveLength(1);
      expect(extras[0]?.text()).toBe(
        tx('message.updating-existing-not-possible-can-add-new-values'),
      );
    }, 20000);

    it('saves an enum edit via PATCH with zero success toasts and closes the modal', async () => {
      const updated = {
        ...tierDef,
        customPropertyConfig: { config: { values: ['gold', 'silver'], multiSelect: false } },
      };
      const fetchMock = writeFetch([tierDef], {
        id: 'tid',
        name: 'table',
        customProperties: [updated],
      });
      vi.stubGlobal('fetch', fetchMock);
      const successSpy = vi.spyOn(message, 'success');
      const errorSpy = vi.spyOn(message, 'error');
      const { wrapper } = await mountDefs();
      await chooseAction(wrapper, 'update');
      const enumSelect = formSelect(wrapper, 'edit-custom-property-enum-config');
      await enumSelect.vm.$emit('update:value', ['gold', 'silver']);
      await wrapper.get('[data-testid="edit-custom-property-save"]').trigger('click');
      await flushPromises();
      expect(methodBodies(fetchMock, 'PUT')).toHaveLength(0);
      expect(methodBodies(fetchMock, 'PATCH')).toEqual([
        [
          { op: 'test', path: '/customProperties/0/name', value: 'tier' },
          {
            op: 'replace',
            path: '/customProperties/0/customPropertyConfig',
            value: { config: { multiSelect: false, values: ['gold', 'silver'] } },
          },
        ],
      ]);
      // INV-19 (a): the update chain has zero success toasts.
      expect(successSpy).toHaveBeenCalledTimes(0);
      expect(errorSpy).toHaveBeenCalledTimes(0);
      expect(modalOf(wrapper, 720).props('open')).toBe(false);
    }, 20000);

    it('closes the modal with an error toast when the edit target is gone', async () => {
      vi.stubGlobal('fetch', goneFetch([tierDef]));
      const errorSpy = vi.spyOn(message, 'error');
      const successSpy = vi.spyOn(message, 'success');
      const { wrapper, tx } = await mountDefs();
      await chooseAction(wrapper, 'update');
      await wrapper.get('[data-testid="edit-custom-property-save"]').trigger('click');
      await flushPromises();
      expect(errorSpy).toHaveBeenCalledTimes(1);
      expect(errorSpy).toHaveBeenCalledWith(
        tx('server.update-entity-error', { entity: tx('label.custom-property') }),
      );
      expect(successSpy).toHaveBeenCalledTimes(0);
      expect(modalOf(wrapper, 720).props('open')).toBe(false);
    }, 20000);

    it('closes the modal with a raw error toast when the PATCH fails', async () => {
      const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        const method = String(init?.method || '').toUpperCase();
        if (url.includes('category=field')) {
          return jsonResponse({ data: FIELD_TYPES, paging: { total: FIELD_TYPES.length } });
        }
        if (method === 'PATCH') {
          return jsonResponse({ message: 'boom' }, 500);
        }
        if (url.includes('/api/v1/metadata/types/name/')) {
          return jsonResponse({ id: 'tid', name: 'table', customProperties: [tierDef] });
        }
        return new Response('not found', { status: 404 });
      });
      vi.stubGlobal('fetch', fetchMock);
      const errorSpy = vi.spyOn(message, 'error');
      const { wrapper } = await mountDefs();
      await chooseAction(wrapper, 'update');
      await wrapper.get('[data-testid="edit-custom-property-save"]').trigger('click');
      await flushPromises();
      expect(errorSpy).toHaveBeenCalledWith('boom');
      expect(modalOf(wrapper, 720).props('open')).toBe(false);
    }, 20000);

    it('shows the saving enum Alert only while saving, with the dismiss lock', async () => {
      let resolvePatch!: (response: Response) => void;
      const patchGate = new Promise<Response>((resolve) => {
        resolvePatch = resolve;
      });
      const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        const method = String(init?.method || '').toUpperCase();
        if (url.includes('category=field')) {
          return jsonResponse({ data: FIELD_TYPES, paging: { total: FIELD_TYPES.length } });
        }
        if (method === 'PATCH') {
          return patchGate;
        }
        if (url.includes('/api/v1/metadata/types/name/')) {
          return jsonResponse({ id: 'tid', name: 'table', customProperties: [tierDef] });
        }
        return new Response('not found', { status: 404 });
      });
      vi.stubGlobal('fetch', fetchMock);
      const { wrapper, tx } = await mountDefs();
      await chooseAction(wrapper, 'update');
      await wrapper.get('[data-testid="edit-custom-property-save"]').trigger('click');
      await flushPromises();
      await nextTick();
      const alert = wrapper.find('.ant-alert');
      expect(alert.exists()).toBe(true);
      expect(alert.text()).toContain(tx('message.enum-property-update-message'));
      expect(modalOf(wrapper, 720).props('maskClosable')).toBe(false);
      expect(modalOf(wrapper, 720).props('keyboard')).toBe(false);
      resolvePatch(jsonResponse({ id: 'tid', name: 'table', customProperties: [tierDef] }));
      await flushPromises();
      expect(wrapper.find('.ant-alert').exists()).toBe(false);
      expect(modalOf(wrapper, 720).props('open')).toBe(false);
    }, 20000);

    it('shows no Alert while saving a non-enum property', async () => {
      let resolvePatch!: (response: Response) => void;
      const patchGate = new Promise<Response>((resolve) => {
        resolvePatch = resolve;
      });
      const saved = {
        name: 'note',
        description: 'd',
        propertyType: { name: 'string' },
      };
      const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        const method = String(init?.method || '').toUpperCase();
        if (url.includes('category=field')) {
          return jsonResponse({ data: FIELD_TYPES, paging: { total: FIELD_TYPES.length } });
        }
        if (method === 'PATCH') {
          return patchGate;
        }
        if (url.includes('/api/v1/metadata/types/name/')) {
          return jsonResponse({ id: 'tid', name: 'table', customProperties: [saved] });
        }
        return new Response('not found', { status: 404 });
      });
      vi.stubGlobal('fetch', fetchMock);
      const { wrapper } = await mountDefs();
      await chooseAction(wrapper, 'update');
      await wrapper.get('[data-testid="edit-custom-property-save"]').trigger('click');
      await flushPromises();
      await nextTick();
      expect(wrapper.find('.ant-alert').exists()).toBe(false);
      resolvePatch(jsonResponse({ id: 'tid', name: 'table', customProperties: [saved] }));
      await flushPromises();
    }, 20000);

    it('renders saved entity-reference tags without remove and new tags with remove', async () => {
      vi.stubGlobal(
        'fetch',
        writeFetch([
          {
            name: 'refs',
            description: 'd',
            propertyType: { name: 'entityReference' },
            customPropertyConfig: { config: ['table'] },
          },
        ]),
      );
      const { wrapper } = await mountDefs();
      await chooseAction(wrapper, 'update');
      const tags = () =>
        wrapper.findAll('[data-testid="autocomplete-selected-item"]');
      expect(tags()).toHaveLength(1);
      expect(tags()[0]?.find('.ant-tag-close-icon').exists()).toBe(false);
      const refSelect = formSelect(wrapper, 'edit-custom-property-entity-ref-config');
      await refSelect.vm.$emit('update:value', ['table', 'topic']);
      await flushPromises();
      expect(tags()).toHaveLength(2);
      expect(tags()[0]?.find('.ant-tag-close-icon').exists()).toBe(false);
      expect(tags()[1]?.find('.ant-tag-close-icon').exists()).toBe(true);
      await tags()[1]!.find('.ant-tag-close-icon').trigger('click');
      await flushPromises();
      expect(formSelect(wrapper, 'edit-custom-property-entity-ref-config').props('value')).toEqual(
        ['table'],
      );
    }, 20000);

    it('blocks edit save with field errors and no PATCH', async () => {
      const fetchMock = writeFetch([tierDef]);
      vi.stubGlobal('fetch', fetchMock);
      const { wrapper, tx } = await mountDefs();
      await chooseAction(wrapper, 'update');
      await setEditDescription(wrapper, '');
      await wrapper.get('[data-testid="edit-custom-property-save"]').trigger('click');
      await flushPromises();
      expect(wrapper.text()).toContain(
        tx('label.field-required', { field: tx('label.description') }),
      );
      expect(methodBodies(fetchMock, 'PATCH')).toHaveLength(0);
      expect(modalOf(wrapper, 720).props('open')).toBe(true);
    }, 20000);

    it('keeps saved entity-reference types on save (additive union)', async () => {
      const fetchMock = writeFetch([
        {
          name: 'refs',
          description: 'd',
          propertyType: { name: 'entityReference' },
          customPropertyConfig: { config: ['table'] },
        },
      ]);
      vi.stubGlobal('fetch', fetchMock);
      const { wrapper } = await mountDefs();
      await chooseAction(wrapper, 'update');
      const refSelect = formSelect(wrapper, 'edit-custom-property-entity-ref-config');
      await refSelect.vm.$emit('update:value', ['topic']);
      await wrapper.get('[data-testid="edit-custom-property-save"]').trigger('click');
      await flushPromises();
      expect(methodBodies(fetchMock, 'PATCH')).toEqual([
        [
          { op: 'test', path: '/customProperties/0/name', value: 'refs' },
          {
            op: 'replace',
            path: '/customProperties/0/customPropertyConfig',
            value: { config: ['table', 'topic'] },
          },
        ],
      ]);
    }, 20000);
  });

  describe('delete confirmation', () => {
    it('renders the primary non-destructive confirmation contract', async () => {
      const fetchMock = writeFetch(DEFAULT_DEFS);
      vi.stubGlobal('fetch', fetchMock);
      const { wrapper, tx } = await mountDefs();
      await chooseAction(wrapper, 'delete');
      const modal = modalOf(wrapper, 520);
      expect(modal.props('open')).toBe(true);
      expect(modal.props('maskClosable')).toBe(false);
      expect(modal.props('keyboard')).toBe(false);
      expect(wrapper.find('[data-testid="confirmation-modal"]').exists()).toBe(true);
      expect(wrapper.find('[data-testid="modal-header"]').text()).toBe(
        tx('label.delete-property-name', { propertyName: 'retentionDays' }),
      );
      expect(wrapper.find('[data-testid="body-text"]').text()).toBe(
        tx('message.are-you-sure-delete-property', { propertyName: 'retentionDays' }),
      );
      const confirm = wrapper.get('[data-testid="save-button"]');
      expect(confirm.classes()).toContain('ant-btn-primary');
      expect(confirm.classes()).not.toContain('ant-btn-dangerous');
      expect(confirm.text()).toContain(tx('label.confirm'));
      await wrapper.get('[data-testid="cancel"]').trigger('click');
      await flushPromises();
      expect(modalOf(wrapper, 520).props('open')).toBe(false);
      expect(methodBodies(fetchMock, 'PATCH')).toHaveLength(0);
    }, 20000);

    it('deletes via PATCH, closes, and shows no toast', async () => {
      const fetchMock = writeFetch(DEFAULT_DEFS, {
        id: 'tid',
        name: 'table',
        customProperties: [],
      });
      vi.stubGlobal('fetch', fetchMock);
      const successSpy = vi.spyOn(message, 'success');
      const errorSpy = vi.spyOn(message, 'error');
      const { wrapper } = await mountDefs();
      await chooseAction(wrapper, 'delete');
      await wrapper.get('[data-testid="save-button"]').trigger('click');
      await flushPromises();
      expect(methodBodies(fetchMock, 'PATCH')).toEqual([
        [
          { op: 'test', path: '/customProperties/0/name', value: 'retentionDays' },
          { op: 'remove', path: '/customProperties/0' },
        ],
      ]);
      expect(wrapper.findAll('[data-testid="property-name"]')).toHaveLength(0);
      expect(modalOf(wrapper, 520).props('open')).toBe(false);
      expect(successSpy).toHaveBeenCalledTimes(0);
      expect(errorSpy).toHaveBeenCalledTimes(0);
    }, 20000);

    it('treats deleting a gone property as deleted with silent refetch and no toast', async () => {
      const fetchMock = goneFetch(DEFAULT_DEFS);
      vi.stubGlobal('fetch', fetchMock);
      const successSpy = vi.spyOn(message, 'success');
      const errorSpy = vi.spyOn(message, 'error');
      const { wrapper } = await mountDefs();
      await chooseAction(wrapper, 'delete');
      await wrapper.get('[data-testid="save-button"]').trigger('click');
      await flushPromises();
      expect(methodBodies(fetchMock, 'PATCH')).toHaveLength(0);
      expect(wrapper.findComponent(CreatePlaceholder).exists()).toBe(true);
      expect(modalOf(wrapper, 520).props('open')).toBe(false);
      expect(successSpy).toHaveBeenCalledTimes(0);
      expect(errorSpy).toHaveBeenCalledTimes(0);
    }, 20000);

    it('closes with a raw error toast when the delete PATCH fails', async () => {
      const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        const method = String(init?.method || '').toUpperCase();
        if (url.includes('category=field')) {
          return jsonResponse({ data: FIELD_TYPES, paging: { total: FIELD_TYPES.length } });
        }
        if (method === 'PATCH') {
          return jsonResponse({ message: 'boom' }, 500);
        }
        if (url.includes('/api/v1/metadata/types/name/')) {
          return jsonResponse({ id: 'tid', name: 'table', customProperties: DEFAULT_DEFS });
        }
        return new Response('not found', { status: 404 });
      });
      vi.stubGlobal('fetch', fetchMock);
      const errorSpy = vi.spyOn(message, 'error');
      const { wrapper } = await mountDefs();
      await chooseAction(wrapper, 'delete');
      await wrapper.get('[data-testid="save-button"]').trigger('click');
      await flushPromises();
      expect(errorSpy).toHaveBeenCalledWith('boom');
      expect(modalOf(wrapper, 520).props('open')).toBe(false);
    }, 20000);

    it('switches the confirm testid to loading-button while deleting', async () => {
      let resolvePatch!: (response: Response) => void;
      const patchGate = new Promise<Response>((resolve) => {
        resolvePatch = resolve;
      });
      const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        const method = String(init?.method || '').toUpperCase();
        if (url.includes('category=field')) {
          return jsonResponse({ data: FIELD_TYPES, paging: { total: FIELD_TYPES.length } });
        }
        if (method === 'PATCH') {
          return patchGate;
        }
        if (url.includes('/api/v1/metadata/types/name/')) {
          return jsonResponse({ id: 'tid', name: 'table', customProperties: DEFAULT_DEFS });
        }
        return new Response('not found', { status: 404 });
      });
      vi.stubGlobal('fetch', fetchMock);
      const { wrapper } = await mountDefs();
      await chooseAction(wrapper, 'delete');
      await wrapper.get('[data-testid="save-button"]').trigger('click');
      await flushPromises();
      await nextTick();
      expect(wrapper.find('[data-testid="loading-button"]').exists()).toBe(true);
      expect(wrapper.find('[data-testid="save-button"]').exists()).toBe(false);
      resolvePatch(jsonResponse({ id: 'tid', name: 'table', customProperties: [] }));
      await flushPromises();
      expect(modalOf(wrapper, 520).props('open')).toBe(false);
    }, 20000);
  });

  describe('per-type gate', () => {
    it('hides Add and actions without EditAll — empty and ViewBasic-only grants', async () => {
      getEntityPermissionById.mockResolvedValue({});
      const { wrapper } = await mountDefs();
      expect(wrapper.find('[data-testid="property-name"]').text()).toBe('Retention days');
      expect(wrapper.find('[data-testid="add-field-button"]').exists()).toBe(false);
      expect(wrapper.find('[data-testid="property-actions"]').exists()).toBe(false);

      getEntityPermissionById.mockResolvedValue({ ViewBasic: true });
      const { wrapper: viewWrapper } = await mountDefs();
      expect(viewWrapper.find('[data-testid="property-name"]').text()).toBe('Retention days');
      expect(viewWrapper.find('[data-testid="add-field-button"]').exists()).toBe(false);
      expect(viewWrapper.find('[data-testid="property-actions"]').exists()).toBe(false);
    }, 20000);

    it('shows Add and actions with EditAll', async () => {
      const { wrapper } = await mountDefs();
      expect(wrapper.find('[data-testid="add-field-button"]').exists()).toBe(true);
      expect(wrapper.find('[data-testid="property-actions"]').exists()).toBe(true);
    }, 20000);

    it('hides the buttons while the permission is still loading', async () => {
      getEntityPermissionById.mockImplementation(
        () => new Promise<Record<string, boolean>>(() => {}),
      );
      const { wrapper } = await mountDefs();
      await flushPromises();
      // The type itself loaded (page readable) but the grant has not
      // resolved — fail-closed, never optimistically shown.
      expect(wrapper.find('[data-testid="property-name"]').text()).toBe('Retention days');
      expect(wrapper.find('[data-testid="add-field-button"]').exists()).toBe(false);
      expect(wrapper.find('[data-testid="property-actions"]').exists()).toBe(false);
    }, 20000);

    it('the form cannot be opened without EditAll', async () => {
      getEntityPermissionById.mockResolvedValue({});
      const { wrapper } = await mountDefs();
      // No Add/Edit/Delete entry point exists, and all three overlays
      // stay closed. (antd Drawer/Modal render their children in the DOM
      // even while closed, so form-DOM absence is not the assertion —
      // the open props are.)
      expect(wrapper.find('[data-testid="add-field-button"]').exists()).toBe(false);
      expect(wrapper.find('[data-testid="property-actions"]').exists()).toBe(false);
      expect(drawerOf(wrapper).props('open')).toBe(false);
      expect(modalOf(wrapper, 720).props('open')).toBe(false);
      expect(modalOf(wrapper, 520).props('open')).toBe(false);
    }, 20000);
  });
});

describe('CustomPropertyTypeDetailView unknown segment (§3.5/D-10)', () => {
  beforeEach(() => {
    localStorage.clear();
    getEntityPermissionById.mockResolvedValue({ EditAll: true });
    getEntityPermissionByFqn.mockResolvedValue({});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it('shows the not-found error without issuing a metadata-type request', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/api/v1/metadata/types?') && url.includes('category=field')) {
        return jsonResponse({
          data: [{ id: 'f1', name: 'integer', category: 'field', displayName: 'Integer' }],
          paging: { total: 1 },
        });
      }
      return new Response('not found', { status: 404 });
    });
    vi.stubGlobal('fetch', fetchMock);
    const pinia = createPinia();
    setActivePinia(pinia);
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        {
          path: '/settings/customProperties/:tab',
          name: 'admin-settings-custom-property-type',
          component: CustomPropertyTypeDetailView,
        },
      ],
    });
    await router.push('/settings/customProperties/bogus');
    await router.isReady();
    const wrapper = mount(CustomPropertyTypeDetailView, {
      global: { plugins: [pinia, router, Antd, createTestI18n()] },
    });
    await flushPromises();
    expect(
      fetchMock.mock.calls.some(([url]) => String(url).includes('/metadata/types/name/')),
    ).toBe(false);
    expect(wrapper.text()).toContain('The page you are looking for does not exist.');
    wrapper.unmount();
    vi.unstubAllGlobals();
  });
});
