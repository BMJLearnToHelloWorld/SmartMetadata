/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may
 * not use this file except in compliance with the License. You may obtain
 * a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { mount } from '@vue/test-utils';
import Antd from 'ant-design-vue';
import { describe, expect, it, vi } from 'vitest';
import { nextTick } from 'vue';
import { createTestI18n } from '@/test/i18n';
import WidgetRelatedTermsCell from './WidgetRelatedTermsCell.vue';

async function tick(ms = 10) {
  await new Promise((resolve) => setTimeout(resolve, ms));
  await nextTick();
}

const RELATIONS = [
  { name: 'A', fullyQualifiedName: 'g.A', relationType: 'relatedTo' },
  { name: 'B', fullyQualifiedName: 'g.B', relationType: 'isA' },
  { name: 'C', fullyQualifiedName: 'g.C', relationType: 'relatedTo' },
];

const RELATION_TYPES = [
  { name: 'relatedTo', displayName: 'Related To' },
  { name: 'isA', displayName: 'Is A' },
];

const TERM_OPTIONS = [
  { name: 'A', fullyQualifiedName: 'g.A', type: 'glossaryTerm' },
  { name: 'B', fullyQualifiedName: 'g.B', type: 'glossaryTerm' },
  { name: 'C', fullyQualifiedName: 'g.C', type: 'glossaryTerm' },
  { name: 'D', fullyQualifiedName: 'g.D', type: 'glossaryTerm' },
];

function mountCell(props: Record<string, unknown> = {}) {
  return mount(WidgetRelatedTermsCell, {
    props: {
      relations: RELATIONS,
      relationTypes: RELATION_TYPES,
      termOptions: TERM_OPTIONS,
      hasEditAccess: true,
      onSave: vi.fn(),
      onTermClick: vi.fn(),
      ...props,
    },
    global: { plugins: [Antd, createTestI18n()] },
    attachTo: document.body,
  });
}

describe('WidgetRelatedTermsCell', () => {
  it('groups badges by relation type with the type display name', () => {
    const wrapper = mountCell();
    expect(wrapper.text()).toContain('Related To');
    expect(wrapper.text()).toContain('Is A');
    expect(wrapper.find('[data-testid="related-term-g.A"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="related-term-g.B"]').exists()).toBe(true);
    wrapper.unmount();
  });

  it('collapses past five badges per group with a toggle', async () => {
    const many = Array.from({ length: 7 }, (_, i) => ({
      name: `T${i}`,
      fullyQualifiedName: `g.T${i}`,
      relationType: 'relatedTo',
    }));
    const wrapper = mountCell({ relations: many });
    expect(wrapper.text()).toContain('+2 more');
    expect(wrapper.find('[data-testid="related-term-g.T6"]').exists()).toBe(false);
    await wrapper.find('[data-testid="related-terms-toggle-relatedTo"]').trigger('click');
    expect(wrapper.find('[data-testid="related-term-g.T6"]').exists()).toBe(true);
    wrapper.unmount();
  });

  it('navigates on badge click and hides buttons without access', async () => {
    const onTermClick = vi.fn();
    const wrapper = mountCell({ hasEditAccess: false, onTermClick });
    await wrapper.find('[data-testid="related-term-g.A"]').trigger('click');
    expect(onTermClick).toHaveBeenCalledWith(
      expect.objectContaining({ fullyQualifiedName: 'g.A' }),
    );
    expect(wrapper.find('[data-testid="edit-button"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it('shows a placeholder without access when there are no relations', () => {
    const wrapper = mountCell({ relations: [], hasEditAccess: false });
    expect(wrapper.text()).toContain('—');
    wrapper.unmount();
  });

  it('edits relations and saves the replaced list', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    const wrapper = mountCell({ onSave });
    await wrapper.find('[data-testid="edit-button"]').trigger('click');
    await tick();
    const vm = wrapper.vm as unknown as { rows: Array<{ termKeys: string[] }> };
    // Drop C from the relatedTo row, keep A.
    vm.rows[0].termKeys = ['g.A'];
    await nextTick();
    await wrapper.find('[data-testid="save-related-terms"]').trigger('click');
    await tick();
    expect(onSave).toHaveBeenCalledWith([
      {
        relationType: 'relatedTo',
        term: { id: undefined, type: 'glossaryTerm', fullyQualifiedName: 'g.A', name: 'A', displayName: undefined },
      },
      {
        relationType: 'isA',
        term: { id: undefined, type: 'glossaryTerm', fullyQualifiedName: 'g.B', name: 'B', displayName: undefined },
      },
    ]);
    wrapper.unmount();
    document.body.innerHTML = '';
  });

  it('adds a row and appends it to the existing relations', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    const wrapper = mountCell({ onSave });
    await wrapper.find('[data-testid="related-term-add-button"]').trigger('click');
    await tick();
    const vm = wrapper.vm as unknown as { rows: Array<{ termKeys: string[]; relationType: string }> };
    vm.rows[0].termKeys = ['g.D'];
    await nextTick();
    await wrapper.find('[data-testid="save-related-terms"]').trigger('click');
    await tick();
    const saved = onSave.mock.calls[0][0] as Array<{ relationType: string }>;
    expect(saved).toHaveLength(4);
    expect(saved[3]).toEqual({
      relationType: 'relatedTo',
      term: { id: undefined, type: 'glossaryTerm', fullyQualifiedName: 'g.D', name: 'D', displayName: undefined },
    });
    wrapper.unmount();
    document.body.innerHTML = '';
  });

  it('keeps the editor open when the save fails', async () => {
    const onSave = vi.fn().mockRejectedValue(new Error('boom'));
    const wrapper = mountCell({ onSave });
    await wrapper.find('[data-testid="edit-button"]').trigger('click');
    await tick();
    await wrapper.find('[data-testid="save-related-terms"]').trigger('click');
    await tick();
    expect(wrapper.find('[data-testid="save-related-terms"]').exists()).toBe(true);
    wrapper.unmount();
    document.body.innerHTML = '';
  });
});
