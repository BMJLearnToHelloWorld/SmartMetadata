/**
 * Copyright 2026 SmartMetadata authors.
 * Licensed under the Apache License, Version 2.0.
 * Official ContractDetailFormTab owner-rule fetch and hasOwnerRuleViolation.
 */
import { flushPromises, mount } from '@vue/test-utils';
import Antd from 'ant-design-vue';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestI18n } from '@/test/i18n';
import ContractDetailFormTab from './ContractDetailFormTab.vue';

const getEntityRules = vi.fn();

vi.mock('@/api/system', async () => {
  const actual = await vi.importActual<typeof import('@/api/system')>('@/api/system');
  return {
    ...actual,
    getEntityRules: (...args: unknown[]) => getEntityRules(...args),
  };
});

vi.mock('@/components/governance/workflowBuilder/forms/UserTeamPicker.vue', () => ({
  default: {
    name: 'UserTeamPicker',
    props: ['modelValue', 'testId'],
    emits: ['update:modelValue'],
    template: '<div :data-testid="testId" />',
  },
}));

vi.mock('@/components/shared/SmRichTextEditor.vue', () => ({
  default: {
    name: 'SmRichTextEditor',
    props: ['initialValue'],
    template: '<div data-testid="contract-description-stub" />',
  },
}));

const ownershipRule = {
  name: 'Ownership Rule',
  description: 'Multiple users or single team ownership',
  rule: JSON.stringify({ multipleUsersOrSingleTeamOwnership: true }),
  enabled: true,
  ignoredEntities: [],
};

describe('ContractDetailFormTab official entity rules', () => {
  beforeEach(() => {
    getEntityRules.mockReset().mockResolvedValue([ownershipRule]);
  });

  it('fetches official TABLE entityRulesSettings and flags a team combined with a user', async () => {
    const wrapper = mount(ContractDetailFormTab, {
      global: { plugins: [Antd, createTestI18n()] },
    });
    await flushPromises();
    expect(getEntityRules).toHaveBeenCalledWith('table');
    const picker = wrapper.getComponent({ name: 'UserTeamPicker' });
    await picker.vm.$emit('update:modelValue', [
      { id: 't1', type: 'team', name: 'Data' },
      { id: 'u1', type: 'user', name: 'Ada' },
    ]);
    await flushPromises();
    expect(wrapper.text()).toContain('Select either multiple users or a single team as owners.');
    wrapper.unmount();
  });

  it('allows several users under the official single-team rule', async () => {
    const wrapper = mount(ContractDetailFormTab, {
      global: { plugins: [Antd, createTestI18n()] },
    });
    await flushPromises();
    const picker = wrapper.getComponent({ name: 'UserTeamPicker' });
    await picker.vm.$emit('update:modelValue', [
      { id: 'u1', type: 'user', name: 'Ada' },
      { id: 'u2', type: 'user', name: 'Bob' },
    ]);
    await flushPromises();
    expect(wrapper.text()).not.toContain('Select either multiple users or a single team as owners.');
    wrapper.unmount();
  });

  it('does not flag a team plus a user while fetched rules are still the official defaults', async () => {
    getEntityRules.mockResolvedValue([]);
    const wrapper = mount(ContractDetailFormTab, {
      global: { plugins: [Antd, createTestI18n()] },
    });
    await flushPromises();
    const picker = wrapper.getComponent({ name: 'UserTeamPicker' });
    await picker.vm.$emit('update:modelValue', [
      { id: 't1', type: 'team', name: 'Data' },
      { id: 'u1', type: 'user', name: 'Ada' },
    ]);
    await flushPromises();
    expect(wrapper.text()).not.toContain('Select either multiple users or a single team as owners.');
    wrapper.unmount();
  });

  it('re-validates already selected owners after TABLE rules load', async () => {
    let resolveRules: (value: typeof ownershipRule[]) => void = () => undefined;
    getEntityRules.mockImplementation(
      () =>
        new Promise<typeof ownershipRule[]>((resolve) => {
          resolveRules = resolve;
        }),
    );
    const wrapper = mount(ContractDetailFormTab, {
      props: {
        initialValues: {
          owners: [
            { id: 't1', type: 'team', name: 'Data' },
            { id: 'u1', type: 'user', name: 'Ada' },
          ],
        },
      },
      global: { plugins: [Antd, createTestI18n()] },
    });
    await flushPromises();
    expect(wrapper.text()).not.toContain('Select either multiple users or a single team as owners.');
    resolveRules([ownershipRule]);
    await flushPromises();
    expect(wrapper.text()).toContain('Select either multiple users or a single team as owners.');
    wrapper.unmount();
  });
});
