/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0.
 */
import { flushPromises, mount } from '@vue/test-utils';
import Antd, { message } from 'ant-design-vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestI18n } from '@/test/i18n';
import type { TierTag } from '@/api/tags';
import TierPicker from './TierPicker.vue';

vi.mock('@/api/tags', () => ({
  listTierTags: vi.fn(),
}));

import { listTierTags } from '@/api/tags';

const mockedListTierTags = vi.mocked(listTierTags);

function tier(overrides: Partial<TierTag> = {}): TierTag {
  return {
    id: 't1',
    name: 'Tier1',
    displayName: 'Tier 1',
    description: 'Critical data.',
    fullyQualifiedName: 'Tier.Tier1',
    owners: [],
    reviewers: [],
    domains: [],
    ...overrides,
  };
}

function mountPicker(props: Record<string, unknown> = {}) {
  return mount(TierPicker, {
    props: {
      updateTier: vi.fn().mockResolvedValue(undefined),
      ...props,
    },
    slots: { default: '<button data-testid="tier-trigger">Edit tier</button>' },
    attachTo: document.body,
    global: { plugins: [Antd, createTestI18n()] },
  });
}

/** A closed overlay stays mounted with `display: none`; visibility is the style, not a class. */
function visibleOverlay(): Element | null {
  return (
    Array.from(document.querySelectorAll('.ant-popover')).find(
      (element) => (element as HTMLElement).style.display !== 'none',
    ) ?? null
  );
}

async function openPicker(wrapper: ReturnType<typeof mountPicker>) {
  await wrapper.find('[data-testid="tier-trigger"]').trigger('click');
  await vi.waitFor(() => {
    expect(visibleOverlay()?.querySelector('[data-testid="tier-picker"]')).toBeTruthy();
  });
  await flushPromises();
}

/** The currently visible popover overlay; stale hidden overlays are ignored. */
function popover(): Element {
  const overlay = visibleOverlay();
  if (!overlay) {
    throw new Error('no visible popover overlay');
  }
  return overlay;
}

function q(selector: string): Element | null {
  return popover().querySelector(selector);
}

