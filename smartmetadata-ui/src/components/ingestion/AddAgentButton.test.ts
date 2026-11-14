/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0.
 */
import { flushPromises, mount } from '@vue/test-utils';
import Antd from 'ant-design-vue';
import { afterEach, describe, expect, it } from 'vitest';
import { createMemoryHistory, createRouter, type Router } from 'vue-router';
import { createTestI18n } from '@/test/i18n';
import type { PipelineType } from '@/types/ingestion';
import AddAgentButton from './AddAgentButton.vue';

async function makeRouter(): Promise<Router> {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      {
        path: '/ingestion/services/:kind/:id/add/:ingestionType',
        name: 'ingestion-service-add-ingestion',
        component: { template: '<div>add</div>' },
      },
    ],
  });
  await router.push('/');
  await router.isReady();
  return router;
}

function mountButton(
  router: Router,
  props: {
    types: PipelineType[];
    isDataInsightExists?: boolean;
    disabled?: boolean;
  },
) {
  return mount(AddAgentButton, {
    props: {
      types: props.types,
      isDataInsightExists: props.isDataInsightExists ?? false,
      disabled: props.disabled ?? false,
      serviceKind: 'database',
      serviceId: 's1',
    },
    attachTo: document.body,
    global: { plugins: [Antd, createTestI18n(), router] },
  });
}

async function openMenu(wrapper: ReturnType<typeof mountButton>) {
  await wrapper.find('[data-testid="add-new-ingestion-button"]').trigger('click');
  await flushPromises();
}

describe('AddAgentButton (official AddIngestionButton)', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('renders nothing when no kind is addable', async () => {
    const router = await makeRouter();
    const wrapper = mountButton(router, { types: [] });
    expect(wrapper.find('[data-testid="add-new-ingestion-button"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it('renders the Add Agent button, disabled when the service is unavailable', async () => {
    const router = await makeRouter();
    const wrapper = mountButton(router, { types: ['metadata'], disabled: true });
    const button = wrapper.find('[data-testid="add-new-ingestion-button"]');
    expect(button.exists()).toBe(true);
    expect(button.text()).toContain('Add Agent');
    expect((button.element as HTMLButtonElement).disabled).toBe(true);
    wrapper.unmount();
  });

  it('lists the flag-driven kinds with Add X Agent labels', async () => {
    const router = await makeRouter();
    const wrapper = mountButton(router, { types: ['metadata', 'usage', 'dbt'] });
    await openMenu(wrapper);
    expect(document.querySelector('[data-testid="agent-item-metadata"]')?.textContent).toContain(
      'Add Metadata Agent',
    );
    expect(document.querySelector('[data-testid="agent-item-usage"]')?.textContent).toContain(
      'Add Usage Agent',
    );
    expect(document.querySelector('[data-testid="agent-item-dbt"]')?.textContent).toContain(
      'Add dbt Agent',
    );
    expect(document.querySelector('[data-testid="agent-item-TestSuite"]')).toBeNull();
    wrapper.unmount();
  });

  it('disables the dataInsight item when one already exists', async () => {
    const router = await makeRouter();
    const wrapper = mountButton(router, { types: ['dataInsight'], isDataInsightExists: true });
    await openMenu(wrapper);
    const item = document.querySelector('[data-testid="agent-item-dataInsight"]');
    expect(item?.textContent).toContain('Add Data Insight Agent');
    expect(item?.getAttribute('aria-disabled')).toBe('true');
    wrapper.unmount();
  });

  it('navigates to the add-ingestion route with the chosen kind', async () => {
    const router = await makeRouter();
    const wrapper = mountButton(router, { types: ['metadata', 'usage'] });
    await openMenu(wrapper);
    const item = document.querySelector<HTMLElement>('[data-testid="agent-item-usage"]');
    expect(item).not.toBeNull();
    item?.click();
    await flushPromises();
    expect(router.currentRoute.value.name).toBe('ingestion-service-add-ingestion');
    expect(router.currentRoute.value.params).toEqual({
      kind: 'database',
      id: 's1',
      ingestionType: 'usage',
    });
    wrapper.unmount();
  });
});
