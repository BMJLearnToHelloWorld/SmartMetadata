/**
 * Copyright 2026 SmartMetadata authors.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { mount } from '@vue/test-utils';
import Antd from 'ant-design-vue';
import { describe, expect, it } from 'vitest';
import { createTestI18n } from '@/test/i18n';
import type { SupportedLocale } from '@/i18n/localePreference';
import { createEmptyServiceForm } from '@/ingestion/connections';
import type { ServiceFormValues } from '@/types/ingestion';
import FileOrInputField from './FileOrInputField.vue';
import MapEditor from './MapEditor.vue';
import ServiceConnectionFields from './ServiceConnectionFields.vue';
import ToggleField from '@/components/shared/ToggleField.vue';

function mountFields(
  serviceType: string,
  values: Partial<ServiceFormValues> = {},
  locale: SupportedLocale = 'en-US',
  storedConfig?: Record<string, unknown>,
) {
  const form: ServiceFormValues = {
    ...createEmptyServiceForm(),
    serviceType,
    ...values,
  };
  const wrapper = mount(ServiceConnectionFields, {
    props: {
      form,
      storedConfig: storedConfig as never,
    },
    global: { plugins: [Antd, createTestI18n(locale)] },
  });
  return { wrapper, form };
}

describe('ServiceConnectionFields (live-issues S-09/S-10/S-12/S-13/S-14/S-15/S-16/S-17)', () => {
  it('renders the four pin sections with scope/advanced collapsed (MySQL)', async () => {
    const { wrapper } = mountFields('Mysql');
    expect(wrapper.find('[data-testid="connection-section-connection"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="connection-section-authentication"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="connection-section-scope"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="connection-section-advanced"]').exists()).toBe(true);
    // Open sections render their fields; collapsed bodies are not in the DOM.
    expect(wrapper.find('[data-testid="service-host-port"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="service-auth-type"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="service-database-name"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="service-scheme"]').exists()).toBe(false);
    // The connection badge counts the two missing required fields.
    expect(wrapper.find('[data-testid="connection-section-connection"]').text()).toContain(
      '2 required',
    );
    // Expanding scope reveals its fields.
    await wrapper
      .find('[data-testid="connection-section-scope-toggle"]')
      .trigger('click');
    expect(wrapper.find('[data-testid="service-database-name"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="service-use-slow-logs"]').exists()).toBe(true);
  });

  it('labels fields with pin schema titles, EN in both locales (S-15/S-16)', async () => {
    const en = mountFields('Mysql');
    expect(en.wrapper.text()).toContain('Host and Port');
    expect(en.wrapper.text()).not.toContain('Host and port');
    const zh = mountFields('Mysql', {}, 'zh-CN');
    expect(zh.wrapper.text()).toContain('Host and Port');
    expect(zh.wrapper.text()).not.toContain('主机和端口');
    await zh.wrapper.find('[data-testid="connection-section-scope-toggle"]').trigger('click');
    expect(zh.wrapper.text()).toContain('Use Slow Logs for Lineage');
    expect(zh.wrapper.text()).toContain('Database Name');
  });

  it('shows the single-option scheme select without writing the value back (S-11)', async () => {
    const { wrapper, form } = mountFields('Mysql');
    await wrapper
      .find('[data-testid="connection-section-advanced-toggle"]')
      .trigger('click');
    const scheme = wrapper.find('[data-testid="service-scheme"]');
    expect(scheme.exists()).toBe(true);
    expect(scheme.text()).toContain('mysql+pymysql');
    expect(form.scheme).toBeFalsy();
    expect(wrapper.find('.svc-group-label').text()).toBe('SSL');
  });

  it('switches auth branches with the single-credential note and clears the other branch (S-12)', async () => {
    const { wrapper, form } = mountFields('Mysql', {
      password: 'typed-secret',
      authAwsRegion: 'us-east-1',
    });
    const note = () => wrapper.find('.svc-auth-note').text();
    expect(note()).toContain('Only the Basic Auth credential is stored');
    expect(wrapper.find('[data-testid="service-password"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="service-auth-aws-region"]').exists()).toBe(false);
    const iamInput = wrapper.find('input[value="iam"]');
    expect(iamInput.exists()).toBe(true);
    // setChecked() is private on DOMWrapper: set the property and fire
    // the change the ant Radio.Group listens for.
    (iamInput.element as HTMLInputElement).checked = true;
    await iamInput.trigger('change');
    expect(form.authTypeBranch).toBe('iam');
    expect(form.password).toBeUndefined();
    expect(form.authAwsRegion).toBe('us-east-1');
    expect(note()).toContain('Only the IAM Auth Configuration Source credential is stored');
    expect(wrapper.find('[data-testid="service-auth-aws-region"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="service-password"]').exists()).toBe(false);
  });

  it('renders SSL leaves as file-or-input, not textareas (S-13)', async () => {
    const { wrapper } = mountFields('Mysql');
    await wrapper
      .find('[data-testid="connection-section-advanced-toggle"]')
      .trigger('click');
    const leaves = wrapper.findAllComponents(FileOrInputField);
    expect(leaves.map((leaf) => leaf.props('label'))).toEqual([
      'CA Certificate',
      'SSL Certificate',
      'SSL Key',
    ]);
    expect(wrapper.find('[data-testid="service-ssl-ca-certificate"]').exists()).toBe(true);
    expect(leaves[0].props('acceptedFileTypes')).toEqual(['.pem', '.crt', '.cer']);
  });

  it('round-trips map editor values through the JSON-string form value (S-14)', async () => {
    const { wrapper, form } = mountFields('Mysql', {
      connectionOptions: '{"opt":"1"}',
    });
    await wrapper
      .find('[data-testid="connection-section-advanced-toggle"]')
      .trigger('click');
    const editors = wrapper.findAllComponents(MapEditor);
    expect(editors).toHaveLength(2);
    expect(editors[0].props('modelValue')).toEqual({ opt: '1' });
    expect(editors[0].props('title')).toBe('Connection Options');
    await editors[0].vm.$emit('update:modelValue', { opt: '2', extra: 'x' });
    expect(form.connectionOptions).toBe('{"opt":"2","extra":"x"}');
  });

  it('keeps the secret hint and shows no other inline hints or descriptions (S-17)', async () => {
    const { wrapper } = mountFields('Mysql');
    const hints = wrapper.findAll('.svc-hint');
    expect(hints).toHaveLength(1);
    expect(hints[0].text()).toContain('Leave blank to keep an existing password');
    await wrapper.find('[data-testid="connection-section-scope-toggle"]').trigger('click');
    expect(wrapper.text()).not.toContain('Optional name to give to the database');
    expect(wrapper.text()).not.toContain('Database Schema of the data source');
  });

  it('renders booleans as toggles with schema-title labels', async () => {
    const { wrapper, form } = mountFields('Mysql');
    await wrapper.find('[data-testid="connection-section-scope-toggle"]').trigger('click');
    const toggle = wrapper.findComponent(ToggleField);
    expect(toggle.exists()).toBe(true);
    expect(toggle.props('label')).toBe('Use Slow Logs for Lineage');
    expect(toggle.props('modelValue')).toBe(false);
    await wrapper.find('[data-testid="service-use-slow-logs-switch"]').trigger('click');
    expect(form.useSlowLogs).toBe(true);
  });

  it('renders boolean schema descriptions under toggles (pin BooleanFieldTemplate, S-17)', async () => {
    const { wrapper } = mountFields('Mysql');
    await wrapper.find('[data-testid="connection-section-scope-toggle"]').trigger('click');
    const toggle = wrapper.findComponent(ToggleField);
    expect(toggle.props('description')).toBe('Use slow logs to extract lineage.');
    expect(
      wrapper.find('[data-testid="service-use-slow-logs"] .toggle-field-description').text(),
    ).toBe('Use slow logs to extract lineage.');
  });

  it('renders the Snowflake branch selector with translated titles (L-2)', async () => {
    const zh = mountFields('Snowflake', {}, 'zh-CN');
    expect(zh.wrapper.text()).toContain('密码');
    expect(zh.wrapper.text()).toContain('Key pair');
  });

  it('reports focus with RJSF ids and schema meta, and blur on focus-out (S-04)', async () => {
    const { wrapper } = mountFields('Mysql');
    await wrapper.find('[data-testid="service-host-port"]').trigger('focusin');
    expect(wrapper.emitted('focus')?.at(-1)).toEqual([
      'root/hostPort',
      expect.objectContaining({
        title: 'Host and Port',
        section: 'connection',
      }),
    ]);
    await wrapper.find('[data-testid="service-password"]').trigger('focusin');
    expect(wrapper.emitted('focus')?.at(-1)).toEqual([
      'root/authType/password',
      expect.objectContaining({
        title: 'Password',
        description: 'Password to connect to source.',
        section: 'authentication',
      }),
    ]);
    await wrapper.find('[data-testid="service-password"]').trigger('focusout');
    expect(wrapper.emitted('blur')).toHaveLength(1);
  });

  it('renders no placeholder text on connection fields (S-18, pin shows none)', () => {
    const { wrapper } = mountFields('Mysql');
    expect(wrapper.find('[data-testid="service-host-port"]').attributes('placeholder')).toBeUndefined();
    const redshift = mountFields('Redshift');
    expect(
      redshift.wrapper.find('[data-testid="service-host-port"]').attributes('placeholder'),
    ).toBeUndefined();
  });

  it('renders table notes after the sections', () => {
    const { wrapper } = mountFields('Kafka');
    expect(wrapper.text()).toContain('Confluent REST Proxy URL is a CLI workflow key');
  });

  it('marks file-or-input leaves with stored values from the stored config (S-13)', async () => {
    const { wrapper } = mountFields(
      'Mysql',
      {},
      'en-US',
      { sslConfig: { caCertificate: '---CERT---' } },
    );
    await wrapper
      .find('[data-testid="connection-section-advanced-toggle"]')
      .trigger('click');
    const leaves = wrapper.findAllComponents(FileOrInputField);
    expect(leaves[0].props('hasStoredValue')).toBe(true);
    expect(leaves[1].props('hasStoredValue')).toBe(false);
  });
});
