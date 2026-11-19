<!--
  Copyright 2026 SmartMetadata authors.

  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { Button, Select } from 'ant-design-vue';
import { resolveWidgetContentKey } from '@/catalog/detailWidgetDispatch';
import {
  EMPTY_WIDGET_PLACEHOLDER_KEY,
  FULL_PANEL_WIDTH,
  HALF_PANEL_WIDTH,
  getGridRowAt,
  getLeftPanelFlowLayout,
  getLeftPanelHeight,
  isLeftPanelWidget,
  placeWidgetBesideLeftPanel,
  placeWidgetInLeftPanel,
  toLeftPanelEditGrid,
} from './gridLayoutUtils';
import type { WidgetConfig } from './customizeTypes';

/**
 * Light 8-column grid engine for the C-4 detail/marketplace editors
 * (b*: behavior + save-semantics equivalence with official
 * react-grid-layout, not the same framework). Reuses the proven
 * CustomizeMyData light-drag pattern (CSS grid + HTML5 drag, drag
 * handle, pointer-cell computation).
 *
 * Official behaviors reproduced here:
 * - Column-locked tab drag: a dragged widget keeps its start column
 *   and only reorders vertically (GridLayoutDragUtils
 *   getColumnLockedDragHandlers, applied to every tab-grid drag).
 * - Left-panel cross-drop (useLeftPanelCrossDrop): pointer hit-test
 *   against the panel box; into the panel at the flow drop point
 *   (half/full width by origin column), out of the panel into the
 *   side column; the panel keeps at least one widget.
 * - Left-panel nested edit grid (to/fromLeftPanelEditGrid) with flow
 *   layout; the panel cell spans the flowed height.
 * - Resize by corner drag (RGL default resizable on the entity edit
 *   side; the marketplace/landing grids pass resizable=false).
 * - Empty-widget placeholder rendered last, never draggable.
 *
 * The grid is controlled: every change emits `layout-change` with the
 * full layout (placeholder included, children flowed, panel height
 * refreshed); the parent strips the placeholder for persistence.
 */
const props = withDefaults(
  defineProps<{
    layout: WidgetConfig[];
    cols?: number;
    rowHeight?: number;
    gap?: number;
    rowGap?: number;
    resizable?: boolean;
    removable?: boolean;
    forceFullWidth?: boolean;
    /**
     * Page type the grid edits. The `#widget` slot reports the
     * content key for each widget (official GenericWidget dispatch);
     * without it every content key is null and cells keep title
     * chrome only.
     */
    pageType?: string;
    widgetTitle: (widget: WidgetConfig) => string;
  }>(),
  { cols: 8, rowHeight: 100, gap: 16, rowGap: undefined, resizable: true, removable: true, forceFullWidth: false },
);

const emit = defineEmits<{
  'layout-change': [layout: WidgetConfig[]];
  remove: [key: string];
  'widget-width': [key: string, width: number];
  'placeholder-click': [key: string];
  'last-panel-widget-kept': [];
}>();

const { t } = useI18n();

const effectiveRowGap = computed(() => props.rowGap ?? props.gap);

const gridRef = ref<HTMLElement | null>(null);
// The panel cell lives inside a v-for, so a template ref would collect
// an array; use a callback ref to keep the single panel element.
let panelEl: HTMLElement | null = null;

function setPanelRef(el: unknown): void {
  panelEl = el as HTMLElement | null;
}

const WIDTH_OPTIONS = [1, 2, 3, 8];

function isPlaceholder(widget: WidgetConfig): boolean {
  return widget.i === EMPTY_WIDGET_PLACEHOLDER_KEY;
}

/**
 * Read-side dispatch, shared with GenericTab: the content key for a
 * widget id on this page, or null when the page has no content for it
 * (the cell then keeps its title chrome).
 */
function contentKeyFor(widget: WidgetConfig): string | null {
  return resolveWidgetContentKey(props.pageType ?? '', widget.i);
}

