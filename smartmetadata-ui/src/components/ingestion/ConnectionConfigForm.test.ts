/**
 * Copyright 2026 SmartMetadata authors.
 * Licensed under the Apache License, Version 2.0.
 */
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import Antd from 'ant-design-vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { reactive } from 'vue';
import { createI18n } from 'vue-i18n';
import TestConnectionCard from '@/components/ingestion/TestConnectionCard.vue';
import { createEmptyServiceForm } from '@/ingestion/connections';
import type { FetchConnectionSchema } from '@/ingestion/connectionSchemaLoader';
import { clearConnectionSchemaCache } from '@/ingestion/connectionSchemaLoader';
import type { ServiceFormValues, ServiceKind } from '@/types/ingestion';
import ConnectionConfigForm from './ConnectionConfigForm.vue';

const MESSAGES = {
  'en-US': {
    settings: {
      services: {
        connectionGuard: {
          loadFailed: 'The connection schema failed to load.',
          noConfigAvailable: 'No Connection Configs available.',
          blockedReasonA: 'Reason A.',
          blockedReasonB: 'Reason B.',
          blockedReasonC: 'Reason C.',
        },
        connectionForm: {
          pipelineServerIpAddress: 'Pipeline Server IP Address',
          airflowHostIpAddress: 'iSmart will connect from the IP {hostIp}.',
        },
        pipeline: {
          disabledFallback: 'Pipeline service is disabled.',
          unreachableFallback: 'Pipeline service is unreachable.',
        },
      },
    },
    product: { name: 'iSmart' },
    connection: {
      hostPort: 'Host and Port',
      username: 'Username',
      password: 'Password',
      database: 'Database',
    },
    crud: { name: 'Name', type: 'Type' },
  },
};

const SCHEMA = { type: 'object', properties: { hostPort: { type: 'string' } } };

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

interface MountOptions {
  kind?: ServiceKind;
  serviceType?: string;
  fetchSchema?: FetchConnectionSchema;
  formOverrides?: Partial<ServiceFormValues>;
  extraProps?: Record<string, unknown>;
}

async function mountForm(options: MountOptions = {}): Promise<{
  wrapper: VueWrapper;
  form: ServiceFormValues;
}> {
  const form = reactive<ServiceFormValues>(createEmptyServiceForm());
  form.kind = options.kind ?? 'database';
  form.serviceType = options.serviceType ?? 'Postgres';
  Object.assign(form, options.formOverrides ?? {});
  const fetchSchema: FetchConnectionSchema =
    options.fetchSchema ?? (async () => jsonResponse(SCHEMA));
  const wrapper = mount(ConnectionConfigForm, {
    props: {
      kind: form.kind,
      serviceType: form.serviceType,
      form,
      serviceName: 'warehouse',
      airflowStatus: { code: 200, platform: 'airflow' },
      airflowChecked: true,
      fetchSchema,
      ...(options.extraProps ?? {}),
    },
    attachTo: document.body,
    global: {
      plugins: [Antd, createI18n({ legacy: false, locale: 'en-US', messages: MESSAGES })],
    },
  });
  await flushPromises();
  return { wrapper, form };
}

