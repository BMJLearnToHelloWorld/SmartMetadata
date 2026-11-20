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
import Antd, { message } from 'ant-design-vue';
import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryHistory, createRouter, type Router } from 'vue-router';
import FiltersConfigForm from '@/components/ingestion/FiltersConfigForm.vue';
import NavigationGuardModal from '@/components/ingestion/NavigationGuardModal.vue';
import { clearConnectionSchemaCache } from '@/ingestion/connectionSchemaLoader';
import { createTestI18n } from '@/test/i18n';
import EditServiceConnectionView from './EditServiceConnectionView.vue';

/**
 * The edit keys do not exist in the locale files yet (the integration line
 * writes them from the worker's key list); merge the report's en values so
 * the spec asserts real interpolation (FQN heading, missing-entity message)
 * instead of key strings.
 */
const EDIT_MESSAGES = {
  settings: {
    services: {
      edit: {
        stepConnectionDetails: 'Connection Details',
        stepSetDefaultFilters: 'Set Default Filters',
        heading: 'Edit {entity} Service Connection',
        breadcrumb: 'Edit Connection',
        somethingWentWrong: 'Something went wrong',
        entityMissing: '{entity} instance for {fqn} not found',
      },
    },
  },
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const SCHEMA = { type: 'object', properties: { hostPort: { type: 'string' } } };

/** Stored config matches what the builder emits for the hydrated form
 * (scheme/sslMode defaults included), so an unchanged save is an empty
 * patch. The supports flags and unmodeled keys prove the merge preserves
 * keys the form never emits. */
const POSTGRES_SERVICE = {
  id: 's1',
  name: 'warehouse',
  fullyQualifiedName: 'warehouse',
  displayName: 'Warehouse',
  description: 'Original description',
  serviceType: 'Postgres',
  owners: [{ id: 'u1', name: 'owner-one', type: 'user' }],
  connection: {
    config: {
      type: 'Postgres',
      hostPort: 'localhost:5432',
      username: 'postgres',
      database: 'appdb',
      scheme: 'postgresql+psycopg2',
      sslMode: 'disable',
      authType: { password: '*****' },
      schemaFilterPattern: { includes: ['^public$'], excludes: [] },
      includeSchemas: true,
      ingestAllDatabases: false,
      classificationName: 'PostgresPolicyTags',
      queryStatementSource: 'pg_stat_statements',
      supportsMetadataExtraction: true,
      supportsProfiler: false,
      unmodeledKey: 'kept',
    },
  },
};

const CUSTOM_MLMODEL_SERVICE = {
  id: 'c1',
  name: 'custom-ml',
  fullyQualifiedName: 'custom-ml',
  serviceType: 'CustomMlModel',
  connection: { config: { type: 'CustomMlModel' } },
};

/** Collibra stored config for the stale-seed mount test: the connection
 * form (Scope section) and the filter step both edit glossaryFilterPattern. */
const COLLIBRA_SERVICE = {
  id: 'cb1',
  name: 'collibra',
  fullyQualifiedName: 'collibra',
  displayName: 'Collibra',
  serviceType: 'Collibra',
  connection: {
    config: {
      type: 'Collibra',
      username: 'col-user',
      password: '*********',
      hostPort: 'collibra.example.com:443',
      glossaryFilterPattern: { includes: ['^glossary-.*$'], excludes: [] },
      enableEnrichment: false,
    },
  },
};

const OPEN_METADATA_SERVICE = {
  ...POSTGRES_SERVICE,
  id: 's9',
  name: 'OpenMetadata',
  fullyQualifiedName: 'OpenMetadata',
};

async function waitFor(check: () => boolean, what: string): Promise<void> {
  for (let i = 0; i < 50; i++) {
    if (check()) {
      return;
    }
    await flushPromises();
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error(`timed out waiting for ${what}`);
}

describe('EditServiceConnectionView', () => {
  const calls: Array<{
    url: string;
    method?: string;
    body?: string;
    contentType?: string;
  }> = [];
  let getStatus: number;
  let getBody: unknown;
  let patchStatus: number;
  let schemaStatus: number;
  let getGate: Promise<Response> | null;
  let releaseGet: ((response: Response) => void) | null;

  beforeEach(() => {
    calls.length = 0;
    getStatus = 200;
    getBody = undefined;
    patchStatus = 200;
    schemaStatus = 200;
    getGate = null;
    releaseGet = null;
    clearConnectionSchemaCache();
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        const headers = init?.headers as Record<string, string> | undefined;
        calls.push({
          url,
          method: init?.method,
          body: typeof init?.body === 'string' ? init.body : undefined,
          contentType: headers?.['Content-Type'],
        });
        if (url.includes('/jsons/connectionSchemas/')) {
          return jsonResponse(SCHEMA, schemaStatus);
        }
        if (url.includes('/api/v1/services/') && init?.method === 'PATCH') {
          if (patchStatus !== 200) {
            return new Response('patch failed', { status: patchStatus });
          }
          return jsonResponse({
            ...POSTGRES_SERVICE,
            owners: undefined,
            connection: {
              config: {
                ...POSTGRES_SERVICE.connection.config,
                hostPort: 'db2:5432',
              },
            },
          });
        }
        if (url.includes('/api/v1/services/databaseServices/s1')) {
          if (getGate) {
            return getGate;
          }
          if (getStatus !== 200) {
            return new Response('fetch failed', { status: getStatus });
          }
          return jsonResponse(getBody ?? POSTGRES_SERVICE);
        }
        if (url.includes('/api/v1/services/databaseServices/s9')) {
          return jsonResponse(OPEN_METADATA_SERVICE);
        }
        if (url.includes('/api/v1/services/mlmodelServices/c1')) {
          return jsonResponse(CUSTOM_MLMODEL_SERVICE);
        }
        if (url.includes('/api/v1/services/metadataServices/cb1')) {
          return jsonResponse(COLLIBRA_SERVICE);
        }
        if (url.includes('ingestionPipelines/status')) {
          return jsonResponse({ code: 200, platform: 'airflow' });
        }
        if (url.includes('ingestionPipelines/ip')) {
          return jsonResponse({ ip: '203.0.113.7' });
        }
        return new Response('not found', { status: 404 });
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    message.destroy();
    document.body.innerHTML = '';
  });

  function makeRouter(): Router {
    return createRouter({
      history: createMemoryHistory(),
      routes: [
        {
          path: '/connections',
          name: 'connections',
          component: { template: '<div>list</div>' },
        },
        {
          path: '/ingestion/services/:kind/:id/connection',
          name: 'ingestion-service-connection',
          component: EditServiceConnectionView,
          props: true,
        },
        {
          path: '/ingestion/services/:kind/:id',
          name: 'ingestion-service',
          component: { template: '<div>svc</div>' },
          props: true,
        },
        {
          path: '/other',
          name: 'other',
          component: { template: '<div>other</div>' },
        },
      ],
    });
  }

  async function mountAt(path: string, history: string[] = []) {
    const pinia = createPinia();
    setActivePinia(pinia);
    const router = makeRouter();
    for (const entry of history) {
      await router.push(entry);
    }
    await router.push(path);
    await router.isReady();
    const i18n = createTestI18n();
    i18n.global.mergeLocaleMessage('en-US', EDIT_MESSAGES);
    const wrapper = mount(
      { template: '<router-view />' },
      {
        global: {
          plugins: [pinia, router, Antd, i18n],
        },
      },
    );
    await flushPromises();
    await wrapper.vm.$nextTick();
    return { wrapper, router };
  }

  async function waitForForm(wrapper: Awaited<ReturnType<typeof mountAt>>['wrapper']) {
    await waitFor(
      () => wrapper.find('[data-testid="service-host-port"]').exists(),
      'connection form fields',
    );
  }

  async function goToStep2(wrapper: Awaited<ReturnType<typeof mountAt>>['wrapper']) {
    await waitForForm(wrapper);
    await wrapper.find('[data-testid="edit-connection-next"]').trigger('click');
    await flushPromises();
    await wrapper.vm.$nextTick();
  }

  function patchCalls() {
    return calls.filter((call) => call.method === 'PATCH');
  }

  function serviceGetCalls() {
    // The orchestrator probe also lives under /v1/services/; only the
    // service-detail GETs count here.
    return calls.filter(
      (call) =>
        call.url.includes('/api/v1/services/') &&
        !call.url.includes('ingestionPipelines') &&
        (call.method === undefined || call.method === 'GET'),
    );
  }

  it('renders the header with FQN, both step names, breadcrumb, and no identity fields', async () => {
    const { wrapper } = await mountAt('/ingestion/services/database/s1/connection');
    await waitForForm(wrapper);
    expect(wrapper.find('[data-testid="header-heading"]').text()).toBe(
      'Edit warehouse Service Connection',
    );
    expect(wrapper.find('[data-testid="sm-breadcrumb"]').text()).toContain('Database');
    expect(wrapper.find('[data-testid="sm-breadcrumb"]').text()).toContain('Warehouse');
    expect(wrapper.find('[data-testid="sm-breadcrumb"]').text()).toContain('Edit Connection');
    expect(wrapper.text()).toContain('Connection Details');
    expect(wrapper.text()).toContain('Set Default Filters');
    expect(wrapper.find('[data-testid="edit-connection-display-name"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="edit-connection-description"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="edit-connection-no-form"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it('shows a spinner while loading, then the form', async () => {
    getGate = new Promise<Response>((resolve) => {
      releaseGet = resolve;
    });
    const { wrapper } = await mountAt('/ingestion/services/database/s1/connection');
    expect(wrapper.find('.ant-spin-spinning').exists()).toBe(true);
    expect(wrapper.find('[data-testid="edit-connection-step-connection"]').exists()).toBe(false);
    releaseGet!(jsonResponse(POSTGRES_SERVICE));
    await waitForForm(wrapper);
    expect(wrapper.find('[data-testid="edit-connection-step-connection"]').exists()).toBe(true);
    wrapper.unmount();
  });

  it('enters the error state for the OpenMetadata service without rendering forms', async () => {
    const { wrapper } = await mountAt('/ingestion/services/database/s9/connection');
    await flushPromises();
    await wrapper.vm.$nextTick();
    expect(wrapper.find('[data-testid="edit-connection-error"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="edit-connection-error"]').text()).toContain(
      'DatabaseServices instance for OpenMetadata not found',
    );
    expect(wrapper.find('[data-testid="edit-connection-next"]').exists()).toBe(false);
    expect(serviceGetCalls()).toHaveLength(1);
    wrapper.unmount();
  });

  it('enters the error state on 404 and toasts with an empty shell on other errors', async () => {
    getStatus = 404;
    const notFound = await mountAt('/ingestion/services/database/s1/connection');
    await flushPromises();
    await notFound.wrapper.vm.$nextTick();
    expect(notFound.wrapper.find('[data-testid="edit-connection-error"]').exists()).toBe(true);
    expect(notFound.wrapper.find('[data-testid="edit-connection-error"]').text()).toContain(
      'DatabaseServices instance for s1 not found',
    );
    notFound.wrapper.unmount();
    document.body.innerHTML = '';

    getStatus = 500;
    const failed = await mountAt('/ingestion/services/database/s1/connection');
    await flushPromises();
    await failed.wrapper.vm.$nextTick();
    expect(failed.wrapper.find('[data-testid="edit-connection-error"]').exists()).toBe(false);
    expect(document.querySelector('.ant-message-error')).not.toBeNull();
    // Pin-degenerate render: header/stepper/footer, no forms, no doc panel.
    expect(failed.wrapper.find('[data-testid="edit-connection-next"]').exists()).toBe(true);
    expect(failed.wrapper.find('[data-testid="edit-connection-step-connection"]').exists()).toBe(false);
    failed.wrapper.unmount();
  });

  it('never fetches and enters the error state for an unknown kind', async () => {
    const { wrapper } = await mountAt('/ingestion/services/banana/s1/connection');
    await flushPromises();
    await wrapper.vm.$nextTick();
    expect(serviceGetCalls()).toHaveLength(0);
    expect(wrapper.find('[data-testid="edit-connection-error"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="edit-connection-error"]').text()).toContain(
      'Banana instance for s1 not found',
    );
    wrapper.unmount();
  });

  it('seeds step 2 from the step-1 merged config, not the stored details (stale-seed fix)', async () => {
    const { wrapper } = await mountAt('/ingestion/services/database/s1/connection');
    await waitForForm(wrapper);
    await wrapper.find('[data-testid="service-host-port"]').setValue('db2:5432');
    await wrapper.find('[data-testid="edit-connection-next"]').trigger('click');
    await flushPromises();
    await wrapper.vm.$nextTick();
    expect(wrapper.find('[data-testid="edit-connection-step-filters"]').exists()).toBe(true);
    const filters = wrapper.findComponent(FiltersConfigForm);
    expect(filters.exists()).toBe(true);
    // Named deviation from pin (EditConnectionFormPage.tsx:383 seeds the
    // filter step from the STORED serviceDetails): the step-1 merged config
    // wins, so a step-1 edit is visible to the filter step instead of being
    // silently overwritten by the stale stored value on save. If the
    // binding regresses to the stored config, hostPort reads localhost:5432.
    expect(filters.props('initialConfig')).toEqual({
      ...POSTGRES_SERVICE.connection.config,
      hostPort: 'db2:5432',
    });
    wrapper.unmount();
  });

  it('seeds step 2 with a step-1 filter-pattern edit, not the stored pattern (stale-seed fix)', async () => {
    // Only Collibra has filterPattern controls in the step-1 connection
    // form (connectionFields.ts); Postgres renders no filter card there.
    const { wrapper } = await mountAt('/ingestion/services/metadata/cb1/connection');
    await waitForForm(wrapper);
    await wrapper.find('[data-testid="connection-section-scope-toggle"]').trigger('click');
    const card = wrapper.find('[data-testid="filter-section-glossaryFilterPattern"]');
    expect(card.exists()).toBe(true);
    await card.find('[data-testid="include-filter-input"]').setValue('new_glossary');
    await card.find('[data-testid="include-add-button"]').trigger('click');
    await flushPromises();
    await wrapper.vm.$nextTick();
    await wrapper.find('[data-testid="edit-connection-next"]').trigger('click');
    await flushPromises();
    await wrapper.vm.$nextTick();
    expect(wrapper.find('[data-testid="edit-connection-step-filters"]').exists()).toBe(true);
    const filters = wrapper.findComponent(FiltersConfigForm);
    expect(filters.exists()).toBe(true);
    const initialConfig = filters.props('initialConfig') as Record<string, unknown>;
    // The stored pattern was { includes: ['^glossary-.*$'], excludes: [] };
    // the step-1 edit appends a contains condition for new_glossary.
    // Seeding from the stored config would show only ^glossary-.*$ and the
    // merge would then silently drop the step-1 edit on save.
    expect(initialConfig.glossaryFilterPattern).toEqual({
      includes: ['^glossary-.*$', '.*new_glossary.*'],
      excludes: [],
    });
    wrapper.unmount();
  });

  it('saves a key-level JSON Patch preserving unemitted keys, with no success toast', async () => {
    const { wrapper, router } = await mountAt(
      '/ingestion/services/database/s1/connection',
    );
    await waitForForm(wrapper);
    await wrapper.find('[data-testid="service-host-port"]').setValue('db2:5432');
    await wrapper.find('[data-testid="edit-connection-next"]').trigger('click');
    await flushPromises();
    await wrapper.vm.$nextTick();
    await wrapper.find('[data-testid="edit-connection-save"]').trigger('click');
    await flushPromises();
    await wrapper.vm.$nextTick();

    expect(patchCalls()).toHaveLength(1);
    const patch = patchCalls()[0];
    expect(new URL(patch.url).pathname).toBe('/api/v1/services/databaseServices/s1');
    expect(patch.contentType).toBe('application/json-patch+json');
    const ops = JSON.parse(patch.body ?? '[]') as Array<{ op: string; path: string; value?: unknown }>;
    expect(ops).toContainEqual({
      op: 'replace',
      path: '/connection/config/hostPort',
      value: 'db2:5432',
    });
    for (const preserved of [
      'supportsMetadataExtraction',
      'supportsProfiler',
      'unmodeledKey',
      'schemaFilterPattern',
      'includeSchemas',
    ]) {
      expect(ops.map((op) => op.path)).not.toContain(
        expect.stringContaining(preserved),
      );
    }
    expect(ops.map((op) => op.path)).not.toContain('/connection');
    expect(document.querySelector('.ant-message-success')).toBeNull();
    expect(router.currentRoute.value.name).toBe('ingestion-service');
    wrapper.unmount();
  });

  it('leaves with zero requests when the patch is empty', async () => {
    const { wrapper, router } = await mountAt(
      '/ingestion/services/database/s1/connection',
    );
    await goToStep2(wrapper);
    await wrapper.find('[data-testid="edit-connection-save"]').trigger('click');
    await flushPromises();
    await wrapper.vm.$nextTick();
    expect(patchCalls()).toHaveLength(0);
    expect(router.currentRoute.value.name).toBe('ingestion-service');
    wrapper.unmount();
  });

  it('advances a covered CustomMlModel with the stored connection kept, then leaves patchless', async () => {
    // T-2 (2026-11-20): CustomMlModel flipped from a blocked prompt-area
    // row (class C) to covered — it now renders its static form
    // (sourcePythonClass + connectionOptions) instead of the no-config
    // prompt. The stored type-only config is exactly what the builder
    // emits for an untouched form, so an unchanged save is an empty patch.
    const { wrapper, router } = await mountAt('/ingestion/services/mlmodel/c1/connection');
    await waitFor(
      () => wrapper.find('[data-testid="service-source-python-class"]').exists(),
      'CustomMlModel form',
    );
    expect(wrapper.find('[data-testid="no-config-available"]').exists()).toBe(false);
    await wrapper.find('[data-testid="edit-connection-next"]').trigger('click');
    await flushPromises();
    await wrapper.vm.$nextTick();
    expect(wrapper.find('[data-testid="edit-connection-step-filters"]').exists()).toBe(true);
    await wrapper.find('[data-testid="edit-connection-save"]').trigger('click');
    await flushPromises();
    await wrapper.vm.$nextTick();
    expect(patchCalls()).toHaveLength(0);
    expect(router.currentRoute.value.name).toBe('ingestion-service');
    wrapper.unmount();
  });

  it('advances on schema load failure with the stored connection kept', async () => {
    schemaStatus = 500;
    const { wrapper } = await mountAt('/ingestion/services/database/s1/connection');
    await waitFor(
      () => wrapper.find('[data-testid="no-config-available"]').exists(),
      'load-failed prompt',
    );
    await wrapper.find('[data-testid="edit-connection-next"]').trigger('click');
    await flushPromises();
    await wrapper.vm.$nextTick();
    expect(wrapper.find('[data-testid="edit-connection-step-filters"]').exists()).toBe(true);
    wrapper.unmount();
  });

  it('toasts on patch failure and stays on the page', async () => {
    patchStatus = 500;
    const { wrapper, router } = await mountAt(
      '/ingestion/services/database/s1/connection',
    );
    await waitForForm(wrapper);
    await wrapper.find('[data-testid="service-host-port"]').setValue('db2:5432');
    await wrapper.find('[data-testid="edit-connection-next"]').trigger('click');
    await flushPromises();
    await wrapper.vm.$nextTick();
    await wrapper.find('[data-testid="edit-connection-save"]').trigger('click');
    await flushPromises();
    await wrapper.vm.$nextTick();
    expect(document.querySelector('.ant-message-error')).not.toBeNull();
    expect(router.currentRoute.value.name).toBe('ingestion-service-connection');
    wrapper.unmount();
  });

  it('goes back in history from step 1, to the list or the detail page', async () => {
    const fromList = await mountAt('/ingestion/services/database/s1/connection', [
      '/connections',
    ]);
    await waitForForm(fromList.wrapper);
    await fromList.wrapper.find('[data-testid="edit-connection-back"]').trigger('click');
    await flushPromises();
    const discard = document.querySelector(
      '[data-testid="navigation-guard-discard"]',
    ) as HTMLElement | null;
    expect(discard).not.toBeNull();
    discard!.click();
    await flushPromises();
    await fromList.wrapper.vm.$nextTick();
    expect(fromList.router.currentRoute.value.name).toBe('connections');
    fromList.wrapper.unmount();
    document.body.innerHTML = '';

    const fromDetail = await mountAt('/ingestion/services/database/s1/connection', [
      '/ingestion/services/database/s1',
    ]);
    await waitForForm(fromDetail.wrapper);
    await fromDetail.wrapper.find('[data-testid="edit-connection-back"]').trigger('click');
    await flushPromises();
    const discardDetail = document.querySelector(
      '[data-testid="navigation-guard-discard"]',
    ) as HTMLElement | null;
    expect(discardDetail).not.toBeNull();
    discardDetail!.click();
    await flushPromises();
    await fromDetail.wrapper.vm.$nextTick();
    expect(fromDetail.router.currentRoute.value.name).toBe('ingestion-service');
    fromDetail.wrapper.unmount();
  });

  it('asks before stepping back from step 2 and returns to step 1 on confirm', async () => {
    const { wrapper } = await mountAt('/ingestion/services/database/s1/connection');
    await goToStep2(wrapper);
    await wrapper.find('[data-testid="edit-connection-back"]').trigger('click');
    await flushPromises();
    const modals = wrapper.findAllComponents(NavigationGuardModal);
    expect(modals).toHaveLength(2);
    await modals[1].vm.$emit('leave');
    await flushPromises();
    await wrapper.vm.$nextTick();
    expect(wrapper.find('[data-testid="edit-connection-step-connection"]').exists()).toBe(true);
    wrapper.unmount();
  });

  it('guards navigation away even without edits, and lets the user stay', async () => {
    const { wrapper, router } = await mountAt(
      '/ingestion/services/database/s1/connection',
    );
    await waitForForm(wrapper);
    // Do not await the push: the leave guard holds the navigation open
    // until the modal is answered, so awaiting it deadlocks.
    const navigation = router.push('/other');
    await flushPromises();
    const discard = document.querySelector(
      '[data-testid="navigation-guard-discard"]',
    ) as HTMLElement | null;
    expect(discard).not.toBeNull();
    expect(router.currentRoute.value.name).toBe('ingestion-service-connection');
    // Stay: the modal closes and the route is unchanged.
    (discard?.parentElement?.querySelector('.ant-btn-primary') as HTMLElement).click();
    await navigation;
    await flushPromises();
    expect(document.querySelector('[data-testid="navigation-guard-discard"]')).toBeNull();
    expect(router.currentRoute.value.name).toBe('ingestion-service-connection');
    wrapper.unmount();
  });
}, 120000);
