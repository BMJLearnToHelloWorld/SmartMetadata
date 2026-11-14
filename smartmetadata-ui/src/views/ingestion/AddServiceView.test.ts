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
import Antd, { Select, message } from 'ant-design-vue';
import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryHistory, createRouter } from 'vue-router';
import { createTestI18n } from '@/test/i18n';
import AddServiceView from './AddServiceView.vue';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
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
    expect(wrapper.find('[data-testid="wizard-test-connection-residual"]').exists()).toBe(true);

    const nameInput = wrapper.find('[data-testid="wizard-service-name"]');
    await nameInput.setValue('warehouse');
    await wrapper.find('[data-testid="service-host-port"]').setValue('localhost:5432');
    await wrapper.find('[data-testid="wizard-next"]').trigger('click');
    expect(wrapper.find('[data-testid="wizard-step-filter"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="filter-include-schemas"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="wizard-filter-residual"]').exists()).toBe(true);

    await wrapper.find('[data-testid="wizard-create"]').trigger('click');
    await flushPromises();
    expect(calls.some((call) => call.url.includes('/api/v1/services/databaseServices') && call.method === 'POST')).toBe(true);
    expect(router.currentRoute.value.name).toBe('ingestion-service');
    expect(router.currentRoute.value.params).toMatchObject({ kind: 'database', id: 's9' });
  });

  it('carries entered filter scope into the service connection.config (P-12)', async () => {
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
    await wrapper.find('[data-testid="filter-include-schemas"]').setValue('public');
    await wrapper.find('[data-testid="wizard-create"]').trigger('click');
    await flushPromises();

    // P-12: the wizard creates only the service. The entered scope is
    // merged into the service create request's connection.config (so the
    // add-ingestion form can prefill from it later, P-08(c)); no
    // pipeline is created here.
    expect(serviceBodies).toHaveLength(1);
    const serviceBody = serviceBodies[0].body as {
      connection?: { config?: Record<string, unknown> };
    };
    expect(serviceBody.connection?.config?.includeSchemas).toBe('public');
    expect(pipelinePosts).toBe(0);
    expect(router.currentRoute.value.name).toBe('ingestion-service');
    // D-11: P-12's removal of direct pipeline creation stands — the
    // wizard triggers AutoPilot instead, with the service entity
    // link (the create response carries no FQN, so the mapper falls
    // back to the service name).
    expect(triggerBodies).toEqual([{ entityLink: '<#E::databaseService::warehouse>' }]);
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
    // Kind select first, type select second: switch to llm, then to a
    // form-less llm type (Anthropic has no connection form in this branch).
    await selects[0]?.vm.$emit('update:value', 'llm');
    await selects[1]?.vm.$emit('update:value', 'Anthropic');
    await wrapper.find('[data-testid="wizard-next"]').trigger('click');
    expect(wrapper.find('[data-testid="wizard-step-connection"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="wizard-no-connection-form"]').exists()).toBe(true);
    await wrapper.find('[data-testid="wizard-service-name"]').setValue('chat');
    expect((wrapper.find('[data-testid="wizard-next"]').element as HTMLButtonElement).disabled).toBe(true);
    expect(calls.filter((call) => call.method === 'POST')).toHaveLength(0);
  });
});
