<!--
Copyright 2026 SmartMetadata authors.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0
-->
<script setup lang="ts">
import { Card } from 'ant-design-vue';
import { computed, ref } from 'vue';

const props = withDefaults(
  defineProps<{
    firstPanel: { className: string; minWidth: number; flex: number };
    secondPanel: { className: string; minWidth: number; flex?: number };
    hideSecondPanel?: boolean;
  }>(),
  { hideSecondPanel: false },
);

const containerRef = ref<HTMLElement | null>(null);
const splitterRef = ref<HTMLElement | null>(null);
// Pixel width once a drag starts; null keeps the pin flex ratios.
const firstWidth = ref<number | null>(null);

const firstStyle = computed(() =>
  firstWidth.value === null
    ? {
        flex: `${props.firstPanel.flex} 1 0`,
        minWidth: `${props.firstPanel.minWidth}px`,
      }
    : {
        flex: `0 0 ${firstWidth.value}px`,
        minWidth: `${props.firstPanel.minWidth}px`,
      },
);
const secondStyle = computed(() => ({
  flex: `${props.secondPanel.flex ?? 1} 1 0`,
  minWidth: `${props.secondPanel.minWidth}px`,
}));

function handleSplitterPointerDown(event: PointerEvent): void {
  const container = containerRef.value;
  const splitter = splitterRef.value;
  const firstElement = container?.querySelector('.resizable-first-panel');
  if (!container || !splitter || !firstElement) {
    return;
  }
  const startX = event.clientX;
  const startWidth = firstElement.getBoundingClientRect().width;
  const containerWidth = container.getBoundingClientRect().width;
  const splitterWidth = splitter.getBoundingClientRect().width;
  const maxWidth =
    containerWidth - splitterWidth - props.secondPanel.minWidth;

  const handleMove = (moveEvent: PointerEvent): void => {
    const next = startWidth + (moveEvent.clientX - startX);
    firstWidth.value = Math.min(
      Math.max(next, props.firstPanel.minWidth),
      Math.max(maxWidth, props.firstPanel.minWidth),
    );
  };
  const handleUp = (): void => {
    window.removeEventListener('pointermove', handleMove);
    window.removeEventListener('pointerup', handleUp);
  };
  window.addEventListener('pointermove', handleMove);
  window.addEventListener('pointerup', handleUp);
}
</script>

<template>
  <div ref="containerRef" data-testid="resizable-panels" style="display: flex">
    <div
      :class="[
        'resizable-first-panel',
        firstPanel.className,
        { 'full-width': hideSecondPanel },
      ]"
      :data-testid="firstPanel.className"
      :style="firstStyle"
    >
      <Card class="h-full overflow-y-auto">
        <slot name="first-panel" />
      </Card>
    </div>

    <div
      v-if="!hideSecondPanel"
      ref="splitterRef"
      class="splitter right-panel-splitter"
      @pointerdown="handleSplitterPointerDown"
    >
      <div class="sso-splitter-grabber" />
    </div>

    <div
      v-if="!hideSecondPanel"
      :class="secondPanel.className"
      :data-testid="secondPanel.className"
      :style="secondStyle"
    >
      <Card>
        <slot name="second-panel" />
      </Card>
    </div>
  </div>
</template>

<style scoped>
.splitter {
  cursor: col-resize;
}
</style>
