/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { defineComponent, h } from 'vue';
import { flushPromises, mount } from '@vue/test-utils';
import Antd from 'ant-design-vue';
import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryHistory, createRouter, type Router } from 'vue-router';
import { createTestI18n } from '@/test/i18n';
import AirflowMessageBanner from '@/components/ingestion/AirflowMessageBanner.vue';
import FilterPatternCard from '@/components/ingestion/FilterPatternCard.vue';
import NavigationGuardModal from '@/components/ingestion/NavigationGuardModal.vue';
import EditServiceConnectionView from './EditServiceConnectionView.vue';

/** Stand-in for the contracted card: the card has its own tests; the view
 * test asserts wiring (props in, status-change out) only. */
const TestConnectionCardStub = defineComponent({
  name: 'TestConnectionCard',
  props: {
    connectionType: { type: String, required: true },
    kind: { type: String, required: true },
    serviceName: { type: String, required: true },
    getConnection: { type: Function, required: true },
    airflowAvailable: { type: Boolean, required: true },
    hostIp: { type: String, default: undefined },
    missingRequiredFieldsCount: { type: Number, default: 0 },
    onValidateFormRequiredFields: { type: Function, default: undefined },
  },
  emits: ['status-change'],
  setup(_props, { emit }) {
    return () =>
      h('div', { 'data-testid': 'test-connection-stub' }, [
        h(
          'button',
          {
            'data-testid': 'test-connection-pass',
            onClick: () => emit('status-change', true),
          },
          'pass',
        ),
      ]);
  },
});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const POSTGRES_SERVICE = {
  id: 's1',
  name: 'warehouse',
  fullyQualifiedName: 'warehouse',
  displayName: 'Warehouse',
  description: 'Original description',
  serviceType: 'Postgres',
  connection: {
    config: {
      type: 'Postgres',
      hostPort: 'localhost:5432',
      username: 'postgres',
      authType: { password: '*****' },
      database: 'appdb',
      schemaFilterPattern: { includes: ['^public$'], excludes: [] },
      includeSchemas: true,
    },
  },
};

const CUSTOM_SERVICE = {
  id: 's2',
  name: 'custom-svc',
  fullyQualifiedName: 'custom-svc',
  serviceType: 'CustomDatabase',
  connection: { config: { type: 'CustomDatabase' } },
};

