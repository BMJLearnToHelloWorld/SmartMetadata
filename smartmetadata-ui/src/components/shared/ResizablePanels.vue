<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { MenuFoldOutlined, MenuUnfoldOutlined } from '@ant-design/icons-vue';
import { Card, Tooltip } from 'ant-design-vue';
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';

export interface AppResizablePanelConfig {
  minWidth: number;
  flex?: number;
  className?: string;
  wrapInCard?: boolean;
  allowScroll?: boolean;
  onStopResize?: (newFlex: number | undefined) => void;
}

const props = withDefaults(
  defineProps<{
    firstPanel: AppResizablePanelConfig;
    secondPanel: AppResizablePanelConfig;
    hideSecondPanel?: boolean;
    className?: string;
    /**
     * Which panel the splitter button collapses. Pin has two components
     * here: ResizablePanels collapses the right panel, while
     * ResizableLeftPanels (the one DataInsightPage uses) collapses the
     * left panel. Default 'second' keeps the original behaviour for all
     * existing callers; pass 'first' for a pin ResizableLeftPanels shape.
     */
    collapseSide?: 'first' | 'second';
  }>(),
  { hideSecondPanel: false, className: undefined, collapseSide: 'second' },
);

const { t } = useI18n();

/**
 * Official ResizablePanels (components/common/ResizablePanels/
 * ResizablePanels.tsx, pin a3012259ca), side-by-side subset: two
 * panels sized by flex fractions with pixel min-widths, a drag
 * splitter, and a collapsible panel. `wrapInCard` defaults to
 * true for both panels. The expand button keeps pin's `sidebar-toggle`
 * testid and `label.expand` tooltip; the collapse button is the Vue
 * affordance that makes the collapsed state reachable (pin's state
 * toggles only from its own expand button). `onStopResize` receives
 * the first panel's new flex fraction when a drag ends. The panel
 * testids carry the panel className, as in pin; the container carries
 * pin's `resizable-panels` testid. `collapseSide` picks which panel the
 * splitter button collapses: 'second' is pin ResizablePanels, 'first'
 * is pin ResizableLeftPanels (the Data Insight page shape).
 */
const SPLITTER_WIDTH = 8;

const firstFlex = computed(() => props.firstPanel.flex ?? 1);
const secondFlex = computed(() => props.secondPanel.flex ?? 1);
const fraction = ref(firstFlex.value / (firstFlex.value + secondFlex.value));
const isCollapsed = ref(false);
const isFirstCollapsed = computed(() => isCollapsed.value && props.collapseSide === 'first');
const isSecondCollapsed = computed(() => isCollapsed.value && props.collapseSide === 'second');
const containerRef = ref<HTMLElement | null>(null);

const firstWrapInCard = computed(() => props.firstPanel.wrapInCard ?? true);
const secondWrapInCard = computed(() => props.secondPanel.wrapInCard ?? true);

function clampFraction(next: number, containerWidth: number): number {
  const usable = Math.max(0, containerWidth - SPLITTER_WIDTH);
  if (usable <= 0) {
    return fraction.value;
  }
  const minFirst = Math.min(props.firstPanel.minWidth / usable, 1);
  const minSecond = Math.min(props.secondPanel.minWidth / usable, 1);
  return Math.min(Math.max(next, minFirst), Math.max(minFirst, 1 - minSecond));
}

let dragging = false;

function onSplitterPointerDown(event: PointerEvent): void {
  if (isCollapsed.value) {
    return;
  }
  if ((event.target as HTMLElement).closest('button')) {
    return;
  }
  dragging = true;
  try {
    (event.target as HTMLElement).setPointerCapture?.(event.pointerId);
  } catch {
    // jsdom and older browsers lack setPointerCapture; the window
    // listeners below still receive the moves.
  }
  event.preventDefault();
}

function onSplitterPointerMove(event: PointerEvent): void {
  if (!dragging) {
    return;
  }
  const container = containerRef.value;
  if (!container) {
    return;
  }
  const rect = container.getBoundingClientRect();
  fraction.value = clampFraction((event.clientX - rect.left) / rect.width, rect.width);
}

function onSplitterPointerUp(): void {
  if (!dragging) {
    return;
  }
  dragging = false;
  props.firstPanel.onStopResize?.(fraction.value);
  props.secondPanel.onStopResize?.(fraction.value);
}

function toggleCollapse(): void {
  isCollapsed.value = !isCollapsed.value;
}
</script>

<template>
  <div
    ref="containerRef"
    :class="className"
    data-testid="resizable-panels"
    style="display: flex; height: 100%; width: 100%"
    @pointermove="onSplitterPointerMove"
    @pointerup="onSplitterPointerUp"
  >
    <div
      :class="firstPanel.className"
      :data-testid="firstPanel.className"
      :style="{
        flex:
          hideSecondPanel || isSecondCollapsed
            ? '1 1 100%'
            : isFirstCollapsed
              ? '0 0 0px'
              : `0 0 calc(${(fraction * 100).toFixed(2)}% - ${(SPLITTER_WIDTH * fraction).toFixed(2)}px)`,
        minWidth:
          hideSecondPanel || isSecondCollapsed
            ? undefined
            : isFirstCollapsed
              ? '0px'
              : `${firstPanel.minWidth}px`,
        overflowY: isFirstCollapsed ? 'hidden' : firstPanel.allowScroll ? 'auto' : undefined,
      }"
    >
      <Card
        v-if="firstWrapInCard && !isFirstCollapsed"
        :style="{ height: firstPanel.allowScroll ? undefined : '100%', overflowY: firstPanel.allowScroll ? undefined : 'auto' }"
      >
        <slot name="first" />
      </Card>
      <slot v-else-if="!isFirstCollapsed" name="first" />
    </div>

    <div
      v-if="!hideSecondPanel"
      style="
        flex: 0 0 8px;
        cursor: col-resize;
        display: flex;
        align-items: center;
        justify-content: center;
        touch-action: none;
      "
      @pointerdown="onSplitterPointerDown"
    >
      <Tooltip v-if="isCollapsed" :title="t('label.expand')" placement="right">
        <button
          data-testid="sidebar-toggle"
          style="background: transparent; border: none; cursor: pointer; padding: 4px"
          type="button"
          @click="toggleCollapse"
        >
          <MenuUnfoldOutlined />
        </button>
      </Tooltip>
      <button
        v-else
        :aria-label="t('label.collapse')"
        data-testid="sidebar-collapse"
        style="background: transparent; border: none; cursor: pointer; padding: 4px"
        type="button"
        @click="toggleCollapse"
      >
        <MenuFoldOutlined />
      </button>
    </div>

    <div
      v-if="!hideSecondPanel"
      :class="secondPanel.className"
      :data-testid="secondPanel.className"
      :style="{
        flex: isSecondCollapsed ? '0 0 0px' : '1 1 auto',
        minWidth: isSecondCollapsed ? '0px' : `${secondPanel.minWidth}px`,
        overflow: isSecondCollapsed ? 'hidden' : undefined,
      }"
    >
      <Card v-if="secondWrapInCard && !isSecondCollapsed" style="height: 100%">
        <div style="min-height: 0; flex: 1; overflow: auto">
          <slot name="second" />
        </div>
      </Card>
      <slot v-else-if="!isSecondCollapsed" name="second" />
    </div>
  </div>
</template>
