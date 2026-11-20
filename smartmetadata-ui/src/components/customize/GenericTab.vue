<!--
  Copyright 2026 SmartMetadata authors.

  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed } from 'vue';
import { resolveWidgetContentKey } from '@/catalog/detailWidgetDispatch';
import {
  GRID_ROW_HEIGHT,
  GRID_VERTICAL_MARGIN,
  TAB_GRID_MAX_COLUMNS,
} from '@/views/admin/persona/editors/customizePageData';
import type { WidgetConfig } from '@/views/admin/persona/editors/customizeTypes';
import {
  getLeftPanelFlowLayout,
  getLeftPanelHeight,
  isLeftPanelWidget,
} from '@/views/admin/persona/editors/gridLayoutUtils';

/**
 * Read-side widget grid for one detail tab: the product equivalent of
 * the official `GenericTab`
 * (`components/Customization/GenericTab/GenericTab.tsx`, pin 392b3efd).
 * The layout is resolved upstream (`customizeWidgetLayout`) and passed
 * in; this component only places cells and offers each widget to the
 * `widget` scoped slot with its dispatch content key. It renders no
 * content itself, drags nothing, resizes nothing, and never falls
 * back: an empty layout renders an empty grid, and a widget whose id
 * resolves to no content key renders an empty cell that still
 * occupies its grid space (official `GenericTab.tsx:48-64` maps the
 * layout with no empty-layout or no-match branch, and
 * `getWidgetsFromKey` returning `null` leaves the cell in place).
 *
 * Geometry mirrors the official grid
 * (`GenericTab.tsx:82-102`, `constants/CustomizeWidgets.constants.ts:22-24`):
 * 8 columns, 100px rows, 16px gaps, no drag/resize. Cells are placed
 * by the stored coordinates (`gridColumn: x+1 / span w`,
 * `gridRow: y+1 / span h`), the same formula the detail editor uses
 * (`DetailGridEditor.vue` `cellStyle`). Rows are content-sized
 * (`minmax(100px, auto)`), which is the CSS-grid form of the official
 * dynamic-height behavior without the `ResizeObserver` measurement
 * loop (`DynamicHeightWidget.tsx`).
 *
 * One bounded adaptation to that formula: grid line numbers and spans
 * must be integers — a fractional span makes the whole declaration
 * invalid and the browser drops it (verified in Firefox 2026-11-18:
 * `grid-row: 1 / span 2.5` computes to `auto` and the item
 * auto-places to the wrong row). Stored layouts do carry fractional
 * geometry (default tables hold `h` values like 8.5/10.5 from height
 * sums plus the 0.5 panel padding, and `w: 0.5` children), and an
 * untouched default widget keeps its fractions through an editor
 * save. So start lines are floored (clamped to >= 1) and spans are
 * ceiled (clamped to >= 1): the cell always covers its stored rect,
 * never clips, at the cost of under one row/column of extra space.
 * Official react-grid-layout positions fractionally in pixels; the
 * integer rounding is the CSS-grid price of that equivalence, not a
 * silent default — the stored coordinates still decide placement.
 * Two disclosed consequences (m-4/m-5): floor/ceil does not clip, so
 * two adjacent fractional cells can theoretically overlap by under
 * one row/column. That overlap was not the rounding's fault — the
 * stored default layouts themselves carry overlapping right-column
 * rects (pin `TableClassBase.ts:142-246`: FJT y0 h2, AssetHealth y1
 * h3, DataProducts y2 h2, Tags y3 h2, ...), which only the official
 * grid's vertical compaction separates at render time. The read side
 * now compacts the same way (`customizeWidgetLayout.ts`
 * `resolveWidgetLayout`, a port of react-grid-layout v1 `compact`):
 * stored rects are left untouched, and the compaction runs before
 * the floor/ceil, so floor/ceil only ever handles the residual
 * fractional panel heights, not stored overlaps. And direction:
 * official `useGridLayoutDirection`
 * (`hooks/useGridLayoutDirection.ts:16-32`, called at
 * `GenericTab.tsx:76`) forces the grid container to `dir="ltr"`
 * with children following `i18n.dir()`; the product ships only
 * en/zh, both LTR, so the omission has zero actual effect.
 *
 * The left panel is structural, as officially: the panel widget
 * itself is never offered to the slot. Its children render inside
 * the panel cell, ordered and line-wrapped by the shared flow helper
 * (`getLeftPanelFlowLayout`, the port of official
 * `GridLayoutDragUtils.ts:141`), one flex line per flow line, each
 * child offered to the slot with its own content key. Officially the
 * same split happens in `LeftPanelWidget` /
 * `LeftPanelContainer.tsx:169-182` (view mode: children ordered by
 * row then column, each resolved through `getWidgetsFromKey`). The
 * panel cell spans `max(stored h, flowed children height)`, the
 * editor's `panelSpan` rule, so a stale stored height cannot clip
 * the children. Children of non-panel widgets are ignored: the
 * editor only ever writes `children` under the panel
 * (`gridLayoutUtils.ts` `placeWidgetInLeftPanel` /
 * `placeWidgetBesideLeftPanel`, `DetailGridEditor.vue` layout
 * updates, `CustomizeTabWidget.vue` removal), and every default
 * layout carries `children` only on `KnowledgePanel.LeftPanel`
 * entries — the same single-level nesting official read code
 * assumes (`LeftPanelWidget.tsx:43` reads only the panel's
 * `children`).
 *
 * What was and was not carried over from `generic-tab.less`:
 *
 * - Carried: the container framing rule — the grid carries a surface
 *   background, radius, and padding only when no left panel is
 *   present (official `custom-tab` class, `:38-42`, gated by the
 *   `leftSideWidgetPresent` check at `GenericTab.tsx:69-73`); with a
 *   panel the container stays transparent so panel widgets line up
 *   flush with the page edges (`:44-48`). The styling itself is
 *   product tokens only, no official visuals.
 * - Not carried: the drag/placeholder rules (`.react-draggable-dragging`,
 *   `.react-grid-placeholder`) — read mode has no dragging; the
 *   `.dynamic-height-widget` fixed min-height — rows are
 *   content-sized here; and the Glossary `height-auto` class
 *   (`GenericTab.tsx:88`, less `:58-60`) — it exists to undo a
 *   react-grid-layout measured container height, and a CSS grid
 *   container is intrinsically auto-height, so there is no
 *   equivalent rule to write.
 */

