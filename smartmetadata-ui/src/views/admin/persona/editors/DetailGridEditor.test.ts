/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may
 * not use this file except in compliance with the License. You may obtain
 * a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import Antd, { Select } from 'ant-design-vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestI18n } from '@/test/i18n';
import DetailGridEditor from './DetailGridEditor.vue';
import type { WidgetConfig } from './customizeTypes';
import { widgetTitle } from './tabLabels';

const PLACEHOLDER = 'ExtraWidget.EmptyWidgetPlaceholder';

function rect(overrides: Partial<DOMRect>): DOMRect {
  return {
    x: 0,
    y: 0,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    width: 0,
    height: 0,
    toJSON: () => ({}),
    ...overrides,
  } as DOMRect;
}

function mockRect(el: Element, value: DOMRect): void {
  vi.spyOn(el, 'getBoundingClientRect').mockReturnValue(value);
}

function dragEvent(type: string, init: { clientX?: number; clientY?: number }): Event {
  const event = new Event(type, { bubbles: true, cancelable: true });
  if (init.clientX !== undefined) {
    Object.defineProperty(event, 'clientX', { value: init.clientX });
  }
  if (init.clientY !== undefined) {
    Object.defineProperty(event, 'clientY', { value: init.clientY });
  }
  return event;
}

