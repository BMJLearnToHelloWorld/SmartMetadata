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
import Antd, { message, Select } from 'ant-design-vue';
import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defineComponent } from 'vue';
import { createMemoryHistory, createRouter, type HistoryState, type Router } from 'vue-router';
import { createTestI18n } from '@/test/i18n';
import SchemaField from '@/components/ingestion/SchemaField.vue';
import SelectServiceType from '@/components/ingestion/SelectServiceType.vue';
import TestConnectionCard from '@/components/ingestion/TestConnectionCard.vue';
import { clearConnectionSchemaCache } from '@/ingestion/connectionSchemaLoader';
import { useAuthStore } from '@/stores/auth';
import AddServiceView from './AddServiceView.vue';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function filterProperty(title: string) {
  return {
    type: 'object',
    title,
    properties: {
      includes: { type: 'array', items: { type: 'string' } },
      excludes: { type: 'array', items: { type: 'string' } },
    },
  };
}

const POSTGRES_SCHEMA = {
  type: 'object',
  properties: {
    hostPort: { type: 'string', title: 'Host and Port' },
    databaseFilterPattern: filterProperty('Database Filter Pattern'),
    schemaFilterPattern: filterProperty('Schema Filter Pattern'),
    tableFilterPattern: filterProperty('Table Filter Pattern'),
    storedProcedureFilterPattern: filterProperty('Stored Procedure Filter Pattern'),
  },
};

interface StubOptions {
  nameLookup?: 'absent' | 'duplicate';
  createStatus?: number;
  triggerStatus?: number;
  schema?: Record<string, unknown>;
}

interface Harness {
  wrapper: VueWrapper;
  router: Router;
  calls: Array<{ url: string; method?: string; body?: unknown }>;
}

