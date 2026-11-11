/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { flushPromises, mount } from '@vue/test-utils';
import Antd, { message } from 'ant-design-vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestI18n } from '@/test/i18n';
import KillPipelineModal from './KillPipelineModal.vue';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

async function mountModal() {
  const wrapper = mount(KillPipelineModal, {
    props: { open: true, pipelineId: 'p1', pipelineName: 'warehouse-metadata' },
    attachTo: document.body,
    global: { plugins: [Antd, createTestI18n()] },
  });
  await flushPromises();
  return wrapper;
}

async function clickConfirm(): Promise<void> {
  const ok = document.body.querySelector('.ant-modal-footer .ant-btn-primary') as HTMLElement | null;
  expect(ok).not.toBeNull();
  ok!.click();
  await flushPromises();
}

describe('KillPipelineModal (P-05)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
    // Wiping body.innerHTML orphans antd's global message holder: later
    // message.* calls would render into the detached container and never
    // appear. Destroy it first so the next test gets a fresh holder.
    message.destroy();
    document.body.innerHTML = '';
  });

  it('kills through POST /kill/{id} and emits killed on success', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ code: 200, platform: 'airflow', runId: 'r1' })),
    );
    const wrapper = await mountModal();
    expect(document.body.textContent).toContain('Kill warehouse-metadata ?');
    expect(document.body.textContent).toContain(
      'Once you kill this Ingestion, all running and queued workflows will be stopped',
    );
    await clickConfirm();
    const urls = vi.mocked(fetch).mock.calls.map((call) => String(call[0]));
    expect(urls.some((url) => url.includes('/kill/p1'))).toBe(true);
    expect(wrapper.emitted('killed')).toHaveLength(1);
    expect(wrapper.emitted('close')).toHaveLength(1);
    expect(document.body.textContent).toContain('Successfully killed running workflows');
    wrapper.unmount();
  });

  it('reports a disabled client as an error and emits no killed (C-01)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ code: 200, platform: 'airflow', reason: 'Pipeline Client Disabled' })),
    );
    const wrapper = await mountModal();
    await clickConfirm();
    expect(wrapper.emitted('killed')).toBeUndefined();
    // Official: the modal closes in finally even on failure.
    expect(wrapper.emitted('close')).toHaveLength(1);
    expect(document.body.textContent).toContain('Pipeline Client Disabled');
    wrapper.unmount();
  });

  it('reports a non-200 code in the body as a failure and emits no killed (M-6)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse({ code: 500, platform: 'airflow', reason: 'kill failed' }),
      ),
    );
    const wrapper = await mountModal();
    await clickConfirm();
    expect(wrapper.emitted('killed')).toBeUndefined();
    // Official: the modal closes in finally even on failure.
    expect(wrapper.emitted('close')).toHaveLength(1);
    expect(document.body.textContent).toContain('kill failed');
    expect(document.body.textContent).not.toContain('Successfully killed running workflows');
    wrapper.unmount();
  });

  it('reports a 404 (no runnable run) as a failure (P-05)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('not found', { status: 404 })));
    const wrapper = await mountModal();
    await clickConfirm();
    expect(wrapper.emitted('killed')).toBeUndefined();
    expect(wrapper.emitted('close')).toHaveLength(1);
    wrapper.unmount();
  });
});
