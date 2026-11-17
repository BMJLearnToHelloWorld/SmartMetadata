/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0.
 */
import { mount } from '@vue/test-utils';
import Antd, { Tooltip } from 'ant-design-vue';
import { afterEach, describe, expect, it } from 'vitest';
import { createTestI18n } from '@/test/i18n';
import type { ServiceConnectionConfig, ServiceKind } from '@/types/ingestion';
import ServiceConnectionDetails from './ServiceConnectionDetails.vue';

function mountDetails(
  config?: ServiceConnectionConfig,
  kind: ServiceKind = 'database',
  serviceType = 'Mysql',
) {
  return mount(ServiceConnectionDetails, {
    props: { config, kind, serviceType },
    attachTo: document.body,
    global: { plugins: [Antd, createTestI18n()] },
  });
}

function rowTexts(wrapper: ReturnType<typeof mountDetails>): string[] {
  return wrapper.findAll('.connection-detail-row').map((row) => row.text());
}

function inputValues(wrapper: ReturnType<typeof mountDetails>): string[] {
  return wrapper.findAll('input').map((input) => (input.element as HTMLInputElement).value);
}

describe('ServiceConnectionDetails (official getKeyValues)', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('renders stored keys in order, skipping null and DEF_UI_SCHEMA keys', () => {
    const wrapper = mountDetails({
      type: 'Mysql',
      hostPort: 'db.internal:3306',
      username: 'reader',
      databaseName: null as unknown as string,
      supportsMetadataExtraction: true,
      useSlowLogs: true,
    } as ServiceConnectionConfig);
    const rows = rowTexts(wrapper);
    expect(rows.map((row) => row.split(':')[0])).toEqual([
      'hostPort',
      'username',
      'useSlowLogs',
    ]);
    expect(inputValues(wrapper)).toEqual(['db.internal:3306', 'reader', 'true']);
    expect(wrapper.text()).not.toContain('supportsMetadataExtraction');
    wrapper.unmount();
  });

  it('skips DEF_UI_SCHEMA keys at nested depth and flattens nested objects', () => {
    const wrapper = mountDetails({
      authType: { type: 'basic', password: 'nested-secret' },
    } as unknown as ServiceConnectionConfig);
    expect(wrapper.text()).not.toContain('authType:');
    expect(wrapper.text()).not.toContain('basic');
    expect(rowTexts(wrapper).map((row) => row.split(':')[0])).toEqual(['password']);
    wrapper.unmount();
  });

  it('masks password fields: the value never enters the DOM', () => {
    const wrapper = mountDetails({
      username: 'reader',
      authType: { password: 's3cr3t-value' },
    } as unknown as ServiceConnectionConfig);
    expect(wrapper.html()).not.toContain('s3cr3t-value');
    expect(document.body.innerHTML).not.toContain('s3cr3t-value');
    const passwordInput = wrapper
      .findAll('input')
      .find((input) => (input.element as HTMLInputElement).type === 'password');
    expect(passwordInput).toBeDefined();
    expect((passwordInput!.element as HTMLInputElement).value).toBe('••••••••');
    expect(inputValues(wrapper)).toContain('reader');
    wrapper.unmount();
  });

  it('masks the sslConfig triplet through the stored-key alias', () => {
    const wrapper = mountDetails({
      sslConfig: {
        caCertificate: '-----BEGIN CERTIFICATE-----secret-ca',
        sslCertificate: 'secret-cert',
        sslKey: 'secret-key',
      },
    } as unknown as ServiceConnectionConfig);
    expect(wrapper.html()).not.toContain('secret-ca');
    expect(wrapper.html()).not.toContain('secret-cert');
    expect(wrapper.html()).not.toContain('secret-key');
    expect(inputValues(wrapper)).toEqual(['••••••••', '••••••••', '••••••••']);
    wrapper.unmount();
  });

  it('renders arrays as badges and unmatched leaves as text', () => {
    const wrapper = mountDetails({
      customArray: ['alpha', 'beta'],
      customScalar: 'plain',
    } as unknown as ServiceConnectionConfig);
    const badges = wrapper.findAll('.ant-tag').map((tag) => tag.text());
    expect(badges).toEqual(['alpha', 'beta']);
    expect(inputValues(wrapper)).toEqual(['plain']);
    wrapper.unmount();
  });

  it('renders filter-pattern entries generically, skipping empty entries', () => {
    const wrapper = mountDetails({
      tableFilterPattern: { includes: ['^sys_', '^tmp_'], excludes: [], extra: 'kept' },
      schemaFilterPattern: { includes: [], excludes: [] },
    } as unknown as ServiceConnectionConfig);
    const text = wrapper.text();
    expect(text).toContain('tableFilterPattern:');
    expect(text).toContain('Includes:');
    expect(text).toContain('^sys_, ^tmp_');
    expect(text).toContain('Extra:');
    expect(text).toContain('kept');
    expect(text).not.toContain('Excludes:');
    expect(text).not.toContain('schemaFilterPattern:');
    wrapper.unmount();
  });

  it('does not apply filter-pattern rendering to other kinds\' fields', () => {
    const wrapper = mountDetails({
      topicFilterPattern: { includes: ['orders'], excludes: [] },
    } as unknown as ServiceConnectionConfig);
    expect(wrapper.text()).not.toContain('Includes:');
    expect(wrapper.findAll('.ant-tag').map((tag) => tag.text())).toEqual(['orders']);
    wrapper.unmount();
  });

  it('shows the registry description as a tooltip and none for unmatched keys', () => {
    const wrapper = mountDetails({
      hostPort: 'db.internal:3306',
      customScalar: 'plain',
    } as unknown as ServiceConnectionConfig);
    const tooltips = wrapper.findAllComponents(Tooltip);
    expect(tooltips).toHaveLength(1);
    expect(String(tooltips[0].props('title'))).toContain('Host and port of the MySQL service');
    wrapper.unmount();
  });

  it('renders the no-data placeholder when the config is absent', () => {
    const wrapper = mountDetails(undefined);
    expect(wrapper.find('[data-testid="no-data-placeholder"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="service-connection-details"]').exists()).toBe(true);
    wrapper.unmount();
  });

  it('renders an empty card for an empty config', () => {
    const wrapper = mountDetails({});
    expect(wrapper.find('[data-testid="service-connection-details"]').exists()).toBe(true);
    expect(wrapper.findAll('.connection-detail-row')).toHaveLength(0);
    expect(wrapper.find('[data-testid="no-data-placeholder"]').exists()).toBe(false);
    wrapper.unmount();
  });
});
