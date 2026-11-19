/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { mount } from '@vue/test-utils';
import Antd from 'ant-design-vue';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { defineComponent, createApp, h } from 'vue';
import { createMemoryHistory, createRouter } from 'vue-router';
import { reportUncaughtAppError } from './appErrorHandler';
import SmErrorBoundary from './components/shared/SmErrorBoundary.vue';
import { createTestI18n } from './test/i18n';

// N-4 experiment (Task 4 item 1): a real mount of an error-throwing
// descendant, proving the boundary + second-net split records each error
// exactly once. No source inference: the counting wrapper delegates to
// the real handler main.ts installs.

const BOOM = new Error('second-net boom');

const Thrower = defineComponent({
  name: 'Thrower',
  setup() {
    throw BOOM;
  },
});

const BoundaryHarness = defineComponent({
  name: 'BoundaryHarness',
  setup: () => () => h(SmErrorBoundary, null, { default: () => h(Thrower) }),
});

function createTestRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/my-data', name: 'home', component: { template: '<div>home</div>' } }],
  });
}

describe('appErrorHandler second net (N-4)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('records a boundary-caught error exactly once and never invokes the second net', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const handlerCalls: unknown[] = [];
    const wrapper = mount(BoundaryHarness, {
      global: {
        plugins: [createTestRouter(), createTestI18n(), Antd],
        config: {
          errorHandler: (error: unknown) => {
            handlerCalls.push(error);
            reportUncaughtAppError(error);
          },
        },
      },
    });
    await wrapper.vm.$nextTick();
    expect(wrapper.find('.sm-error-fallback').exists()).toBe(true);
    expect(handlerCalls).toEqual([]);
    expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
    expect(consoleErrorSpy).toHaveBeenCalledWith(BOOM);
  });

  it('records an error outside any boundary exactly once through the second net', async () => {
    // Raw createApp, not VTU mount: VTU rethrows errors collected
    // during mounting even when a custom errorHandler is installed,
    // which would mask the exact behavior under test (Vue delegates
    // to errorHandler and does not rethrow).
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const handlerCalls: unknown[] = [];
    const app = createApp(Thrower);
    app.config.errorHandler = (error: unknown) => {
      handlerCalls.push(error);
      reportUncaughtAppError(error);
    };
    const host = document.createElement('div');
    app.mount(host);
    await Promise.resolve();
    expect(handlerCalls).toEqual([BOOM]);
    expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
    expect(consoleErrorSpy).toHaveBeenCalledWith(BOOM);
    app.unmount();
  });
});