describe('EditServiceConnectionView (live-issues S-01..S-08)', () => {
  const calls: Array<{ url: string; method?: string }> = [];
  const putBodies: unknown[] = [];
  let orchestratorStatus: number;
  let orchestratorBody: unknown;
  let hostIpStatus: number;
  let hostIpBody: unknown;
  let putGate: Promise<Response> | null;

  beforeEach(() => {
    calls.length = 0;
    putBodies.length = 0;
    orchestratorStatus = 200;
    orchestratorBody = { code: 200, platform: 'airflow' };
    hostIpStatus = 200;
    hostIpBody = { ip: '203.0.113.7' };
    putGate = null;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        calls.push({ url, method: init?.method });
        if (url.includes('/api/v1/services/databaseServices/s1')) {
          return jsonResponse(POSTGRES_SERVICE);
        }
        if (url.includes('/api/v1/services/databaseServices/s2')) {
          return jsonResponse(CUSTOM_SERVICE);
        }
        if (url.includes('/api/v1/services/databaseServices') && init?.method === 'PUT') {
          putBodies.push(JSON.parse(String(init.body)));
          if (putGate) {
            return putGate;
          }
          return jsonResponse({ id: 's1', name: 'warehouse', serviceType: 'Postgres' });
        }
        if (url.includes('ingestionPipelines/status')) {
          return jsonResponse(orchestratorBody, orchestratorStatus);
        }
        if (url.includes('ingestionPipelines/ip')) {
          if (hostIpStatus === 204) {
            return new Response(null, { status: 204 });
          }
          return jsonResponse(hostIpBody, hostIpStatus);
        }
        return new Response('not found', { status: 404 });
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function makeRouter(): Router {
    return createRouter({
      history: createMemoryHistory(),
      routes: [
        {
          path: '/ingestion/services',
          name: 'ingestion-services',
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
      ],
    });
  }

  async function mountAt(path: string) {
    const pinia = createPinia();
    setActivePinia(pinia);
    const router = makeRouter();
    await router.push(path);
    await router.isReady();
    const wrapper = mount(
      { template: '<router-view />' },
      {
        global: {
          plugins: [pinia, router, Antd, createTestI18n()],
          stubs: { TestConnectionCard: TestConnectionCardStub },
        },
      },
    );
    await flushPromises();
    await wrapper.vm.$nextTick();
    return { wrapper, router };
  }

  async function goToStep2(wrapper: Awaited<ReturnType<typeof mountAt>>['wrapper']) {
    await wrapper.find('[data-testid="edit-connection-next"]').trigger('click');
    await flushPromises();
    await wrapper.vm.$nextTick();
  }

  it('renders breadcrumb, FQN heading, stepper, doc panel and the S-08 identity fields', async () => {
    const { wrapper } = await mountAt('/ingestion/services/database/s1/connection');
    expect(wrapper.text()).toContain('Database');
    expect(wrapper.text()).toContain('Warehouse');
    expect(wrapper.text()).toContain('Edit Connection');
    expect(wrapper.text()).toContain('Edit warehouse Service Connection');
    expect(wrapper.find('[data-testid="step-label-1"]').text()).toBe('Connection Details');
    expect(wrapper.find('[data-testid="step-label-2"]').text()).toBe('Set Default Filters');
    expect(wrapper.find('[data-testid="service-requirements"]').exists()).toBe(true);
    // L-1: pin's doc panel shows the connector type as the title and
    // the category word as the subtitle.
    const panel = wrapper.find('[data-testid="service-requirements"]');
    expect(panel.find('.service-doc-title').text()).toBe('Postgres');
    expect(panel.find('.service-doc-subtitle').text()).toBe('Database Service');
    expect(wrapper.find('[data-testid="edit-connection-display-name"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="edit-connection-description"]').exists()).toBe(true);
    expect(
      (wrapper.find('[data-testid="edit-connection-display-name"]').element as HTMLInputElement)
        .value,
    ).toBe('Warehouse');
    expect(wrapper.find('[data-testid="edit-connection-filters-residual"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it('wires the test-connection card with the orchestrator probe and stored-shape connection (S-03/S-05)', async () => {
    const { wrapper } = await mountAt('/ingestion/services/database/s1/connection');
    const card = wrapper.findComponent(TestConnectionCardStub);
    expect(card.exists()).toBe(true);
    expect(card.props('connectionType')).toBe('Postgres');
    expect(card.props('serviceName')).toBe('warehouse');
    expect(card.props('airflowAvailable')).toBe(true);
    expect(card.props('missingRequiredFieldsCount')).toBe(0);
    const validate = card.props('onValidateFormRequiredFields');
    if (!validate) throw new Error('expected the card validator prop');
    expect(validate()).toBe(true);
    const connection = card.props('getConnection')() as Record<string, unknown>;
    expect(connection['config']).toMatchObject({
      hostPort: 'localhost:5432',
      username: 'postgres',
    });
    const banner = wrapper.findComponent(AirflowMessageBanner);
    expect(banner.props('checked')).toBe(true);
    wrapper.unmount();
  });

  it('reports airflow unavailable when the orchestrator probe fails (S-05)', async () => {
    orchestratorStatus = 500;
    orchestratorBody = { message: 'down' };
    const { wrapper } = await mountAt('/ingestion/services/database/s1/connection');
    const card = wrapper.findComponent(TestConnectionCardStub);
    expect(card.props('airflowAvailable')).toBe(false);
    wrapper.unmount();
  });

  it('shows the pipeline-server IP alert with the fetched host IP (F6, pin ConnectionConfigForm)', async () => {
    const { wrapper } = await mountAt('/ingestion/services/database/s1/connection');
    await vi.waitFor(
      () => expect(wrapper.find('[data-testid="ip-address"]').exists()).toBe(true),
      { timeout: 3000 },
    );
    const alert = wrapper.find('[data-testid="ip-address"]');
    expect(alert.text()).toContain('Pipeline Server IP Address');
    expect(alert.text()).toContain('203.0.113.7');
    expect(calls.some((call) => call.url.includes('ingestionPipelines/ip'))).toBe(true);
    // Pin passes the fetched IP to TestConnection as well.
    expect(wrapper.findComponent(TestConnectionCardStub).props('hostIp')).toBe('203.0.113.7');
    wrapper.unmount();
  });

  it('hides the IP alert on the Hybrid platform (F6)', async () => {
    orchestratorBody = { code: 200, platform: 'Hybrid' };
    const { wrapper } = await mountAt('/ingestion/services/database/s1/connection');
    await flushPromises();
    expect(wrapper.find('[data-testid="ip-address"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it('hides the IP alert when the server disables IP info with an empty 204 (F6)', async () => {
    hostIpStatus = 204;
    const { wrapper } = await mountAt('/ingestion/services/database/s1/connection');
    await vi.waitFor(
      () => expect(calls.some((call) => call.url.includes('ingestionPipelines/ip'))).toBe(true),
      { timeout: 3000 },
    );
    await flushPromises();
    expect(wrapper.find('[data-testid="ip-address"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it('shows the error placeholder when the IP fetch fails (F6, pin fetchHostIp)', async () => {
    hostIpStatus = 500;
    hostIpBody = { message: 'boom' };
    const { wrapper } = await mountAt('/ingestion/services/database/s1/connection');
    await vi.waitFor(
      () => expect(wrapper.find('[data-testid="ip-address"]').exists()).toBe(true),
      { timeout: 3000 },
    );
    expect(wrapper.find('[data-testid="ip-address"]').text()).toContain('[error - unknown]');
    wrapper.unmount();
  });

  it('disables Back while saving (L-4)', async () => {
    let resolvePut!: (value: Response) => void;
    putGate = new Promise<Response>((resolve) => {
      resolvePut = resolve;
    });
    const { wrapper, router } = await mountAt('/ingestion/services/database/s1/connection');
    await wrapper
      .find('[data-testid="edit-connection-description"]')
      .setValue('edited description');
    await goToStep2(wrapper);
    await wrapper.find('[data-testid="edit-connection-save"]').trigger('click');
    await wrapper.vm.$nextTick();
    expect(
      (wrapper.find('[data-testid="edit-connection-back"]').element as HTMLButtonElement).disabled,
    ).toBe(true);
    resolvePut(jsonResponse({ id: 's1', name: 'warehouse', serviceType: 'Postgres' }));
    await flushPromises();
    expect(router.currentRoute.value.name).toBe('ingestion-service');
    wrapper.unmount();
  });

  it('advances to step 2 with filter cards from the declared table, first two open (S-01/S-02)', async () => {
    const { wrapper } = await mountAt('/ingestion/services/database/s1/connection');
    expect(wrapper.find('[data-testid="edit-connection-step-connection"]').exists()).toBe(true);
    await goToStep2(wrapper);
    expect(wrapper.find('[data-testid="edit-connection-step-filters"]').exists()).toBe(true);
    expect(wrapper.text()).toContain('What should we ingest?');
    const cards = wrapper.findAllComponents(FilterPatternCard);
    expect(cards.map((card) => card.props('fieldName'))).toEqual([
      'databaseFilterPattern',
      'schemaFilterPattern',
      'tableFilterPattern',
      'storedProcedureFilterPattern',
    ]);
    expect(cards.map((card) => card.props('defaultOpen'))).toEqual([true, true, false, false]);
    expect(cards[0].props('systemExcludes')).toEqual(['^template1$', '^template0$']);
    expect(cards[1].props('systemExcludes')).toEqual(['^information_schema$']);
    expect(cards[0].props('hasExistingData')).toBe(false);
    expect(cards[1].props('hasExistingData')).toBe(true);
    expect(cards[1].props('modelValue')).toEqual({ includes: ['^public$'], excludes: [] });
    wrapper.unmount();
  });

  it('shows the connected message on step 2 only after a successful test (S-02)', async () => {
    const { wrapper } = await mountAt('/ingestion/services/database/s1/connection');
    await goToStep2(wrapper);
    expect(wrapper.find('[data-testid="edit-connection-connected"]').exists()).toBe(false);
    await wrapper.find('[data-testid="edit-connection-back"]').trigger('click');
    await flushPromises();
    // Back from step 2 asks for confirmation; confirm to return to step 1.
    const modals = wrapper.findAllComponents(NavigationGuardModal);
    await modals[1].vm.$emit('leave');
    await flushPromises();
    await wrapper.vm.$nextTick();
    expect(wrapper.find('[data-testid="edit-connection-step-connection"]').exists()).toBe(true);
    await wrapper.find('[data-testid="test-connection-pass"]').trigger('click');
    await goToStep2(wrapper);
    const connected = wrapper.find('[data-testid="edit-connection-connected"]');
    expect(connected.exists()).toBe(true);
    expect(connected.text()).toContain('Connected to localhost:5432');
    wrapper.unmount();
  });

  it('shows the pin empty state when the type declares no filter patterns (S-02)', async () => {
    const { wrapper } = await mountAt('/ingestion/services/database/s2/connection');
    await goToStep2(wrapper);
    expect(wrapper.findAllComponents(FilterPatternCard)).toHaveLength(0);
    expect(wrapper.find('[data-testid="no-config-available"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="no-config-available"]').text()).toContain(
      'No filter patterns are available for this connector.',
    );
    wrapper.unmount();
  });

  it('leaves without a save when nothing changed — no PUT, just navigation (S-02)', async () => {
    const { wrapper, router } = await mountAt('/ingestion/services/database/s1/connection');
    await goToStep2(wrapper);
    await wrapper.find('[data-testid="edit-connection-save"]').trigger('click');
    await flushPromises();
    expect(putBodies).toHaveLength(0);
    expect(router.currentRoute.value.name).toBe('ingestion-service');
    wrapper.unmount();
  });

  it('saves edits via PUT with blank-means-keep secrets, stored filters, and no flat keys (S-02)', async () => {
    const { wrapper, router } = await mountAt('/ingestion/services/database/s1/connection');
    await wrapper
      .find('[data-testid="edit-connection-description"]')
      .setValue('edited description');
    await goToStep2(wrapper);
    // Edit a fresh filter card: the new scope must reach the saved config.
    const cards = wrapper.findAllComponents(FilterPatternCard);
    await cards[2].vm.$emit('update:modelValue', { includes: ['^t$'], excludes: [] });
    await wrapper.find('[data-testid="edit-connection-save"]').trigger('click');
    await flushPromises();
    expect(putBodies).toHaveLength(1);
    const body = putBodies[0] as Record<string, unknown>;
    expect(body['name']).toBe('warehouse');
    expect(body['serviceType']).toBe('Postgres');
    expect(body['displayName']).toBe('Warehouse');
    expect(body['description']).toBe('edited description');
    const config = (body['connection'] as Record<string, unknown>)['config'] as Record<
      string,
      unknown
    >;
    expect(config['hostPort']).toBe('localhost:5432');
    expect(config['username']).toBe('postgres');
    expect(config['database']).toBe('appdb');
    expect(config['authType']).toEqual({ password: '*****' });
    expect(config).not.toHaveProperty('password');
    expect(config['schemaFilterPattern']).toEqual({ includes: ['^public$'], excludes: [] });
    expect(config['tableFilterPattern']).toEqual({ includes: ['^t$'], excludes: [] });
    expect(config).not.toHaveProperty('includeSchemas');
    expect(router.currentRoute.value.name).toBe('ingestion-service');
    wrapper.unmount();
  });

  it('guards dirty leaves with the confirm modal, and leaves clean pages at once (S-07)', async () => {
    const { wrapper, router } = await mountAt('/ingestion/services/database/s1/connection');
    // Clean: navigation proceeds with no modal.
    const cleanNav = router.push({ name: 'ingestion-services' });
    await flushPromises();
    await cleanNav;
    expect(router.currentRoute.value.name).toBe('ingestion-services');
    expect(document.body.textContent).not.toContain('Do you want to save or discard changes?');
    // Return and dirty the form.
    await router.push('/ingestion/services/database/s1/connection');
    await flushPromises();
    await wrapper.vm.$nextTick();
    await wrapper
      .find('[data-testid="edit-connection-description"]')
      .setValue('dirty edit');
    const blockedNav = router.push({ name: 'ingestion-services' });
    await flushPromises();
    await wrapper.vm.$nextTick();
    expect(document.body.textContent).toContain('Do you want to save or discard changes?');
    const modals = wrapper.findAllComponents(NavigationGuardModal);
    await modals[0].vm.$emit('stay');
    await flushPromises();
    await blockedNav.catch(() => undefined);
    expect(router.currentRoute.value.name).toBe('ingestion-service-connection');
    // Second attempt, this time confirming the leave.
    const leaveNav = router.push({ name: 'ingestion-services' });
    await flushPromises();
    await wrapper.vm.$nextTick();
    await wrapper.findAllComponents(NavigationGuardModal)[0].vm.$emit('leave');
    await flushPromises();
    await leaveNav;
    expect(router.currentRoute.value.name).toBe('ingestion-services');
    wrapper.unmount();
  });

  it('asks for confirmation when going back from step 2 to step 1 (S-07)', async () => {
    const { wrapper } = await mountAt('/ingestion/services/database/s1/connection');
    await goToStep2(wrapper);
    await wrapper.find('[data-testid="edit-connection-back"]').trigger('click');
    await flushPromises();
    await wrapper.vm.$nextTick();
    expect(document.body.textContent).toContain('Do you want to save or discard changes?');
    const modals = wrapper.findAllComponents(NavigationGuardModal);
    await modals[1].vm.$emit('stay');
    await flushPromises();
    await wrapper.vm.$nextTick();
    expect(wrapper.find('[data-testid="edit-connection-step-filters"]').exists()).toBe(true);
    await wrapper.find('[data-testid="edit-connection-back"]').trigger('click');
    await flushPromises();
    await wrapper.vm.$nextTick();
    await wrapper.findAllComponents(NavigationGuardModal)[1].vm.$emit('leave');
    await flushPromises();
    await wrapper.vm.$nextTick();
    expect(wrapper.find('[data-testid="edit-connection-step-connection"]').exists()).toBe(true);
    wrapper.unmount();
  });
});
