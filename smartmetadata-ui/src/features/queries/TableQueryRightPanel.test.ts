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
import { afterEach, describe, expect, it, vi } from 'vitest';
import { nextTick } from 'vue';
import { getDerivedPermissionFlags } from '@/api/permissions';
import type { JsonPatchOp } from '@/admin/jsonPatch';
import type { DataQuery } from '@/api/queries';
import { createTestI18n } from '@/test/i18n';
import TableQueryRightPanel from './TableQueryRightPanel.vue';

vi.mock('@/governance/catalogOptions', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/governance/catalogOptions')>();
  return {
    ...original,
    loadGovernanceCatalog: vi.fn(async () => ({
      owners: [
        { key: 'user:u1', id: 'u1', type: 'user', label: 'alice (user)' },
        { key: 'team:t1', id: 't1', type: 'team', label: 'data (team)' },
      ],
      tags: [
        { tagFQN: 'PII.Sensitive', name: 'Sensitive', source: 'Classification' },
        { tagFQN: 'Tier.Tier1', name: 'Tier1', source: 'Classification' },
        { tagFQN: 'Glossary.Customer', name: 'Customer', source: 'Glossary' },
      ],
      domains: [],
    })),
  };
});

const QUERY: DataQuery = {
  id: 'q1',
  query: 'select 1',
  description: 'quarterly rollup',
  owners: [{ id: 'u1', type: 'user', name: 'alice', displayName: 'Alice' }],
  tags: [
    { tagFQN: 'PII.Sensitive', name: 'Sensitive', source: 'Classification', labelType: 'Generated' },
    { tagFQN: 'Glossary.Customer', name: 'Customer', source: 'Glossary', labelType: 'Manual', state: 'Suggested' },
  ],
  users: [{ id: 'u2', type: 'user', name: 'bob' }],
  usedBy: ['external-etl'],
};

function mountPanel(
  query: DataQuery | undefined,
  ops: Record<string, boolean>,
  onQueryUpdate: (id: string, ops: JsonPatchOp[]) => Promise<DataQuery> = vi.fn(
    async (id: string) => ({ ...(query ?? ({} as DataQuery)), id }),
  ),
) {
  const wrapper = mount(TableQueryRightPanel, {
    props: {
      query,
      isLoading: false,
      permission: getDerivedPermissionFlags(ops),
      onQueryUpdate,
    },
    attachTo: document.body,
    global: { plugins: [Antd, createTestI18n()] },
  });
  return { wrapper, onQueryUpdate };
}

afterEach(() => {
  document.body.innerHTML = '';
  vi.clearAllMocks();
});