const panelWidget = computed(() => props.layout.find(isLeftPanelWidget));
const realWidgets = computed(() => props.layout.filter((widget) => !isPlaceholder(widget)));
const placeholderWidget = computed(() => props.layout.find(isPlaceholder));

const panelChildrenFlow = computed(() =>
  getLeftPanelFlowLayout(panelWidget.value?.children ?? []),
);
const panelCols = computed(() => panelWidget.value?.w ?? 6);
const panelSpan = computed(() =>
  Math.max(panelWidget.value?.h ?? 0, getLeftPanelHeight(panelWidget.value?.children ?? [])),
);
const maxRow = computed(() =>
  realWidgets.value.reduce((max, widget) => Math.max(max, widget.y + widget.h), 0),
);

function cellStyle(widget: WidgetConfig): Record<string, string> {
  return {
    gridColumn: `${widget.x + 1} / span ${widget.w}`,
    gridRow: `${widget.y + 1} / span ${widget.h}`,
  };
}

function panelCellStyle(widget: WidgetConfig): Record<string, string> {
  return {
    gridColumn: `${widget.x + 1} / span ${widget.w}`,
    gridRow: `${widget.y + 1} / span ${panelSpan.value}`,
  };
}

function childCellStyle(widget: WidgetConfig): Record<string, string> {
  const edit = toLeftPanelEditGrid(widget, panelCols.value);
  return {
    gridColumn: `${edit.x + 1} / span ${Math.max(1, edit.w)}`,
    gridRow: `${edit.y + 1} / span ${edit.h}`,
  };
}

function collides(a: WidgetConfig, b: WidgetConfig): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

function compactWithObstacles(
  items: WidgetConfig[],
  obstacles: WidgetConfig[],
): WidgetConfig[] {
  const placed: WidgetConfig[] = [...obstacles];
  const ordered = [...items].sort((a, b) => a.y - b.y || a.x - b.x);
  const result: WidgetConfig[] = [];
  for (const item of ordered) {
    let y = item.y;
    if (!item.static) {
      while (
        y > 0 &&
        !placed.some((other) => other.i !== item.i && collides({ ...item, y: y - 1 }, other))
      ) {
        y -= 1;
      }
      // A dragged/resized item may land on others: push the collided
      // item down below the collider (RGL moveElement displacement),
      // re-checking against every placed item.
      let guard = 0;
      let hit = placed.find((other) => other.i !== item.i && collides({ ...item, y }, other));
      while (hit && guard < 100) {
        guard += 1;
        y = hit.y + hit.h;
        hit = placed.find((other) => other.i !== item.i && collides({ ...item, y }, other));
      }
    }
    const settled = { ...item, y };
    placed.push(settled);
    result.push(settled);
  }
  return result;
}

/** Reflow after moving/resizing one item: others compact around it. */
function reflowAround(layout: WidgetConfig[], movedKey: string): WidgetConfig[] {
  const moved = layout.find((widget) => widget.i === movedKey);
  if (!moved) {
    return layout;
  }
  const rest = layout.filter((widget) => widget.i !== movedKey);
  const settled = compactWithObstacles(rest, [moved]);
  const byKey = new Map(settled.map((widget) => [widget.i, widget]));
  return layout.map((widget) => byKey.get(widget.i) ?? widget);
}

function emitLayout(next: WidgetConfig[]): void {
  const placeholder = next.find(isPlaceholder);
  const real = next.filter((widget) => !isPlaceholder(widget));
  // The panel's height comes from the widgets inside it, for the grid
  // only (panelSpan at render), so it is NOT saved over the stored one
  // (official CustomizeTabWidget: "keep the stored height").
  emit('layout-change', placeholder ? [...real, placeholder] : real);
}

function childBaseKey(widget: WidgetConfig): string {
  return widget.i.split('-')[0];
}

// --- Drag state -------------------------------------------------------

interface DragState {
  key: string;
  origin: 'tab' | 'panel';
  startX: number;
  fromSideColumn: boolean;
}

