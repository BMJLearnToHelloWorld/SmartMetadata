/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { mount } from '@vue/test-utils';
import Antd from 'ant-design-vue';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { nextTick } from 'vue';
import { createTestI18n } from '@/test/i18n';
import ColumnDescriptionCell from './ColumnDescriptionCell.vue';

afterEach(() => {
  document.body.innerHTML = '';
});

// The read-only preview applies its content on a 0ms timer, so
// render assertions wait for a real tick.
async function tick(ms = 10) {
  await new Promise((resolve) => setTimeout(resolve, ms));
  await nextTick();
}

function mountCell(propsOverrides: Record<string, unknown> = {}) {
  return mount(ColumnDescriptionCell, {
    attachTo: document.body,
    props: {
      description: 'The email column',
      hasEditAccess: true,
      onEdit: () => undefined,
      ...propsOverrides,
    },
    global: { plugins: [Antd, createTestI18n()] },
  });
}

describe('ColumnDescriptionCell', () => {
  it('renders the description and shows the edit button when editable', async () => {
    const wrapper = mountCell();
    await tick();
    expect(wrapper.text()).toContain('The email column');
    expect(wrapper.find('[data-testid="edit-column-description"]').exists()).toBe(true);
    wrapper.unmount();
  });

  it('shows the no-description text when empty', () => {
    const wrapper = mountCell({ description: '' });
    expect(wrapper.text()).toContain('No Description');
    wrapper.unmount();
  });

  it('hides the edit button without edit access or when read-only', () => {
    const noAccess = mountCell({ hasEditAccess: false });
    expect(noAccess.find('[data-testid="edit-column-description"]').exists()).toBe(false);
    noAccess.unmount();
    const readOnly = mountCell({ readOnly: true });
    expect(readOnly.find('[data-testid="edit-column-description"]').exists()).toBe(false);
    readOnly.unmount();
  });

  it('reports the edit click to the parent and owns no modal', async () => {
    // Pin TableDescription: the cell only calls its onClick prop; the
    // modal lives in the parent (AssetDetailPiece). The convergence
    // lane removed the batch-2 cell-owned modal, so clicking the
    // button must call onEdit and must not open any modal.
    const onEdit = vi.fn();
    const wrapper = mountCell({ onEdit });
    await tick();
    await wrapper.find('[data-testid="edit-column-description"]').trigger('click');
    expect(onEdit).toHaveBeenCalledTimes(1);
    expect(document.querySelector('.ant-modal')).toBeNull();
    wrapper.unmount();
  });
});
