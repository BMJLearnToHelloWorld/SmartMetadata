/**
 * Copyright 2026 SmartMetadata authors.
 * Licensed under the Apache License, Version 2.0.
 */
import { flushPromises, mount } from '@vue/test-utils';
import Antd from 'ant-design-vue';
import { describe, expect, it } from 'vitest';
import { createTestI18n } from '@/test/i18n';
import LineageLayers from './LineageLayers.vue';

function mountLayers(props: Record<string, unknown>) {
  return mount(LineageLayers, {
    props: { entityType: 'table', activeLayer: [], platformView: 'None', ...props },
    global: { plugins: [Antd, createTestI18n()] },
    attachTo: document.body,
  });
}

async function openMenu(wrapper: ReturnType<typeof mountLayers>) {
  await wrapper.find('[data-testid="lineage-layer-btn"]').trigger('click');
  await flushPromises();
}

describe('LineageLayers', () => {
  it('offers overlays + Service + Domain for a table with domains, trigger names the selection', async () => {
    const wrapper = mountLayers({
      entityContext: { domains: [{ fullyQualifiedName: 'd', type: 'domain' }] },
      activeLayer: ['ColumnLevelLineage'],
      platformView: 'None',
    });
    expect(wrapper.find('[data-testid="lineage-layer-btn"]').text()).toContain('Column lineage');
    await openMenu(wrapper);
    const items = [...document.body.querySelectorAll('[data-testid^="lineage-layer-"]')]
      .map((item) => item.getAttribute('data-testid'))
      .filter((id) => id !== 'lineage-layer-btn');
    expect(items).toEqual([
      'lineage-layer-column-btn',
      'lineage-layer-observability-btn',
      'lineage-layer-service-btn',
      'lineage-layer-domain-btn',
    ]);
    wrapper.unmount();
  });

  it('trigger falls back to the data-asset level when nothing is selected', () => {
    const wrapper = mountLayers({});
    expect(wrapper.find('[data-testid="lineage-layer-btn"]').text()).toContain('Data asset level');
    wrapper.unmount();
  });

  it('clicking an overlay emits the toggled active layer', async () => {
    const wrapper = mountLayers({ activeLayer: ['ColumnLevelLineage'] });
    await openMenu(wrapper);
    const items = [...document.body.querySelectorAll('[data-testid="lineage-layer-observability-btn"]')];
    (items.at(-1) as HTMLElement).click();
    await flushPromises();
    expect(wrapper.emitted('change-active-layer')).toEqual([
      [['ColumnLevelLineage', 'DataObservability']],
    ]);
    wrapper.unmount();
  });

  it('clicking a platform view emits it, clicking the active one emits None', async () => {
    const wrapper = mountLayers({});
    await openMenu(wrapper);
    const service = [...document.body.querySelectorAll('[data-testid="lineage-layer-service-btn"]')];
    (service.at(-1) as HTMLElement).click();
    await flushPromises();
    expect(wrapper.emitted('change-platform-view')).toEqual([['Service']]);

    const wrapper2 = mountLayers({ platformView: 'Service' });
    await openMenu(wrapper2);
    const service2 = [...document.body.querySelectorAll('[data-testid="lineage-layer-service-btn"]')];
    (service2.at(-1) as HTMLElement).click();
    await flushPromises();
    expect(wrapper2.emitted('change-platform-view')).toEqual([['None']]);
    wrapper.unmount();
    wrapper2.unmount();
  });

  it('offers nothing for a service entity', async () => {
    const wrapper = mountLayers({ entityType: 'databaseService' });
    await openMenu(wrapper);
    const items = [...document.body.querySelectorAll('[data-testid^="lineage-layer-"][data-testid$="-btn"]')]
      .map((item) => item.getAttribute('data-testid'))
      .filter((id) => id !== 'lineage-layer-btn');
    expect(items).toEqual([]);
    wrapper.unmount();
  });
});