const dragState = ref<DragState | null>(null);
const dropTarget = ref<'panel' | 'beside' | null>(null);
const lastDragCell = ref<string | null>(null);

function findWidget(key: string): { widget: WidgetConfig; origin: 'tab' | 'panel' } | null {
  const tabWidget = props.layout.find((widget) => widget.i === key);
  if (tabWidget) {
    return { widget: tabWidget, origin: 'tab' };
  }
  const child = panelWidget.value?.children?.find((widget) => widget.i === key);
  if (child) {
    return { widget: child, origin: 'panel' };
  }
  return null;
}

function onDragStart(event: DragEvent, key: string): void {
  const found = findWidget(key);
  if (!found || !event.dataTransfer) {
    event.preventDefault();
    return;
  }
  const panel = panelWidget.value;
  dragState.value = {
    key,
    origin: found.origin,
    startX: found.widget.x,
    fromSideColumn: panel ? found.widget.x >= panel.x + panel.w : false,
  };
  lastDragCell.value = null;
  dropTarget.value = null;
  event.dataTransfer.effectAllowed = 'move';
  event.dataTransfer.setData('text/plain', key);
}

function pointerTarget(event: DragEvent): 'panel' | 'beside' | null {
  if (!panelEl) {
    return null;
  }
  const rect = panelEl.getBoundingClientRect();
  if (event.clientX > rect.right) {
    return 'beside';
  }
  if (event.clientX >= rect.left && event.clientY >= rect.top && event.clientY <= rect.bottom) {
    return 'panel';
  }
  return null;
}

function rowFromPointer(event: DragEvent): number {
  const grid = gridRef.value;
  if (!grid) {
    return 0;
  }
  const rect = grid.getBoundingClientRect();
  return Math.max(
    0,
    Math.floor((event.clientY - rect.top) / (props.rowHeight + effectiveRowGap.value)),
  );
}

function moveChildWithinPanel(
  children: WidgetConfig[],
  key: string,
  row: number,
  xFraction: number,
): WidgetConfig[] {
  const widget = children.find((child) => child.i === key);
  if (!widget) {
    return children;
  }
  const flowed = getLeftPanelFlowLayout(children.filter((child) => child.i !== key));
  const landedOn = flowed.findIndex(
    (child) => child.y > row || (child.y === row && child.x >= xFraction),
  );
  const at = landedOn === -1 ? flowed.length : landedOn;
  const next = [...flowed.slice(0, at), widget, ...flowed.slice(at)];
  // Re-flow from the insertion order (same flow as placeWidgetInLeftPanel).
  let lineTop = 0;
  let lineHeight = 0;
  let lineEnd = 0;
  return next.map((child) => {
    if (lineEnd + child.w > FULL_PANEL_WIDTH + 1e-9) {
      lineTop += lineHeight;
      lineHeight = 0;
      lineEnd = 0;
    }
    const placed = { ...child, x: lineEnd, y: lineTop };
    lineEnd += child.w;
    lineHeight = Math.max(lineHeight, child.h);
    return placed;
  });
}