async function mountWizard(
  initialUrl: string,
  options: StubOptions = {},
  historyState?: HistoryState,
): Promise<Harness> {
  const calls: Harness['calls'] = [];
  const schema = options.schema ?? POSTGRES_SCHEMA;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      let body: unknown;
      try {
        body = init?.body ? JSON.parse(String(init.body)) : undefined;
      } catch {
        body = undefined;
      }
      calls.push({ url, method: init?.method, body });
      if (url.includes('/jsons/connectionSchemas/')) {
        return jsonResponse(schema);
      }
      if (url.includes('/api/v1/services/ingestionPipelines/status')) {
        return jsonResponse({ code: 200, platform: 'Airflow' });
      }
      if (url.includes('/api/v1/services/ingestionPipelines/ip')) {
        return jsonResponse({ ip: '10.0.0.9' });
      }
      if (url.includes('/name/') && init?.method !== 'POST') {
        if (options.nameLookup === 'duplicate') {
          return jsonResponse({ id: 'existing', name: 'warehouse', serviceType: 'Postgres' });
        }
        return new Response('not found', { status: 404 });
      }
      if (url.includes('/api/v1/services/') && init?.method === 'POST') {
        if (options.createStatus === 500) {
          return new Response('create failed', { status: 500 });
        }
        return jsonResponse({
          id: 's9',
          name: 'warehouse',
          fullyQualifiedName: 'warehouse',
          serviceType: 'Postgres',
        });
      }
      if (url.includes('/api/v1/apps/trigger/') && init?.method === 'POST') {
        if (options.triggerStatus === 500) {
          return new Response('trigger failed', { status: 500 });
        }
        return new Response('', { status: 200 });
      }
      return new Response('not found', { status: 404 });
    }),
  );

  const pinia = createPinia();
  setActivePinia(pinia);
  useAuthStore().user = { id: 'u1', name: 'admin' };

  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/:serviceCategory/add-service', name: 'ingestion-service-add', component: AddServiceView },
      {
        path: '/service/:serviceCategory/:fqn/:tab?/:subTab?',
        name: 'service-detail',
        component: { template: '<div>svc</div>' },
        props: true,
      },
      {
        path: '/connections',
        name: 'connections',
        component: { template: '<div>list</div>' },
      },
      { path: '/other', name: 'other', component: { template: '<div>other</div>' } },
    ],
  });
  // A location object with an embedded `?query` string drops the
  // query (vue-router parses it only for string locations), so split
  // the initial URL and pass path/query/state explicitly.
  const [initialPath, initialQueryString] = initialUrl.split('?');
  const initialQuery = Object.fromEntries(new URLSearchParams(initialQueryString ?? ''));
  await router.push({ path: initialPath, query: initialQuery, state: historyState });
  await router.isReady();

  const i18n = createTestI18n();
  i18n.global.mergeLocaleMessage('en-US', {
    settings: {
      services: {
        service: 'Service',
        categoryTitle: {
          database: 'Databases',
          messaging: 'Messaging',
          dashboard: 'Dashboards',
          pipeline: 'Pipelines',
          mlmodel: 'ML Models',
          metadata: 'Metadata',
          storage: 'Storages',
          search: 'Search',
          api: 'APIs',
          security: 'Security',
          drive: 'Drives',
        },
        wizard: {
          addNewService: 'Add New Service',
          allServices: 'All Services',
          selectField: 'Select {field}',
          serviceType: 'Service Type',
          stepConnect: 'Connect',
          stepWhatToIngest: 'What to Ingest',
          createAndDeploy: 'Create & Deploy',
          nextWhatToIngest: 'Next: What to Ingest',
          nameThisService: 'Name this service',
          nameThisServiceDescription: 'A unique name for this {serviceType} connection.',
          serviceNameRule: 'Must be unique within this service category.',
          addDescriptionPlaceholder: 'Add a description for this service',
          addDescription: 'Add a description',
          searchConnector: 'Search for a connector',
          noConnectorsAvailable: 'No connectors available for the selected service type.',
          serviceName: 'Service Name',
        },
        fieldTextRequired: '{fieldText} is required.',
        beta: 'Beta',
        nameAlreadyExistsWithSuggestion:
          'A {serviceCategory} named {serviceName} already exists. Try {suggestedServiceName}.',
        serviceLowercase: 'service',
        categoryLabel: {
          database: 'Database Service',
          messaging: 'Messaging Service',
          dashboard: 'Dashboard Service',
          pipeline: 'Pipeline Service',
          mlmodel: 'Ml Model Service',
          metadata: 'Metadata Service',
          storage: 'Storage Service',
          search: 'Search Service',
          api: 'API Service',
          security: 'Security Service',
          drive: 'Drive',
        },
        connectionGuard: {
          loadFailed: 'Failed to load the connection schema.',
          noConfigAvailable: 'No Connection Configs available.',
          blockedReasonA: 'This connector has no guided connection form yet.',
          blockedReasonB: 'This connector has no connection configuration.',
          blockedReasonC: 'This connector cannot be configured yet.',
        },
        connectionForm: {
          pipelineServerIpAddress: 'Pipeline Server IP Address',
          airflowHostIpAddress: 'The platform will connect from the IP {hostIp}.',
        },
        filters: {
          whatShouldWeIngest: 'What should we ingest?',
          whatToIngestDescription: 'Define the ingestion scope.',
          connectedToHost: 'Connected to {host}',
          connectionVerifiedScope: 'Connection verified.',
          noFilterPatternsAvailable: 'No filter patterns are available for this connector.',
        },
        pipeline: {
          disabledFallback: 'Pipeline server is disabled.',
          unreachableFallback: 'Pipeline server is unreachable.',
        },
      },
    },
  });

  // Mount through <router-view/> so the wizard instance is the
  // routed instance and onBeforeRouteLeave fires for the guard test.
  const host = defineComponent({ template: '<router-view />' });
  const wrapper = mount(host, {
    global: { plugins: [pinia, router, Antd, i18n] },
  });
  await flushPromises();
  return { wrapper, router, calls };
}

/** Poll until `check` passes or the timeout expires (real timers: the name check debounces 400ms). */
async function waitFor(check: () => boolean, label: string, timeoutMs = 3000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    await flushPromises();
    if (check()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`Timed out waiting for: ${label}`);
}

/** Fill the name card plus all three required Postgres static fields. */
async function fillPostgresConnection(wrapper: VueWrapper): Promise<void> {
  await wrapper.find('[data-testid="service-name-input"]').setValue('warehouse');
  await wrapper.find('[data-testid="service-username"]').setValue('postgres');
  await wrapper.find('[data-testid="service-host-port"]').setValue('localhost:5432');
  await wrapper.find('[data-testid="service-database"]').setValue('postgres');
}

