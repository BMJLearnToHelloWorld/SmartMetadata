/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { defineComponent, h, ref } from 'vue';
import { flushPromises, mount } from '@vue/test-utils';
import Antd from 'ant-design-vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryHistory, createRouter } from 'vue-router';
import { createTestI18n } from '@/test/i18n';
import { useWorkflowNavigationBlock } from '@/composables/useWorkflowNavigationBlock';

async function mountBlock(options: {
  enabled?: boolean;
  saveResult?: boolean;
} = {}) {
  const enabled = ref(options.enabled ?? true);
  const onSaveWorkflow = vi.fn(async () => options.saveResult ?? true);
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/workflows/:fqn/:tab', component: { template: '<div>builder</div>' } },
      { path: '/govern/workflows', component: { template: '<div>list</div>' } },
    ],
  });
  await router.push('/workflows/approve-glossary-term/workflow?mode=edit');
  await router.isReady();

  let block!: ReturnType<typeof useWorkflowNavigationBlock>;
  const Harness = defineComponent({
    setup() {
      block = useWorkflowNavigationBlock({
        enabled,
        onSaveWorkflow,
      });
      return () => h('div');
    },
  });
  const wrapper = mount(Harness, {
    global: { plugins: [router, Antd, createTestI18n()] },
    attachTo: document.body,
  });
  await flushPromises();
  return { wrapper, router, block, enabled, onSaveWorkflow };
}

describe('useWorkflowNavigationBlock', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    document.body.innerHTML = '';
    localStorage.clear();
  });

  it('cancels unload while enabled', async () => {
    const { wrapper } = await mountBlock();
    // jsdom does not allow constructing BeforeUnloadEvent; a plain
    // cancelable event exercises the same handler path.
    const event = new window.Event('beforeunload', {
      cancelable: true,
    });
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    wrapper.unmount();
  });

  it('does not cancel unload while disabled', async () => {
    const { wrapper } = await mountBlock({ enabled: false });
    const event = new window.Event('beforeunload', {
      cancelable: true,
    });
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
    wrapper.unmount();
  });

  it('blocks an internal link click and discards to it', async () => {
    const { wrapper, router, block } = await mountBlock();
    const anchor = document.createElement('a');
    anchor.href = '/govern/workflows';
    anchor.textContent = 'list';
    document.body.appendChild(anchor);
    anchor.dispatchEvent(
      new window.MouseEvent('click', { bubbles: true, cancelable: true }),
    );
    await flushPromises();
    expect(block.showModal.value).toBe(true);
    block.onDiscard();
    await flushPromises();
    expect(router.currentRoute.value.path).toBe('/govern/workflows');
    wrapper.unmount();
  });

  it('lets external links through', async () => {
    const { wrapper, block } = await mountBlock();
    const anchor = document.createElement('a');
    anchor.href = 'https://example.com/other';
    anchor.textContent = 'external';
    document.body.appendChild(anchor);
    anchor.dispatchEvent(
      new window.MouseEvent('click', { bubbles: true, cancelable: true }),
    );
    await flushPromises();
    expect(block.showModal.value).toBe(false);
    wrapper.unmount();
  });

  it('saves and proceeds only when the save succeeds', async () => {
    const { wrapper, router, block, onSaveWorkflow } = await mountBlock({
      saveResult: true,
    });
    const anchor = document.createElement('a');
    anchor.href = '/govern/workflows';
    document.body.appendChild(anchor);
    anchor.dispatchEvent(
      new window.MouseEvent('click', { bubbles: true, cancelable: true }),
    );
    await flushPromises();
    await block.onSave();
    // router.push resolves on the next tick.
    await flushPromises();
    expect(onSaveWorkflow).toHaveBeenCalledTimes(1);
    expect(router.currentRoute.value.path).toBe('/govern/workflows');
    wrapper.unmount();
  });

  it('stays when the save fails', async () => {
    const { wrapper, router, block } = await mountBlock({ saveResult: false });
    const anchor = document.createElement('a');
    anchor.href = '/govern/workflows';
    document.body.appendChild(anchor);
    anchor.dispatchEvent(
      new window.MouseEvent('click', { bubbles: true, cancelable: true }),
    );
    await flushPromises();
    await block.onSave();
    expect(block.showModal.value).toBe(false);
    expect(router.currentRoute.value.path).toBe('/workflows/approve-glossary-term/workflow');
    wrapper.unmount();
  });

  it('intercepts a back step and restores the entry', async () => {
    // Arm the guard with a positioned history entry, as the browser would,
    // before the guard captures it on enable.
    window.history.pushState(
      { position: 1 },
      '',
      '/workflows/approve-glossary-term/workflow?mode=edit',
    );
    const { wrapper, block } = await mountBlock();
    const goSpy = vi.spyOn(window.history, 'go');
    // A synthetic popstate does not move the URL (a real back step does),
    // so move it first — the handler compares nextPath to the current path.
    window.history.pushState({ position: 0 }, '', '/govern/workflows');
    window.dispatchEvent(
      new window.PopStateEvent('popstate', { state: { position: 0 } }),
    );
    await flushPromises();
    // The first popstate restores the entry instead of navigating.
    expect(goSpy).toHaveBeenCalledWith(1);
    // The restore fires a second popstate; that one opens the modal.
    window.dispatchEvent(
      new window.PopStateEvent('popstate', { state: { position: 1 } }),
    );
    await flushPromises();
    expect(block.showModal.value).toBe(true);
    goSpy.mockRestore();
    wrapper.unmount();
  });
});