function onDragOver(event: DragEvent): void {
  const state = dragState.value;
  if (!state || !gridRef.value) {
    return;
  }
  event.preventDefault();
  const target = pointerTarget(event);
  const panelRect = panelEl?.getBoundingClientRect();

  if (state.origin === 'tab' && target === 'panel') {
    dropTarget.value = 'panel';
    return;
  }
  if (state.origin === 'panel' && target === 'beside') {
    dropTarget.value = 'beside';
    return;
  }
  dropTarget.value = null;

  if (state.origin === 'tab') {
    const row = rowFromPointer(event);
    const cellKey = `tab:${row}`;
    if (lastDragCell.value === cellKey) {
      return;
    }
    lastDragCell.value = cellKey;
    const moved = props.layout.map((widget) =>
      widget.i === state.key
        ? {
            ...widget,
            x: props.forceFullWidth ? 0 : state.startX,
            w: props.forceFullWidth ? props.cols : widget.w,
            y: row,
          }
        : widget,
    );
    emitLayout(reflowAround(moved.filter((w) => !isPlaceholder(w)), state.key).concat(
      moved.filter(isPlaceholder),
    ));
    return;
  }

  // Within-panel reorder: row + left/right half from the pointer.
  if (!panelRect) {
    return;
  }
  const row = getGridRowAt(event.clientY - panelRect.top);
  const xFraction = event.clientX < panelRect.left + panelRect.width / 2 ? 0 : HALF_PANEL_WIDTH;
  const cellKey = `panel:${row}:${xFraction}`;
  if (lastDragCell.value === cellKey) {
    return;
  }
  lastDragCell.value = cellKey;
  const panel = panelWidget.value;
  if (!panel) {
    return;
  }
  const nextChildren = moveChildWithinPanel(panel.children ?? [], state.key, row, xFraction);
  emitLayout(
    props.layout.map((widget) =>
      isLeftPanelWidget(widget) ? { ...widget, children: nextChildren } : widget,
    ),
  );
}

function onDrop(event: DragEvent): void {
  const state = dragState.value;
  const target = dropTarget.value;
  dragState.value = null;
  dropTarget.value = null;
  lastDragCell.value = null;
  if (!state || !target) {
    return;
  }
  event.preventDefault();
  const panel = panelWidget.value;
  if (!panelEl || !panel) {
    return;
  }
  const rect = panelEl.getBoundingClientRect();
  const found = findWidget(state.key);
  if (!found) {
    return;
  }

  if (target === 'panel' && state.origin === 'tab') {
    const row = getGridRowAt(event.clientY - rect.top);
    const x = event.clientX < rect.left + rect.width / 2 ? 0 : HALF_PANEL_WIDTH;
    const w = state.fromSideColumn ? HALF_PANEL_WIDTH : FULL_PANEL_WIDTH;
    emitLayout(placeWidgetInLeftPanel(realWidgets.value, found.widget, { row, x, w }));
    return;
  }

  if (target === 'beside' && state.origin === 'panel') {
    const children = panel.children ?? [];
    if (children.length === 1) {
      emit('last-panel-widget-kept');
      return;
    }
    const row = panel.y + getGridRowAt(event.clientY - rect.top);
    const widgetInPanelUnits = found.widget;
    emitLayout(
      placeWidgetBesideLeftPanel(realWidgets.value, widgetInPanelUnits, row, props.cols),
    );
  }
}

function onDragEnd(): void {
  dragState.value = null;
  dropTarget.value = null;
  lastDragCell.value = null;
}

// --- Resize -----------------------------------------------------------

const resizing = ref<string | null>(null);

function onResizeStart(event: PointerEvent, widget: WidgetConfig): void {
  if (!props.resizable || widget.static || isPlaceholder(widget)) {
    return;
  }
  event.preventDefault();
  event.stopPropagation();
  resizing.value = widget.i;
  const cell = (event.target as HTMLElement).closest('[data-widget-key]') as HTMLElement | null;
  const grid = gridRef.value;
  if (!cell || !grid) {
    return;
  }
  const cellRect = cell.getBoundingClientRect();
  const gridRect = grid.getBoundingClientRect();
  const colWidth = (gridRect.width - props.gap * (props.cols - 1)) / props.cols;

  const onMove = (moveEvent: PointerEvent): void => {
    const w = Math.max(
      1,
      Math.min(props.cols - widget.x, Math.round((moveEvent.clientX - cellRect.left + props.gap) / (colWidth + props.gap))),
    );
    const h = Math.max(
      1,
      Math.round((moveEvent.clientY - cellRect.top + effectiveRowGap.value) / (props.rowHeight + effectiveRowGap.value)),
    );
    const moved = props.layout.map((item) =>
      item.i === widget.i ? { ...item, w, h } : item,
    );
    emitLayout(reflowAround(moved.filter((item) => !isPlaceholder(item)), widget.i).concat(
      moved.filter(isPlaceholder),
    ));
  };
  const onUp = (): void => {
    resizing.value = null;
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
  };
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
}

