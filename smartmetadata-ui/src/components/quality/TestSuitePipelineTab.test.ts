/**
 * Copyright 2026 SmartMetadata authors.
 * Licensed under the Apache License, Version 2.0.
 */
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { createMemoryHistory, createRouter } from 'vue-router';
import Antd from 'ant-design-vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import NextPrevious from '@/components/shared/NextPrevious.vue';
import TestSuitePipelineTab from '@/components/quality/TestSuitePipelineTab.vue';
import { createTestI18n } from '@/test/i18n';
import { PAGE_SIZE_BASE } from '@/utils/pagination';

const listIngestionPipelines = vi.fn();
const getOrchestratorStatus = vi.fn();
const getEntityPermissionByFqn = vi.fn();

vi.mock('@/api/ingestionPipelines', () => ({
  INGESTION_PIPELINE_FIELDS: 'owners,pipelineStatuses',
  listIngestionPipelines: (...args: unknown[]) => listIngestionPipelines(...args),
  getOrchestratorStatus: (...args: unknown[]) => getOrchestratorStatus(...args),
}));

vi.mock('@/stores/permissions', () => ({
  usePermissionStore: () => ({
    isAdminUser: true,
    getResourcePermission: vi.fn(async () => ({ Create: true })),
    getEntityPermissionByFqn: (...args: unknown[]) => getEntityPermissionByFqn(...args),
  }),
}));

vi.mock('@/ingestion/usePipelineRowActions', () => ({
  usePipelineRowActions: () => ({
    logsPipeline: { value: null },
    killPipeline: { value: null },
    onRun: vi.fn(),
    onDeploy: vi.fn(),
    onToggle: vi.fn(),
    onLogs: vi.fn(),
    onKill: vi.fn(),
    onDelete: vi.fn(),
    onKillDone: vi.fn(),
  }),
}));

const mockPipelines = [
  {
    id: 'p1',
    name: 'pipeline1',
    fullyQualifiedName: 'suite.fqn.pipeline1',
    displayName: 'pipeline1',
    pipelineType: 'TestSuite',
    enabled: true,
    sourceConfig: { config: { testCases: ['a', 'b', 'c'] } },
    pipelineStatuses: [],
  },
  {
    id: 'p2',
    name: 'pipeline2',
    fullyQualifiedName: 'suite.fqn.pipeline2',
    displayName: 'pipeline2',
    pipelineType: 'TestSuite',
    enabled: true,
    sourceConfig: { config: { testCases: ['a'] } },
    pipelineStatuses: [],
  },
];

async function mountTab() {
  const pinia = createPinia();
  setActivePinia(pinia);
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', name: 'home', component: { template: '<div />' } },
      { path: '/ingestion/pipelines/:id', name: 'ingestion-pipeline', component: { template: '<div />' } },
    ],
  });
  await router.push('/');
  await router.isReady();
  const wrapper = mount(TestSuitePipelineTab, {
    props: { testSuiteFqn: 'suite.fqn', testSuiteId: 'suite-id' },
    global: {
      plugins: [pinia, router, Antd, createTestI18n()],
      stubs: {
        IngestionRecentRuns: true,
        IngestionStatusCount: true,
        PipelineScheduleCell: true,
        TestSuitePipelineFormDrawer: true,
        IngestionLogsModal: true,
        KillPipelineModal: true,
        PipelineRowActions: true,
      },
    },
    attachTo: document.body,
  });
  await flushPromises();
  return wrapper;
}

describe('TestSuitePipelineTab', () => {
  beforeEach(() => {
    listIngestionPipelines.mockReset();
    getOrchestratorStatus.mockReset();
    getEntityPermissionByFqn.mockReset();
    getOrchestratorStatus.mockResolvedValue({ platform: 'active', code: 200 });
    getEntityPermissionByFqn.mockResolvedValue({ EditAll: true, Delete: true });
    listIngestionPipelines.mockResolvedValue({
      data: mockPipelines,
      total: 30,
      after: 'cursor-after',
      before: 'cursor-before',
    });
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('loads pipelines with official page size on mount', async () => {
    await mountTab();
    expect(listIngestionPipelines).toHaveBeenCalledWith(
      expect.objectContaining({
        testSuite: 'suite.fqn',
        pipelineType: 'TestSuite',
        limit: PAGE_SIZE_BASE,
        fields: 'owners,pipelineStatuses',
      }),
    );
  });

  it('renders NextPrevious when total is non-zero', async () => {
    const wrapper = await mountTab();
    const pager = wrapper.findComponent(NextPrevious);
    expect(pager.exists()).toBe(true);
    expect(pager.props('pageSize')).toBe(PAGE_SIZE_BASE);
  });

  it('hides NextPrevious when total is zero', async () => {
    listIngestionPipelines.mockResolvedValueOnce({ data: [], total: 0 });
    const wrapper = await mountTab();
    expect(wrapper.findComponent(NextPrevious).exists()).toBe(false);
  });

  it('fetches the next cursor page when NextPrevious advances', async () => {
    const wrapper = await mountTab();
    const pager = wrapper.findComponent(NextPrevious);
    await pager.props('pagingHandler')({ cursorType: 'after', currentPage: 2 });
    await flushPromises();
    expect(listIngestionPipelines).toHaveBeenLastCalledWith(
      expect.objectContaining({
        testSuite: 'suite.fqn',
        limit: PAGE_SIZE_BASE,
        after: 'cursor-after',
      }),
    );
  });

  it('exposes test-case count per pipeline row', async () => {
    const wrapper = await mountTab();
    expect(wrapper.find('[data-testid="test-case-count-pipeline1"]').text()).toBe('3');
    expect(wrapper.find('[data-testid="test-case-count-pipeline2"]').text()).toBe('1');
  });

  it('fetches per-pipeline ingestion permissions by FQN', async () => {
    await mountTab();
    expect(getEntityPermissionByFqn).toHaveBeenCalledWith(
      'ingestionPipeline',
      'suite.fqn.pipeline1',
    );
    expect(getEntityPermissionByFqn).toHaveBeenCalledWith(
      'ingestionPipeline',
      'suite.fqn.pipeline2',
    );
  });

  it('shows Airflow setup guide when orchestrator is unavailable', async () => {
    getOrchestratorStatus.mockResolvedValue({ platform: 'Airflow', code: 503 });
    const wrapper = await mountTab();
    expect(wrapper.find('[data-testid="error-placeholder-ingestion"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="test-suite-pipeline-tab"]').exists()).toBe(false);
  });
});