describe('TableQueryRightPanel', () => {
  it('renders the five sections in pin order', () => {
    const { wrapper } = mountPanel(QUERY, {});
    const text = wrapper.text();
    const order = ['Owners', 'Description', 'Tags', 'Users', 'Used by'].map((label) => text.indexOf(label));
    expect(order.every((index) => index >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(text).toContain('Alice');
    expect(text).toContain('quarterly rollup');
    expect(text).toContain('PII.Sensitive');
    expect(text).toContain('bob');
    expect(text).toContain('external-etl');
    wrapper.unmount();
  });

  it('shows no-entity empties for users and used-by', () => {
    const { wrapper } = mountPanel({ ...QUERY, users: [], usedBy: [] }, {});
    expect(wrapper.find('[data-testid="users"]').text()).toContain('No Users');
    expect(wrapper.find('[data-testid="used-by"]').text()).toContain('No Used by');
    wrapper.unmount();
  });

  it('gates each editor on its field permission', () => {
    const { wrapper } = mountPanel(QUERY, { EditOwners: true });
    expect(wrapper.find('[data-testid="edit-owner"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="edit-description"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="edit-tags"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it('saves a description edit through the patch prop', async () => {
    const { wrapper, onQueryUpdate } = mountPanel(QUERY, { EditDescription: true });
    await wrapper.find('[data-testid="edit-description"]').trigger('click');
    await wrapper.find('[data-testid="edit-description-input"]').setValue('new description');
    await wrapper.find('[data-testid="save-description-btn"]').trigger('click');
    await flushPromises();
    expect(onQueryUpdate).toHaveBeenCalledWith('q1', [
      { op: 'replace', path: '/description', value: 'new description' },
    ]);
    expect(wrapper.find('[data-testid="edit-description-input"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it('stays in edit mode when the description patch rejects', async () => {
    const failing = vi.fn(async () => {
      throw new Error('patch failed');
    });
    const { wrapper } = mountPanel(QUERY, { EditDescription: true }, failing);
    await wrapper.find('[data-testid="edit-description"]').trigger('click');
    await wrapper.find('[data-testid="edit-description-input"]').setValue('new description');
    await wrapper.find('[data-testid="save-description-btn"]').trigger('click');
    await flushPromises();
    expect(wrapper.find('[data-testid="edit-description-input"]').exists()).toBe(true);
    wrapper.unmount();
  });

  it('saves an owners edit with entity refs built from the catalog keys', async () => {
    const { wrapper, onQueryUpdate } = mountPanel(QUERY, { EditOwners: true });
    await wrapper.find('[data-testid="edit-owner"]').trigger('click');
    await flushPromises();
    const select = wrapper.find('[data-testid="edit-owner-select"]');
    await select.find('.ant-select-selector').trigger('mousedown');
    await flushPromises();
    await nextTick();
    const options = [...document.body.querySelectorAll('.ant-select-item-option')];
    const teamOption = options.find((option) => option.textContent?.includes('data (team)'));
    (teamOption as HTMLElement).click();
    await flushPromises();
    await wrapper.find('[data-testid="save-owners-btn"]').trigger('click');
    await flushPromises();
    expect(onQueryUpdate).toHaveBeenCalledTimes(1);
    const [, ops] = vi.mocked(onQueryUpdate).mock.calls[0] as [string, JsonPatchOp[]];
    expect(ops[0]?.path).toBe('/owners');
    expect(ops[0]?.value).toEqual([
      { id: 'u1', type: 'user' },
      { id: 't1', type: 'team' },
    ]);
    wrapper.unmount();
  });

  it('preserves an existing tag labelType when saving tags', async () => {
    const { wrapper, onQueryUpdate } = mountPanel(QUERY, { EditTags: true });
    await wrapper.find('[data-testid="edit-tags"]').trigger('click');
    await flushPromises();
    const select = wrapper.find('[data-testid="edit-tags-select"]');
    await select.find('.ant-select-selector').trigger('mousedown');
    await flushPromises();
    await nextTick();
    const options = [...document.body.querySelectorAll('.ant-select-item-option')];
    const tierOption = options.find((option) => option.textContent?.includes('Tier.Tier1'));
    (tierOption as HTMLElement).click();
    await flushPromises();
    await wrapper.find('[data-testid="save-tags-btn"]').trigger('click');
    await flushPromises();
    expect(onQueryUpdate).toHaveBeenCalledTimes(1);
    const [, ops] = vi.mocked(onQueryUpdate).mock.calls[0] as [string, JsonPatchOp[]];
    expect(ops[0]?.path).toBe('/tags');
    expect(ops[0]?.value).toEqual([
      { tagFQN: 'PII.Sensitive', source: 'Classification', labelType: 'Generated', state: 'Confirmed' },
      { tagFQN: 'Tier.Tier1', source: 'Classification', labelType: 'Manual', state: 'Confirmed' },
      { tagFQN: 'Glossary.Customer', source: 'Glossary', labelType: 'Manual', state: 'Suggested' },
    ]);
    wrapper.unmount();
  });

  it('never displays or offers glossary labels, which belong to a separate surface', async () => {
    const { wrapper } = mountPanel(QUERY, { EditTags: true });
    expect(wrapper.text()).toContain('PII.Sensitive');
    expect(wrapper.text()).not.toContain('Glossary.Customer');
    await wrapper.find('[data-testid="edit-tags"]').trigger('click');
    await flushPromises();
    const select = wrapper.find('[data-testid="edit-tags-select"]');
    await select.find('.ant-select-selector').trigger('mousedown');
    await flushPromises();
    await nextTick();
    const options = [...document.body.querySelectorAll('.ant-select-item-option')].map(
      (option) => option.textContent ?? '',
    );
    expect(options.join(' ')).toContain('PII.Sensitive');
    expect(options.join(' ')).toContain('Tier.Tier1');
    expect(options.join(' ')).not.toContain('Glossary.Customer');
    wrapper.unmount();
  });

  it('preserves a Suggested classification state when saving tags', async () => {
    const suggested: DataQuery = {
      ...QUERY,
      tags: [
        { tagFQN: 'PII.Sensitive', name: 'Sensitive', source: 'Classification', labelType: 'Generated', state: 'Suggested' },
      ],
    };
    const { wrapper, onQueryUpdate } = mountPanel(suggested, { EditTags: true });
    await wrapper.find('[data-testid="edit-tags"]').trigger('click');
    await flushPromises();
    const select = wrapper.find('[data-testid="edit-tags-select"]');
    await select.find('.ant-select-selector').trigger('mousedown');
    await flushPromises();
    await nextTick();
    const options = [...document.body.querySelectorAll('.ant-select-item-option')];
    const tierOption = options.find((option) => option.textContent?.includes('Tier.Tier1'));
    (tierOption as HTMLElement).click();
    await flushPromises();
    await wrapper.find('[data-testid="save-tags-btn"]').trigger('click');
    await flushPromises();
    const [, ops] = vi.mocked(onQueryUpdate).mock.calls[0] as [string, JsonPatchOp[]];
    expect(ops[0]?.value).toEqual([
      { tagFQN: 'PII.Sensitive', source: 'Classification', labelType: 'Generated', state: 'Suggested' },
      { tagFQN: 'Tier.Tier1', source: 'Classification', labelType: 'Manual', state: 'Confirmed' },
    ]);
    wrapper.unmount();
  });

  it('skips the patch when a description save changes nothing', async () => {
    const { wrapper, onQueryUpdate } = mountPanel(QUERY, { EditDescription: true });
    await wrapper.find('[data-testid="edit-description"]').trigger('click');
    await wrapper.find('[data-testid="save-description-btn"]').trigger('click');
    await flushPromises();
    expect(onQueryUpdate).not.toHaveBeenCalled();
    expect(wrapper.find('[data-testid="edit-description-input"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it('skips the patch when an owners save changes nothing', async () => {
    const { wrapper, onQueryUpdate } = mountPanel(QUERY, { EditOwners: true });
    await wrapper.find('[data-testid="edit-owner"]').trigger('click');
    await flushPromises();
    await wrapper.find('[data-testid="save-owners-btn"]').trigger('click');
    await flushPromises();
    expect(onQueryUpdate).not.toHaveBeenCalled();
    expect(wrapper.find('[data-testid="edit-owner-select"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it('skips the patch when a tags save changes nothing, so no label can flip state', async () => {
    const { wrapper, onQueryUpdate } = mountPanel(QUERY, { EditTags: true });
    await wrapper.find('[data-testid="edit-tags"]').trigger('click');
    await flushPromises();
    await wrapper.find('[data-testid="save-tags-btn"]').trigger('click');
    await flushPromises();
    expect(onQueryUpdate).not.toHaveBeenCalled();
    expect(wrapper.find('[data-testid="edit-tags-select"]').exists()).toBe(false);
    wrapper.unmount();
  });
});
