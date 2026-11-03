/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0.
 */
import { flushPromises, mount } from '@vue/test-utils';
import Antd from 'ant-design-vue';
import { describe, expect, it } from 'vitest';
import { createMemoryHistory, createRouter } from 'vue-router';
import { createTestI18n } from '@/test/i18n';
import DocsView from './DocsView.vue';

describe('DocsView', () => {
  it('embeds the server Swagger UI through the /api proxy and links the spec', async () => {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/docs', name: 'docs', component: DocsView }],
    });
    await router.push({ name: 'docs' });
    await router.isReady();
    const wrapper = mount(DocsView, { global: { plugins: [router, Antd, createTestI18n()] } });
    await flushPromises();
    const frame = wrapper.find('[data-testid="docs-swagger-frame"]');
    expect(frame.exists()).toBe(true);
    expect(frame.attributes('src')).toBe('/api/swagger-ui');
    const spec = wrapper.find('[data-testid="docs-spec-download"]');
    expect(spec.attributes('href')).toBe('/api/swagger.json');
    expect(wrapper.text()).toContain('Authorize');
  });
});
