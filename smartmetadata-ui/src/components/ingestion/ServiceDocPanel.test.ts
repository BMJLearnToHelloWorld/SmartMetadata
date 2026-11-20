/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { describe, expect, it, vi, afterEach, beforeEach } from 'vitest';
import { nextTick, type ComponentPublicInstance } from 'vue';
import type { SupportedLocale } from '@/i18n/localePreference';
import { createTestI18n } from '@/test/i18n';
import ServiceDocPanel from './ServiceDocPanel.vue';

type PanelWrapper = VueWrapper<ComponentPublicInstance>;

const CONNECTOR_MARKDOWN = [
  'See https://docs.open-metadata.org/latest/connectors/database/mysql for setup.',
  '$$section',
  '## Host and Port $(id="hostPort")',
  'How to reach the host.',
  '## Requirements',
  'Base requirement.',
].join('\n');

const WORKFLOW_MARKDOWN = [
  '# Metadata',
  '$$section',
  '### Database Filter Pattern $(id="databaseFilterPattern")',
  'Filter docs.',
].join('\n');

/** Plain-object fetch response: no Response/Blob construction (Node realm-safety). */
function textResponse(text: string, ok = true) {
  return { ok, status: ok ? 200 : 404, text: async () => text };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function stubFetch(handler: (url: string) => unknown) {
  const fetchMock = vi.fn(async (input: unknown) => handler(String(input)));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

async function mountPanel(
  props: Record<string, unknown> = {},
  locale: SupportedLocale = 'en-US',
): Promise<PanelWrapper> {
  const wrapper = mount(ServiceDocPanel, {
    props: { serviceName: 'Mysql', serviceType: 'Database', focusedMode: true, ...props },
    global: { plugins: [createTestI18n(locale)] },
  });
  await flushPromises();
  await nextTick();
  return wrapper;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('ServiceDocPanel (official ServiceDocPanel, focused mode)', () => {
  it('shows the setup-guide default with nothing focused', async () => {
    stubFetch(() => textResponse(''));
    const wrapper = await mountPanel();
    expect(wrapper.find('[data-testid="service-requirements"]').exists()).toBe(true);
    expect(wrapper.find('.service-doc-title').text()).toBe('Mysql');
    expect(wrapper.find('.service-doc-subtitle').text()).toBe('Database Service');
    expect(wrapper.find('.service-doc-heading').text()).toBe('Setup Guide');
    expect(wrapper.find('.service-doc-description').text()).toBe(
      'Full setup guide, required privileges, and every supported field.',
    );
    expect(wrapper.find('.service-doc-link').exists()).toBe(false);
    wrapper.unmount();
  });

  it('shows section copy for a focused connection field', async () => {
    stubFetch(() => textResponse(''));
    const wrapper = await mountPanel({
      activeField: 'root/hostPort',
      activeFieldMeta: { title: 'Host and Port', description: 'The host.' },
    });
    expect(wrapper.find('.service-doc-eyebrow').text()).toBe('Connection');
    expect(wrapper.find('.service-doc-heading').text()).toBe('Reach your warehouse');
    expect(wrapper.find('.service-doc-description').text()).toContain('iSmart');
    wrapper.unmount();
  });

  it('shows the schema title and description for a focused workflow field', async () => {
    stubFetch(() => textResponse(''));
    const wrapper = await mountPanel({
      isWorkflow: true,
      workflowType: 'metadata',
      activeField: 'root/threads',
      activeFieldMeta: { title: 'Number of Threads', description: 'Thread count.' },
    });
    expect(wrapper.find('.service-doc-eyebrow').text()).toBe('Configuration');
    expect(wrapper.find('.service-doc-heading').text()).toBe('Number of Threads');
    expect(wrapper.find('.service-doc-description').text()).toBe('Thread count.');
    wrapper.unmount();
  });

  it('updates when the focused field changes', async () => {
    stubFetch(() => textResponse(''));
    const wrapper = await mountPanel({
      isWorkflow: true,
      activeField: 'root/threads',
      activeFieldMeta: { title: 'Number of Threads', description: 'Thread count.' },
    });
    await wrapper.setProps({
      activeField: 'root/ownerConfig',
      activeFieldMeta: { title: 'Owner Configuration', description: 'Owners.' },
    });
    await flushPromises();
    await nextTick();
    expect(wrapper.find('.service-doc-heading').text()).toBe('Owner Configuration');
    expect(wrapper.find('.service-doc-description').text()).toBe('Owners.');
    wrapper.unmount();
  });

  it('fetches the connector markdown same-origin and renders the field section and docs link', async () => {
    const fetchMock = stubFetch(() => textResponse(CONNECTOR_MARKDOWN));
    const wrapper = await mountPanel({
      activeField: 'root/hostPort',
      activeFieldMeta: { title: 'Host and Port', section: 'connection' },
    });
    expect(fetchMock).toHaveBeenCalledWith(
      '/locales/en-US/Database/Mysql.md',
      expect.objectContaining({ headers: { Accept: 'text/markdown' } }),
    );
    expect(wrapper.text()).toContain('How to reach the host.');
    const link = wrapper.find('.service-doc-link');
    expect(link.attributes('href')).toBe(
      'https://docs.open-metadata.org/latest/connectors/database/mysql',
    );
    expect(link.text()).toBe('View Mysql docs');
    wrapper.unmount();
  });

  it('shows a loading state while fetching, keeping the panel header', async () => {
    const gate = deferred<string>();
    stubFetch(() => ({ ok: true, status: 200, text: () => gate.promise }));
    const wrapper = mount(ServiceDocPanel, {
      props: { serviceName: 'Mysql', serviceType: 'Database', focusedMode: true },
      global: { plugins: [createTestI18n()] },
    });
    expect(wrapper.find('[data-testid="service-doc-loading"]').exists()).toBe(true);
    expect(wrapper.find('.service-doc-title').text()).toBe('Mysql');
    gate.resolve('');
    await flushPromises();
    await nextTick();
    expect(wrapper.find('[data-testid="service-doc-loading"]').exists()).toBe(false);
    expect(wrapper.find('.service-doc-heading').text()).toBe('Setup Guide');
    wrapper.unmount();
  });

  it('discards a stale response when the service changes mid-flight', async () => {
    const mysqlGate = deferred<string>();
    const postgresGate = deferred<string>();
    stubFetch((url) => ({
      ok: true,
      status: 200,
      text: () => (url.includes('Postgres') ? postgresGate.promise : mysqlGate.promise),
    }));
    const wrapper = mount(ServiceDocPanel, {
      props: {
        serviceName: 'Mysql',
        serviceType: 'Database',
        focusedMode: true,
        activeField: 'root/hostPort',
        activeFieldMeta: { title: 'Host and Port', section: 'connection' },
      },
      global: { plugins: [createTestI18n()] },
    });
    await wrapper.setProps({ serviceName: 'Postgres' });
    postgresGate.resolve('$$section\n## Host $(id="hostPort")\nPostgres host docs.');
    await flushPromises();
    await nextTick();
    mysqlGate.resolve('$$section\n## Host $(id="hostPort")\nMysql host docs.');
    await flushPromises();
    await nextTick();
    expect(wrapper.find('.service-doc-title').text()).toBe('Postgres');
    expect(wrapper.text()).toContain('Postgres host docs.');
    expect(wrapper.text()).not.toContain('Mysql host docs.');
    expect(wrapper.find('[data-testid="service-doc-loading"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it('falls back to English markdown when the active locale has no usable file', async () => {
    const fetchMock = stubFetch((url) =>
      url.includes('zh-CN')
        ? textResponse('<!doctype html><html><body>index</body></html>')
        : textResponse(CONNECTOR_MARKDOWN),
    );
    const wrapper = await mountPanel(
      {
        activeField: 'root/hostPort',
        activeFieldMeta: { title: 'Host and Port', section: 'connection' },
      },
      'zh-CN',
    );
    const urls = fetchMock.mock.calls.map((call) => String(call[0]));
    expect(urls).toContain('/locales/zh-CN/Database/Mysql.md');
    expect(urls).toContain('/locales/en-US/Database/Mysql.md');
    expect(wrapper.text()).toContain('How to reach the host.');
    wrapper.unmount();
  });

  it('renders the schema fallback and no requirements when the fetch fails', async () => {
    stubFetch(() => Promise.reject(new Error('network down')));
    const wrapper = await mountPanel({
      activeField: 'root/hostPort',
      activeFieldMeta: { title: 'Host and Port', description: 'The host.' },
    });
    expect(wrapper.find('[data-testid="service-doc-loading"]').exists()).toBe(false);
    const fallback = wrapper.find('[data-testid="service-doc-field-fallback"]');
    expect(fallback.exists()).toBe(true);
    expect(fallback.find('.service-doc-field-title').text()).toBe('Host and Port');
    expect(fallback.find('.service-doc-field-description').text()).toBe('The host.');
    expect(wrapper.find('[data-testid="service-doc-requirements"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="service-doc-field-markdown"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it('renders the schema fallback but keeps requirements when the doc lacks the section', async () => {
    stubFetch(() => textResponse('# Mysql\n## Requirements\nBase requirement.'));
    const wrapper = await mountPanel({
      activeField: 'root/hostPort',
      activeFieldMeta: { title: 'Host and Port', description: 'The host.' },
    });
    const fallback = wrapper.find('[data-testid="service-doc-field-fallback"]');
    expect(fallback.exists()).toBe(true);
    expect(fallback.find('.service-doc-field-description').text()).toBe('The host.');
    expect(wrapper.find('[data-testid="service-doc-requirements"]').exists()).toBe(true);
    expect(wrapper.text()).toContain('Base requirement.');
    expect(wrapper.find('[data-testid="service-doc-field-markdown"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it('prefers a valid field section over the schema metadata', async () => {
    stubFetch(() => textResponse(CONNECTOR_MARKDOWN));
    const wrapper = await mountPanel({
      activeField: 'root/hostPort',
      activeFieldMeta: { title: 'Host and Port', description: 'Schema description.' },
    });
    expect(wrapper.find('[data-testid="service-doc-field-markdown"]').exists()).toBe(true);
    expect(wrapper.text()).toContain('How to reach the host.');
    expect(wrapper.find('[data-testid="service-doc-field-fallback"]').exists()).toBe(false);
    expect(wrapper.text()).not.toContain('Schema description.');
    wrapper.unmount();
  });

  it('shows the explicit generic fallback for an empty schema description', async () => {
    stubFetch(() => textResponse(''));
    const wrapper = await mountPanel({
      activeField: 'root/hostPort',
      activeFieldMeta: { title: 'Host and Port', description: '' },
    });
    const fallback = wrapper.find('[data-testid="service-doc-field-fallback"]');
    expect(fallback.exists()).toBe(true);
    expect(fallback.find('.service-doc-field-title').text()).toBe('Host and Port');
    expect(fallback.find('.service-doc-field-description').text()).toBe(
      'Full setup guide, required privileges, and every supported field.',
    );
    wrapper.unmount();
  });

  it('keeps the identity branch original: no field fallback even without markdown', async () => {
    stubFetch(() => textResponse(''));
    const wrapper = await mountPanel({
      activeField: 'root/serviceName',
      activeFieldMeta: { title: 'Service Name', description: 'The name.' },
    });
    expect(wrapper.find('.service-doc-heading').text()).toBe('Name it once, find it forever');
    expect(wrapper.find('[data-testid="service-doc-field-fallback"]').exists()).toBe(false);
    expect(wrapper.text()).not.toContain('The name.');
    wrapper.unmount();
  });

  it('fetches the workflow variant and the connector file for the docs link', async () => {
    const postgresConnectorMarkdown = [
      'See https://docs.open-metadata.org/latest/connectors/database/postgres for setup.',
      '$$section',
      '## Host and Port $(id="hostPort")',
      'How to reach the host.',
    ].join('\n');
    const fetchMock = stubFetch((url) =>
      url.includes('/workflows/')
        ? textResponse(WORKFLOW_MARKDOWN)
        : textResponse(postgresConnectorMarkdown),
    );
    const wrapper = await mountPanel({
      serviceName: 'Postgres',
      isWorkflow: true,
      workflowType: 'metadata',
      activeField: 'root/databaseFilterPattern',
      activeFieldMeta: { title: 'Database Filter Pattern' },
    });
    const urls = fetchMock.mock.calls.map((call) => String(call[0]));
    expect(urls).toContain('/locales/en-US/Database/workflows/metadata.md');
    expect(urls).toContain('/locales/en-US/Database/Postgres.md');
    expect(wrapper.text()).toContain('Filter docs.');
    const link = wrapper.find('.service-doc-link');
    expect(link.attributes('href')).toBe(
      'https://docs.open-metadata.org/latest/connectors/database/postgres',
    );
    wrapper.unmount();
  });
});

describe('ServiceDocPanel full-document mode (pin default, focusedMode unset)', () => {
  const FULL_DOC_MARKDOWN = [
    '$$section',
    '## Client ID',
    '$(id="clientId")',
    'Your OpenMetadata client id.',
    '$$',
    '$$section',
    '## Secret',
    '$(id="clientSecret")',
    'Your secret.',
    '$$',
  ].join('\n');

  beforeEach(() => {
    HTMLElement.prototype.scrollIntoView = vi.fn();
    if (typeof globalThis.CSS === 'undefined' || !globalThis.CSS.escape) {
      vi.stubGlobal('CSS', { escape: (value: string) => value });
    }
  });

  it('renders sectioned docs with brand replacement and no focused header', async () => {
    const fetchMock = stubFetch(() => textResponse(FULL_DOC_MARKDOWN));
    const wrapper = await mountPanel({ focusedMode: false });
    expect(fetchMock).toHaveBeenCalledWith(
      '/locales/en-US/Database/Mysql.md',
      expect.objectContaining({ headers: { Accept: 'text/markdown' } }),
    );
    expect(wrapper.find('.service-doc-title').exists()).toBe(false);
    expect(wrapper.find('.service-doc-heading').exists()).toBe(false);
    const sections = wrapper.findAll('section');
    expect(sections.map((s) => s.attributes('data-id'))).toEqual([
      'clientId',
      'clientSecret',
    ]);
    expect(wrapper.text()).toContain('Your iSmart client id.');
    wrapper.unmount();
  });

  it('renders an empty body when no doc file exists', async () => {
    stubFetch(() => textResponse('', false));
    const wrapper = await mountPanel({ focusedMode: false });
    expect(wrapper.findAll('section').length).toBe(0);
    expect(wrapper.find('[data-testid="service-doc-loading"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it('highlights the active field section', async () => {
    stubFetch(() => textResponse(FULL_DOC_MARKDOWN));
    const wrapper = await mountPanel({
      focusedMode: false,
      activeField: 'root/clientSecret',
    });
    await vi.waitFor(() => {
      const section = wrapper.find('section[data-id="clientSecret"]');
      expect(section.attributes('data-highlighted')).toBe('true');
    });
    wrapper.unmount();
  });

  it('does not highlight in focused mode', async () => {
    stubFetch(() => textResponse(FULL_DOC_MARKDOWN));
    const wrapper = await mountPanel({
      focusedMode: true,
      activeField: 'root/clientSecret',
    });
    expect(wrapper.find('section[data-id="clientSecret"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it('discards a stale full-doc response when the service changes mid-flight', async () => {
    const mysqlGate = deferred<string>();
    const postgresGate = deferred<string>();
    stubFetch((url) => ({
      ok: true,
      status: 200,
      text: () => (url.includes('Postgres') ? postgresGate.promise : mysqlGate.promise),
    }));
    const wrapper = mount(ServiceDocPanel, {
      props: {
        serviceName: 'Mysql',
        serviceType: 'Database',
        focusedMode: false,
      },
      global: { plugins: [createTestI18n()] },
    });
    await wrapper.setProps({ serviceName: 'Postgres' });
    postgresGate.resolve('$$section\n## Host $(id="hostPort")\nPostgres host docs.');
    await flushPromises();
    await nextTick();
    mysqlGate.resolve('$$section\n## Host $(id="hostPort")\nMysql host docs.');
    await flushPromises();
    await nextTick();
    expect(wrapper.text()).toContain('Postgres host docs.');
    expect(wrapper.text()).not.toContain('Mysql host docs.');
    wrapper.unmount();
  });
});