function onWidthChange(widget: WidgetConfig, width: number): void {
  emit('widget-width', widget.i, width);
}
</script>

<template>
  <div
    ref="gridRef"
    class="detail-grid-editor"
    data-testid="detail-grid-editor"
    :style="{
      gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
      gridAutoRows: `${rowHeight}px`,
      gap: `${effectiveRowGap}px ${gap}px`,
    }"
    @dragover.prevent="onDragOver"
    @drop.prevent="onDrop"
    @dragend="onDragEnd"
  >
    <template v-for="widget in realWidgets" :key="widget.i">
      <!-- Left panel: static cell with a nested flow grid. -->
      <div
        v-if="isLeftPanelWidget(widget)"
        :ref="setPanelRef"
        class="detail-grid-editor__panel"
        :class="{ 'detail-grid-editor__panel--drop': dropTarget === 'panel' }"
        :data-widget-key="widget.i"
        data-testid="left-panel-drop-target"
        :style="panelCellStyle(widget)"
      >
        <div
          class="detail-grid-editor__panel-grid"
          :style="{
            gridTemplateColumns: `repeat(${panelCols}, minmax(0, 1fr))`,
            gridAutoRows: `${rowHeight}px`,
            gap: `${gap}px`,
          }"
        >
          <div
            v-for="child in panelChildrenFlow"
            :key="child.i"
            class="detail-grid-editor__cell"
            :data-widget-key="child.i"
            :data-testid="`detail-widget-cell-${childBaseKey(child)}`"
            :style="childCellStyle(child)"
          >
            <div class="detail-grid-editor__card">
              <div class="detail-grid-editor__header">
                <span
                  class="drag-widget-icon detail-grid-editor__handle"
                  draggable="true"
                  @dragstart="onDragStart($event, child.i)"
                >⠿</span>
                <span class="detail-grid-editor__title">{{ widgetTitle(child) }}</span>
                <Button
                  v-if="removable"
                  type="text"
                  size="small"
                  :data-testid="`widget-remove-${child.i}`"
                  :aria-label="t('home.remove')"
                  @click="emit('remove', child.i)"
                >
                  ×
                </Button>
              </div>
              <div class="detail-grid-editor__live">
                <slot name="widget" :widget="child" :content-key="contentKeyFor(child)" />
              </div>
            </div>
          </div>
        </div>
      </div>
      <!-- Regular widget cell. -->
      <div
        v-else
        class="detail-grid-editor__cell"
        :class="{ 'detail-grid-editor__cell--drop': dropTarget === 'beside' }"
        :data-widget-key="widget.i"
        :data-testid="`detail-widget-cell-${childBaseKey(widget)}`"
        :style="cellStyle(widget)"
      >
        <div class="detail-grid-editor__card">
          <div class="detail-grid-editor__header">
            <span
              class="drag-widget-icon detail-grid-editor__handle"
              draggable="true"
              @dragstart="onDragStart($event, widget.i)"
            >⠿</span>
            <span class="detail-grid-editor__title">{{ widgetTitle(widget) }}</span>
            <Select
              v-if="resizable && !widget.static"
              :value="widget.w"
              size="small"
              class="detail-grid-editor__width"
              :data-testid="`widget-width-${widget.i}`"
              @change="(width) => onWidthChange(widget, width as number)"
            >
              <Select.Option
                v-for="option in WIDTH_OPTIONS.filter((w) => w <= cols)"
                :key="option"
                :value="option"
              >
                {{ option }}
              </Select.Option>
            </Select>
            <Button
              v-if="removable"
              type="text"
              size="small"
              :data-testid="`widget-remove-${widget.i}`"
              :aria-label="t('home.remove')"
              @click="emit('remove', widget.i)"
            >
              ×
            </Button>
            <span
              v-if="resizable && !widget.static"
            class="detail-grid-editor__resize"
            :data-testid="`widget-resize-${widget.i}`"
            @pointerdown="onResizeStart($event, widget)"
          />
          </div>
          <div class="detail-grid-editor__live">
            <slot name="widget" :widget="widget" :content-key="contentKeyFor(widget)" />
          </div>
        </div>
      </div>
    </template>
    <!-- Empty-widget placeholder: always rendered last. -->
    <div
      v-if="placeholderWidget"
      class="detail-grid-editor__placeholder-cell"
      :style="{
        gridColumn: `1 / span ${placeholderWidget.w}`,
        gridRow: `${maxRow + 1} / span ${placeholderWidget.h}`,
      }"
    >
      <button
        type="button"
        class="detail-grid-editor__placeholder"
        data-testid="detail-placeholder-cell"
        @click="emit('placeholder-click', placeholderWidget.i)"
      >
        <span>+ {{ t('home.addWidget') }}</span>
      </button>
    </div>
  </div>
