/**
 * Copyright 2026 SmartMetadata authors.
 * Licensed under the Apache License, Version 2.0.
 */
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import Antd, { message } from 'ant-design-vue';
import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryHistory, createRouter, type Router } from 'vue-router';
import { createTestI18n } from '@/test/i18n';
import IngestionPipelineList from './IngestionPipelineList.vue';

/**
 * The `settings.services.pipeline.*` keys are written by the
 * integration line; the test merges the pin-verbatim values so the
 * assertions read real copy instead of key strings.
 */
const PIPELINE_MESSAGES = {
  settings: {
    services: {
      pipeline: {
        countColumn: 'Count',
        scheduleColumn: 'Schedule',
        recentRunsColumn: 'Recent Runs',
        statusColumn: 'Status',
        countSuccess: 'Success',
        countFailed: 'Failed',
        countWarning: 'Warning',
        statusActive: 'Active',
        statusPaused: 'Paused',
        reDeploy: 'Re Deploy',
        noAgentsSetUpYet: 'No agents set up yet',
        disabledDeployment:
          'To view Ingestion Data, run the metadata ingestion on your own environment following these <0>{link}</0>',
        noIngestionDescription:
          'To view Agents Data, run the metadata ingestion. Please refer to this doc to schedule the <0>{link}</0>',
        documentationLink: 'documentation',
        metadataAgentsLink: 'Metadata Agents',
        documentation: 'Documentation',
        disabledFallback:
          'The pipeline service is disabled for this deployment. Agents are listed from their last recorded state, and deploying or running them has no effect until it is enabled.',
        unreachableFallback:
          'The pipeline service cannot be reached. Agents and their run history are shown from their last recorded state, and agent actions stay unavailable until the service responds again.',
        tooltip: { executionDate: 'Execution Date', startDate: 'Start Date', endDate: 'End Date' },
      },
    },
  },
  ingestion: {
    pipelines: {
      bulkDeploySuccess: 'Pipelines re-deployed successfully',
      bulkDeployPartial: '{deployed} deployed, {failed} not deployed',
    },
  },
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

interface StubBehavior {
  listStatus: number;
  listBody: unknown;
  orchestratorBody: unknown;
  deployBody: (id: string) => unknown;
  deployStatus: number;
}

function pipelineRecord(id: string, overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id,
    name: `${id}-metadata`,
    displayName: `${id} metadata`,
    fullyQualifiedName: `warehouse.${id}-metadata`,
    pipelineType: 'metadata',
    enabled: true,
    service: { id: 's1', type: 'databaseService', name: 'warehouse' },
    airflowConfig: { scheduleInterval: '0 0 * * *' },
    pipelineStatuses: [
      {
        runId: `${id}-run-1`,
        pipelineState: 'success',
        timestamp: 1700000000000,
        startDate: 1700000000000,
        endDate: 1700000060000,
        status: [{ records: 100, updated_records: 5, errors: 2, warnings: 1 }],
      },
    ],
    ...overrides,
  };
}

function installFetch(behavior: StubBehavior): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      // The probe branch must precede the list branch: the list URL
      // prefix also matches /status.
      if (url.includes('/api/v1/services/ingestionPipelines/status')) {
        return jsonResponse(behavior.orchestratorBody);
      }
      if (url.includes('/api/v1/services/ingestionPipelines/deploy/')) {
        const id = url.split('/deploy/')[1]?.split('?')[0] ?? '';
        return jsonResponse(behavior.deployBody(decodeURIComponent(id)), behavior.deployStatus);
      }
      if (url.includes('/api/v1/services/ingestionPipelines')) {
        return jsonResponse(behavior.listBody, behavior.listStatus);
      }
      return new Response('not found', { status: 404 });
    }),
  );
}

function defaultBehavior(): StubBehavior {
  return {
    listStatus: 200,
    listBody: {
      data: [pipelineRecord('p1'), pipelineRecord('p2', { enabled: false })],
      paging: { total: 2 },
    },
    orchestratorBody: { code: 200, platform: 'airflow' },
    deployBody: () => ({ code: 200 }),
    deployStatus: 200,
  };
}

