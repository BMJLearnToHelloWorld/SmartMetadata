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
import TourStartView from './TourStartView.vue';

describe('TourStartView', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('starts the tour and navigates to the first step route', async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const tour = useTourStore();
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/tour', name: 'tour', component: TourStartView },
        { path: '/my-data', name: 'home', component: { template: '<div>home</div>' } },
      ],
    });
    await router.push({ name: 'tour' });
    await router.isReady();
    mount(TourStartView, {
      attachTo: document.body,
      global: { plugins: [pinia, router, Antd, createTestI18n()] },
    });
    await flushPromises();
    expect(tour.active).toBe(true);
    expect(tour.stepIndex).toBe(0);
    expect(router.currentRoute.value.name).toBe('home');
  });
});
