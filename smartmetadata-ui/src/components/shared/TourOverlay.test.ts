/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0.
 */
import { flushPromises, mount } from '@vue/test-utils';
import Antd from 'ant-design-vue';
import { createPinia, setActivePinia } from 'pinia';
import { afterEach, describe, expect, it } from 'vitest';
import { createMemoryHistory, createRouter } from 'vue-router';
import { createTestI18n } from '@/test/i18n';
import { useTourStore } from '@/stores/tour';
import TourOverlay from './TourOverlay.vue';

const ROUTE_NAMES = [
  'home',
  'search',
  'ingestion-services',
  'governance-glossaries',
  'ontology-explorer',
  'quality-test-cases',
  'marketplace-overview',
  'context-center-overview',
  'context-center-memories',
];

describe('TourOverlay', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('walks the steps by route, shows progress, and closes on skip', async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const tour = useTourStore();
    const router = createRouter({
      history: createMemoryHistory(),
      routes: ROUTE_NAMES.map((name) => ({ path: `/${name}`, name, component: { template: '<div>stub</div>' } })),
    });
    await router.push({ name: 'home' });
    await router.isReady();
    const wrapper = mount(TourOverlay, {
      attachTo: document.body,
      global: { plugins: [pinia, router, Antd, createTestI18n()] },
    });
    expect(wrapper.find('[data-testid="tour-overlay"]').exists()).toBe(false);
    tour.start();
    await flushPromises();
    expect(wrapper.find('[data-testid="tour-overlay"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="tour-progress"]').text()).toContain('1');
    expect(wrapper.find('[data-testid="tour-prev"]').attributes('disabled')).toBeDefined();
    await wrapper.find('[data-testid="tour-next"]').trigger('click');
    await flushPromises();
    expect(tour.stepIndex).toBe(1);
    expect(router.currentRoute.value.name).toBe('search');
    expect(wrapper.find('[data-testid="tour-progress"]').text()).toContain('2');
    await wrapper.find('[data-testid="tour-skip"]').trigger('click');
    await flushPromises();
    expect(tour.active).toBe(false);
    expect(wrapper.find('[data-testid="tour-overlay"]').exists()).toBe(false);
  });
});