async function mountList(
  serviceName = 'databaseServices',
  initialQuery: Record<string, string> = {},
): Promise<{ wrapper: VueWrapper; router: Router }> {
  const pinia = createPinia();
  setActivePinia(pinia);
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/', name: 'pipelines-tab', component: { template: '<div />' } }],
  });
  await router.push({ path: '/', query: initialQuery });
  await router.isReady();
  const i18n = createTestI18n();
  i18n.global.mergeLocaleMessage('en-US', PIPELINE_MESSAGES);
  const wrapper = mount(IngestionPipelineList, {
    props: { serviceName },
    attachTo: document.body,
    global: { plugins: [pinia, router, Antd, i18n] },
  });
  await flushPromises();
  return { wrapper, router };
}

function fetchUrls(): string[] {
  return vi.mocked(fetch).mock.calls.map(([input]) => String(input));
}

function listUrls(): string[] {
  return fetchUrls().filter(
    (url) =>
      url.includes('/api/v1/services/ingestionPipelines') &&
      !url.includes('/status') &&
      !url.includes('/deploy/'),
  );
}

async function selectRows(wrapper: VueWrapper, count: number): Promise<void> {
  const boxes = wrapper.findAll('tbody .ant-checkbox-input');
  expect(boxes.length).toBeGreaterThanOrEqual(count);
  for (let index = 0; index < count; index += 1) {
    await boxes[index].trigger('click');
  }
  await flushPromises();
}

