/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0.
 */
import { flushPromises, mount } from '@vue/test-utils';
import Antd, { message, Select } from 'ant-design-vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestI18n } from '@/test/i18n';
import type { EntityRef } from '@/types/api';
import type { CatalogService } from '@/types/ingestion';
import ServiceHeaderFacets from './ServiceHeaderFacets.vue';

const patchServiceMock = vi.fn();

vi.mock('@/api/servicePatch', () => ({
  patchService: (...args: unknown[]) => patchServiceMock(...args),
}));

vi.mock('@/ingestion/tierTags', () => ({
  isTierTag: (tagFQN: string) => tagFQN.startsWith('Tier.'),
  getTierTag: (tags: Array<{ tagFQN: string }>) =>
    tags.find((tag) => tag.tagFQN.startsWith('Tier.')),
  getTagsWithoutTier: (tags: Array<{ tagFQN: string }>) =>
    tags.filter((tag) => !tag.tagFQN.startsWith('Tier.')),
  tierTagsPatch: (currentTags: unknown[], newTierFqn?: string) => {
    const kept = currentTags.filter(
      (tag) => !(tag as { tagFQN: string }).tagFQN.startsWith('Tier.'),
    );
    const next = newTierFqn
      ? [
          ...kept,
          {
            tagFQN: newTierFqn,
            source: 'Classification',
            labelType: 'Manual',
            state: 'Confirmed',
          },
        ]
      : kept;
    return [{ op: 'replace', path: '/tags', value: next }];
  },
}));

const loadGovernanceCatalogMock = vi.fn();
const listTierTagsMock = vi.fn();

vi.mock('@/governance/catalogOptions', async (importOriginal) => {
  const original = (await importOriginal()) as Record<string, unknown>;
  return {
    ...original,
    loadGovernanceCatalog: (...args: unknown[]) => loadGovernanceCatalogMock(...args),
  };
});

vi.mock('@/api/tags', () => ({
  listTierTags: (...args: unknown[]) => listTierTagsMock(...args),
}));

const mockedPatchService = patchServiceMock;
const mockedLoadCatalog = loadGovernanceCatalogMock;
const mockedListTierTags = listTierTagsMock;

function domain(id: string, name: string): EntityRef {
  return { id, name, displayName: name, type: 'domain' };
}

function owner(id: string, type: string, name: string): EntityRef {
  return { id, name, displayName: name, type };
}

function tag(tagFQN: string, extra: Record<string, unknown> = {}) {
  return {
    tagFQN,
    source: 'Classification',
    labelType: 'Manual',
    state: 'Confirmed',
    ...extra,
  };
}

const catalogService = {
  id: 's1',
  name: 'svc',
  kind: 'database',
  serviceType: 'Mysql',
} as CatalogService;

function mountFacets(props: Record<string, unknown> = {}) {
  return mount(ServiceHeaderFacets, {
    props: {
      serviceId: 's1',
      serviceKind: 'database',
      canEditDomains: true,
      canEditOwners: true,
      canEditTier: true,
      ...props,
    },
    attachTo: document.body,
    global: { plugins: [Antd, createTestI18n()] },
  });
}

function visibleOverlay(): Element | null {
  return (
    Array.from(document.querySelectorAll('.ant-popover')).find(
      (element) => (element as HTMLElement).style.display !== 'none',
    ) ?? null
  );
}

async function openPopover(triggerTestId: string, contentTestId: string) {
  const trigger = document.querySelector(`[data-testid="${triggerTestId}"]`) as HTMLElement;
  trigger.click();
  await vi.waitFor(
    () => {
      expect(visibleOverlay()?.querySelector(`[data-testid="${contentTestId}"]`)).toBeTruthy();
    },
    { timeout: 3000 },
  );
  await flushPromises();
}

