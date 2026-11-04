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
import Antd from 'ant-design-vue';
import { describe, expect, it, vi } from 'vitest';
import { createTestI18n } from '@/test/i18n';
import EditLockBar from './EditLockBar.vue';

vi.mock('@/api/ontologyEdit', () => ({
  acquireOntologyEditLock: vi.fn(async () => ({ resourceType: 'ontology', resourceId: 'o1', holder: 'amy', sessionId: 'sess-9', version: 1, acquiredAt: 1, renewedAt: 1, expiresAt: 9999999999999 })),
  renewOntologyEditLock: vi.fn(async () => ({ resourceType: 'ontology', resourceId: 'o1', holder: 'amy', sessionId: 'sess-9', version: 2, acquiredAt: 1, renewedAt: 2, expiresAt: 9999999999999 })),
  getOntologyEditLock: vi.fn(async () => ({ resourceType: 'ontology', resourceId: 'o1', holder: 'amy', sessionId: 'sess-9', version: 1, acquiredAt: 1, renewedAt: 1, expiresAt: 9999999999999 })),
  releaseOntologyEditLock: vi.fn(async () => undefined),
}));

import {
  acquireOntologyEditLock,
  releaseOntologyEditLock,
} from '@/api/ontologyEdit';

function mountBar(props: Record<string, unknown>) {
  return mount(EditLockBar, {
    props: { ontologyId: 'o1', ontologyName: 'Onto', canEdit: true, lock: null, sessionId: '', ...props },
    global: { plugins: [Antd, createTestI18n()] },
  });
}

describe('EditLockBar', () => {
  it('shows the denied state and no acquire button without edit permission', async () => {
    const wrapper = mountBar({ canEdit: false });
    await flushPromises();
    expect(wrapper.find('[data-testid="ontology-edit-lock-denied"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="ontology-edit-lock-acquire"]').exists()).toBe(false);
  });

  it('blocks editing when another session holds the lock', async () => {
    const wrapper = mountBar({
      lock: { resourceType: 'ontology', resourceId: 'o1', holder: 'bob', sessionId: 'sess-other', version: 1, expiresAt: 9999999999999 },
      sessionId: 'sess-mine',
    });
    await flushPromises();
    expect(wrapper.find('[data-testid="ontology-edit-lock-held"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="ontology-edit-lock-acquire"]').exists()).toBe(false);
    expect(wrapper.text()).toContain('bob');
  });

  it('acquires a lease and emits the lock and session id', async () => {
    const wrapper = mountBar({});
    await flushPromises();
    await wrapper.get('[data-testid="ontology-edit-lock-acquire"]').trigger('click');
    await flushPromises();
    expect(acquireOntologyEditLock).toHaveBeenCalledWith(
      expect.objectContaining({ resourceType: 'ontology', resourceId: 'o1' }),
    );
    const lockEvents = wrapper.emitted('update:lock');
    expect(lockEvents?.at(-1)?.[0]).toMatchObject({ sessionId: 'sess-9' });
    const sessionEvents = wrapper.emitted('update:sessionId');
    expect(sessionEvents?.[0]?.[0]).toBeTruthy();
  });

  it('releases only the caller session lock', async () => {
    const wrapper = mountBar({
      lock: { resourceType: 'ontology', resourceId: 'o1', holder: 'amy', sessionId: 'sess-9', version: 1, expiresAt: 9999999999999 },
      sessionId: 'sess-9',
    });
    await flushPromises();
    await wrapper.get('[data-testid="ontology-edit-lock-release"]').trigger('click');
    await flushPromises();
    expect(releaseOntologyEditLock).toHaveBeenCalledWith('ontology', 'o1', 'sess-9');
    expect(wrapper.emitted('update:lock')?.at(-1)?.[0]).toBeNull();
  });
});