/** Fill the name card plus the Ranger static fields (hostPort, username, password). */
async function fillRangerConnection(wrapper: VueWrapper): Promise<void> {
  await wrapper.find('[data-testid="service-name-input"]').setValue('warehouse');
  await wrapper.find('[data-testid="service-username"]').setValue('ranger-user');
  await wrapper.find('[data-testid="service-host-port"]').setValue('localhost:6080');
  await wrapper.find('[data-testid="service-password"]').setValue('secret');
}

/** Fill the name card plus the Mysql required fields (username, hostPort) and password. */
async function fillMysqlConnection(wrapper: VueWrapper): Promise<void> {
  await wrapper.find('[data-testid="service-name-input"]').setValue('warehouse');
  await wrapper.find('[data-testid="service-username"]').setValue('mysql-user');
  await wrapper.find('[data-testid="service-password"]').setValue('secret');
  await wrapper.find('[data-testid="service-host-port"]').setValue('localhost:3306');
}

/** Fill the name card plus the Kafka bootstrap servers (its only required field). */
async function fillKafkaConnection(wrapper: VueWrapper): Promise<void> {
  await wrapper.find('[data-testid="service-name-input"]').setValue('warehouse');
  await wrapper.find('[data-testid="service-bootstrap-servers"]').setValue('localhost:9092');
}

/** Walk from the step-2 connection form to the step-3 filter form. */
async function walkToFilterStep(
  wrapper: VueWrapper,
  fill: (wrapper: VueWrapper) => Promise<void> = fillPostgresConnection,
  readyTestId = 'service-host-port',
): Promise<void> {
  await waitFor(
    () => wrapper.find(`[data-testid="${readyTestId}"]`).exists(),
    'connection form fields',
  );
  await fill(wrapper);
  await clickWizardNext(wrapper);
  await waitFor(
    () => wrapper.find('[data-testid="wizard-step-filter"]').exists(),
    'filter step',
  );
}

/** Enter a single regex include on the schema filter pattern composer. */
async function enterSchemaInclude(wrapper: VueWrapper): Promise<void> {
  const schemaField = wrapper
    .findAllComponents(SchemaField)
    .find((field) => (field.props('path') as string[]).includes('schemaFilterPattern'));
  expect(schemaField?.exists()).toBe(true);
  await (schemaField as VueWrapper)
    .find('[data-testid="schemaFilterPattern-only-specific-button"]')
    .trigger('click');
  await addComposerCondition(schemaField as VueWrapper, 'include', '^public$');
}

/**
 * Walk Back from the filter step to the type grid: step 3 Back returns
 * to step 2, step 2 Back discards the wizard (resetWizardState) to
 * step 1. The antd Modal teleports to document.body; its discard
 * button is asserted the same way the Back-confirm test does.
 */
async function backToTypeStep(wrapper: VueWrapper): Promise<void> {
  await wrapper.find('[data-testid="wizard-back"]').trigger('click');
  await flushPromises();
  (document.querySelector('[data-testid="navigation-guard-discard"]') as HTMLElement).click();
  await flushPromises();
  expect(wrapper.find('[data-testid="wizard-step-connection"]').exists()).toBe(true);
  await wrapper.find('[data-testid="wizard-back"]').trigger('click');
  await flushPromises();
  (document.querySelector('[data-testid="navigation-guard-discard"]') as HTMLElement).click();
  await flushPromises();
  expect(wrapper.find('[data-testid="wizard-step-type"]').exists()).toBe(true);
}

/** The created service's request body from the recorded calls. */
function createdBody(
  calls: Harness['calls'],
  servicePath: string,
): Record<string, unknown> {
  const create = calls.find(
    (call) => call.url.includes(servicePath) && call.method === 'POST',
  );
  expect(create).toBeDefined();
  return create?.body as Record<string, unknown>;
}

function createdConfig(
  calls: Harness['calls'],
  servicePath: string,
): Record<string, unknown> {
  return (
    createdBody(calls, servicePath).connection as Record<string, Record<string, unknown>>
  ).config;
}