describe('TierPicker (official TierCard)', () => {
  beforeEach(() => {
    mockedListTierTags.mockResolvedValue({
      data: [tier(), tier({ id: 't2', name: 'Tier2', fullyQualifiedName: 'Tier.Tier2' })],
    });
  });

  afterEach(() => {
    document.body.innerHTML = '';
    vi.clearAllMocks();
  });

  it('fetches tiers on open through listTierTags and renders colored options', async () => {
    mockedListTierTags.mockResolvedValue({
      data: [tier({ style: { color: '#c00' } })],
    });
    const wrapper = mountPicker();
    expect(mockedListTierTags).not.toHaveBeenCalled();
    await openPicker(wrapper);
    expect(mockedListTierTags).toHaveBeenCalledTimes(1);
    expect(mockedListTierTags).toHaveBeenCalledWith();
    const option = q('[data-testid="tier-option-Tier.Tier1"]');
    expect(option?.textContent).toContain('Tier 1');
    expect(option?.textContent).toContain('Critical data.');
    expect(
      (option?.querySelector('.tier-picker-option-name') as HTMLElement)?.style.color,
    ).toBe('rgb(204, 0, 0)');
    wrapper.unmount();
  });

  it('does not refetch while tiers are already loaded', async () => {
    const wrapper = mountPicker();
    await openPicker(wrapper);
    await wrapper.find('[data-testid="tier-trigger"]').trigger('click');
    await flushPromises();
    await openPicker(wrapper);
    expect(mockedListTierTags).toHaveBeenCalledTimes(1);
    wrapper.unmount();
  });

  it('renders exactly what listTierTags returns: no client-side disabled filter', async () => {
    mockedListTierTags.mockResolvedValue({
      data: [tier(), tier({ id: 't2', name: 'Tier2', fullyQualifiedName: 'Tier.Tier2', disabled: true })],
    });
    const wrapper = mountPicker();
    await openPicker(wrapper);
    expect(q('[data-testid="tier-option-Tier.Tier1"]')).not.toBeNull();
    expect(q('[data-testid="tier-option-Tier.Tier2"]')).not.toBeNull();
    wrapper.unmount();
  });

  it('toasts and shows the empty state when the fetch fails', async () => {
    mockedListTierTags.mockRejectedValue(new Error('boom'));
    const errorSpy = vi.spyOn(message, 'error').mockImplementation(() => ({}) as never);
    const wrapper = mountPicker();
    await openPicker(wrapper);
    expect(errorSpy).toHaveBeenCalledWith('Error while fetching tiers');
    expect(q('[data-testid="tier-picker-empty"]')?.textContent).toContain(
      'No tiers are available',
    );
    wrapper.unmount();
  });

  it('commits the picked tag and closes', async () => {
    const updateTier = vi.fn().mockResolvedValue(undefined);
    const wrapper = mountPicker({ updateTier });
    await openPicker(wrapper);
    (q('[data-testid="tier-option-Tier.Tier2"]') as HTMLElement).click();
    await flushPromises();
    expect(updateTier).toHaveBeenCalledTimes(1);
    expect(updateTier.mock.calls[0][0]).toMatchObject({ fullyQualifiedName: 'Tier.Tier2' });
    await vi.waitFor(
      () => {
        expect(visibleOverlay()).toBeNull();
      },
      { timeout: 3000 },
    );
    wrapper.unmount();
  });

  it('clicking the selected tier again clears it', async () => {
    const updateTier = vi.fn().mockResolvedValue(undefined);
    const wrapper = mountPicker({ currentTier: 'Tier.Tier1', updateTier });
    await openPicker(wrapper);
    (q('[data-testid="tier-option-Tier.Tier1"]') as HTMLElement).click();
    await flushPromises();
    expect(updateTier).toHaveBeenCalledWith(undefined);
    wrapper.unmount();
  });

  it('clears through the Clear row when a tier is set', async () => {
    const updateTier = vi.fn().mockResolvedValue(undefined);
    const wrapper = mountPicker({ currentTier: 'Tier.Tier1', updateTier });
    await openPicker(wrapper);
    (q('[data-testid="tier-picker-clear"]') as HTMLElement).click();
    await flushPromises();
    expect(updateTier).toHaveBeenCalledWith(undefined);
    wrapper.unmount();
  });

  it('hides the Clear row when no tier is set', async () => {
    const wrapper = mountPicker();
    await openPicker(wrapper);
    expect(q('[data-testid="tier-picker-clear"]')).toBeNull();
    wrapper.unmount();
  });

  it('toasts when the commit fails', async () => {
    const errorSpy = vi.spyOn(message, 'error').mockImplementation(() => ({}) as never);
    const updateTier = vi.fn().mockRejectedValue(new Error('boom'));
    const wrapper = mountPicker({ updateTier });
    await openPicker(wrapper);
    (q('[data-testid="tier-option-Tier.Tier1"]') as HTMLElement).click();
    await flushPromises();
    expect(errorSpy).toHaveBeenCalledWith('Error while updating Tier');
    wrapper.unmount();
  });

  it('searches options by name only, never by FQN', async () => {
    mockedListTierTags.mockResolvedValue({
      data: [
        tier({ displayName: 'Alpha Tier' }),
        tier({ id: 't2', name: 'Tier2', displayName: 'Beta Tier', fullyQualifiedName: 'Tier.Tier2' }),
      ],
    });
    const wrapper = mountPicker();
    await openPicker(wrapper);
    const searchRoot = q('[data-testid="tier-picker-search"]') as HTMLElement;
    const search = (
      searchRoot.tagName === 'INPUT' ? searchRoot : searchRoot.querySelector('input')
    ) as HTMLInputElement;
    search.value = 'beta';
    search.dispatchEvent(new Event('input', { bubbles: true }));
    await flushPromises();
    expect(q('[data-testid="tier-option-Tier.Tier1"]')).toBeNull();
    expect(q('[data-testid="tier-option-Tier.Tier2"]')).not.toBeNull();
    search.value = 'tier.tier2';
    search.dispatchEvent(new Event('input', { bubbles: true }));
    await flushPromises();
    expect(q('[data-testid="tier-option-Tier.Tier2"]')).toBeNull();
    expect(q('[data-testid="tier-picker-empty"]')).not.toBeNull();
    wrapper.unmount();
  });

  it('splits markdown descriptions into summary and details', async () => {
    mockedListTierTags.mockResolvedValue({
      data: [tier({ description: 'First paragraph.\n\nSecond paragraph with *emphasis*.' })],
    });
    const wrapper = mountPicker();
    await openPicker(wrapper);
    const option = q('[data-testid="tier-option-Tier.Tier1"]');
    expect(option?.querySelector('.tier-picker-option-summary')?.textContent).toBe(
      'First paragraph.',
    );
    expect(option?.textContent).toContain('Second paragraph with emphasis.');
    wrapper.unmount();
  });

  it('treats inline-only descriptions as one summary', async () => {
    mockedListTierTags.mockResolvedValue({
      data: [tier({ description: 'Just **one** line.' })],
    });
    const wrapper = mountPicker();
    await openPicker(wrapper);
    const option = q('[data-testid="tier-option-Tier.Tier1"]');
    expect(option?.querySelector('.tier-picker-option-summary')?.textContent).toBe(
      'Just one line.',
    );
    expect(
      option?.querySelector('[data-testid="tier-picker-option-details-Tier.Tier1"]'),
    ).toBeNull();
    wrapper.unmount();
  });

  it('renders HTML descriptions as a plain summary plus rich markdown details', async () => {
    mockedListTierTags.mockResolvedValue({
      data: [
        tier({
          description:
            '<p>Summary line.</p><p>Details with <strong>bold</strong> and a ' +
            '<a href="https://example.com">link</a>.</p><ul><li>First</li><li>Second</li></ul>',
        }),
      ],
    });
    const wrapper = mountPicker();
    await openPicker(wrapper);
    const option = q('[data-testid="tier-option-Tier.Tier1"]');
    expect(option?.querySelector('.tier-picker-option-summary')?.textContent).toBe(
      'Summary line.',
    );
    const details = option?.querySelector(
      '[data-testid="tier-picker-option-details-Tier.Tier1"]',
    );
    expect(details?.querySelector('strong')?.textContent).toBe('bold');
    expect(details?.querySelector('a')?.getAttribute('href')).toBe('https://example.com');
    expect(details?.textContent).toContain('First');
    expect(details?.textContent).toContain('Second');
    wrapper.unmount();
  });
});
