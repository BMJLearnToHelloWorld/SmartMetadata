/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may
 * not use this file except in compliance with the License. You may obtain
 * a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { h, type VNode } from 'vue';
import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import { DetailWidgetKeys } from '@/catalog/detailWidgetDispatch';
import type { WidgetConfig } from '@/views/admin/persona/editors/customizeTypes';
import GenericTab from './GenericTab.vue';

interface SlotCall {
  widget: WidgetConfig;
  contentKey: string | null;
}

function widget(i: string, overrides: Partial<WidgetConfig> = {}): WidgetConfig {
  return { i, x: 0, y: 0, w: 6, h: 2, ...overrides };
}

function mountTab(layout: WidgetConfig[], pageType = 'Table') {
  const calls: SlotCall[] = [];
  const wrapper = mount(GenericTab, {
    props: { layout, pageType },
    slots: {
      widget: (props: SlotCall): VNode => {
        calls.push({ widget: props.widget, contentKey: props.contentKey });
        return h(
          'div',
          {
            class: 'slot-marker',
            'data-widget': props.widget.i,
            'data-content-key': props.contentKey ?? 'null',
          },
          props.widget.i,
        );
      },
    },
  });
  return { wrapper, calls };
}

describe('GenericTab', () => {
  it('renders the grid container with 8 columns, 100px rows, and 16px gaps', () => {
    const { wrapper } = mountTab([widget('KnowledgePanel.Description')]);
    const grid = wrapper.find('.generic-tab');
    expect(grid.exists()).toBe(true);
    const style = grid.attributes('style') as string;
    expect(style).toContain('grid-template-columns: repeat(8, minmax(0, 1fr))');
    expect(style).toContain('grid-auto-rows: minmax(100px, auto)');
    expect(style).toContain('gap: 16px');
  });

  it('places cells by stored coordinates with id and data-testid', () => {
    const { wrapper } = mountTab([
      widget('KnowledgePanel.Description', { x: 0, y: 0, w: 2, h: 1 }),
      widget('KnowledgePanel.TableSchema', { x: 2, y: 1, w: 6, h: 2 }),
    ]);
    const first = wrapper.find('[data-testid="KnowledgePanel.Description"]');
    expect(first.attributes('id')).toBe('KnowledgePanel.Description');
    expect(first.attributes('style')).toContain('grid-column: 1 / span 2');
    expect(first.attributes('style')).toContain('grid-row: 1 / span 1');
    const second = wrapper.find('[data-testid="KnowledgePanel.TableSchema"]');
    expect(second.attributes('id')).toBe('KnowledgePanel.TableSchema');
    expect(second.attributes('style')).toContain('grid-column: 3 / span 6');
    expect(second.attributes('style')).toContain('grid-row: 2 / span 2');
  });

  it('offers each widget to the slot with its dispatch content key', () => {
    const { calls } = mountTab([
      widget('KnowledgePanel.TableSchema-1', { x: 0, y: 0, w: 8, h: 2 }),
      widget('KnowledgePanel.Description', { x: 0, y: 2, w: 8, h: 2 }),
    ]);
    expect(calls.map((call) => call.widget.i)).toEqual([
      'KnowledgePanel.TableSchema-1',
      'KnowledgePanel.Description',
    ]);
    expect(calls.map((call) => call.contentKey)).toEqual([
      DetailWidgetKeys.TABLE_SCHEMA,
      DetailWidgetKeys.DESCRIPTION,
    ]);
  });

  it('renders an empty grid container for an empty layout, with no fallback text', () => {
    const { wrapper } = mountTab([]);
    expect(wrapper.find('.generic-tab').exists()).toBe(true);
    expect(wrapper.findAll('.generic-tab__cell')).toHaveLength(0);
    expect(wrapper.findAll('.generic-tab__panel')).toHaveLength(0);
    expect(wrapper.text()).toBe('');
  });

  it('renders an empty cell occupying grid space for a null content key', () => {
    const { wrapper, calls } = mountTab([
      widget('KnowledgePanel.Nope', { x: 1, y: 2, w: 4, h: 3 }),
    ]);
    expect(calls).toHaveLength(1);
    expect(calls[0].contentKey).toBeNull();
    const cell = wrapper.find('[data-testid="KnowledgePanel.Nope"]');
    expect(cell.exists()).toBe(true);
    expect(cell.attributes('style')).toContain('grid-column: 2 / span 4');
    expect(cell.attributes('style')).toContain('grid-row: 3 / span 3');
  });

  it('never offers the left panel to the slot; its children render inside the panel cell', () => {
    const { wrapper, calls } = mountTab([
      widget('KnowledgePanel.LeftPanel', {
        x: 0,
        y: 0,
        w: 6,
        h: 4,
        children: [
          widget('KnowledgePanel.Description', { x: 0, y: 0, w: 1, h: 2 }),
          widget('KnowledgePanel.Tags', { x: 0, y: 2, w: 1, h: 2 }),
        ],
      }),
      widget('KnowledgePanel.TableSchema', { x: 6, y: 0, w: 2, h: 4 }),
    ]);
    expect(calls.map((call) => call.widget.i)).toEqual([
      'KnowledgePanel.Description',
      'KnowledgePanel.Tags',
      'KnowledgePanel.TableSchema',
    ]);
    expect(calls.map((call) => call.contentKey)).toEqual([
      DetailWidgetKeys.DESCRIPTION,
      DetailWidgetKeys.TAGS,
      DetailWidgetKeys.TABLE_SCHEMA,
    ]);
    const panel = wrapper.find('.generic-tab__panel');
    expect(panel.attributes('id')).toBe('KnowledgePanel.LeftPanel');
    expect(panel.attributes('data-testid')).toBe('KnowledgePanel.LeftPanel');
    expect(panel.find('[data-testid="KnowledgePanel.Description"]').exists()).toBe(true);
    expect(panel.find('[data-testid="KnowledgePanel.Tags"]').exists()).toBe(true);
    // The panel cell itself carries no slot marker: only its children do.
    expect(panel.findAll('.slot-marker')).toHaveLength(2);
  });

  it('orders panel children by flow position and groups half-width pairs into lines', () => {
    const { wrapper } = mountTab([
      widget('KnowledgePanel.LeftPanel', {
        x: 0,
        y: 0,
        w: 6,
        h: 4,
        children: [
          widget('KnowledgePanel.Tags', { x: 0, y: 2, w: 1, h: 1 }),
          widget('KnowledgePanel.Description', { x: 0, y: 0, w: 0.5, h: 1 }),
          widget('KnowledgePanel.Domain', { x: 0.5, y: 0, w: 0.5, h: 1 }),
        ],
      }),
    ]);
    const lines = wrapper.findAll('.generic-tab__panel-line');
    expect(lines).toHaveLength(2);
    expect(
      lines[0].findAll('.generic-tab__panel-child').map((child) => child.attributes('data-testid')),
    ).toEqual(['KnowledgePanel.Description', 'KnowledgePanel.Domain']);
    expect(
      lines[1].findAll('.generic-tab__panel-child').map((child) => child.attributes('data-testid')),
    ).toEqual(['KnowledgePanel.Tags']);
  });

  it('spans the panel cell by the flowed children height when it exceeds the stored height', () => {
    const { wrapper } = mountTab([
      widget('KnowledgePanel.LeftPanel', {
        x: 0,
        y: 0,
        w: 6,
        h: 1,
        children: [
          widget('KnowledgePanel.Description', { x: 0, y: 0, w: 1, h: 2 }),
          widget('KnowledgePanel.Tags', { x: 0, y: 2, w: 1, h: 2 }),
        ],
      }),
    ]);
    expect(wrapper.find('.generic-tab__panel').attributes('style')).toContain('grid-row: 1 / span 4');
  });

  it('keeps the stored panel height when it exceeds the flowed children height', () => {
    const { wrapper } = mountTab([
      widget('KnowledgePanel.LeftPanel', {
        x: 0,
        y: 0,
        w: 6,
        h: 5,
        children: [widget('KnowledgePanel.Description', { x: 0, y: 0, w: 1, h: 2 })],
      }),
    ]);
    expect(wrapper.find('.generic-tab__panel').attributes('style')).toContain('grid-row: 1 / span 5');
  });

  it('renders a childless panel as an empty cell with no slot offers', () => {
    const { wrapper, calls } = mountTab([
      widget('KnowledgePanel.LeftPanel', { x: 0, y: 0, w: 6, h: 2, children: [] }),
    ]);
    expect(calls).toHaveLength(0);
    expect(wrapper.findAll('.generic-tab__panel')).toHaveLength(1);
    expect(wrapper.findAll('.generic-tab__panel-line')).toHaveLength(0);
  });

  it('ignores children of non-panel widgets', () => {
    const { calls } = mountTab([
      widget('KnowledgePanel.Description', {
        x: 0,
        y: 0,
        w: 6,
        h: 2,
        children: [widget('KnowledgePanel.Tags', { x: 0, y: 0, w: 1, h: 1 })],
      }),
    ]);
    expect(calls.map((call) => call.widget.i)).toEqual(['KnowledgePanel.Description']);
  });

  it('frames the container only when no left panel is present', () => {
    const withoutPanel = mountTab([widget('KnowledgePanel.Description')]);
    expect(withoutPanel.wrapper.find('.generic-tab').classes()).toContain('generic-tab--framed');
    const withPanel = mountTab([
      widget('KnowledgePanel.LeftPanel', { x: 0, y: 0, w: 6, h: 2, children: [] }),
    ]);
    expect(withPanel.wrapper.find('.generic-tab').classes()).not.toContain('generic-tab--framed');
  });

  it('has no drag or resize affordances', () => {
    const { wrapper } = mountTab([widget('KnowledgePanel.Description')]);
    expect(wrapper.find('[draggable="true"]').exists()).toBe(false);
    expect(wrapper.html()).not.toContain('resize');
    expect(wrapper.html()).not.toContain('drag');
  });

  it('integerizes fractional geometry so the placement declarations stay valid', () => {
    // Stored layouts carry fractional h/w (default tables: h 8.5/10.5,
    // w 0.5); a fractional span is dropped by the browser, so starts
    // floor and spans ceil, always covering the stored rect.
    const { wrapper } = mountTab([
      widget('KnowledgePanel.Description', { x: 0.5, y: 0.5, w: 0.5, h: 2.5 }),
      widget('KnowledgePanel.TableSchema', { x: 2, y: 1, w: 6, h: 1.5 }),
    ]);
    const first = wrapper.find('[data-testid="KnowledgePanel.Description"]');
    expect(first.attributes('style')).toContain('grid-column: 1 / span 1');
    expect(first.attributes('style')).toContain('grid-row: 1 / span 3');
    const second = wrapper.find('[data-testid="KnowledgePanel.TableSchema"]');
    expect(second.attributes('style')).toContain('grid-row: 2 / span 2');
  });

  it('ceils a fractional panel span from the stored height or the flowed height', () => {
    const { wrapper } = mountTab([
      widget('KnowledgePanel.LeftPanel', {
        x: 0,
        y: 0,
        w: 6,
        h: 4.5,
        children: [widget('KnowledgePanel.Description', { x: 0, y: 0, w: 1, h: 2 })],
      }),
    ]);
    expect(wrapper.find('.generic-tab__panel').attributes('style')).toContain('grid-row: 1 / span 5');
  });
});
