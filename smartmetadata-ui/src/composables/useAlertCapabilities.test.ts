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
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { defineComponent, h, nextTick, ref } from 'vue';
import { getAlertCapabilities } from '@/api/eventSubscriptions';
import type { AlertCapabilities } from '@/types/notifications';
import { useAlertCapabilities, type UseAlertCapabilitiesState } from './useAlertCapabilities';

vi.mock('@/api/eventSubscriptions', () => ({ getAlertCapabilities: vi.fn() }));

const mockedGetCapabilities = vi.mocked(getAlertCapabilities);

function answer(overrides: Partial<AlertCapabilities> = {}): AlertCapabilities {
  return {
    alertType: 'Notification',
    filters: [],
    sources: [{ name: 'table', kind: 'entity' }],
    triggers: [],
    ...overrides,
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function mountCapabilities(initialSources: string[] = ['table']) {
  let result!: UseAlertCapabilitiesState;
  const sources = ref<string[]>(initialSources);
  const probe = defineComponent({
    setup() {
      result = useAlertCapabilities({ alertType: 'Notification', sources });
      return () => h('div');
    },
  });
  const wrapper = mount(probe);
  return { wrapper, result: () => result, sources };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('useAlertCapabilities', () => {
  it('asks on mount and shows the answer, settled', async () => {
    mockedGetCapabilities.mockResolvedValue(answer());
    const { result } = mountCapabilities();
    expect(result().loading.value).toBe(true);
    expect(result().settled.value).toBe(false);
    await flushPromises();
    expect(result().loading.value).toBe(false);
    expect(result().settled.value).toBe(true);
    expect(result().selection.value?.sources).toEqual([{ name: 'table', kind: 'entity' }]);
    expect(result().answeredFor.value).toEqual(['table']);
    expect(result().knownSources.value).toEqual([{ name: 'table', kind: 'entity' }]);
    expect(mockedGetCapabilities).toHaveBeenCalledTimes(1);
    expect(mockedGetCapabilities).toHaveBeenCalledWith({
      alertType: 'Notification',
      sources: ['table'],
      input: undefined,
    });
  });

  it('answers from cache when the selection returns, without asking again', async () => {
    mockedGetCapabilities.mockResolvedValue(answer());
    const { result, sources } = mountCapabilities();
    await flushPromises();
    sources.value = ['topic'];
    await flushPromises();
    expect(mockedGetCapabilities).toHaveBeenCalledTimes(2);
    sources.value = ['table'];
    await flushPromises();
    expect(mockedGetCapabilities).toHaveBeenCalledTimes(2);
    expect(result().answeredFor.value).toEqual(['table']);
  });

  it('keeps known sources and settles on failure', async () => {
    mockedGetCapabilities.mockResolvedValueOnce(
      answer({ sources: [{ name: 'table', kind: 'entity' }] }),
    );
    const { result, sources } = mountCapabilities();
    await flushPromises();
    mockedGetCapabilities.mockRejectedValueOnce(new Error('boom'));
    sources.value = ['topic'];
    await flushPromises();
    expect(result().loading.value).toBe(false);
    expect(result().settled.value).toBe(true);
    expect(result().selection.value).toBeUndefined();
    expect(result().answeredFor.value).toBeUndefined();
    expect(result().knownSources.value).toEqual([{ name: 'table', kind: 'entity' }]);
  });

  it('does not show a stale answer', async () => {
    const first = deferred<AlertCapabilities>();
    const second = deferred<AlertCapabilities>();
    mockedGetCapabilities.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const { result, sources } = mountCapabilities();
    sources.value = ['topic'];
    await nextTick();
    first.resolve(answer({ sources: [{ name: 'table', kind: 'entity' }] }));
    await flushPromises();
    expect(result().loading.value).toBe(true);
    expect(result().selection.value).toBeUndefined();
    second.resolve(answer({ sources: [{ name: 'topic', kind: 'entity' }] }));
    await flushPromises();
    expect(result().loading.value).toBe(false);
    expect(result().selection.value?.sources).toEqual([{ name: 'topic', kind: 'entity' }]);
    expect(result().answeredFor.value).toEqual(['topic']);
  });

  it('re-asks on retry', async () => {
    mockedGetCapabilities.mockRejectedValueOnce(new Error('boom'));
    const { result } = mountCapabilities();
    await flushPromises();
    expect(result().selection.value).toBeUndefined();
    mockedGetCapabilities.mockResolvedValueOnce(answer());
    result().retry();
    await flushPromises();
    expect(mockedGetCapabilities).toHaveBeenCalledTimes(2);
    expect(result().selection.value).toBeDefined();
  });

  it('does not re-ask when only the input reference changes', async () => {
    mockedGetCapabilities.mockResolvedValue(answer());
    const input = ref({ filters: [] });
    const probe = defineComponent({
      setup() {
        useAlertCapabilities({
          alertType: 'Notification',
          sources: ['table'],
          input,
        });
        return () => h('div');
      },
    });
    mount(probe);
    await flushPromises();
    input.value = { filters: [] };
    await flushPromises();
    expect(mockedGetCapabilities).toHaveBeenCalledTimes(1);
  });

  it('asks nothing while disabled, and asks once enabled', async () => {
    mockedGetCapabilities.mockResolvedValue(answer());
    const enabled = ref(false);
    let result!: UseAlertCapabilitiesState;
    const probe = defineComponent({
      setup() {
        result = useAlertCapabilities({
          alertType: 'Notification',
          sources: ['table'],
          enabled,
        });
        return () => h('div');
      },
    });
    mount(probe);
    await flushPromises();
    expect(mockedGetCapabilities).not.toHaveBeenCalled();
    expect(result.settled.value).toBe(false);
    enabled.value = true;
    await nextTick();
    await flushPromises();
    expect(mockedGetCapabilities).toHaveBeenCalledTimes(1);
    expect(result.settled.value).toBe(true);
  });
});
