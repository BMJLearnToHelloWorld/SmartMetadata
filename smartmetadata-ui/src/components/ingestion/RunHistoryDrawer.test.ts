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
import Antd from 'ant-design-vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestI18n } from '@/test/i18n';
import type { Agent, PipelineStatus } from '@/types/ingestion';
import RunHistoryDrawer from './RunHistoryDrawer.vue';

const listStatusesMock = vi.fn();

vi.mock('@/api/ingestionPipelines', () => ({
  listPipelineStatuses: (...args: unknown[]) => listStatusesMock(...args),
}));

function agent(overrides: Partial<Agent> = {}): Agent {
  return {
    id: 'a1',
    fqn: 'svc.Metadata_Agent',
    pipelineType: 'Metadata',
    name: 'Metadata Agent',
    type: 'Metadata',
    unit: 'assets',
    verb: 'ingested',
    status: 'success',
    pct: 100,
    eta: null,
    assets: 10,
    target: 10,
    errors: 0,
    warnings: 0,
    recentRuns: [],
    enabled: true,
    ...overrides,
  };
}

const T1 = Date.UTC(2026, 10, 15, 2, 0, 0);
const T2 = Date.UTC(2026, 10, 16, 2, 0, 0);
const T3 = Date.UTC(2026, 10, 17, 2, 0, 0);

/** Newest-first, as the endpoint returns them. */
function statuses(): PipelineStatus[] {
  return [
    {
      runId: 'r3',
      timestamp: T3,
      pipelineState: 'Success',
      startDate: T3,
      endDate: T3 + 90_000,
      status: [
        { name: 'metadata', records: 100, filtered: 10, updated_records: 5, warnings: 1, errors: 0 },
        {
          name: 'lineage',
          records: 60,
          filtered: 20,
          updated_records: 2,
          warnings: 2,
          errors: 3,
          failures: [
            { name: 'sink', error: 'boom', stackTrace: 'trace1\nERROR trace2' },
            { name: 'second', error: 'ignored' },
          ],
        },
      ],
    },
    {
      runId: 'r2',
      timestamp: T2,
      pipelineState: 'Failed',
      startDate: T2,
      endDate: T2 + 60_000,
      status: [
        {
          name: 'metadata',
          records: 0,
          filtered: 0,
          warnings: 0,
          errors: 1,
          failures: [{ name: 'f', error: 'e' }],
        },
      ],
    },
    {
      runId: 'r1',
      timestamp: T1,
      pipelineState: 'Queued',
      status: [],
    },
  ];
}

function mountDrawer(props: Record<string, unknown> = {}) {
  const snapshot = agent();
  return mount(RunHistoryDrawer, {
    attachTo: document.body,
    props: {
      agent: snapshot,
      agents: [snapshot],
      open: true,
      permissions: { trigger: true, edit: false, delete: false },
      ...props,
    },
    global: { plugins: [Antd, createTestI18n()] },
  });
}

function cards(): HTMLElement[] {
  return [...document.querySelectorAll<HTMLElement>('[data-testid="run-history-item"]')];
}

function drawerText(): string {
  return document.querySelector('.ant-drawer-body')?.textContent ?? '';
}

function headerText(): string {
  return document.querySelector('.ant-drawer-header')?.textContent ?? '';
}

function statText(testId: string): string {
  return document.querySelector(`[data-testid="${testId}"]`)?.textContent ?? '';
}

async function mountWithRuns(props: Record<string, unknown> = {}): Promise<VueWrapper> {
  listStatusesMock.mockResolvedValue({ data: statuses(), paging: { total: 3 } });
  const wrapper = mountDrawer(props);
  await vi.waitFor(() => expect(cards()).toHaveLength(3));
  return wrapper;
}