function dragStartEvent(): Event {
  const event = new Event('dragstart', { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'dataTransfer', {
    value: { setData: vi.fn(), effectAllowed: '' },
  });
  return event;
}

function mountGrid(layout: WidgetConfig[], props: Record<string, unknown> = {}): VueWrapper {
  return mount(DetailGridEditor, {
    attachTo: document.body,
    props: { layout, widgetTitle, ...props },
    global: { plugins: [Antd, createTestI18n()] },
  });
}

function handleFor(wrapper: VueWrapper, key: string): Element {
  const cell = wrapper.find(`[data-widget-key="${key}"]`);
  const handle = cell.element.querySelector('.detail-grid-editor__handle');
  if (!handle) {
    throw new Error(`No drag handle for ${key}`);
  }
  return handle;
}

function emittedLayouts(wrapper: VueWrapper): WidgetConfig[][] {
  return ((wrapper.emitted('layout-change') ?? []) as unknown[][]).map(
    (args) => args[0] as WidgetConfig[],
  );
}

describe('DetailGridEditor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  it('renders cells and the placeholder last', async () => {
    const wrapper = mountGrid([
      { i: 'KnowledgePanel.Tags', x: 0, y: 0, w: 2, h: 1 },
      { i: PLACEHOLDER, x: 0, y: 1, w: 3, h: 2 },
    ]);
    await flushPromises();
    expect(wrapper.find('[data-testid="detail-widget-cell-KnowledgePanel.Tags"]').exists()).toBe(
      true,
    );
    const grid = wrapper.get('[data-testid="detail-grid-editor"]');
    expect(grid.element.lastElementChild?.querySelector('[data-testid="detail-placeholder-cell"]')).toBeTruthy();
  });

  it('renders live widget content through the #widget slot, title chrome without it (R-EDIT-1)', async () => {
    const layout = [{ i: 'KnowledgePanel.TableSchema', x: 0, y: 0, w: 8, h: 2 }];
    const withSlot = mount(DetailGridEditor, {
      attachTo: document.body,
      props: { layout, widgetTitle, pageType: 'Table' },
      slots: {
        widget: `<template #widget="{ contentKey }"><span data-testid="live-content">{{ contentKey }}</span></template>`,
      },
      global: { plugins: [Antd, createTestI18n()] },
    });
    await flushPromises();
    const live = withSlot.find('[data-testid="live-content"]');
    expect(live.exists()).toBe(true);
    expect(live.text()).toBe('KnowledgePanel.TableSchema');
    // The slot content sits inside the read-only live area, whose
    // CSS turns pointer events off so edit gestures stay with the grid.
    expect(live.element.closest('.detail-grid-editor__live')).not.toBeNull();
    withSlot.unmount();

    const withoutSlot = mountGrid(layout, { pageType: 'Table' });
    await flushPromises();
    expect(withoutSlot.find('[data-testid="live-content"]').exists()).toBe(false);
    expect(
      withoutSlot.find('[data-testid="detail-widget-cell-KnowledgePanel.TableSchema"]').exists(),
    ).toBe(true);
    withoutSlot.unmount();
  });

  it('renders left-panel children in the nested grid', async () => {
    const wrapper = mountGrid([
      {
        i: 'KnowledgePanel.LeftPanel',
        x: 0,
        y: 0,
        w: 6,
        h: 7,
        static: true,
        children: [
          { i: 'KnowledgePanel.Description', x: 0, y: 0, w: 1, h: 2 },
          { i: 'KnowledgePanel.Tags', x: 0, y: 2, w: 1, h: 2 },
        ],
      },
      { i: 'KnowledgePanel.Domain', x: 6, y: 0, w: 2, h: 1 },
    ]);
    await flushPromises();
    expect(wrapper.find('[data-testid="left-panel-drop-target"]').exists()).toBe(true);
    expect(
      wrapper.find('[data-testid="detail-widget-cell-KnowledgePanel.Description"]').exists(),
    ).toBe(true);
    expect(
      wrapper.find('[data-testid="detail-widget-cell-KnowledgePanel.Domain"]').exists(),
    ).toBe(true);
  });

  it('emits remove and placeholder-click', async () => {
    const wrapper = mountGrid([
      { i: 'KnowledgePanel.Tags', x: 0, y: 0, w: 2, h: 1 },
      { i: PLACEHOLDER, x: 0, y: 1, w: 3, h: 2 },
    ]);
    await flushPromises();
    await wrapper.get('[data-testid="widget-remove-KnowledgePanel.Tags"]').trigger('click');
    expect(wrapper.emitted('remove')).toEqual([['KnowledgePanel.Tags']]);
    await wrapper.get('[data-testid="detail-placeholder-cell"]').trigger('click');
    expect(wrapper.emitted('placeholder-click')).toEqual([[PLACEHOLDER]]);
  });

  it('emits widget-width from the width selector', async () => {
    const wrapper = mountGrid([
      { i: 'KnowledgePanel.Tags', x: 0, y: 0, w: 2, h: 1 },
    ]);
    await flushPromises();
    const select = wrapper.findComponent(Select);
    expect(select.exists()).toBe(true);
    await select.vm.$emit('change', 3);
    expect(wrapper.emitted('widget-width')).toEqual([['KnowledgePanel.Tags', 3]]);
  });

  it('column-locks tab drags and pushes the collided widget down', async () => {
    const wrapper = mountGrid([
      { i: 'A', x: 0, y: 0, w: 2, h: 1 },
      { i: 'B', x: 0, y: 1, w: 2, h: 1 },
      { i: 'C', x: 2, y: 0, w: 2, h: 1 },
    ]);
    await flushPromises();
    const grid = wrapper.get('[data-testid="detail-grid-editor"]').element;
    mockRect(grid, rect({ top: 0, left: 0, width: 800, height: 600, right: 800, bottom: 600 }));
    handleFor(wrapper, 'B').dispatchEvent(dragStartEvent());
    // Row 0, far-right x: the column must stay locked to the start x.
    grid.dispatchEvent(dragEvent('dragover', { clientX: 700, clientY: 10 }));
    await flushPromises();
    const layouts = emittedLayouts(wrapper);
    expect(layouts.length).toBeGreaterThan(0);
    const last = layouts[layouts.length - 1];
    const byKey = new Map(last.map((item) => [item.i, item]));
    expect(byKey.get('B')).toMatchObject({ x: 0, y: 0 });
    expect(byKey.get('A')).toMatchObject({ x: 0, y: 1 });
    expect(byKey.get('C')).toMatchObject({ x: 2, y: 0 });
  });

  it('drops a side-column widget into the panel at half width', async () => {
    const wrapper = mountGrid([
      {
        i: 'KnowledgePanel.LeftPanel',
        x: 0,
        y: 0,
        w: 6,
        h: 7,
        static: true,
        children: [{ i: 'KnowledgePanel.Description', x: 0, y: 0, w: 1, h: 2 }],
      },
      { i: 'KnowledgePanel.Domain', x: 6, y: 0, w: 2, h: 1 },
    ]);
    await flushPromises();
    const grid = wrapper.get('[data-testid="detail-grid-editor"]').element;
    const panel = wrapper.get('[data-testid="left-panel-drop-target"]').element;
    mockRect(grid, rect({ top: 0, left: 0, width: 800, height: 600, right: 800, bottom: 600 }));
    mockRect(panel, rect({ top: 0, left: 0, width: 600, height: 800, right: 600, bottom: 800 }));
    handleFor(wrapper, 'KnowledgePanel.Domain').dispatchEvent(dragStartEvent());
    grid.dispatchEvent(dragEvent('dragover', { clientX: 300, clientY: 200 }));
    grid.dispatchEvent(dragEvent('drop', { clientX: 300, clientY: 200 }));
    await flushPromises();
    const layouts = emittedLayouts(wrapper);
    expect(layouts.length).toBeGreaterThan(0);
    const last = layouts[layouts.length - 1];
    const panelWidget = last.find((item) => item.i === 'KnowledgePanel.LeftPanel')!;
    // The stored panel height is never rewritten by the grid.
    expect(panelWidget.h).toBe(7);
    const moved = (panelWidget.children ?? []).find(
      (child) => child.i === 'KnowledgePanel.Domain',
    );
    expect(moved).toBeDefined();
    expect(moved?.w).toBe(0.5);
    expect(last.some((item) => item.i === 'KnowledgePanel.Domain')).toBe(false);
  });

  it('drops a panel child beside the panel', async () => {
    const wrapper = mountGrid([
      {
        i: 'KnowledgePanel.LeftPanel',
        x: 0,
        y: 0,
        w: 6,
        h: 7,
        static: true,
        children: [
          { i: 'KnowledgePanel.Description', x: 0, y: 0, w: 1, h: 2 },
          { i: 'KnowledgePanel.Tags', x: 0, y: 2, w: 1, h: 2 },
        ],
      },
      { i: 'KnowledgePanel.Domain', x: 6, y: 0, w: 2, h: 1 },
    ]);
    await flushPromises();
    const grid = wrapper.get('[data-testid="detail-grid-editor"]').element;
    const panel = wrapper.get('[data-testid="left-panel-drop-target"]').element;
    mockRect(grid, rect({ top: 0, left: 0, width: 800, height: 600, right: 800, bottom: 600 }));
    mockRect(panel, rect({ top: 0, left: 0, width: 600, height: 800, right: 600, bottom: 800 }));
    handleFor(wrapper, 'KnowledgePanel.Tags').dispatchEvent(dragStartEvent());
    grid.dispatchEvent(dragEvent('dragover', { clientX: 700, clientY: 50 }));
    grid.dispatchEvent(dragEvent('drop', { clientX: 700, clientY: 50 }));
    await flushPromises();
    const layouts = emittedLayouts(wrapper);
    expect(layouts.length).toBeGreaterThan(0);
    const last = layouts[layouts.length - 1];
    const panelWidget = last.find((item) => item.i === 'KnowledgePanel.LeftPanel')!;
    expect((panelWidget.children ?? []).some((child) => child.i === 'KnowledgePanel.Tags')).toBe(
      false,
    );
    const moved = last.find((item) => item.i === 'KnowledgePanel.Tags');
    expect(moved).toBeDefined();
    expect(moved?.x).toBe(6);
  });

  it('keeps the last panel widget and emits last-panel-widget-kept', async () => {
    const wrapper = mountGrid([
      {
        i: 'KnowledgePanel.LeftPanel',
        x: 0,
        y: 0,
        w: 6,
        h: 7,
        static: true,
        children: [{ i: 'KnowledgePanel.Description', x: 0, y: 0, w: 1, h: 2 }],
      },
    ]);
    await flushPromises();
    const grid = wrapper.get('[data-testid="detail-grid-editor"]').element;
    const panel = wrapper.get('[data-testid="left-panel-drop-target"]').element;
    mockRect(grid, rect({ top: 0, left: 0, width: 800, height: 600, right: 800, bottom: 600 }));
    mockRect(panel, rect({ top: 0, left: 0, width: 600, height: 800, right: 600, bottom: 800 }));
    handleFor(wrapper, 'KnowledgePanel.Description').dispatchEvent(dragStartEvent());
    grid.dispatchEvent(dragEvent('dragover', { clientX: 700, clientY: 50 }));
    grid.dispatchEvent(dragEvent('drop', { clientX: 700, clientY: 50 }));
    await flushPromises();
    expect(wrapper.emitted('last-panel-widget-kept')).toHaveLength(1);
    expect(wrapper.emitted('layout-change')).toBeUndefined();
  });

  it('resizes by corner drag', async () => {
    const wrapper = mountGrid([{ i: 'A', x: 0, y: 0, w: 2, h: 1 }]);
    await flushPromises();
    const grid = wrapper.get('[data-testid="detail-grid-editor"]').element;
    const cell = wrapper.find('[data-widget-key="A"]').element;
    mockRect(grid, rect({ top: 0, left: 0, width: 800, height: 600, right: 800, bottom: 600 }));
    mockRect(cell, rect({ top: 0, left: 0, width: 188, height: 100, right: 188, bottom: 100 }));
    const handle = wrapper.get('[data-testid="widget-resize-A"]');
    const down = new Event('pointerdown', { bubbles: true, cancelable: true });
    handle.element.dispatchEvent(down);
    const move = new PointerEvent('pointermove', { clientX: 300, clientY: 100 });
    window.dispatchEvent(move);
    await flushPromises();
    window.dispatchEvent(new PointerEvent('pointerup'));
    await flushPromises();
    const layouts = emittedLayouts(wrapper);
    expect(layouts.length).toBeGreaterThan(0);
    const last = layouts[layouts.length - 1];
    expect(last.find((item) => item.i === 'A')).toMatchObject({ w: 3, h: 1 });
  });
});
