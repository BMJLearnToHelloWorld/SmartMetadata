/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may
 * not use this file except in compliance with the License. You may obtain
 * a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { DOMWrapper, flushPromises, mount } from '@vue/test-utils';
import Antd from 'ant-design-vue';
import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryHistory, createRouter } from 'vue-router';
import DomainSelect from './DomainSelect.vue';
import { useAuthStore } from '@/stores/auth';
import { useDomainStore } from '@/stores/domain';
import { createTestI18n } from '@/test/i18n';

const DOMAINS = [
  { id: 'd1', name: 'alpha', displayName: 'Alpha', domainType: 'aggregate' },
  { id: 'd2', name: 'beta', displayName: 'Beta', domainType: 'aggregate' },
];

interface PatchCall {
  url: string;
  method: string;
  body: unknown;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('DomainSelect (navbar button trigger, pin NavBar domainScopeSelector)', () => {
  let patchCalls: PatchCall[];
  let router: ReturnType<typeof createRouter>;
  let goSpy: ReturnType<typeof vi.spyOn>;

  function stubFetch(patchStatus = 200) {
    patchCalls = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.includes('/v1/domains')) {
          return jsonResponse({ data: DOMAINS, paging: { total: 2 } });
        }
        if (url.includes('/v1/users/')) {
          patchCalls.push({
            url,
            method: init?.method ?? 'GET',
            body: init?.body ? JSON.parse(String(init.body)) : undefined,
          });
          // updateUserDetail maps the response and throws when it
          // carries no id/name, so the stub answers a real user.
          return jsonResponse({ id: 'u1', name: 'alice' }, patchStatus);
        }
        return new Response('not found', { status: 404 });
      }),
    );
  }

  async function mountButton() {
    const pinia = createPinia();
    setActivePinia(pinia);
    useAuthStore().user = { id: 'u1', name: 'alice', displayName: 'Alice' };
    router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/', name: 'home', component: { template: '<div>home</div>' } }],
    });
    await router.push('/');
    await router.isReady();
    goSpy = vi.spyOn(router, 'go');
    const wrapper = mount(DomainSelect, {
      attachTo: document.body,
      props: { triggerVariant: 'button', testId: 'domain-dropdown' },
      global: { plugins: [pinia, router, Antd, createTestI18n()] },
    });
    await flushPromises();
    await flushPromises();
    return wrapper;
  }

  function bodyOption(testId: string): DOMWrapper<Element> {
    const el = document.body.querySelector(`[data-testid="${testId}"]`);
    expect(el).not.toBeNull();
    return new DOMWrapper(el as Element);
  }

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    localStorage.clear();
    sessionStorage.clear();
    document.body.innerHTML = '';
  });

  it('shows a globe button trigger reading All Domains when nothing is selected', async () => {
    stubFetch();
    const wrapper = await mountButton();
    const trigger = wrapper.find('[data-testid="domain-dropdown"]');
    expect(trigger.exists()).toBe(true);
    expect(trigger.text()).toContain('All Domains');
    expect(trigger.classes()).not.toContain('domain-select__trigger--active');
    expect(wrapper.find('[data-testid="domain-select"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it('shows the active domain name and the brand state when a domain is selected', async () => {
    localStorage.setItem('sm.domain.v1', 'd1');
    stubFetch();
    const wrapper = await mountButton();
    const trigger = wrapper.find('[data-testid="domain-dropdown"]');
    expect(trigger.text()).toContain('Alpha');
    expect(trigger.classes()).toContain('domain-select__trigger--active');
    wrapper.unmount();
  });

  it('PATCHes defaultDomain and reloads when a domain is picked', async () => {
    stubFetch();
    const wrapper = await mountButton();
    await wrapper.find('[data-testid="domain-dropdown"]').trigger('click');
    await flushPromises();
    await bodyOption('domain-option-d2').trigger('click');
    await flushPromises();
    expect(patchCalls).toHaveLength(1);
    expect(patchCalls[0].url).toContain('/v1/users/u1');
    expect(patchCalls[0].method).toBe('PATCH');
    expect(patchCalls[0].body).toEqual([
      { op: 'add', path: '/defaultDomain', value: { id: 'd2', type: 'domain' } },
    ]);
    expect(goSpy).toHaveBeenCalledWith(0);
    expect(useDomainStore().activeDomainId).toBe('d2');
    wrapper.unmount();
  });

  it('clears defaultDomain (null) and reloads when All Domains is picked', async () => {
    localStorage.setItem('sm.domain.v1', 'd1');
    stubFetch();
    const wrapper = await mountButton();
    await wrapper.find('[data-testid="domain-dropdown"]').trigger('click');
    await flushPromises();
    await bodyOption('domain-option-all').trigger('click');
    await flushPromises();
    expect(patchCalls).toHaveLength(1);
    expect(patchCalls[0].body).toEqual([
      { op: 'add', path: '/defaultDomain', value: null },
    ]);
    expect(goSpy).toHaveBeenCalledWith(0);
    expect(useDomainStore().activeDomainId).toBeNull();
    wrapper.unmount();
  });

  it('does not reload and keeps the scope when the PATCH fails', async () => {
    stubFetch(500);
    const wrapper = await mountButton();
    await wrapper.find('[data-testid="domain-dropdown"]').trigger('click');
    await flushPromises();
    await bodyOption('domain-option-d1').trigger('click');
    await flushPromises();
    expect(patchCalls).toHaveLength(1);
    expect(goSpy).not.toHaveBeenCalled();
    expect(useDomainStore().activeDomainId).toBeNull();
    expect(useDomainStore().switchErrorMessage).not.toBe('');
    wrapper.unmount();
  });

  it('select variant still renders the Select and switches locally without a PATCH', async () => {
    stubFetch();
    const pinia = createPinia();
    setActivePinia(pinia);
    useAuthStore().user = { id: 'u1', name: 'alice' };
    const wrapper = mount(DomainSelect, {
      attachTo: document.body,
      global: { plugins: [pinia, Antd, createTestI18n()] },
    });
    await flushPromises();
    await flushPromises();
    expect(wrapper.find('[data-testid="domain-select"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="domain-dropdown"]').exists()).toBe(false);
    expect(wrapper.text()).toContain('All Domains');
    // Antd renders Select options in a portal only once the dropdown
    // opens (on mousedown on the selector element), so the option
    // labels are asserted from the opened list.
    await wrapper.find('.ant-select-selector').trigger('mousedown');
    await flushPromises();
    expect(document.body.textContent).toContain('Alpha');
    expect(document.body.textContent).toContain('Beta');
    const store = useDomainStore();
    store.selectDomain('d2');
    expect(store.activeDomainId).toBe('d2');
    expect(patchCalls).toHaveLength(0);
    wrapper.unmount();
  });
});

describe('useDomainStore.switchDomain', () => {
  function stubFetch(patchStatus = 200) {
    const patchCalls: PatchCall[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.includes('/v1/users/')) {
          patchCalls.push({
            url,
            method: init?.method ?? 'GET',
            body: init?.body ? JSON.parse(String(init.body)) : undefined,
          });
          return jsonResponse({ id: 'u1', name: 'alice' }, patchStatus);
        }
        return new Response('not found', { status: 404 });
      }),
    );
    return patchCalls;
  }

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
    sessionStorage.clear();
  });

  it('falls back to the local selection with no PATCH when nobody is signed in', async () => {
    const patchCalls = stubFetch();
    const pinia = createPinia();
    setActivePinia(pinia);
    const store = useDomainStore();
    expect(await store.switchDomain('d9')).toBe(true);
    expect(patchCalls).toHaveLength(0);
    expect(store.activeDomainId).toBe('d9');
    expect(localStorage.getItem('sm.domain.v1')).toBe('d9');
  });
});
