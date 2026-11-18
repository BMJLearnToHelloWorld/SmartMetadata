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
import type { DOMWrapper } from '@vue/test-utils';
import Antd, { Select, message } from 'ant-design-vue';
import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryHistory, createRouter } from 'vue-router';
import { createTestI18n } from '@/test/i18n';
import FilterPatternCard from '@/components/ingestion/FilterPatternCard.vue';
import TestConnectionCard from '@/components/ingestion/TestConnectionCard.vue';
import AddServiceView from './AddServiceView.vue';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/**
 * Drive one filter-pattern composer card (the wizard's filter step renders
 * FilterPatternCard composers via SchemaField since the Issue-4 parity
 * batch). The operator select is driven to `regex` so the entered value
 * round-trips verbatim into the FilterPattern object; the composer's
 * default-operator conversions are covered by the FilterPatternCard /
 * filterPatterns tests, not here.
 */
async function addComposerCondition(
  card: DOMWrapper<Element>,
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

describe('AddServiceView', () => {
  const calls: Array<{ url: string; method?: string }> = [];
  beforeEach(() => {
    calls.length = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        calls.push({ url, method: init?.method });
        if (url.includes('/api/v1/services/databaseServices') && init?.method === 'POST') {
          return jsonResponse({ id: 's9', name: 'warehouse', serviceType: 'Postgres' });
        }
        return new Response('not found', { status: 404 });
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('walks type, connection, and filter steps and creates the service', async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/ingestion/services/add', name: 'ingestion-service-add', component: AddServiceView },
        {
          path: '/ingestion/services/:kind/:id',
          name: 'ingestion-service',
          component: { template: '<div>svc</div>' },
          props: true,
        },
      ],
    });
    await router.push('/ingestion/services/add');
    await router.isReady();
    const wrapper = mount(AddServiceView, {
      global: { plugins: [pinia, router, Antd, createTestI18n()] },
    });
    await flushPromises();

    expect(wrapper.find('[data-testid="wizard-step-type"]').exists()).toBe(true);
    await wrapper.find('[data-testid="wizard-next"]').trigger('click');
    expect(wrapper.find('[data-testid="wizard-step-connection"]').exists()).toBe(true);
    // S-03: the residual alert is replaced by the shared test-connection card.
    expect(wrapper.find('[data-testid="wizard-test-connection-residual"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="test-connection"]').exists()).toBe(true);

    const nameInput = wrapper.find('[data-testid="wizard-service-name"]');
    await nameInput.setValue('warehouse');
    await wrapper.find('[data-testid="service-host-port"]').setValue('localhost:5432');
    await wrapper.find('[data-testid="wizard-next"]').trigger('click');
    expect(wrapper.find('[data-testid="wizard-step-filter"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="filter-section-schemaFilterPattern"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="filter-section-storedProcedureFilterPattern"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="wizard-filter-residual"]').exists()).toBe(true);

    await wrapper.find('[data-testid="wizard-create"]').trigger('click');
    await flushPromises();
    expect(calls.some((call) => call.url.includes('/api/v1/services/databaseServices') && call.method === 'POST')).toBe(true);
    expect(router.currentRoute.value.name).toBe('ingestion-service');
    expect(router.currentRoute.value.params).toMatchObject({ kind: 'database', id: 's9' });
  });

  it('carries entered filter patterns into the service connection.config as FilterPattern objects (P-12, D-L3)', async () => {
    const serviceBodies: Array<{ url: string; body: unknown }> = [];
    const triggerBodies: unknown[] = [];
    let pipelinePosts = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.includes('/api/v1/services/databaseServices') && init?.method === 'POST') {
          serviceBodies.push({ url, body: JSON.parse(String(init?.body)) });
          return jsonResponse({ id: 's9', name: 'warehouse', serviceType: 'Postgres' });
        }
        if (url.includes('/api/v1/apps/trigger/') && init?.method === 'POST') {
          triggerBodies.push(JSON.parse(String(init?.body)));
          return new Response('', { status: 200 });
        }
        if (url.includes('/api/v1/services/ingestionPipelines') && init?.method === 'POST') {
          pipelinePosts += 1;
          return jsonResponse({
            id: 'p1',
            name: 'warehouse-metadata',
            pipelineType: 'metadata',
            service: { id: 's9', type: 'databaseService' },
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
        { path: '/ingestion/services/add', name: 'ingestion-service-add', component: AddServiceView },
        {
          path: '/ingestion/services/:kind/:id',
          name: 'ingestion-service',
          component: { template: '<div>svc</div>' },
          props: true,
        },
      ],
    });
    await router.push('/ingestion/services/add');
    await router.isReady();
    const wrapper = mount(AddServiceView, {
      global: { plugins: [pinia, router, Antd, createTestI18n()] },
    });
    await flushPromises();

    await wrapper.find('[data-testid="wizard-next"]').trigger('click');
    await wrapper.find('[data-testid="wizard-service-name"]').setValue('warehouse');
    await wrapper.find('[data-testid="service-host-port"]').setValue('localhost:5432');
    await wrapper.find('[data-testid="wizard-next"]').trigger('click');
    expect(wrapper.find('[data-testid="wizard-step-filter"]').exists()).toBe(true);
    const schemaCard = wrapper.find('[data-testid="filter-section-schemaFilterPattern"]');
    expect(schemaCard.exists()).toBe(true);
    // The include composer renders only in only-specific mode.
    await schemaCard.find('[data-testid="schemaFilterPattern-only-specific-button"]').trigger('click');
    await addComposerCondition(schemaCard, 'include', 'public');
    await addComposerCondition(schemaCard, 'exclude', '^tmp_.*$');
    await wrapper.find('[data-testid="wizard-create"]').trigger('click');
    await flushPromises();

    // P-12: the wizard creates only the service. The entered scope is
    // merged into the service create request's connection.config (so the
    // add-ingestion form can prefill from it later, P-08(c)); no
    // pipeline is created here. D-L3: the merged scope is the declared
    // *FilterPattern object — the flat includeSchemas string the old
    // wizard wrote is undeclared on the connection schema and the
    // server rejects it on encrypt.
    expect(serviceBodies).toHaveLength(1);
    const serviceBody = serviceBodies[0].body as {
      connection?: { config?: Record<string, unknown> };
    };
    const config = serviceBody.connection?.config ?? {};
    expect(config.schemaFilterPattern).toEqual({
      includes: ['public'],
      // F5: the schema card seeds pin's schema-default exclude
      // (^information_schema$) into the fresh card; the first user
      // edit carries it into the payload alongside the entered rule.
      excludes: ['^information_schema$', '^tmp_.*$'],
    });
    expect(Object.keys(config).filter((key) => key.endsWith('FilterPattern'))).toEqual([
      'schemaFilterPattern',
    ]);
    expect(config.includeSchemas).toBeUndefined();
    expect(config.includeViews).toBeUndefined();
    expect(config.includeTopics).toBeUndefined();
    expect(config.includeDashboards).toBeUndefined();
    expect(config.includeCharts).toBeUndefined();
    expect(config.includeContainers).toBeUndefined();
    expect(config.generateSampleData).toBeUndefined();
    expect(pipelinePosts).toBe(0);
    expect(router.currentRoute.value.name).toBe('ingestion-service');
    // D-11: P-12's removal of direct pipeline creation stands — the
    // wizard triggers AutoPilot instead, with the service entity
    // link (the create response carries no FQN, so the mapper falls
    // back to the service name).
    expect(triggerBodies).toEqual([{ entityLink: '<#E::databaseService::warehouse>' }]);
  });

  it('resets entered filter scope on kind change instead of merging it into the new kind (D-L3)', async () => {
    const serviceBodies: Array<{ body: unknown }> = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.includes('/api/v1/services/messagingServices') && init?.method === 'POST') {
          serviceBodies.push({ body: JSON.parse(String(init?.body)) });
          return jsonResponse({ id: 'm1', name: 'warehouse', serviceType: 'Kafka' });
        }
        if (url.includes('/api/v1/apps/trigger/') && init?.method === 'POST') {
          return new Response('', { status: 200 });
        }
        return new Response('not found', { status: 404 });
      }),
    );
    const pinia = createPinia();
    setActivePinia(pinia);
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/ingestion/services/add', name: 'ingestion-service-add', component: AddServiceView },
        {
          path: '/ingestion/services/:kind/:id',
          name: 'ingestion-service',
          component: { template: '<div>svc</div>' },
          props: true,
        },
      ],
    });
    await router.push('/ingestion/services/add');
    await router.isReady();
    const wrapper = mount(AddServiceView, {
      global: { plugins: [pinia, router, Antd, createTestI18n()] },
    });
    await flushPromises();

    await wrapper.find('[data-testid="wizard-next"]').trigger('click');
    await wrapper.find('[data-testid="wizard-service-name"]').setValue('warehouse');
    await wrapper.find('[data-testid="service-host-port"]').setValue('localhost:5432');
    await wrapper.find('[data-testid="wizard-next"]').trigger('click');
    const schemaCard = wrapper.find('[data-testid="filter-section-schemaFilterPattern"]');
    expect(schemaCard.exists()).toBe(true);
    await schemaCard.find('[data-testid="schemaFilterPattern-only-specific-button"]').trigger('click');
    await addComposerCondition(schemaCard, 'include', 'public');
    await wrapper.find('[data-testid="wizard-back"]').trigger('click');
    await wrapper.find('[data-testid="wizard-back"]').trigger('click');
    const selects = wrapper.findAllComponents(Select);
    await selects[0]?.vm.$emit('update:value', 'messaging');
    await wrapper.find('[data-testid="wizard-next"]').trigger('click');
    await wrapper.find('[data-testid="wizard-next"]').trigger('click');
    expect(wrapper.find('[data-testid="wizard-step-filter"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="filter-section-schemaFilterPattern"]').exists()).toBe(false);
    const topicCard = wrapper.find('[data-testid="filter-section-topicFilterPattern"]');
    expect(topicCard.exists()).toBe(true);
    // No entered scope survived the kind change: no include chips.
    // The exclude chips are exactly pin's seeded Kafka topic system
    // excludes (F5) — seeded state, not entered scope.
    expect(topicCard.findAll('[data-testid^="include-chip-"]').length).toBe(0);
    const excludeChips = topicCard.findAll('[data-testid^="exclude-chip-"]');
    expect(excludeChips.length).toBe(3);
    const chipText = excludeChips.map((chip) => chip.text()).join(' ');
    expect(chipText).toContain('__');
    expect(chipText).toContain('_schemas');
    expect(chipText).toContain('_confluent');
    await topicCard.find('[data-testid="topicFilterPattern-only-specific-button"]').trigger('click');
    await addComposerCondition(topicCard, 'include', 'orders');
    await wrapper.find('[data-testid="wizard-create"]').trigger('click');
    await flushPromises();

    expect(serviceBodies).toHaveLength(1);
    const config = (
      serviceBodies[0].body as { connection?: { config?: Record<string, unknown> } }
    ).connection?.config ?? {};
    expect(config.topicFilterPattern).toEqual({
      includes: ['orders'],
      // F5: the first edit carries the seeded system excludes.
      excludes: ['^__.*', '^_schemas$', '^_confluent.*'],
    });
    expect(config.schemaFilterPattern).toBeUndefined();
  });

  it('resets entered filter scope on service-type change within a kind (D-L3)', async () => {
    const serviceBodies: Array<{ body: unknown }> = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.includes('/api/v1/services/databaseServices') && init?.method === 'POST') {
          serviceBodies.push({ body: JSON.parse(String(init?.body)) });
          return jsonResponse({ id: 's9', name: 'warehouse', serviceType: 'Databricks' });
        }
        if (url.includes('/api/v1/apps/trigger/') && init?.method === 'POST') {
          return new Response('', { status: 200 });
        }
        return new Response('not found', { status: 404 });
      }),
    );
    const pinia = createPinia();
    setActivePinia(pinia);
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/ingestion/services/add', name: 'ingestion-service-add', component: AddServiceView },
        {
          path: '/ingestion/services/:kind/:id',
          name: 'ingestion-service',
          component: { template: '<div>svc</div>' },
          props: true,
        },
      ],
    });
    await router.push('/ingestion/services/add');
    await router.isReady();
    const wrapper = mount(AddServiceView, {
      global: { plugins: [pinia, router, Antd, createTestI18n()] },
    });
    await flushPromises();

    await wrapper.find('[data-testid="wizard-next"]').trigger('click');
    await wrapper.find('[data-testid="wizard-service-name"]').setValue('warehouse');
    await wrapper.find('[data-testid="service-host-port"]').setValue('localhost:5432');
    await wrapper.find('[data-testid="wizard-next"]').trigger('click');
    const procedureCard = wrapper.find('[data-testid="filter-section-storedProcedureFilterPattern"]');
    expect(procedureCard.exists()).toBe(true);
    await procedureCard.find('[data-testid="storedProcedureFilterPattern-only-specific-button"]').trigger('click');
    await addComposerCondition(procedureCard, 'include', 'sp_%');
    await wrapper.find('[data-testid="wizard-back"]').trigger('click');
    await wrapper.find('[data-testid="wizard-back"]').trigger('click');
    const selects = wrapper.findAllComponents(Select);
    await selects[1]?.vm.$emit('update:value', 'Databricks');
    await wrapper.find('[data-testid="wizard-next"]').trigger('click');
    await wrapper.find('[data-testid="wizard-next"]').trigger('click');
    expect(wrapper.find('[data-testid="wizard-step-filter"]').exists()).toBe(true);
    // Databricks declares no storedProcedureFilterPattern: the field is
    // gone and the entered value must not survive into the create.
    expect(wrapper.find('[data-testid="filter-section-storedProcedureFilterPattern"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="filter-section-schemaFilterPattern"]').exists()).toBe(true);
    await wrapper.find('[data-testid="wizard-create"]').trigger('click');
    await flushPromises();

    expect(serviceBodies).toHaveLength(1);
    const config = (
      serviceBodies[0].body as { connection?: { config?: Record<string, unknown> } }
    ).connection?.config ?? {};
    expect(config.storedProcedureFilterPattern).toBeUndefined();
    expect(Object.keys(config).filter((key) => key.endsWith('FilterPattern'))).toEqual([]);
  });

  it('still navigates when the AutoPilot trigger fails (D-1, pin trigger-failure path)', async () => {
    let pipelinePosts = 0;
    let triggerPosts = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.includes('/api/v1/services/databaseServices') && init?.method === 'POST') {
          return jsonResponse({ id: 's9', name: 'warehouse', serviceType: 'Postgres' });
        }
        if (url.includes('/api/v1/apps/trigger/') && init?.method === 'POST') {
          triggerPosts += 1;
          return new Response('trigger failed', { status: 500 });
        }
        if (url.includes('/api/v1/services/ingestionPipelines') && init?.method === 'POST') {
          pipelinePosts += 1;
          return jsonResponse({ id: 'p1', name: 'warehouse-metadata', pipelineType: 'metadata' });
        }
        return new Response('not found', { status: 404 });
      }),
    );
    const pinia = createPinia();
    setActivePinia(pinia);
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/ingestion/services/add', name: 'ingestion-service-add', component: AddServiceView },
        {
          path: '/ingestion/services/:kind/:id',
          name: 'ingestion-service',
          component: { template: '<div>svc</div>' },
          props: true,
        },
      ],
    });
    await router.push('/ingestion/services/add');
    await router.isReady();
    const wrapper = mount(AddServiceView, {
      global: { plugins: [pinia, router, Antd, createTestI18n()] },
    });
    await flushPromises();

    await wrapper.find('[data-testid="wizard-next"]').trigger('click');
    await wrapper.find('[data-testid="wizard-service-name"]').setValue('warehouse');
    await wrapper.find('[data-testid="service-host-port"]').setValue('localhost:5432');
    await wrapper.find('[data-testid="wizard-next"]').trigger('click');
    await wrapper.find('[data-testid="wizard-create"]').trigger('click');
    await flushPromises();

    // The trigger failure is swallowed inside the helper (the pin's
    // own quirk): no pipeline is created directly, the wizard still
    // navigates to the new service, and the trigger was attempted.
    expect(triggerPosts).toBe(1);
    expect(pipelinePosts).toBe(0);
    expect(router.currentRoute.value.name).toBe('ingestion-service');
  });

  it('creates a security service without triggering AutoPilot and without the toast (D-1 exclusion)', async () => {
    let triggerPosts = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.includes('/api/v1/services/securityServices') && init?.method === 'POST') {
          return jsonResponse({ id: 's7', name: 'ranger', serviceType: 'Ranger' });
        }
        if (url.includes('/api/v1/apps/trigger/') && init?.method === 'POST') {
          triggerPosts += 1;
          return new Response('', { status: 200 });
        }
        return new Response('not found', { status: 404 });
      }),
    );
    const successSpy = vi.spyOn(message, 'success');
    const pinia = createPinia();
    setActivePinia(pinia);
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/ingestion/services/add', name: 'ingestion-service-add', component: AddServiceView },
        {
          path: '/ingestion/services/:kind/:id',
          name: 'ingestion-service',
          component: { template: '<div>svc</div>' },
          props: true,
        },
      ],
    });
    await router.push('/ingestion/services/add');
    await router.isReady();
    const wrapper = mount(AddServiceView, {
      global: { plugins: [pinia, router, Antd, createTestI18n()] },
    });
    await flushPromises();

    const selects = wrapper.findAllComponents(Select);
    await selects[0]?.vm.$emit('update:value', 'security');
    await wrapper.find('[data-testid="wizard-next"]').trigger('click');
    expect(wrapper.find('[data-testid="wizard-step-connection"]').exists()).toBe(true);
    await wrapper.find('[data-testid="wizard-service-name"]').setValue('ranger');
    await wrapper.find('[data-testid="service-host-port"]').setValue('http://localhost:6080');
    await wrapper.find('[data-testid="wizard-next"]').trigger('click');
    expect(wrapper.find('[data-testid="wizard-step-filter"]').exists()).toBe(true);
    // L-4: Ranger declares no filter patterns — the wizard-level
    // empty state renders instead of cards.
    expect(wrapper.find('[data-testid="wizard-no-filter-patterns"]').exists()).toBe(true);
    expect(wrapper.findAllComponents(FilterPatternCard).length).toBe(0);
    await wrapper.find('[data-testid="wizard-create"]').trigger('click');
    await flushPromises();

    // Security services get no trigger and no toast; the navigation
    // is the confirmation.
    expect(triggerPosts).toBe(0);
    expect(successSpy).not.toHaveBeenCalled();
    expect(router.currentRoute.value.name).toBe('ingestion-service');
    expect(router.currentRoute.value.params).toMatchObject({ kind: 'security', id: 's7' });
    successSpy.mockRestore();
  });

  it('shows the AutoPilot triggered toast for 5 seconds after a successful create (D-1)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.includes('/api/v1/services/databaseServices') && init?.method === 'POST') {
          return jsonResponse({ id: 's9', name: 'warehouse', serviceType: 'Postgres' });
        }
        if (url.includes('/api/v1/apps/trigger/') && init?.method === 'POST') {
          return new Response('', { status: 200 });
        }
        return new Response('not found', { status: 404 });
      }),
    );
    const successSpy = vi.spyOn(message, 'success');
    const pinia = createPinia();
    setActivePinia(pinia);
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/ingestion/services/add', name: 'ingestion-service-add', component: AddServiceView },
        {
          path: '/ingestion/services/:kind/:id',
          name: 'ingestion-service',
          component: { template: '<div>svc</div>' },
          props: true,
        },
      ],
    });
    await router.push('/ingestion/services/add');
    await router.isReady();
    const wrapper = mount(AddServiceView, {
      global: { plugins: [pinia, router, Antd, createTestI18n()] },
    });
    await flushPromises();

    await wrapper.find('[data-testid="wizard-next"]').trigger('click');
    await wrapper.find('[data-testid="wizard-service-name"]').setValue('warehouse');
    await wrapper.find('[data-testid="service-host-port"]').setValue('localhost:5432');
    await wrapper.find('[data-testid="wizard-next"]').trigger('click');
    await wrapper.find('[data-testid="wizard-create"]').trigger('click');
    await flushPromises();

    // The pin's 5000ms becomes 5s: antd durations are seconds.
    expect(successSpy).toHaveBeenCalledTimes(1);
    expect(successSpy).toHaveBeenCalledWith(
      'AutoPilot application is triggered, agents will be auto generated and run.',
      5,
    );
    successSpy.mockRestore();
  });

  it('blocks a form-less type at the connection step instead of creating it with undefined connection (A9)', async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/ingestion/services/add', name: 'ingestion-service-add', component: AddServiceView },
      ],
    });
    await router.push('/ingestion/services/add');
    await router.isReady();
    const wrapper = mount(AddServiceView, {
      global: { plugins: [pinia, router, Antd, createTestI18n()] },
    });
    await flushPromises();
    const selects = wrapper.findAllComponents(Select);
    // Kind select first, type select second: switch to api, then to a
    // form-less api type (WEBHOOK has no connection form in this branch).
    await selects[0]?.vm.$emit('update:value', 'api');
    await selects[1]?.vm.$emit('update:value', 'WEBHOOK');
    await wrapper.find('[data-testid="wizard-next"]').trigger('click');
    expect(wrapper.find('[data-testid="wizard-step-connection"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="wizard-no-connection-form"]').exists()).toBe(true);
    await wrapper.find('[data-testid="wizard-service-name"]').setValue('hook');
    expect((wrapper.find('[data-testid="wizard-next"]').element as HTMLButtonElement).disabled).toBe(true);
    // S-03 gating: no connection form means no test card either.
    expect(wrapper.find('[data-testid="test-connection"]').exists()).toBe(false);
    expect(calls.filter((call) => call.method === 'POST')).toHaveLength(0);
  });

  it('offers only the eleven listable kinds in the wizard, never llm/mcp (C-2)', async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/ingestion/services/add', name: 'ingestion-service-add', component: AddServiceView },
      ],
    });
    await router.push('/ingestion/services/add');
    await router.isReady();
    const wrapper = mount(AddServiceView, {
      global: { plugins: [pinia, router, Antd, createTestI18n()] },
    });
    await flushPromises();
    const kindSelect = wrapper
      .findAllComponents(Select)
      .find((candidate) => candidate.attributes('data-testid') === 'wizard-service-kind');
    expect(kindSelect?.exists()).toBe(true);
    // The Select consumes its Option children as data (they never mount
    // as components), so the offered set is read from the slot VNodes
    // the wizard passes in — exactly the options a user can pick.
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
    collect((kindSelect?.vm.$slots.default?.() ?? []) as unknown[]);
    expect(optionValues).toEqual([
      'database',
      'messaging',
      'dashboard',
      'storage',
      'pipeline',
      'metadata',
      'security',
      'mlmodel',
      'search',
      'api',
      'drive',
    ]);
    expect(optionValues).not.toContain('llm');
    expect(optionValues).not.toContain('mcp');
  });

  it('renders the test-connection card on the connection step with live form wiring (S-03)', async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/ingestion/services/add', name: 'ingestion-service-add', component: AddServiceView },
        {
          path: '/ingestion/services/:kind/:id',
          name: 'ingestion-service',
          component: { template: '<div>svc</div>' },
          props: true,
        },
      ],
    });
    await router.push('/ingestion/services/add');
    await router.isReady();
    const wrapper = mount(AddServiceView, {
      global: { plugins: [pinia, router, Antd, createTestI18n()] },
    });
    await flushPromises();

    await wrapper.find('[data-testid="wizard-next"]').trigger('click');
    expect(wrapper.find('[data-testid="wizard-test-connection-residual"]').exists()).toBe(false);
    const card = wrapper.findComponent(TestConnectionCard);
    expect(card.exists()).toBe(true);
    expect(card.props('connectionType')).toBe('Postgres');
    expect(card.props('kind')).toBe('database');
    expect(card.props('serviceName')).toBe('');
    // The orchestrator probe 404s under this mock, so Airflow is unavailable.
    expect(card.props('airflowAvailable')).toBe(false);
    expect(card.props('missingRequiredFieldsCount')).toBe(3);
    const validate = card.props('onValidateFormRequiredFields');
    if (!validate) throw new Error('expected the card validator prop');
    expect(validate()).toBe(false);

    await wrapper.find('[data-testid="wizard-service-name"]').setValue('warehouse');
    await wrapper.find('[data-testid="service-host-port"]').setValue('localhost:5432');
    expect(card.props('serviceName')).toBe('warehouse');
    expect(card.props('missingRequiredFieldsCount')).toBe(2);
    const connection = card.props('getConnection')() as Record<string, unknown>;
    expect(connection['config']).toMatchObject({ hostPort: 'localhost:5432' });
  });

  it('passes pin filter-card options and seeds system excludes on the fresh wizard (F5, M-F3/M-W2)', async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/ingestion/services/add', name: 'ingestion-service-add', component: AddServiceView },
      ],
    });
    await router.push('/ingestion/services/add');
    await router.isReady();
    const wrapper = mount(AddServiceView, {
      global: { plugins: [pinia, router, Antd, createTestI18n()] },
    });
    await flushPromises();

    await wrapper.find('[data-testid="wizard-next"]').trigger('click');
    await wrapper.find('[data-testid="wizard-service-name"]').setValue('warehouse');
    await wrapper.find('[data-testid="service-host-port"]').setValue('localhost:5432');
    await wrapper.find('[data-testid="wizard-next"]').trigger('click');
    expect(wrapper.find('[data-testid="wizard-step-filter"]').exists()).toBe(true);

    const cards = wrapper.findAllComponents(FilterPatternCard);
    const byField = new Map(cards.map((card) => [card.props('fieldName'), card]));
    expect([...byField.keys()].sort()).toEqual([
      'databaseFilterPattern',
      'schemaFilterPattern',
      'storedProcedureFilterPattern',
      'tableFilterPattern',
    ]);
    // Pin FiltersConfigForm: first two open, fresh create has no
    // existing data, schema defaults feed systemExcludes.
    expect(byField.get('databaseFilterPattern')?.props('defaultOpen')).toBe(true);
    expect(byField.get('schemaFilterPattern')?.props('defaultOpen')).toBe(true);
    expect(byField.get('tableFilterPattern')?.props('defaultOpen')).toBe(false);
    expect(byField.get('storedProcedureFilterPattern')?.props('defaultOpen')).toBe(false);
    for (const card of cards) {
      expect(card.props('hasExistingData')).toBe(false);
    }
    expect(byField.get('databaseFilterPattern')?.props('systemExcludes')).toEqual([
      '^template1$',
      '^template0$',
    ]);
    expect(byField.get('schemaFilterPattern')?.props('systemExcludes')).toEqual([
      '^information_schema$',
    ]);
    expect(byField.get('tableFilterPattern')?.props('systemExcludes')).toEqual([]);
    // The seeded excludes render as chips on the fresh cards, with
    // the system-excludes toggle only where defaults exist.
    const databaseSection = wrapper.find('[data-testid="filter-section-databaseFilterPattern"]');
    const databaseChips = databaseSection.findAll('[data-testid^="exclude-chip-"]');
    expect(databaseChips.length).toBe(2);
    expect(databaseChips.map((chip) => chip.text()).join(' ')).toContain('template1');
    expect(
      databaseSection.find('[data-testid="databaseFilterPattern-exclude-system-filters"]').exists(),
    ).toBe(true);
    const schemaChips = wrapper
      .find('[data-testid="filter-section-schemaFilterPattern"]')
      .findAll('[data-testid^="exclude-chip-"]');
    expect(schemaChips.length).toBe(1);
    expect(schemaChips[0]?.text()).toContain('information_schema');
    expect(
      wrapper
        .find('[data-testid="filter-section-tableFilterPattern"]')
        .find('[data-testid="tableFilterPattern-exclude-system-filters"]')
        .exists(),
    ).toBe(false);
  });

  it('shows the connected message on the filter step only after a passed test connection (L-5) and states the P-12/D-L3 truth (F11 L-1)', async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/ingestion/services/add', name: 'ingestion-service-add', component: AddServiceView },
      ],
    });
    await router.push('/ingestion/services/add');
    await router.isReady();
    const wrapper = mount(AddServiceView, {
      global: { plugins: [pinia, router, Antd, createTestI18n()] },
    });
    await flushPromises();

    await wrapper.find('[data-testid="wizard-next"]').trigger('click');
    await wrapper.find('[data-testid="wizard-service-name"]').setValue('warehouse');
    await wrapper.find('[data-testid="service-host-port"]').setValue('localhost:5432');
    await wrapper.find('[data-testid="wizard-next"]').trigger('click');
    expect(wrapper.find('[data-testid="wizard-step-filter"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="wizard-connected"]').exists()).toBe(false);

    await wrapper.find('[data-testid="wizard-back"]').trigger('click');
    await wrapper.findComponent(TestConnectionCard).vm.$emit('status-change', true);
    await wrapper.find('[data-testid="wizard-next"]').trigger('click');
    expect(wrapper.find('[data-testid="wizard-connected"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="wizard-connected"]').text()).toContain(
      'Connected to localhost:5432',
    );
    const residual = wrapper.find('[data-testid="wizard-filter-residual"]');
    expect(residual.exists()).toBe(true);
    expect(residual.text()).toContain('stored in the service connection configuration');
    expect(residual.text()).toContain('AutoPilot creates the ingestion agents');
    expect(residual.text()).toContain('no pipeline is created with the service');
  });
});