describe('ConnectionConfigForm', () => {
  beforeEach(() => {
    clearConnectionSchemaCache();
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        if (String(input).includes('/ip')) {
          return jsonResponse({ ip: '203.0.113.7' });
        }
        return new Response('not found', { status: 404 });
      }),
    );
  });

  afterEach(() => {
    document.body.innerHTML = '';
    vi.unstubAllGlobals();
    clearConnectionSchemaCache();
  });

  it('shows the schema loader while the schema is loading', async () => {
    const { wrapper } = await mountForm({
      fetchSchema: () => new Promise(() => undefined),
    });
    expect(wrapper.find('[data-testid="connection-schema-loader"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="no-config-available"]').exists()).toBe(false);
  });

  it('renders the static form and test connection for a pending-static row', async () => {
    const { wrapper } = await mountForm({
      formOverrides: { hostPort: 'localhost:5432', username: 'reader', database: 'warehouse' },
    });
    expect(wrapper.find('[data-testid="no-config-available"]').exists()).toBe(false);
    expect(wrapper.findComponent(TestConnectionCard).exists()).toBe(true);
    expect(wrapper.find('[data-testid="ip-address"]').exists()).toBe(true);
    expect(wrapper.text()).toContain('203.0.113.7');
    const exposed = wrapper.vm as unknown as {
      submit: () => boolean;
      connectionSubmitBlocked: boolean;
    };
    expect(exposed.connectionSubmitBlocked).toBe(false);
    expect(exposed.submit()).toBe(true);
    const saves = wrapper.emitted('save') as Array<[Record<string, unknown>]> | undefined;
    expect(saves).toHaveLength(1);
    expect(saves?.[0][0].hostPort).toBe('localhost:5432');
    expect(saves?.[0][0].type).toBe('Postgres');
  });

  it('blocks submit while required fields are missing', async () => {
    const { wrapper } = await mountForm({});
    const exposed = wrapper.vm as unknown as { submit: () => boolean };
    expect(exposed.submit()).toBe(false);
    expect(wrapper.emitted('save')).toBeUndefined();
  });

  it('never emits a save for an empty body, even for a type with an empty schema required set', async () => {
    // ElasticSearch's schema declares no required fields (precondition
    // 03 §4.6.1), but the static table marks hostPort required, so the
    // required rule decides today; the Q4 payload defense in submit()
    // is the last line for the schema-driven form (U-1) and is covered
    // at the unit level by connectionBodyIsEmpty.
    const { wrapper } = await mountForm({ kind: 'search', serviceType: 'ElasticSearch' });
    const exposed = wrapper.vm as unknown as { submit: () => boolean };
    expect(exposed.submit()).toBe(false);
    expect(wrapper.emitted('save')).toBeUndefined();
  });

  it('shows the read-only prompt and blocks submit for a blocked row', async () => {
    const { wrapper } = await mountForm({ kind: 'mlmodel', serviceType: 'CustomMlModel' });
    expect(wrapper.find('[data-testid="no-config-available"]').text()).toBe('Reason C.');
    expect(wrapper.findComponent(TestConnectionCard).exists()).toBe(false);
    const exposed = wrapper.vm as unknown as {
      submit: () => boolean;
      connectionSubmitBlocked: boolean;
      guardDecision: { formArea: string } | null;
    };
    expect(exposed.connectionSubmitBlocked).toBe(true);
    expect(exposed.guardDecision?.formArea).toBe('read-only-prompt');
    expect(exposed.submit()).toBe(false);
  });

  it('passes through for WEBHOOK now that it has no ledger row (A2)', async () => {
    // A2 (2026-11-19): WEBHOOK has no ledger row — the type exists only
    // in the API service enum, with no connection form — so it is
    // out-of-universe like mcp/Mcp, not a no-loader row: no fetch, no
    // no-config prompt, test connection renders, the guard does not
    // block submit. The no-config area itself is still covered at the
    // unit level (loader L1 'empty' + decideConnectionGuard 'empty').
    let fetchCalled = false;
    const { wrapper } = await mountForm({
      kind: 'api',
      serviceType: 'WEBHOOK',
      fetchSchema: async () => {
        fetchCalled = true;
        return jsonResponse(SCHEMA);
      },
    });
    expect(fetchCalled).toBe(false);
    expect(wrapper.find('[data-testid="no-config-available"]').exists()).toBe(false);
    expect(wrapper.findComponent(TestConnectionCard).exists()).toBe(true);
    const exposed = wrapper.vm as unknown as {
      connectionSubmitBlocked: boolean;
      guardDecision: { formArea: string } | null;
    };
    expect(exposed.connectionSubmitBlocked).toBe(false);
    expect(exposed.guardDecision).toBeNull();
  });

  it('shows the load-failed prompt when the schema fetch rejects', async () => {
    const { wrapper } = await mountForm({
      fetchSchema: async () => {
        throw new Error('network down');
      },
    });
    expect(wrapper.find('[data-testid="no-config-available"]').text()).toBe(
      'The connection schema failed to load.',
    );
    const exposed = wrapper.vm as unknown as { submit: () => boolean };
    expect(exposed.submit()).toBe(false);
  });

  it('passes the four additional props through to the test-connection contract', async () => {
    const onValidate = vi.fn(() => false);
    const { wrapper } = await mountForm({
      extraProps: {
        additionalMissingFieldsCount: 2,
        isAdditionalValidationPending: true,
        onValidateAdditionalRequiredFields: onValidate,
      },
    });
    const card = wrapper.findComponent(TestConnectionCard);
    expect(card.props('missingRequiredFieldsCount')).toBeGreaterThanOrEqual(2);
    expect(card.props('isFormValidationPending')).toBe(true);
    const validate = card.props('onValidateFormRequiredFields') as () => boolean;
    expect(validate()).toBe(false);
    expect(onValidate).toHaveBeenCalledTimes(1);
  });

  it('honors the parent submit-disabled flag', async () => {
    const { wrapper } = await mountForm({
      formOverrides: { hostPort: 'localhost:5432', username: 'reader', database: 'warehouse' },
      extraProps: { isSubmitDisabled: true },
    });
    const exposed = wrapper.vm as unknown as { submit: () => boolean; isSubmitDisabled: boolean };
    expect(exposed.isSubmitDisabled).toBe(true);
    expect(exposed.submit()).toBe(false);
  });

  it('hides the test connection when disabled', async () => {
    const { wrapper } = await mountForm({ extraProps: { disabled: true } });
    expect(wrapper.findComponent(TestConnectionCard).exists()).toBe(false);
    expect(wrapper.find('[data-testid="no-config-available"]').exists()).toBe(false);
  });

  it('passes through for an out-of-universe pair with the existing behavior', async () => {
    const { wrapper } = await mountForm({ kind: 'mcp', serviceType: 'Mcp' });
    expect(wrapper.find('[data-testid="no-config-available"]').exists()).toBe(false);
    expect(wrapper.findComponent(TestConnectionCard).exists()).toBe(true);
    const exposed = wrapper.vm as unknown as { connectionSubmitBlocked: boolean };
    expect(exposed.connectionSubmitBlocked).toBe(false);
  });

  it('shows no filter-pattern field in the connection form', async () => {
    const { wrapper } = await mountForm({});
    for (const field of [
      'databaseFilterPattern',
      'schemaFilterPattern',
      'tableFilterPattern',
      'topicFilterPattern',
    ]) {
      expect(wrapper.text()).not.toContain(field);
    }
  });
});