describe('IngestionPipelineList', () => {
  beforeEach(() => {
    localStorage.clear();
    installFetch(defaultBehavior());
  });

  afterEach(() => {
    message.destroy();
    document.body.innerHTML = '';
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it('fetches with the category service type and renders the six official columns', async () => {
    const { wrapper } = await mountList();
    const url = listUrls()[0];
    expect(url).toContain('serviceType=databaseService');
    expect(url).toContain('limit=15');
    expect(url).not.toContain('service=');
    const header = wrapper.find('.ant-table-thead').text();
    expect(header).toContain('Name');
    expect(header).toContain('Type');
    expect(header).toContain('Count');
    expect(header).toContain('Schedule');
    expect(header).toContain('Recent Runs');
    expect(header).toContain('Status');
    expect(header).not.toContain('Description');
    expect(header).not.toContain('Service');
    // Name is plain text: no link, no highlight.
    expect(wrapper.find('tbody a').exists()).toBe(false);
    expect(wrapper.find('tbody').text()).toContain('p1 metadata');
    // Type shows the raw enum value.
    expect(wrapper.find('tbody').text()).toContain('metadata');
    // Count tiles with the official formula.
    expect(wrapper.find('[data-testid="success-count"]').text()).toContain('105');
    expect(wrapper.find('[data-testid="failed-count"]').text()).toContain('2');
    // Status shows both states.
    expect(wrapper.find('tbody').text()).toContain('Active');
    expect(wrapper.find('tbody').text()).toContain('Paused');
    // No row actions, no create entry anywhere in the tab.
    expect(wrapper.find('[data-testid^="row-overflow-"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="create-pipeline"]').exists()).toBe(false);
  });

  it('passes TEST_SUITE service type for the testSuites tab', async () => {
    await mountList('testSuites');
    expect(listUrls()[0]).toContain('serviceType=testSuite');
  });

  it('keeps old rows and stays silent when a reload fails', async () => {
    const behavior = defaultBehavior();
    installFetch(behavior);
    const { wrapper } = await mountList();
    expect(wrapper.find('tbody').text()).toContain('p1 metadata');
    behavior.listStatus = 500;
    behavior.listBody = 'boom';
    // Sorting triggers a reload through the URL write.
    await wrapper.find('.ant-table-column-sorters').trigger('click');
    await flushPromises();
    await flushPromises();
    expect(wrapper.find('tbody').text()).toContain('p1 metadata');
    expect(document.querySelector('.ant-message-error')).toBeNull();
  });

  it('fetches the list without waiting for the airflow probe', async () => {
    let resolveProbe: ((value: Response) => void) | undefined;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('/api/v1/services/ingestionPipelines/status')) {
          return new Promise<Response>((resolve) => {
            resolveProbe = resolve;
          });
        }
        if (url.includes('/api/v1/services/ingestionPipelines')) {
          return jsonResponse({
            data: [pipelineRecord('p1')],
            paging: { total: 1 },
          });
        }
        return new Response('not found', { status: 404 });
      }),
    );
    const { wrapper } = await mountList();
    expect(wrapper.find('tbody').text()).toContain('p1 metadata');
    resolveProbe?.(jsonResponse({ code: 200, platform: 'airflow' }));
    await flushPromises();
  });

  it('shows the disabled banner text when the platform is disabled', async () => {
    const behavior = defaultBehavior();
    behavior.orchestratorBody = { code: 200, platform: 'disabled' };
    installFetch(behavior);
    const { wrapper } = await mountList();
    expect(wrapper.find('[data-testid="no-airflow-placeholder"]').exists()).toBe(true);
    expect(wrapper.text()).toContain('The pipeline service is disabled for this deployment.');
    expect(wrapper.find('[data-testid="bulk-re-deploy-button"]').attributes('disabled')).toBeDefined();
  });

  it('shows no banner when the orchestrator answers 200', async () => {
    const { wrapper } = await mountList();
    expect(wrapper.find('[data-testid="no-airflow-placeholder"]').exists()).toBe(false);
  });

  it('bulk deploys each selected pipeline by id, toasts once, and reloads after 500ms', async () => {
    const { wrapper } = await mountList();
    const button = wrapper.find('[data-testid="bulk-re-deploy-button"]');
    expect(button.attributes('disabled')).toBeDefined();
    await selectRows(wrapper, 2);
    expect(wrapper.find('[data-testid="bulk-re-deploy-button"]').attributes('disabled')).toBeUndefined();
    const loadsBefore = listUrls().length;
    await wrapper.find('[data-testid="bulk-re-deploy-button"]').trigger('click');
    await flushPromises();
    const deployUrls = fetchUrls().filter((url) => url.includes('/deploy/'));
    expect(deployUrls).toHaveLength(2);
    expect(deployUrls[0]).toContain('/deploy/p1');
    expect(deployUrls[1]).toContain('/deploy/p2');
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(document.querySelector('.ant-message-success')?.textContent).toContain(
      'Pipelines re-deployed successfully',
    );
    expect(document.querySelector('.ant-message-error')).toBeNull();
    // The finally cleared the selection: the button is disabled again.
    expect(wrapper.find('[data-testid="bulk-re-deploy-button"]').attributes('disabled')).toBeDefined();
    await new Promise((resolve) => setTimeout(resolve, 600));
    await flushPromises();
    expect(listUrls().length).toBeGreaterThan(loadsBefore);
  });

  it('reports disabled-client deploys as failures with the shared reason and does not reload', async () => {
    const behavior = defaultBehavior();
    behavior.deployBody = () => ({ code: 200, reason: 'Pipeline Client Disabled' });
    installFetch(behavior);
    const { wrapper } = await mountList();
    await selectRows(wrapper, 2);
    const loadsBefore = listUrls().length;
    await wrapper.find('[data-testid="bulk-re-deploy-button"]').trigger('click');
    await flushPromises();
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(document.querySelector('.ant-message-success')).toBeNull();
    expect(document.querySelector('.ant-message-error')?.textContent).toContain(
      '0 deployed, 2 not deployed — Pipeline Client Disabled',
    );
    await new Promise((resolve) => setTimeout(resolve, 600));
    await flushPromises();
    expect(listUrls().length).toBe(loadsBefore);
  });

  it('reports mixed results with counts only and still reloads', async () => {
    const behavior = defaultBehavior();
    behavior.deployBody = (id) =>
      id === 'p1' ? { code: 200 } : { code: 200, reason: 'Pipeline Client Disabled' };
    installFetch(behavior);
    const { wrapper } = await mountList();
    await selectRows(wrapper, 2);
    const loadsBefore = listUrls().length;
    await wrapper.find('[data-testid="bulk-re-deploy-button"]').trigger('click');
    await flushPromises();
    await new Promise((resolve) => setTimeout(resolve, 50));
    const errorText = document.querySelector('.ant-message-error')?.textContent ?? '';
    expect(errorText).toContain('1 deployed, 1 not deployed');
    expect(errorText).not.toContain('Pipeline Client Disabled');
    await new Promise((resolve) => setTimeout(resolve, 600));
    await flushPromises();
    expect(listUrls().length).toBeGreaterThan(loadsBefore);
  });

  it('reports a deploy throw with the error message', async () => {
    const behavior = defaultBehavior();
    behavior.deployStatus = 500;
    behavior.deployBody = () => 'deploy boom';
    installFetch(behavior);
    const { wrapper } = await mountList();
    await selectRows(wrapper, 1);
    await wrapper.find('[data-testid="bulk-re-deploy-button"]').trigger('click');
    await flushPromises();
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(document.querySelector('.ant-message-error')).not.toBeNull();
    expect(document.querySelector('.ant-message-success')).toBeNull();
  });

  it('writes ?sortOrder= on name sort and keeps the sort param out of other actions', async () => {
    const { wrapper, router } = await mountList();
    await wrapper.find('.ant-table-column-sorters').trigger('click');
    await flushPromises();
    await flushPromises();
    expect(router.currentRoute.value.query.sortOrder).toBe('asc');
    const sortedUrl = listUrls().at(-1) ?? '';
    expect(sortedUrl).toContain('sortField=displayName');
    expect(sortedUrl).toContain('sortOrder=asc');
    await wrapper.find('.ant-table-column-sorters').trigger('click');
    await flushPromises();
    await flushPromises();
    expect(router.currentRoute.value.query.sortOrder).toBe('desc');
  });

  it('ignores an illegal ?sortOrder= value', async () => {
    await mountList('databaseServices', { sortOrder: 'sideways' });
    expect(listUrls()[0]).not.toContain('sortField=');
    expect(listUrls()[0]).not.toContain('sortOrder=');
  });

  it('filters by pipeline type through the column filter', async () => {
    const { wrapper } = await mountList();
    const trigger = wrapper.find('.ant-table-filter-trigger');
    expect(trigger.exists()).toBe(true);
    await trigger.trigger('click');
    await flushPromises();
    await new Promise((resolve) => setTimeout(resolve, 50));
    const rows = [...document.querySelectorAll('.column-filter__row input')];
    expect(rows.length).toBe(12);
    (rows[0] as HTMLElement).click();
    await flushPromises();
    await flushPromises();
    const filteredUrl = listUrls().at(-1) ?? '';
    expect(filteredUrl).toContain('pipelineType=application');
  });

  it('shows the disabled-deployment empty state with the deployment docs link', async () => {
    const behavior = defaultBehavior();
    behavior.listBody = { data: [], paging: { total: 0 } };
    behavior.orchestratorBody = { code: 200, platform: 'disabled' };
    installFetch(behavior);
    const { wrapper } = await mountList();
    expect(wrapper.text()).toContain('No agents set up yet');
    expect(wrapper.text()).toContain('To view Ingestion Data');
    const link = wrapper.find('a[href*="deployment/ingestion"]');
    expect(link.exists()).toBe(true);
    expect(link.text()).toBe('documentation');
    expect(wrapper.find('[data-testid="empty-create-pipeline"]').exists()).toBe(false);
  });

  it('shows the default empty state with the metadata workflows link', async () => {
    const behavior = defaultBehavior();
    behavior.listBody = { data: [], paging: { total: 0 } };
    installFetch(behavior);
    const { wrapper } = await mountList();
    expect(wrapper.text()).toContain('To view Agents Data');
    const link = wrapper.find('a[href*="connectors/ingestion/workflows/metadata"]');
    expect(link.exists()).toBe(true);
    expect(link.text()).toBe('Metadata Agents');
  });

  it('pages forward with the after cursor', async () => {
    const behavior = defaultBehavior();
    behavior.listBody = {
      data: [pipelineRecord('p1')],
      paging: { total: 20, after: 'cursor-1' },
    };
    installFetch(behavior);
    const { wrapper } = await mountList();
    expect(wrapper.find('[data-testid="pagination"]').exists()).toBe(true);
    await wrapper.find('[data-testid="next"]').trigger('click');
    await flushPromises();
    await flushPromises();
    const pagedUrl = listUrls().at(-1) ?? '';
    expect(pagedUrl).toContain('after=cursor-1');
  });
});
