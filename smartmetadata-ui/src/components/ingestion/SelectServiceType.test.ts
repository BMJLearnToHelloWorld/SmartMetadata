/**
 * Copyright 2026 SmartMetadata authors.
 * Licensed under the Apache License, Version 2.0.
 */
import { mount, type VueWrapper } from '@vue/test-utils';
import Antd from 'ant-design-vue';
import { describe, expect, it } from 'vitest';
import { createI18n } from 'vue-i18n';
import SelectServiceType from './SelectServiceType.vue';

const MESSAGES = {
  'en-US': {
    settings: {
      services: {
        service: 'Service',
        beta: 'Beta',
        fieldTextRequired: '{fieldText} is required.',
        categoryTitle: {
          database: 'Databases',
          dashboard: 'Dashboards',
          messaging: 'Messaging',
          pipeline: 'Pipelines',
          storage: 'Storages',
          api: 'APIs',
          mlmodel: 'ML Models',
          metadata: 'Metadata',
          search: 'Search Engines',
          drive: 'Drives',
          security: 'Security',
        },
        wizard: {
          allServices: 'All Services',
          searchConnector: 'Search for a connector',
          noConnectorsAvailable: 'No connectors available for the selected service type.',
        },
      },
    },
    message: { 'no-data-available': 'No data available' },
  },
};

function mountPicker(props: Record<string, unknown> = {}): VueWrapper {
  return mount(SelectServiceType, {
    props: { category: 'database', ...props },
    attachTo: document.body,
    global: {
      plugins: [Antd, createI18n({ legacy: false, locale: 'en-US', messages: MESSAGES })],
    },
  });
}

describe('SelectServiceType', () => {
  it('lists the selected category connectors with display names and raw-type testids', () => {
    const wrapper = mountPicker({});
    // Database exposes 11 types (no exclusions in this category).
    expect(wrapper.findAll('.select-service-type__card').length).toBe(11);
    expect(wrapper.find('[data-testid="Postgres"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="Postgres"]').text()).toContain('Postgres');
  });

  it('flattens all categories in the all view and excludes unsupported plus excluded services', () => {
    const wrapper = mountPicker({ category: 'all' });
    // 40 product types minus the 9 wizard-excluded rows of the T-2
    // ledger (6 unsupported + 3 excludedService present here).
    expect(wrapper.findAll('.select-service-type__card').length).toBe(31);
    for (const excluded of [
      'Alation',
      'WEBHOOK',
      'VertexAI',
      'Ranger',
      'SharePoint',
      'Collibra',
      'Sklearn',
      'MetadataES',
      'OpenMetadata',
    ]) {
      expect(wrapper.find(`[data-testid="${excluded}"]`).exists()).toBe(false);
    }
    expect(wrapper.find('[data-testid="Postgres"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="Kafka"]').exists()).toBe(true);
  });

  it('shows the Beta badge for beta services only', () => {
    const wrapper = mountPicker({ category: 'pipeline' });
    expect(wrapper.find('[data-testid="Prefect"]').text()).toContain('Beta');
    expect(wrapper.find('[data-testid="Dagster"]').text()).not.toContain('Beta');
  });

  it('maps display names through the 21-entry table and startCase for Custom types', () => {
    const wrapper = mountPicker({ category: 'search' });
    expect(wrapper.find('[data-testid="ElasticSearch"]').text()).toContain('Elasticsearch');
    expect(wrapper.find('[data-testid="CustomSearch"]').text()).toContain('Custom Search');
  });

  it('filters by trimmed lowercase substring on the raw type', async () => {
    const wrapper = mountPicker({ category: 'all' });
    const input = wrapper.find('[data-testid="connector-search"]');
    await input.setValue('  SQL ');
    const cards = wrapper.findAll('.select-service-type__card');
    expect(cards.length).toBeGreaterThan(0);
    expect(cards.every((card) => card.attributes('data-testid')?.toLowerCase().includes('sql'))).toBe(
      true,
    );
  });

  it('shows the empty placeholder when no connector matches', async () => {
    const wrapper = mountPicker({});
    await wrapper.find('[data-testid="connector-search"]').setValue('zzz-no-such-connector');
    expect(wrapper.findAll('.select-service-type__card').length).toBe(0);
    expect(wrapper.find('[data-testid="no-data-placeholder"]').exists()).toBe(true);
    expect(wrapper.text()).toContain('No connectors available for the selected service type.');
  });

  it('emits the category and type pair on card click', async () => {
    const wrapper = mountPicker({ category: 'all' });
    await wrapper.find('[data-testid="Kafka"]').trigger('click');
    expect(wrapper.emitted('select')).toEqual([[{ category: 'messaging', type: 'Kafka' }]]);
  });

  it('shows the required error with the service field text', () => {
    const wrapper = mountPicker({ showError: true });
    expect(wrapper.text()).toContain('Service is required.');
    expect(mountPicker({}).text()).not.toContain('Service is required.');
  });

  it('falls back to the first category for an unknown category value', () => {
    const wrapper = mountPicker({ category: 'bogus' });
    expect(wrapper.findAll('.select-service-type__card').length).toBe(11);
    expect(wrapper.find('[data-testid="Postgres"]').exists()).toBe(true);
  });
});
