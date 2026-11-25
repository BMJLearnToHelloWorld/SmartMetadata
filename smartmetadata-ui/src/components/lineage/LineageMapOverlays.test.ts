/**
 * Copyright 2026 SmartMetadata authors.
 * Licensed under the Apache License, Version 2.0.
 */
import { mount } from '@vue/test-utils';
import Antd from 'ant-design-vue';
import { describe, expect, it } from 'vitest';
import { createTestI18n } from '@/test/i18n';
import LineageMapBreadcrumbs from './LineageMapBreadcrumbs.vue';
import LineageMapStatusPanel from './LineageMapStatusPanel.vue';

const CRUMBS = [
  { id: 'root', label: 'All services', band: 'LAYER' as const, levelKind: 'service' as const },
  {
    id: 'svc',
    label: 'mysql',
    fullyQualifiedName: 'mysql',
    band: 'ASSET' as const,
    levelKind: 'service' as const,
  },
  {
    id: 'db',
    label: 'shop',
    fullyQualifiedName: 'mysql.shop',
    band: 'ASSET' as const,
    levelKind: 'database' as const,
  },
];

describe('LineageMapBreadcrumbs (pin LineageMapBreadcrumbs)', () => {
  function mountCrumbs(props: Record<string, unknown> = {}) {
    return mount(LineageMapBreadcrumbs, {
      props: { breadcrumbs: CRUMBS, lens: 'service', ...props },
      global: { plugins: [Antd, createTestI18n()] },
      attachTo: document.body,
    });
  }

  it('renders one button per crumb and emits focus on click', async () => {
    const wrapper = mountCrumbs();
    expect(wrapper.find('[data-testid="lineage-map-breadcrumbs"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="lineage-map-crumb-svc"]').text()).toBe('mysql');
    await wrapper.find('[data-testid="lineage-map-crumb-db"]').trigger('click');
    expect(wrapper.emitted('focus')).toEqual([[CRUMBS[2]]]);
    wrapper.unmount();
  });

  it('renders nothing when the trail is empty', () => {
    const wrapper = mountCrumbs({ breadcrumbs: [] });
    expect(wrapper.find('[data-testid="lineage-map-breadcrumbs"]').exists()).toBe(false);
    wrapper.unmount();
  });
});

describe('LineageMapStatusPanel (pin LineageMapStatusPanel)', () => {
  function mountStatus(props: Record<string, unknown> = {}) {
    return mount(LineageMapStatusPanel, {
      props: { nodeCount: 5, hiddenNodeCount: 0, sampled: false, ...props },
      global: { plugins: [Antd, createTestI18n()] },
      attachTo: document.body,
    });
  }

  it('renders nothing when nothing is hidden or sampled', () => {
    const wrapper = mountStatus();
    expect(wrapper.find('[data-testid="lineage-map-status-panel"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it('shows the truncated notice with visible and total counts', () => {
    const wrapper = mountStatus({ nodeCount: 5, hiddenNodeCount: 3 });
    expect(wrapper.find('[data-testid="lineage-map-truncated-notice"]').text()).toContain(
      'Showing 5 of 8 assets',
    );
    wrapper.unmount();
  });

  it('shows the notice when the scene is sampled', () => {
    const wrapper = mountStatus({ sampled: true });
    expect(wrapper.find('[data-testid="lineage-map-truncated-notice"]').exists()).toBe(true);
    wrapper.unmount();
  });
});