describe('ServiceHeaderFacets (official DataAssetHeaderDetailsRow)', () => {
  beforeEach(() => {
    mockedPatchService.mockResolvedValue(catalogService);
    mockedLoadCatalog.mockResolvedValue({
      owners: [
        { key: 'user:u1', id: 'u1', type: 'user', label: 'Alice' },
        { key: 'team:t1', id: 't1', type: 'team', label: 'Team A' },
        { key: 'user:u2', id: 'u2', type: 'user', label: 'Bob' },
      ],
      tags: [],
      domains: [
        {
          id: 'd1',
          name: 'Domain One',
          displayName: 'Domain One',
          domainType: 'Aggregate',
          owners: [],
          experts: [],
          tags: [],
        },
        {
          id: 'd2',
          name: 'Domain Two',
          displayName: 'Domain Two',
          domainType: 'Aggregate',
          owners: [],
          experts: [],
          tags: [],
        },
      ],
    } as never);
    mockedListTierTags.mockResolvedValue({
      data: [
        {
          id: 't1',
          name: 'Tier1',
          displayName: 'Tier 1',
          description: '',
          fullyQualifiedName: 'Tier.Tier1',
          owners: [],
        },
        {
          id: 't2',
          name: 'Tier2',
          displayName: 'Tier 2',
          description: '',
          fullyQualifiedName: 'Tier.Tier2',
          owners: [],
        },
      ],
      paging: { total: 2 },
    } as never);
  });

  afterEach(() => {
    document.body.innerHTML = '';
    vi.clearAllMocks();
  });

  it('renders domain, owners and tier with dot separators', () => {
    const wrapper = mountFacets({
      domains: [domain('d1', 'Domain One'), domain('d2', 'Domain Two')],
      owners: [owner('u1', 'user', 'Alice')],
      tags: [tag('Tier.Tier1', { displayName: 'Tier 1' })],
    });
    const strip = wrapper.find('[data-testid="entity-meta-strip"]');
    expect(strip.text()).toContain('Domain One');
    expect(strip.text()).toContain('Alice');
    expect(strip.text()).toContain('Tier 1');
    expect(wrapper.find('[data-testid="domain-count-button"]').text()).toBe('+1');
    expect(wrapper.findAll('.facet-dot')).toHaveLength(2);
    wrapper.unmount();
  });

  it('shows the add texts even without permission, without edit buttons', () => {
    const wrapper = mountFacets({
      canEditDomains: false,
      canEditOwners: false,
      canEditTier: false,
    });
    expect(wrapper.text()).toContain('Add Domain');
    expect(wrapper.text()).toContain('Add Owner');
    expect(wrapper.text()).toContain('Add Tier');
    expect(wrapper.find('[data-testid="edit-domain-button"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="edit-owner-button"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="edit-tier-button"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it('hides the domain facet for metadata services by default', () => {
    const wrapper = mountFacets({
      serviceKind: 'metadata',
      domains: [domain('d1', 'Domain One')],
    });
    expect(wrapper.find('[data-testid="edit-domain-button"]').exists()).toBe(false);
    expect(wrapper.text()).not.toContain('Domain One');
    expect(wrapper.findAll('.facet-dot')).toHaveLength(1);
    wrapper.unmount();
  });

  it('lists extra domains in the count popover', async () => {
    const wrapper = mountFacets({
      domains: [domain('d1', 'Domain One'), domain('d2', 'Domain Two')],
    });
    await openPopover('domain-count-button', 'domain-count-popover');
    expect(visibleOverlay()?.textContent).toContain('Domain Two');
    wrapper.unmount();
  });

  it('saves domains as a whole-array replace and emits the response', async () => {
    const wrapper = mountFacets({ domains: [domain('d1', 'Domain One')] });
    await openPopover('edit-domain-button', 'domain-picker');
    const select = wrapper.findComponent(Select);
    expect(select.props('value')).toEqual(['d1']);
    await select.vm.$emit('update:value', ['d1', 'd2']);
    (visibleOverlay()?.querySelector('[data-testid="domain-picker-save"]') as HTMLElement).click();
    await flushPromises();
    expect(mockedPatchService).toHaveBeenCalledWith('database', 's1', [
      {
        op: 'replace',
        path: '/domains',
        value: [
          { id: 'd1', type: 'domain' },
          { id: 'd2', type: 'domain' },
        ],
      },
    ]);
    expect(wrapper.emitted('updated')).toEqual([[catalogService]]);
    wrapper.unmount();
  });

  it('clears domains with an empty selection', async () => {
    const wrapper = mountFacets({ domains: [domain('d1', 'Domain One')] });
    await openPopover('edit-domain-button', 'domain-picker');
    await wrapper.findComponent(Select).vm.$emit('update:value', []);
    (visibleOverlay()?.querySelector('[data-testid="domain-picker-save"]') as HTMLElement).click();
    await flushPromises();
    expect(mockedPatchService).toHaveBeenCalledWith('database', 's1', [
      { op: 'replace', path: '/domains', value: [] },
    ]);
    wrapper.unmount();
  });

  it('keeps the domain picker open with its draft when the save fails', async () => {
    const errorSpy = vi.spyOn(message, 'error').mockImplementation(() => ({}) as never);
    mockedPatchService.mockRejectedValue(new Error('boom'));
    const wrapper = mountFacets({ domains: [domain('d1', 'Domain One')] });
    await openPopover('edit-domain-button', 'domain-picker');
    await wrapper.findComponent(Select).vm.$emit('update:value', ['d2']);
    (visibleOverlay()?.querySelector('[data-testid="domain-picker-save"]') as HTMLElement).click();
    await flushPromises();
    expect(errorSpy).toHaveBeenCalledWith('Error while updating Domain');
    expect(wrapper.emitted('updated')).toBeUndefined();
    expect(visibleOverlay()?.querySelector('[data-testid="domain-picker"]')).not.toBeNull();
    expect(wrapper.findComponent(Select).props('value')).toEqual(['d2']);
    wrapper.unmount();
  });

  it('resets the domain draft on cancel', async () => {
    const wrapper = mountFacets({ domains: [domain('d1', 'Domain One')] });
    await openPopover('edit-domain-button', 'domain-picker');
    await wrapper.findComponent(Select).vm.$emit('update:value', ['d2']);
    (visibleOverlay()?.querySelector('[data-testid="domain-picker-cancel"]') as HTMLElement).click();
    await vi.waitFor(
      () => {
        expect(visibleOverlay()).toBeNull();
      },
      { timeout: 3000 },
    );
    await openPopover('edit-domain-button', 'domain-picker');
    expect(wrapper.findComponent(Select).props('value')).toEqual(['d1']);
    wrapper.unmount();
  });

  it('saves users and teams jointly as owner refs', async () => {
    const wrapper = mountFacets({ owners: [owner('u1', 'user', 'Alice')] });
    await openPopover('edit-owner-button', 'owner-picker');
    const select = wrapper.findComponent(Select);
    expect(select.props('value')).toEqual(['user:u1']);
    expect(select.props('options')).toEqual([
      { value: 'user:u1', label: 'Alice' },
      { value: 'team:t1', label: 'Team A' },
      { value: 'user:u2', label: 'Bob' },
    ]);
    await select.vm.$emit('update:value', ['user:u1', 'team:t1']);
    (visibleOverlay()?.querySelector('[data-testid="owner-picker-save"]') as HTMLElement).click();
    await flushPromises();
    expect(mockedPatchService).toHaveBeenCalledWith('database', 's1', [
      {
        op: 'replace',
        path: '/owners',
        value: [
          { id: 'u1', type: 'user' },
          { id: 't1', type: 'team' },
        ],
      },
    ]);
    expect(wrapper.emitted('updated')).toEqual([[catalogService]]);
    wrapper.unmount();
  });

  it('toasts and stays open when the owner save fails', async () => {
    const errorSpy = vi.spyOn(message, 'error').mockImplementation(() => ({}) as never);
    mockedPatchService.mockRejectedValue(new Error('boom'));
    const wrapper = mountFacets({ owners: [] });
    await openPopover('edit-owner-button', 'owner-picker');
    await wrapper.findComponent(Select).vm.$emit('update:value', ['user:u2']);
    (visibleOverlay()?.querySelector('[data-testid="owner-picker-save"]') as HTMLElement).click();
    await flushPromises();
    expect(errorSpy).toHaveBeenCalledWith('Error while updating Owners');
    expect(visibleOverlay()?.querySelector('[data-testid="owner-picker"]')).not.toBeNull();
    wrapper.unmount();
  });

  it('writes the tier by filtering Tier labels and appending one Classification label', async () => {
    // The description field is the tell: a rebuild through toTagLabel
    // would drop it, while pass-through keeps the stored object whole.
    const kept = tag('PII.Sensitive', {
      labelType: 'Suggested',
      state: 'Suggested',
      description: 'keep me',
    });
    const wrapper = mountFacets({ tags: [tag('Tier.Tier1'), kept] });
    await openPopover('edit-tier-button', 'tier-picker');
    (visibleOverlay()?.querySelector('[data-testid="tier-option-Tier.Tier2"]') as HTMLElement).click();
    await flushPromises();
    expect(mockedPatchService).toHaveBeenCalledTimes(1);
    const ops = mockedPatchService.mock.calls[0][2] as Array<{ value: unknown[] }>;
    expect(ops[0].value).toHaveLength(2);
    expect(ops[0].value[0]).toEqual(kept);
    expect(ops[0].value[1]).toEqual({
      tagFQN: 'Tier.Tier2',
      source: 'Classification',
      labelType: 'Manual',
      state: 'Confirmed',
    });
    expect(wrapper.emitted('updated')).toEqual([[catalogService]]);
    wrapper.unmount();
  });

  it('clears the tier keeping only non-tier labels', async () => {
    const kept = tag('PII.Sensitive');
    const wrapper = mountFacets({ tags: [tag('Tier.Tier1'), kept] });
    await openPopover('edit-tier-button', 'tier-picker');
    (visibleOverlay()?.querySelector('[data-testid="tier-picker-clear"]') as HTMLElement).click();
    await flushPromises();
    const ops = mockedPatchService.mock.calls[0][2] as Array<{ value: unknown[] }>;
    expect(ops[0].value).toHaveLength(1);
    expect(ops[0].value[0]).toEqual(kept);
    wrapper.unmount();
  });

  it('lets TierPicker own the toast when the tier save fails', async () => {
    const errorSpy = vi.spyOn(message, 'error').mockImplementation(() => ({}) as never);
    mockedPatchService.mockRejectedValue(new Error('boom'));
    const wrapper = mountFacets({ tags: [tag('Tier.Tier1')] });
    await openPopover('edit-tier-button', 'tier-picker');
    (visibleOverlay()?.querySelector('[data-testid="tier-option-Tier.Tier2"]') as HTMLElement).click();
    await flushPromises();
    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy).toHaveBeenCalledWith('Error while updating Tier');
    expect(wrapper.emitted('updated')).toBeUndefined();
    wrapper.unmount();
  });

  it('falls back through displayName, name and tagFQN for the tier text', () => {
    const named = mountFacets({ tags: [tag('Tier.Tier1', { name: 'Tier 1' })] });
    expect(named.text()).toContain('Tier 1');
    named.unmount();
    const bare = mountFacets({ tags: [tag('Tier.Tier1')] });
    expect(bare.text()).toContain('Tier.Tier1');
    bare.unmount();
  });

  it('retries the catalog load after a failure instead of caching the rejection', async () => {
    const errorSpy = vi.spyOn(message, 'error').mockImplementation(() => ({}) as never);
    mockedLoadCatalog.mockRejectedValueOnce(new Error('boom'));
    const wrapper = mountFacets();
    await openPopover('edit-domain-button', 'domain-picker');
    expect(errorSpy).toHaveBeenCalledWith('Failed to load');
    expect(mockedLoadCatalog).toHaveBeenCalledTimes(1);
    (visibleOverlay()?.querySelector('[data-testid="domain-picker-cancel"]') as HTMLElement).click();
    await vi.waitFor(
      () => {
        expect(visibleOverlay()).toBeNull();
      },
      { timeout: 3000 },
    );
    await openPopover('edit-domain-button', 'domain-picker');
    expect(mockedLoadCatalog).toHaveBeenCalledTimes(2);
    expect(errorSpy).toHaveBeenCalledTimes(1);
    errorSpy.mockRestore();
    wrapper.unmount();
  });

  it('renders owners through the shared cell with the cap-4 overflow', () => {
    const wrapper = mountFacets({
      owners: [
        owner('u1', 'user', 'Alice'),
        owner('u2', 'user', 'Bob'),
        owner('u3', 'user', 'Carol'),
        owner('u4', 'user', 'Dave'),
        owner('u5', 'user', 'Erin'),
      ],
    });
    const strip = wrapper.find('[data-testid="entity-meta-strip"]');
    expect(strip.text()).toContain('Alice');
    expect(strip.text()).toContain('Dave');
    expect(strip.text()).not.toContain('Erin');
    expect(wrapper.find('[data-testid="owner-more-count"]').text()).toBe('+1');
    wrapper.unmount();
  });
});
