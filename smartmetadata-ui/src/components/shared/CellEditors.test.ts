/**
 * Copyright 2026 SmartMetadata authors.
 * Licensed under the Apache License, Version 2.0.
 */
import { flushPromises, mount } from '@vue/test-utils';
import Antd from 'ant-design-vue';
import { describe, expect, it, vi } from 'vitest';
import { createTestI18n } from '@/test/i18n';
import GlossaryTermCellEditor from './GlossaryTermCellEditor.vue';
import OwnerCellEditor from './OwnerCellEditor.vue';

const listUsers = vi.fn();
const listTeams = vi.fn();
const listGlossaryTerms = vi.fn();

vi.mock('@/api/users', () => ({ listUsers: (...args: unknown[]) => listUsers(...args) }));
vi.mock('@/api/teams', () => ({ listTeams: (...args: unknown[]) => listTeams(...args) }));
vi.mock('@/api/glossaryTerms', () => ({
  listGlossaryTerms: (...args: unknown[]) => listGlossaryTerms(...args),
}));

describe('OwnerCellEditor', () => {
  it('renders selected owners from the type:name cell value', async () => {
    listUsers.mockResolvedValue({
      data: [{ id: 'u1', name: 'alice', displayName: 'Alice' }],
    });
    listTeams.mockResolvedValue({
      data: [{ id: 't1', name: 'eng', displayName: 'Engineering' }],
    });
    const wrapper = mount(OwnerCellEditor, {
      props: { modelValue: 'user:alice;team:eng', testId: 'owner-cell' },
      global: { plugins: [Antd, createTestI18n()] },
    });
    await flushPromises();
    expect(wrapper.text()).toContain('Alice');
    expect(wrapper.text()).toContain('Engineering');
    expect(wrapper.find('[data-testid="owner-cell"]').exists()).toBe(true);
  });

  it('falls back to a plain input when the listings fail', async () => {
    listUsers.mockRejectedValue(new Error('boom'));
    listTeams.mockRejectedValue(new Error('boom'));
    const wrapper = mount(OwnerCellEditor, {
      props: { modelValue: 'user:alice', testId: 'owner-cell' },
      global: { plugins: [Antd, createTestI18n()] },
    });
    await flushPromises();
    const input = wrapper.find('[data-testid="owner-cell"]');
    expect(input.exists()).toBe(true);
    expect((input.element as HTMLInputElement).value).toBe('user:alice');
  });
});

describe('GlossaryTermCellEditor', () => {
  it('renders selected terms from the FQN list cell value', async () => {
    listGlossaryTerms.mockResolvedValue({
      data: [
        { id: 'g1', name: 'Term', displayName: 'Term', fullyQualifiedName: 'Glossary.Term' },
      ],
    });
    const wrapper = mount(GlossaryTermCellEditor, {
      props: { modelValue: 'Glossary.Term', testId: 'term-cell' },
      global: { plugins: [Antd, createTestI18n()] },
    });
    await flushPromises();
    expect(wrapper.text()).toContain('Term');
    expect(wrapper.find('[data-testid="term-cell"]').exists()).toBe(true);
  });

  it('falls back to a plain input when the listing fails', async () => {
    listGlossaryTerms.mockRejectedValue(new Error('boom'));
    const wrapper = mount(GlossaryTermCellEditor, {
      props: { modelValue: 'Glossary.Term', testId: 'term-cell' },
      global: { plugins: [Antd, createTestI18n()] },
    });
    await flushPromises();
    const input = wrapper.find('[data-testid="term-cell"]');
    expect(input.exists()).toBe(true);
    expect((input.element as HTMLInputElement).value).toBe('Glossary.Term');
  });
});