const props = defineProps<{
  layout: WidgetConfig[];
  pageType: string;
}>();

defineSlots<{
  widget(props: { widget: WidgetConfig; contentKey: string | null }): unknown;
}>();

const hasLeftPanel = computed(() => props.layout.some(isLeftPanelWidget));

const gridStyle = computed(() => ({
  gridTemplateColumns: `repeat(${TAB_GRID_MAX_COLUMNS}, minmax(0, 1fr))`,
  gridAutoRows: `minmax(${GRID_ROW_HEIGHT}px, auto)`,
  gap: `${GRID_VERTICAL_MARGIN}px`,
}));

function cellStyle(widget: WidgetConfig): Record<string, string> {
  return {
    gridColumn: `${Math.max(1, Math.floor(widget.x) + 1)} / span ${Math.max(1, Math.ceil(widget.w))}`,
    gridRow: `${Math.max(1, Math.floor(widget.y) + 1)} / span ${Math.max(1, Math.ceil(widget.h))}`,
  };
}

function panelCellStyle(panel: WidgetConfig): Record<string, string> {
  const span = Math.max(panel.h, getLeftPanelHeight(panel.children ?? []));
  return {
    gridColumn: `${Math.max(1, Math.floor(panel.x) + 1)} / span ${Math.max(1, Math.ceil(panel.w))}`,
    gridRow: `${Math.max(1, Math.floor(panel.y) + 1)} / span ${Math.max(1, Math.ceil(span))}`,
  };
}

/** Flowed children grouped into lines: one group per flow `y`. */
function panelLines(panel: WidgetConfig): WidgetConfig[][] {
  const lines: WidgetConfig[][] = [];
  for (const child of getLeftPanelFlowLayout(panel.children ?? [])) {
    const current = lines[lines.length - 1];
    if (current && current[0].y === child.y) {
      current.push(child);
    } else {
      lines.push([child]);
    }
  }
  return lines;
}

function panelChildStyle(child: WidgetConfig): Record<string, string> {
  return { flex: `${child.w} 1 0%` };
}

function contentKeyFor(widget: WidgetConfig): string | null {
  return resolveWidgetContentKey(props.pageType, widget.i);
}
</script>

<template>
  <div
    class="generic-tab"
    :class="{ 'generic-tab--framed': !hasLeftPanel }"
    :style="gridStyle"
  >
    <template v-for="widget in layout" :key="widget.i">
      <div
        v-if="isLeftPanelWidget(widget)"
        :id="widget.i"
        :data-testid="widget.i"
        class="generic-tab__panel"
        :style="panelCellStyle(widget)"
      >
        <div
          v-for="(line, lineIndex) in panelLines(widget)"
          :key="lineIndex"
          class="generic-tab__panel-line"
        >
          <div
            v-for="child in line"
            :key="child.i"
            :id="child.i"
            :data-testid="child.i"
            class="generic-tab__panel-child"
            :style="panelChildStyle(child)"
          >
            <slot name="widget" :widget="child" :content-key="contentKeyFor(child)" />
          </div>
        </div>
      </div>
      <div
        v-else
        :id="widget.i"
        :data-testid="widget.i"
        class="generic-tab__cell"
        :style="cellStyle(widget)"
      >
        <slot name="widget" :widget="widget" :content-key="contentKeyFor(widget)" />
      </div>
    </template>
  </div>
</template>

<style scoped>
.generic-tab {
  display: grid;
  min-width: 0;
}

.generic-tab--framed {
  background: var(--sm-bg-container);
  border-radius: var(--sm-radius-card);
  padding: 12px;
}

.generic-tab__cell {
  min-width: 0;
  min-height: 0;
}

.generic-tab__panel {
  min-width: 0;
  min-height: 0;
}

.generic-tab__panel-line {
  display: flex;
  gap: 16px;
}

.generic-tab__panel-line + .generic-tab__panel-line {
  margin-top: 16px;
}

.generic-tab__panel-child {
  min-width: 0;
  min-height: 0;
}
</style>