/**
 * Click the wizard footer Next once it is enabled. The name check
 * debounces 400ms and disables the button while the lookup is in
 * flight; a click inside that window is swallowed by the disabled
 * button (the pin's own transient), so the test waits it out
 * instead of racing it. A permanently disabled button still fails
 * loudly via the waitFor timeout.
 */
async function clickWizardNext(wrapper: VueWrapper): Promise<void> {
  await waitFor(
    () =>
      wrapper.find('[data-testid="wizard-next"]').exists() &&
      !(wrapper.find('[data-testid="wizard-next"]').element as HTMLButtonElement).disabled,
    'wizard Next enabled',
  );
  await wrapper.find('[data-testid="wizard-next"]').trigger('click');
}

/** Drive one filter-pattern composer card to a single regex include. */
async function addComposerCondition(
  card: VueWrapper,
  tone: 'include' | 'exclude',
  value: string,
): Promise<void> {
  let operatorSelect;
  for (const candidate of card.findAllComponents(Select)) {
    if (candidate.attributes('data-testid') === `${tone}-operator-select`) {
      operatorSelect = candidate;
    }
  }
  expect(operatorSelect?.exists()).toBe(true);
  await operatorSelect?.vm.$emit('update:value', 'regex');
  await card.find(`[data-testid="${tone}-filter-input"]`).setValue(value);
  await card.find(`[data-testid="${tone}-add-button"]`).trigger('click');
}

