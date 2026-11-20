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
import { afterEach, describe, expect, it } from 'vitest';
import { nextTick } from 'vue';
import type { AssetDetail, EntityRef } from '@/types/api';
import { createTestI18n } from '@/test/i18n';
import WidgetRelatedMetricsCell from './WidgetRelatedMetricsCell.vue';

function metric(related: EntityRef[], overrides: Partial<AssetDetail> = {}): AssetDetail {
  return {
    entityType: 'metric',
    id: 'm1',
    name: 'revenue',
    fullyQualifiedName: 'revenue',
    owners: [],
    tags: [],
    domains: [],
    schemaRows: [],
    schemaLabel: '',
    relatedMetrics: related,
    ...overrides,
  };
}

function ref(id: string, name: string): EntityRef {
  return { id, name, displayName: name, fullyQualifiedName: name, type: 'metric' };
}

function mountCell(props: Record<string, unknown>) {
  return mount(WidgetRelatedMetricsCell, {
    props: {
      metric: metric([]),
      hasEditAccess: true,
      onSave: async () => {},
      ...props,
    },
    global: { plugins: [Antd, createTestI18n()], stubs: { RouterLink: { name: 'RouterLink', template: '<a><slot /></a>', props: ['to'] } } },
    attachTo: document.body,
  });
}

async function flush() {
  await nextTick();
  await new Promise((resolve) => setTimeout(resolve, 0));
  await nextTick();
}

describe('WidgetRelatedMetricsCell', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('shows five rows and a show-more toggle when there are more', () => {
    const related = Array.from({ length: 7 }, (_, i) => ref(`r${i}`, `metric-${i}`));
    const wrapper = mountCell({ metric: metric(related) });
    expect(wrapper.findAll('[data-testid="related-metrics-row"]')).toHaveLength(5);
    expect(wrapper.find('[data-testid="related-metrics-toggle"]').exists()).toBe(true);
    wrapper.unmount();
  });

  it('shows the no-metrics text when there are none', () => {
    const wrapper = mountCell({});
    expect(wrapper.text()).toContain('No Related Metrics are available');
    wrapper.unmount();
  });

  it('hides the edit button without edit access or on a deleted metric', () => {
    const noAccess = mountCell({ hasEditAccess: false });
    expect(noAccess.find('[data-testid="related-metrics-edit"]').exists()).toBe(false);
    noAccess.unmount();
    const deleted = mountCell({ metric: metric([], { deleted: true }) });
    expect(deleted.find('[data-testid="related-metrics-edit"]').exists()).toBe(false);
    deleted.unmount();
  });

  it('saves the selection through onSave and closes the editor', async () => {
    const saved: EntityRef[][] = [];
    const wrapper = mountCell({
      metric: metric([ref('r1', 'metric-1')]),
      onSave: async (refs: EntityRef[]) => {
        saved.push(refs);
      },
    });
    await wrapper.find('[data-testid="related-metrics-edit"]').trigger('click');
    await flush();
    // The antd Modal teleports to document.body; its footer buttons are
    // queried on the document, as the delete-confirm tests do.
    const ok = document.body.querySelector('.ant-modal-footer .ant-btn-primary') as HTMLElement;
    expect(ok).not.toBeNull();
    ok.click();
    await flush();
    expect(saved).toHaveLength(1);
    expect(saved[0].map((item) => item.id)).toEqual(['r1']);
    // Success closes the modal: antd keeps the node but hides it.
    const modal = document.body.querySelector('.ant-modal') as HTMLElement | null;
    expect(modal?.style.display).toBe('none');
    wrapper.unmount();
  });

  it('keeps the editor open when the save fails', async () => {
    const wrapper = mountCell({
      metric: metric([ref('r1', 'metric-1')]),
      onSave: async () => {
        throw new Error('save failed');
      },
    });
    await wrapper.find('[data-testid="related-metrics-edit"]').trigger('click');
    await flush();
    const ok = document.body.querySelector('.ant-modal-footer .ant-btn-primary') as HTMLElement;
    expect(ok).not.toBeNull();
    ok.click();
    await flush();
    expect(
      document.body.querySelector('.ant-modal [data-testid="related-metrics-save-error"]'),
    ).not.toBeNull();
    const modal = document.body.querySelector('.ant-modal') as HTMLElement | null;
    expect(modal?.style.display).not.toBe('none');
    wrapper.unmount();
  });
});
