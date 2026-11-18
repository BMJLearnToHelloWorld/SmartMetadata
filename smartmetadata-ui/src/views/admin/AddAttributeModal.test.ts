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
import { message } from 'ant-design-vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createI18n } from 'vue-i18n';
import AddAttributeModal from './AddAttributeModal.vue';
import { listPolicies } from '@/api/policies';
import { listRoles } from '@/api/roles';
import type { AdminPolicy, AdminRole } from '@/types/admin';

vi.mock('@/api/policies', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/api/policies')>();
  return { ...actual, listPolicies: vi.fn() };
});

vi.mock('@/api/roles', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/api/roles')>();
  return { ...actual, listRoles: vi.fn() };
});

const i18n = createI18n({
  legacy: false,
  locale: 'en-US',
  messages: {
    'en-US': {
      label: {
        save: 'Save',
        'search-entity': 'Search {entity}',
        'no-matching-result-plural': 'No matching results',
      },
      crud: { cancel: 'Cancel', loadFailed: 'Failed to load' },
      message: { 'check-spelling-or-try-shorter-term': 'Check spelling' },
    },
  },
});

function mountModal(type: 'role' | 'policy') {
  return mount(AddAttributeModal, {
    attachTo: document.body,
    props: { open: false, type, title: `Add ${type}`, selectedKeys: [] },
    global: { plugins: [i18n] },
  });
}

function bodyRows(): NodeListOf<Element> {
  return document.body.querySelectorAll('[data-testid="policy-row"]');
}

describe('AddAttributeModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(message, 'error').mockImplementation(() => undefined as never);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    document.body.innerHTML = '';
  });

  it('shows an error toast and no unhandled rejection when the role fetch fails', async () => {
    vi.mocked(listRoles).mockRejectedValue(new Error('roles down'));
    const wrapper = mountModal('role');
    const rejections: unknown[] = [];
    const handler = (reason: unknown) => {
      rejections.push(reason);
    };
    process.on('unhandledRejection', handler);
    try {
      await wrapper.setProps({ open: true });
      await flushPromises();
      await vi.waitFor(() => {
        expect(message.error).toHaveBeenCalledWith('roles down');
      });
    } finally {
      process.off('unhandledRejection', handler);
    }
    expect(rejections).toEqual([]);
    // Pin renders the empty placeholder on failure (data stays empty);
    // the toast above is the error surface, not a silent empty list.
    expect(bodyRows().length).toBe(0);
    expect(
      document.body.querySelector('[data-testid="search-error-placeholder"]'),
    ).not.toBeNull();
    expect(document.body.querySelector('[data-testid="search-input"]')).not.toBeNull();
    wrapper.unmount();
  });

  it('shows an error toast and no unhandled rejection when the policy fetch fails', async () => {
    vi.mocked(listPolicies).mockRejectedValue(new Error('policies down'));
    const wrapper = mountModal('policy');
    const rejections: unknown[] = [];
    const handler = (reason: unknown) => {
      rejections.push(reason);
    };
    process.on('unhandledRejection', handler);
    try {
      await wrapper.setProps({ open: true });
      await flushPromises();
      await vi.waitFor(() => {
        expect(message.error).toHaveBeenCalledWith('policies down');
      });
    } finally {
      process.off('unhandledRejection', handler);
    }
    expect(rejections).toEqual([]);
    expect(bodyRows().length).toBe(0);
    wrapper.unmount();
  });

  it('renders fetched roles without an error toast', async () => {
    const role: AdminRole = {
      id: 'r1',
      name: 'DataSteward',
      displayName: 'Data Steward',
      policies: [],
      users: [],
      teams: [],
    };
    vi.mocked(listRoles).mockResolvedValue({ data: [role] });
    const wrapper = mountModal('role');
    await wrapper.setProps({ open: true });
    await flushPromises();
    await vi.waitFor(() => {
      expect(bodyRows().length).toBe(1);
    });
    expect(message.error).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain('Data Steward');
    wrapper.unmount();
  });

  it('renders fetched policies without an error toast', async () => {
    const policy: AdminPolicy = {
      id: 'p1',
      name: 'DataOwnerPolicy',
      owners: [],
      teams: [],
      roles: [],
      rules: [],
    };
    vi.mocked(listPolicies).mockResolvedValue({ data: [policy] });
    const wrapper = mountModal('policy');
    await wrapper.setProps({ open: true });
    await flushPromises();
    await vi.waitFor(() => {
      expect(bodyRows().length).toBe(1);
    });
    expect(message.error).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain('DataOwnerPolicy');
    wrapper.unmount();
  });
});