// The 30s ceiling covers the full-wizard mounts (antd + Tiptap +
// router) and the real-timer 400ms name-check debounce on this
// loaded VM; assertions still fail fast, the timeout only bounds
// the waits. The same walk completes in ~5s unloaded (probe).
describe('AddServiceView', () => {
  beforeEach(() => {
    clearConnectionSchemaCache();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    message.destroy();
    document.body.innerHTML = '';
    clearConnectionSchemaCache();
  });

  it('renders the connector grid on step 1 with no footer and no doc panel', async () => {
    const { wrapper } = await mountWizard('/databaseServices/add-service');
    expect(wrapper.find('[data-testid="wizard-step-type"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="select-service"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="Postgres"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="wizard-next"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="wizard-back"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="service-requirements"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="add-new-service-container"]').text()).toContain(
      'Add New Service',
    );
    // No displayName field and no filter-residual prompt anywhere in the wizard.
    expect(wrapper.html()).not.toContain('display-name');
    expect(wrapper.find('[data-testid="wizard-filter-residual"]').exists()).toBe(false);
  });

  it('advances to step 2 on a same-category card click with the type header and doc panel', async () => {
    const { wrapper } = await mountWizard('/databaseServices/add-service');
    await wrapper.find('[data-testid="Postgres"]').trigger('click');
    await flushPromises();
    expect(wrapper.find('[data-testid="wizard-step-connection"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="add-new-service-container"]').text()).toContain(
      'Postgres Service',
    );
    expect(wrapper.find('[data-testid="service-name-input"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="wizard-next"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="service-requirements"]').exists()).toBe(true);
    expect(wrapper.findComponent(TestConnectionCard).exists()).toBe(true);
    // The breadcrumb morphs to [Add New Service, Postgres] once a type is picked.
    expect(wrapper.find('[data-testid="sm-breadcrumb"]').text()).toContain('Postgres');
  });

  it('navigates on category change and refreshes the grid', async () => {
    const { wrapper, router } = await mountWizard('/databaseServices/add-service');
    const selects = wrapper.findAllComponents(Select);
    expect(selects.length).toBeGreaterThan(0);
    await selects[0]?.vm.$emit('update:value', 'messaging');
    await flushPromises();
    expect(router.currentRoute.value.params).toMatchObject({ serviceCategory: 'messagingServices' });
    expect(router.currentRoute.value.query).toEqual({});
    expect(wrapper.find('[data-testid="Kafka"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="Postgres"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="wizard-step-type"]').exists()).toBe(true);
  });

  it('navigates with state on a cross-category click from the all grid', async () => {
    const { wrapper, router } = await mountWizard('/all/add-service');
    await wrapper.find('[data-testid="Postgres"]').trigger('click');
    await waitFor(
      () => wrapper.find('[data-testid="wizard-step-connection"]').exists(),
      'step 2 after cross-category navigation',
    );
    expect(router.currentRoute.value.params).toMatchObject({ serviceCategory: 'databaseServices' });
    expect(router.currentRoute.value.query).toEqual({});
    expect(wrapper.find('[data-testid="add-new-service-container"]').text()).toContain(
      'Postgres Service',
    );
  });

  it('preselects step 2 for a valid deep-linked serviceType and ignores invalid ones', async () => {
    const valid = await mountWizard('/databaseServices/add-service', {}, {
      serviceType: 'Postgres',
    });
    expect(valid.wrapper.find('[data-testid="wizard-step-connection"]').exists()).toBe(true);
    valid.wrapper.unmount();

    const invalid = await mountWizard('/databaseServices/add-service', {}, {
      serviceType: 'Nope',
    });
    expect(invalid.wrapper.find('[data-testid="wizard-step-type"]').exists()).toBe(true);
    invalid.wrapper.unmount();

    const unsupported = await mountWizard('/metadataServices/add-service', {}, {
      serviceType: 'Alation',
    });
    expect(unsupported.wrapper.find('[data-testid="wizard-step-type"]').exists()).toBe(true);
    unsupported.wrapper.unmount();
  });

  it('walks all three steps and creates the service with owners and no displayName', async () => {
    const successSpy = vi.spyOn(message, 'success');
    const { wrapper, router, calls } = await mountWizard(
      '/databaseServices/add-service',
    );
    await wrapper.find('[data-testid="Postgres"]').trigger('click');
    await waitFor(
      () => wrapper.find('[data-testid="service-host-port"]').exists(),
      'connection form fields',
    );
    await fillPostgresConnection(wrapper);
    await clickWizardNext(wrapper);
    await waitFor(
      () => wrapper.find('[data-testid="wizard-step-filter"]').exists(),
      'filter step',
    );
    expect(wrapper.find('[data-testid="filters-config-form"]').exists()).toBe(true);

    const schemaField = wrapper
      .findAllComponents(SchemaField)
      .find((field) => (field.props('path') as string[]).includes('schemaFilterPattern'));
    expect(schemaField?.exists()).toBe(true);
    // The include composer renders only in only-specific mode.
    await (schemaField as VueWrapper)
      .find('[data-testid="schemaFilterPattern-only-specific-button"]')
      .trigger('click');
    await addComposerCondition(schemaField as VueWrapper, 'include', '^public$');

    await clickWizardNext(wrapper);
    await flushPromises();

    const create = calls.find(
      (call) => call.url.includes('/api/v1/services/databaseServices') && call.method === 'POST',
    );
    expect(create).toBeDefined();
    const body = create?.body as Record<string, unknown>;
    expect(body.name).toBe('warehouse');
    expect(body.serviceType).toBe('Postgres');
    expect(body).not.toHaveProperty('displayName');
    expect(body.owners).toEqual([{ id: 'u1', type: 'user' }]);
    const config = (body.connection as Record<string, Record<string, unknown>>).config;
    expect(config.type).toBe('Postgres');
    expect(config.hostPort).toBe('localhost:5432');
    expect(config.schemaFilterPattern).toEqual({ includes: ['^public$'], excludes: [] });
    expect(
      calls.some((call) => call.url.includes('/api/v1/apps/trigger/') && call.method === 'POST'),
    ).toBe(true);
    expect(successSpy).toHaveBeenCalledWith(expect.any(String), 5);
    expect(router.currentRoute.value.name).toBe('service-detail');
    expect(router.currentRoute.value.params).toMatchObject({ serviceCategory: 'databaseServices', fqn: 'warehouse' });
  });

  it('creates a security service with no AutoPilot trigger and no AutoPilot toast', async () => {
    // Ranger is the only security type and pin-unsupported, so the
    // connector grid never offers it; the wizard's own select event is
    // driven directly for the security kind. The exclusion guard under
    // test lives in the save path (EXCLUDE_AUTO_PILOT_SERVICE_TYPES),
    // not in the grid.
    const successSpy = vi.spyOn(message, 'success');
    const { wrapper, router, calls } = await mountWizard(
      '/securityServices/add-service',
    );
    expect(wrapper.find('[data-testid="wizard-step-type"]').exists()).toBe(true);
    await wrapper
      .findComponent(SelectServiceType)
      .vm.$emit('select', { category: 'security', type: 'Ranger' });
    await walkToFilterStep(wrapper, fillRangerConnection);
    await clickWizardNext(wrapper);
    await flushPromises();

    const create = calls.find(
      (call) =>
        call.url.includes('/api/v1/services/securityServices') && call.method === 'POST',
    );
    expect(create).toBeDefined();
    expect((create?.body as Record<string, unknown>).serviceType).toBe('Ranger');
    expect(
      calls.some((call) => call.url.includes('/api/v1/apps/trigger/')),
    ).toBe(false);
    expect(successSpy).not.toHaveBeenCalled();
    expect(router.currentRoute.value.name).toBe('service-detail');
    expect(router.currentRoute.value.params).toMatchObject({ serviceCategory: 'securityServices', fqn: 'warehouse' });
    successSpy.mockRestore();
  });

  it('drops the entered filter scope when the kind changes (D-L3)', async () => {
    const { wrapper, calls } = await mountWizard('/databaseServices/add-service');
    await wrapper.find('[data-testid="Postgres"]').trigger('click');
    await walkToFilterStep(wrapper);
    await enterSchemaInclude(wrapper);
    expect(wrapper.text()).toContain('^public$');
    await backToTypeStep(wrapper);

    // Change kind through the category select, then pick a connector
    // of the new kind.
    const selects = wrapper.findAllComponents(Select);
    await selects[0]?.vm.$emit('update:value', 'messaging');
    await flushPromises();
    expect(wrapper.find('[data-testid="Kafka"]').exists()).toBe(true);
    await wrapper.find('[data-testid="Kafka"]').trigger('click');
    await walkToFilterStep(wrapper, fillKafkaConnection, 'service-bootstrap-servers');
    // The remounted filter form starts fresh: the entered scope is gone.
    expect(wrapper.text()).not.toContain('^public$');
    await clickWizardNext(wrapper);
    await flushPromises();

    const config = createdConfig(calls, '/api/v1/services/messagingServices');
    const includes = (
      config.schemaFilterPattern as { includes?: string[] } | undefined
    )?.includes;
    expect(includes ?? []).not.toContain('^public$');
  }, 60000);

  it('drops the entered filter scope when the service type changes within a kind (D-L3)', async () => {
    const { wrapper, calls } = await mountWizard('/databaseServices/add-service');
    await wrapper.find('[data-testid="Postgres"]').trigger('click');
    await walkToFilterStep(wrapper);
    await enterSchemaInclude(wrapper);
    expect(wrapper.text()).toContain('^public$');
    await backToTypeStep(wrapper);

    // Same kind, different connector: the type click resets the wizard
    // to a fresh form instead of navigating.
    await wrapper.find('[data-testid="Mysql"]').trigger('click');
    await walkToFilterStep(wrapper, fillMysqlConnection);
    expect(wrapper.text()).not.toContain('^public$');
    await clickWizardNext(wrapper);
    await flushPromises();

    const config = createdConfig(calls, '/api/v1/services/databaseServices');
    expect(createdBody(calls, '/api/v1/services/databaseServices').serviceType).toBe('Mysql');
    const includes = (
      config.schemaFilterPattern as { includes?: string[] } | undefined
    )?.includes;
    expect(includes ?? []).not.toContain('^public$');
  }, 60000);

  it('blocks the Next button on a duplicate name with the suggested name', async () => {
    const { wrapper } = await mountWizard('/databaseServices/add-service', {
      nameLookup: 'duplicate',
    });
    await wrapper.find('[data-testid="Postgres"]').trigger('click');
    await waitFor(
      () => wrapper.find('[data-testid="service-host-port"]').exists(),
      'connection form fields',
    );
    await wrapper.find('[data-testid="service-name-input"]').setValue('warehouse');
    await waitFor(
      () => wrapper.text().includes('Try warehouse_2'),
      'duplicate name error with suggestion',
    );
    expect(
      (wrapper.find('[data-testid="wizard-next"]').element as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  it('renders the form and allows Next for a formerly blocked row now covered by T-2', async () => {
    const { wrapper } = await mountWizard('/mlmodelServices/add-service', {}, {
      serviceType: 'CustomMlModel',
    });
    await waitFor(
      () => wrapper.find('[data-testid="service-source-python-class"]').exists(),
      'CustomMlModel config form',
    );
    // T-2 (2026-11-20): CustomMlModel moved from blocked to covered
    // (connectionCoverage.ts row 'mlmodel'/'CustomMlModel' is now
    // 'covered'; the form-level twin is ConnectionConfigForm.test.ts
    // 'renders the form for a formerly blocked row now covered by T-2').
    // No row is blocked since T-2, so the read-only prompt is
    // unreachable via coverage; the wizard shows the type-only form
    // and Next is free once a name is entered.
    expect(wrapper.find('[data-testid="no-config-available"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="service-host-port"]').exists()).toBe(false);
    await wrapper.find('[data-testid="service-name-input"]').setValue('custom-ml');
    await waitFor(
      () =>
        wrapper.find('[data-testid="wizard-next"]').exists() &&
        !(wrapper.find('[data-testid="wizard-next"]').element as HTMLButtonElement).disabled,
      'wizard Next enabled',
    );
    expect(
      (wrapper.find('[data-testid="wizard-next"]').element as HTMLButtonElement).disabled,
    ).toBe(false);
  });

  it('confirms Back: step 2 resets the wizard, step 3 returns to step 2', async () => {
    const { wrapper } = await mountWizard('/databaseServices/add-service');
    await wrapper.find('[data-testid="Postgres"]').trigger('click');
    await waitFor(
      () => wrapper.find('[data-testid="service-host-port"]').exists(),
      'connection form fields',
    );
    await wrapper.find('[data-testid="service-name-input"]').setValue('warehouse');
    await wrapper.find('[data-testid="wizard-back"]').trigger('click');
    await flushPromises();
    // The antd Modal teleports to document.body; assert on its
    // discard button, which always lands in the document.
    expect(document.querySelector('[data-testid="navigation-guard-discard"]')).not.toBeNull();
    (document.querySelector('[data-testid="navigation-guard-discard"]') as HTMLElement).click();
    await flushPromises();
    expect(wrapper.find('[data-testid="wizard-step-type"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="Postgres"]').exists()).toBe(true);

    // Re-enter, walk to step 3, then Back returns to step 2.
    await wrapper.find('[data-testid="Postgres"]').trigger('click');
    await waitFor(
      () => wrapper.find('[data-testid="service-host-port"]').exists(),
      'connection form fields again',
    );
    await fillPostgresConnection(wrapper);
    await clickWizardNext(wrapper);
    await waitFor(
      () => wrapper.find('[data-testid="wizard-step-filter"]').exists(),
      'filter step',
    );
    await wrapper.find('[data-testid="wizard-back"]').trigger('click');
    await flushPromises();
    expect(document.querySelector('[data-testid="navigation-guard-discard"]')).not.toBeNull();
    (document.querySelector('[data-testid="navigation-guard-discard"]') as HTMLElement).click();
    await flushPromises();
    expect(wrapper.find('[data-testid="wizard-step-connection"]').exists()).toBe(true);
  });

  it('still navigates to the detail on create failure, using the service name', async () => {
    const errorSpy = vi.spyOn(message, 'error');
    const { wrapper, router } = await mountWizard('/databaseServices/add-service', {
      createStatus: 500,
    });
    await wrapper.find('[data-testid="Postgres"]').trigger('click');
    await waitFor(
      () => wrapper.find('[data-testid="service-host-port"]').exists(),
      'connection form fields',
    );
    await fillPostgresConnection(wrapper);
    await clickWizardNext(wrapper);
    await waitFor(
      () => wrapper.find('[data-testid="wizard-step-filter"]').exists(),
      'filter step',
    );
    await clickWizardNext(wrapper);
    await flushPromises();
    expect(errorSpy).toHaveBeenCalled();
    expect(router.currentRoute.value.name).toBe('service-detail');
    expect(router.currentRoute.value.params).toMatchObject({ serviceCategory: 'databaseServices', fqn: 'warehouse' });
  });

  it('still navigates when the AutoPilot trigger fails, with both toasts', async () => {
    const errorSpy = vi.spyOn(message, 'error');
    const successSpy = vi.spyOn(message, 'success');
    const { wrapper, router } = await mountWizard('/databaseServices/add-service', {
      triggerStatus: 500,
    });
    await wrapper.find('[data-testid="Postgres"]').trigger('click');
    await waitFor(
      () => wrapper.find('[data-testid="service-host-port"]').exists(),
      'connection form fields',
    );
    await fillPostgresConnection(wrapper);
    await clickWizardNext(wrapper);
    await waitFor(
      () => wrapper.find('[data-testid="wizard-step-filter"]').exists(),
      'filter step',
    );
    await clickWizardNext(wrapper);
    await flushPromises();
    expect(errorSpy).toHaveBeenCalled();
    expect(successSpy).toHaveBeenCalledWith(expect.any(String), 5);
    expect(router.currentRoute.value.name).toBe('service-detail');
  });

  it('shows the connected message on the filter step only after a passed test connection', async () => {
    const { wrapper } = await mountWizard('/databaseServices/add-service');
    await wrapper.find('[data-testid="Postgres"]').trigger('click');
    await waitFor(
      () => wrapper.find('[data-testid="service-host-port"]').exists(),
      'connection form fields',
    );
    await fillPostgresConnection(wrapper);
    await wrapper
      .findComponent(TestConnectionCard)
      .vm.$emit('status-change', true);
    await clickWizardNext(wrapper);
    await waitFor(
      () => wrapper.find('[data-testid="wizard-step-filter"]').exists(),
      'filter step',
    );
    expect(wrapper.find('[data-testid="filters-connected-message"]').exists()).toBe(true);
    expect(wrapper.text()).toContain('Connected to localhost:5432');
  });

  it('guards navigation away from step 2 and lets the user stay or leave', async () => {
    const { wrapper, router } = await mountWizard('/databaseServices/add-service');
    await wrapper.find('[data-testid="Postgres"]').trigger('click');
    await waitFor(
      () => wrapper.find('[data-testid="service-host-port"]').exists(),
      'connection form fields',
    );
    // Do not await the push: the leave guard holds the navigation
    // open until the modal is answered, so awaiting it deadlocks.
    const navigation = router.push('/other');
    await flushPromises();
    const discard = document.querySelector(
      '[data-testid="navigation-guard-discard"]',
    ) as HTMLElement | null;
    expect(discard).not.toBeNull();
    expect(router.currentRoute.value.name).toBe('ingestion-service-add');
    // Stay: the modal closes and the route is unchanged.
    (
      discard?.parentElement?.querySelector('.ant-btn-primary') as HTMLElement
    ).click();
    await navigation;
    await flushPromises();
    expect(document.querySelector('[data-testid="navigation-guard-discard"]')).toBeNull();
    expect(router.currentRoute.value.name).toBe('ingestion-service-add');
  });

  it('offers only the eleven listable kinds in the step-1 category select, never llm/mcp (C-2)', async () => {
    const { wrapper } = await mountWizard('/all/add-service');
    const categorySelect = wrapper
      .findAllComponents(Select)
      .find((candidate) => candidate.attributes('data-testid') === 'service-category');
    expect(categorySelect?.exists()).toBe(true);
    // The Select consumes its Option children as data (they never mount
    // as components), so the offered set is read from the slot VNodes
    // the picker passes in — exactly the options a user can pick.
    const optionValues: unknown[] = [];
    const collect = (nodes: unknown[]): void => {
      for (const node of nodes) {
        const vnode = node as { props?: Record<string, unknown>; children?: unknown[] };
        if (Array.isArray(vnode.children)) {
          collect(vnode.children);
        } else if (vnode.props?.value !== undefined) {
          optionValues.push(vnode.props.value);
        }
      }
    };
    collect((categorySelect?.vm.$slots.default?.() ?? []) as unknown[]);
    expect(optionValues).toEqual([
      'all',
      'database',
      'dashboard',
      'messaging',
      'pipeline',
      'storage',
      'api',
      'mlmodel',
      'metadata',
      'search',
      'drive',
      'security',
    ]);
    expect(optionValues).not.toContain('llm');
    expect(optionValues).not.toContain('mcp');
  });
}, 30000);
