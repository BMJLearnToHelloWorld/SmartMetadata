/**
 * Copyright 2026 SmartMetadata authors.
 * Licensed under the Apache License, Version 2.0.
 * Official useEntityRules: TABLE fetch, parse, validation, error defaults.
 */
import { flushPromises } from '@vue/test-utils';
import { defineComponent } from 'vue';
import { mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestI18n } from '@/test/i18n';
import { useEntityRules } from './useEntityRules';

const getEntityRules = vi.fn();
const messageError = vi.fn();

vi.mock('@/api/system', async () => {
  const actual = await vi.importActual<typeof import('@/api/system')>('@/api/system');
  return {
    ...actual,
    getEntityRules: (...args: unknown[]) => getEntityRules(...args),
  };
});

vi.mock('ant-design-vue', async () => {
  const actual = await vi.importActual<typeof import('ant-design-vue')>('ant-design-vue');
  return {
    ...actual,
    message: { error: (...args: unknown[]) => messageError(...args) },
  };
});

function mountHook(entityType = 'table') {
  let api: ReturnType<typeof useEntityRules> | undefined;
  const Host = defineComponent({
    setup() {
      api = useEntityRules(entityType);
      return () => null;
    },
  });
  const wrapper = mount(Host, { global: { plugins: [createTestI18n()] } });
  return { wrapper, api: () => api! };
}

describe('useEntityRules official form hook', () => {
  beforeEach(() => {
    getEntityRules.mockReset();
    messageError.mockReset();
  });

  it('fetches and applies official TABLE ownership hints', async () => {
    getEntityRules.mockResolvedValue([
      {
        name: 'Ownership Rule',
        rule: JSON.stringify({ multipleUsersOrSingleTeamOwnership: true }),
        enabled: true,
        ignoredEntities: [],
      },
    ]);
    const { wrapper, api } = mountHook('table');
    expect(api().entityRules.value.canAddMultipleTeamOwner).toBe(true);
    expect(api().isRulesLoaded.value).toBe(false);
    await flushPromises();
    expect(getEntityRules).toHaveBeenCalledWith('table');
    expect(api().isRulesLoaded.value).toBe(true);
    expect(api().entityRules.value.canAddMultipleUserOwners).toBe(true);
    expect(api().entityRules.value.canAddMultipleTeamOwner).toBe(false);
    wrapper.unmount();
  });

  it('keeps official defaults and toasts when the TABLE fetch fails', async () => {
    getEntityRules.mockRejectedValue(new Error('network down'));
    const { wrapper, api } = mountHook('table');
    await flushPromises();
    expect(api().isRulesLoaded.value).toBe(false);
    expect(api().entityRules.value.canAddMultipleTeamOwner).toBe(true);
    expect(api().entityRules.value.canAddMultipleUserOwners).toBe(true);
    expect(messageError).toHaveBeenCalled();
    wrapper.unmount();
  });
});
