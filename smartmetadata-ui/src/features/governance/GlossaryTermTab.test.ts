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
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryHistory, createRouter } from 'vue-router';
import { createTestI18n } from '@/test/i18n';
import type { GlossaryTerm } from '@/types/governance';
import GlossaryTermTab from './GlossaryTermTab.vue';

const listGlossaryTerms = vi.fn();
const listGlossaryTermChildrenLazy = vi.fn();

vi.mock('@/api/glossaryTerms', () => ({
  listGlossaryTerms: (...args: unknown[]) => listGlossaryTerms(...args),
  listGlossaryTermChildrenLazy: (...args: unknown[]) => listGlossaryTermChildrenLazy(...args),
}));

function term(overrides: Partial<GlossaryTerm> & { id: string; name: string }): GlossaryTerm {
  return {
    fullyQualifiedName: `gloss.${overrides.name}`,
    relatedTerms: [],
    owners: [],
    reviewers: [],
    domains: [],
    synonyms: [],
    references: [],
    tags: [],
    ...overrides,
  };
}

const PARENT = term({ id: 't0', name: 'term', childrenCount: 2 });
const ARR = term({ id: 'c1', name: 'arr', description: 'ARR child', status: 'Approved', childrenCount: 2 });
const BRR = term({ id: 'c2', name: 'brr', description: 'BRR child', status: 'Draft' });
const GRAND_A = term({ id: 'g1', name: 'arr-a' });
const GRAND_B = term({ id: 'g2', name: 'arr-b' });
const GRAND_C = term({ id: 'g3', name: 'arr-c' });

async function mountTab() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', name: 'home', component: { template: '<div />' } },
      { path: '/terms/:id', name: 'governance-term', component: { template: '<div />' } },
    ],
  });
  await router.push('/');
  await router.isReady();
  const wrapper = mount(GlossaryTermTab, {
    props: { term: PARENT },
    global: { plugins: [router, Antd, createTestI18n()] },
  });
  await flushPromises();
  await flushPromises();
  return wrapper;
}

async function selectStatusOption(
  wrapper: Awaited<ReturnType<typeof mountTab>>,
  label: string,
): Promise<void> {
  const selector = wrapper.find('[data-testid="term-children-status-filter"] .ant-select-selector');
  selector.element.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
  await flushPromises();
  const option = [...document.querySelectorAll<HTMLElement>('.ant-select-item-option')].find(
    (el) => el.textContent?.trim() === label,
  );
  expect(option).toBeDefined();
  option!.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
  option!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  await flushPromises();
  await flushPromises();
}

describe('GlossaryTermTab (pin GlossaryTermTab, term-view subset)', () => {
  beforeEach(() => {
    listGlossaryTerms.mockReset();
    listGlossaryTermChildrenLazy.mockReset();
    listGlossaryTerms.mockResolvedValue({ data: [ARR, BRR], total: 2 });
    listGlossaryTermChildrenLazy.mockResolvedValue({ data: [GRAND_A, GRAND_B], total: 2 });
    document.body.innerHTML = '';
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('fetches the first level with directChildrenOf and all statuses', async () => {
    const wrapper = await mountTab();
    expect(listGlossaryTerms).toHaveBeenCalledWith({
      directChildrenOf: 'gloss.term',
      limit: 50,
      after: undefined,
      before: undefined,
      entityStatus: undefined,
    });
    expect(wrapper.text()).toContain('ARR');
    expect(wrapper.text()).toContain('BRR');
    expect(wrapper.text()).toContain('Approved');
    expect(wrapper.text()).toContain('2 terms');
    wrapper.unmount();
  });

  it('pages with the next cursor', async () => {
    listGlossaryTerms.mockResolvedValueOnce({ data: [ARR, BRR], total: 120, after: 'c1' });
    const wrapper = await mountTab();
    listGlossaryTerms.mockClear();
    listGlossaryTerms.mockResolvedValue({ data: [BRR], total: 120, before: 'c0' });
    await wrapper.find('[data-testid="next"]').trigger('click');
    await flushPromises();
    await flushPromises();
    expect(listGlossaryTerms).toHaveBeenCalledWith({
      directChildrenOf: 'gloss.term',
      limit: 50,
      after: 'c1',
      before: undefined,
      entityStatus: undefined,
    });
    wrapper.unmount();
  });

  it('sends a partial status selection comma-joined', async () => {
    const wrapper = await mountTab();
    listGlossaryTerms.mockClear();
    await selectStatusOption(wrapper, 'Draft');
    await selectStatusOption(wrapper, 'InReview');
    const lastCall = listGlossaryTerms.mock.calls.at(-1);
    expect(lastCall).toBeDefined();
    expect(lastCall![0]).toMatchObject({ entityStatus: 'Approved' });
    wrapper.unmount();
  });

  it('lazy-loads children on expand and shows the loaded count', async () => {
    const wrapper = await mountTab();
    // The expand icon lives in the row's first cell, not inside the
    // name link; antd also renders the class on the non-expandable
    // row's placeholder span, so select the collapsed (clickable) one.
    // ARR is the only expandable row (BRR has no children).
    const expandIcons = wrapper.findAll('.ant-table-row-expand-icon-collapsed');
    expect(expandIcons).toHaveLength(1);
    await expandIcons[0].trigger('click');
    await flushPromises();
    await flushPromises();
    expect(listGlossaryTermChildrenLazy).toHaveBeenCalledWith('gloss.arr', 50, undefined);
    expect(wrapper.text()).toContain('arr-a');
    expect(wrapper.text()).toContain('arr-b');
    expect(wrapper.text()).toContain('2 of 2 loaded');
    wrapper.unmount();
  });

  it('loads more children from the stored after cursor', async () => {
    const arrThree = term({ ...ARR, childrenCount: 3 });
    listGlossaryTerms.mockResolvedValue({ data: [arrThree, BRR], total: 2 });
    listGlossaryTermChildrenLazy.mockResolvedValueOnce({
      data: [GRAND_A, GRAND_B],
      total: 3,
      after: 'cur1',
    });
    const wrapper = await mountTab();
    await wrapper.findAll('.ant-table-row-expand-icon-collapsed')[0].trigger('click');
    await flushPromises();
    await flushPromises();
    const moreButton = wrapper.find('[data-testid="load-more-children-button"]');
    expect(moreButton.exists()).toBe(true);
    expect(moreButton.text()).toContain('View 1 more');
    listGlossaryTermChildrenLazy.mockResolvedValueOnce({ data: [GRAND_C], total: 3 });
    await moreButton.trigger('click');
    await flushPromises();
    await flushPromises();
    expect(listGlossaryTermChildrenLazy).toHaveBeenCalledWith('gloss.arr', 50, 'cur1');
    expect(wrapper.text()).toContain('arr-c');
    expect(wrapper.find('[data-testid="load-more-children-button"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it('shows the empty state when the term has no children', async () => {
    listGlossaryTerms.mockResolvedValue({ data: [], total: 0 });
    const wrapper = await mountTab();
    expect(wrapper.text()).toContain('No child terms yet');
    wrapper.unmount();
  });

  it('keeps the previous rows when a refetch fails', async () => {
    const wrapper = await mountTab();
    expect(wrapper.text()).toContain('ARR');
    listGlossaryTerms.mockRejectedValueOnce(new Error('boom'));
    await selectStatusOption(wrapper, 'Draft');
    expect(wrapper.text()).toContain('ARR');
    expect(wrapper.text()).toContain('BRR');
    wrapper.unmount();
  });
});