describe('RunHistoryDrawer (official RunHistoryDrawer + useAgentRuns)', () => {
  beforeEach(() => {
    listStatusesMock.mockReset();
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('fetches limit 10 only while open', async () => {
    listStatusesMock.mockResolvedValue({ data: [], paging: { total: 0 } });
    const wrapper = mountDrawer({ open: false });
    await flushPromises();
    expect(listStatusesMock).not.toHaveBeenCalled();
    await wrapper.setProps({ open: true });
    await vi.waitFor(() => expect(listStatusesMock).toHaveBeenCalledTimes(1));
    expect(listStatusesMock).toHaveBeenCalledWith('svc.Metadata_Agent', { limit: 10 });
  });

  it('renders the rail oldest-first and selects the newest run by default', async () => {
    await mountWithRuns();
    const labels = cards().map((card) => card.textContent ?? '');
    expect(labels[0]).toContain("Didn't run");
    expect(labels[1]).toContain('Failed');
    expect(labels[2]).toContain('Success');
    expect(cards()[2].className).toContain('run-history-drawer__card--selected');
    expect(document.querySelector('[data-testid="selected-run-status"]')?.textContent).toContain(
      'Success',
    );
    expect(drawerText()).toContain('Recent Runs');
  });

  it('selects the initialRunId match when provided', async () => {
    await mountWithRuns({ initialRunId: 'r2' });
    expect(cards()[1].className).toContain('run-history-drawer__card--selected');
    expect(document.querySelector('[data-testid="selected-run-status"]')?.textContent).toContain(
      'Failed',
    );
  });

  it('switches the selected panel when a rail card is clicked', async () => {
    await mountWithRuns();
    cards()[0].click();
    await flushPromises();
    expect(cards()[0].className).toContain('run-history-drawer__card--selected');
    expect(document.querySelector('[data-testid="selected-run-status"]')?.textContent).toContain(
      "Didn't run",
    );
    expect(drawerText()).toContain('No steps available.');
  });

  it('derives totals as max for counts and sum for warnings/errors', async () => {
    await mountWithRuns();
    expect(statText('run-stat-processed')).toContain('100');
    expect(statText('run-stat-filtered')).toContain('20');
    expect(statText('run-stat-updated')).toContain('5');
    expect(statText('run-stat-warnings')).toContain('3');
    expect(statText('run-stat-errors')).toContain('3');
  });

  it('formats the started-at line with a UTC offset and rounded duration', async () => {
    await mountWithRuns();
    const sub = document.querySelector('.run-history-drawer__selected-sub')?.textContent ?? '';
    expect(sub).toMatch(/^[A-Z][a-z]{2} \d{2}, \d{4} · \d{2}:\d{2} \(UTC[+-]\d{2}:\d{2}\) ·/);
    expect(sub).toContain('ran for 1.5 min');
    expect(cards()[2].textContent).toContain('1.5 min');
  });

  it('maps an unknown pipeline state to skipped', async () => {
    listStatusesMock.mockResolvedValue({
      data: [{ runId: 'rx', timestamp: T1, pipelineState: 'SomethingNew', status: [] }],
      paging: { total: 1 },
    });
    mountDrawer();
    await vi.waitFor(() => expect(cards()).toHaveLength(1));
    expect(cards()[0].textContent).toContain("Didn't run");
  });

  it('renders step rows with derived statuses and the first failure only', async () => {
    await mountWithRuns();
    const body = drawerText();
    expect(body).toContain('metadata');
    expect(body).toContain('lineage');
    expect(body).toContain('2 steps');
    expect(body).toContain('3 errors');
    expect(body).toContain('sink');
    expect(body).toContain('boom');
    expect(body).not.toContain('second');
    expect(body).not.toContain('ignored');
  });

  it('shows the no-recent-runs state when the list is empty', async () => {
    listStatusesMock.mockResolvedValue({ data: [], paging: { total: 0 } });
    mountDrawer();
    await vi.waitFor(() => expect(drawerText()).toContain('No recent runs found.'));
  });

  it('shows the no-recent-runs state when the fetch fails', async () => {
    listStatusesMock.mockRejectedValue(new Error('network down'));
    mountDrawer();
    await vi.waitFor(() => expect(drawerText()).toContain('No recent runs found.'));
  });

  it('shows the header name, subtitle and raw-logs button, and keeps the drawer open on open-logs', async () => {
    const wrapper = await mountWithRuns();
    expect(headerText()).toContain('Metadata Agent');
    expect(headerText()).toContain('Run history & details');
    const rawLogs = document.querySelector<HTMLElement>('[data-testid="raw-logs-button"]');
    rawLogs?.click();
    await flushPromises();
    expect(wrapper.emitted('open-logs')).toHaveLength(1);
    expect(wrapper.emitted('close')).toBeUndefined();
    expect(document.querySelector('.ant-drawer-body')).not.toBeNull();
  });

  it('resolves the live agent from the agents list for the header and emits', async () => {
    const snapshot = agent();
    const live = agent({ name: 'Live Name', status: 'failed' });
    const wrapper = mountDrawer({ agent: snapshot, agents: [live] });
    listStatusesMock.mockResolvedValue({ data: [], paging: { total: 0 } });
    await vi.waitFor(() => expect(headerText()).toContain('Live Name'));
    expect(
      document.querySelector('[data-testid="raw-logs-button"]')?.className,
    ).toContain('ant-btn-dangerous');
    document.querySelector<HTMLElement>('[data-testid="raw-logs-button"]')?.click();
    await flushPromises();
    expect(wrapper.emitted('open-logs')?.[0]).toEqual([live]);
  });

  it('falls back to the snapshot agent when the list has no match', async () => {
    listStatusesMock.mockResolvedValue({ data: [], paging: { total: 0 } });
    mountDrawer({ agents: [] });
    await vi.waitFor(() => expect(headerText()).toContain('Metadata Agent'));
  });

  it('gates Run now on the live agent state and emits run with the live agent', async () => {
    const snapshot = agent();
    const running = agent({ status: 'running' });
    listStatusesMock.mockResolvedValue({ data: [], paging: { total: 0 } });
    const wrapper = mountDrawer({ agent: snapshot, agents: [running] });
    await vi.waitFor(() => expect(drawerText()).toContain('No recent runs found.'));
    expect(document.querySelector('[data-testid="drawer-run-now-button"]')).toBeNull();

    document.body.innerHTML = '';
    listStatusesMock.mockResolvedValue({ data: [], paging: { total: 0 } });
    const live = agent({ name: 'Live Name' });
    const wrapper2 = mountDrawer({ agent: snapshot, agents: [live] });
    await vi.waitFor(() => expect(headerText()).toContain('Live Name'));
    document.querySelector<HTMLElement>('[data-testid="drawer-run-now-button"]')?.click();
    await flushPromises();
    expect(wrapper2.emitted('run')?.[0]).toEqual([live]);
    expect(wrapper.emitted('run')).toBeUndefined();
  });

  it('hides Run now without trigger permission', async () => {
    listStatusesMock.mockResolvedValue({ data: [], paging: { total: 0 } });
    mountDrawer({ permissions: { trigger: false, edit: false, delete: false } });
    await vi.waitFor(() => expect(drawerText()).toContain('No recent runs found.'));
    expect(document.querySelector('[data-testid="drawer-run-now-button"]')).toBeNull();
  });

  it('disables the header actions while actions are pending or unavailable', async () => {
    listStatusesMock.mockResolvedValue({ data: [], paging: { total: 0 } });
    mountDrawer({ actionsPending: true });
    await vi.waitFor(() => expect(drawerText()).toContain('No recent runs found.'));
    expect(
      (document.querySelector('[data-testid="raw-logs-button"]') as HTMLButtonElement).disabled,
    ).toBe(true);
    expect(
      (document.querySelector('[data-testid="drawer-run-now-button"]') as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  it('emits close from the drawer close button', async () => {
    listStatusesMock.mockResolvedValue({ data: [], paging: { total: 0 } });
    const wrapper = mountDrawer();
    await vi.waitFor(() => expect(drawerText()).toContain('No recent runs found.'));
    document
      .querySelector<HTMLElement>('.ant-drawer-close')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushPromises();
    expect(wrapper.emitted('close')).toHaveLength(1);
  });

  it('renders at 720px wide', async () => {
    listStatusesMock.mockResolvedValue({ data: [], paging: { total: 0 } });
    mountDrawer();
    await vi.waitFor(() => expect(drawerText()).toContain('No recent runs found.'));
    expect(
      (document.querySelector('.ant-drawer-content-wrapper') as HTMLElement).style.width,
    ).toBe('720px');
  });
});