</template>

<style scoped>
.detail-grid-editor {
  display: grid;
  min-width: 0;
}
.detail-grid-editor__cell {
  display: flex;
  min-width: 0;
  min-height: 0;
}
.detail-grid-editor__panel {
  min-width: 0;
  min-height: 0;
  border: 1px solid var(--sm-border-secondary);
  border-radius: var(--sm-radius-card);
  padding: 8px;
}
.detail-grid-editor__panel--drop {
  border-color: var(--sm-color-primary);
  outline: 2px solid var(--sm-color-primary);
}
.detail-grid-editor__cell--drop {
  outline: 2px solid var(--sm-color-primary);
}
.detail-grid-editor__panel-grid {
  display: grid;
  min-width: 0;
}
.detail-grid-editor__card {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  align-items: stretch;
  gap: 8px;
  min-width: 0;
  min-height: 0;
  padding: 8px;
  border: 1px solid var(--sm-border-secondary);
  border-radius: var(--sm-radius-card);
  background: var(--sm-bg-container);
}
.detail-grid-editor__header {
  display: flex;
  flex: none;
  align-items: flex-start;
  gap: 8px;
  min-width: 0;
}
/**
 * Live widget content (official GenericWidget card body): read-only
 * preview of the widget's real content. Pointer events are off so
 * the preview can never steal the edit gestures; the area scrolls
 * internally when the content is taller than the cell. Empty when
 * the parent renders nothing for the widget — the title chrome in
 * the header stays the fallback. The one exception is the Custom
 * Properties cell editor, which re-enables pointer events on its
 * own wrapper (official renders that editor outside the read-only
 * container).
 */
.detail-grid-editor__live {
  flex: 1 1 auto;
  min-width: 0;
  min-height: 0;
  overflow: auto;
  pointer-events: none;
}
.detail-grid-editor__handle {
  flex: none;
  cursor: grab;
  color: var(--sm-text-secondary);
}
.detail-grid-editor__title {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.detail-grid-editor__width {
  flex: none;
  width: 56px;
}
.detail-grid-editor__resize {
  flex: none;
  align-self: flex-end;
  width: 12px;
  height: 12px;
  cursor: nwse-resize;
  border-right: 2px solid var(--sm-text-secondary);
  border-bottom: 2px solid var(--sm-text-secondary);
  opacity: 0.6;
}
.detail-grid-editor__placeholder-cell {
  display: flex;
  min-width: 0;
}
.detail-grid-editor__placeholder {
  display: flex;
  flex: 1 1 auto;
  align-items: center;
  justify-content: center;
  min-height: 96px;
  border: 1.5px dashed var(--sm-border-secondary);
  border-radius: var(--sm-radius-card);
  background: transparent;
  color: var(--sm-text-secondary);
  cursor: pointer;
}
.detail-grid-editor__placeholder:hover {
  border-color: var(--sm-text-secondary);
  color: var(--sm-text-primary);
}
</style>
