<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { Button, Tooltip } from 'ant-design-vue';
import {
  ExpandOutlined,
  PictureOutlined,
  ZoomInOutlined,
  ZoomOutOutlined,
} from '@ant-design/icons-vue';

/**
 * Pin `LineageControlButtons` (a3012259ca,
 * `components/Entity/EntityLineage/LineageControlButtons/`): the zoom
 * cluster that replaces the generic vue-flow `<Controls />` on both
 * canvases. Order and testids match pin exactly — minimap toggle
 * (`toggle-mind-map`, aria-pressed) | zoom in (`zoom-in`) | zoom
 * percentage text (`zoom-level`, `Math.round(zoom * 100)%`) | zoom out
 * (`zoom-out`) | fit view (`fit-screen`, pin
 * `fitView({ padding: 0.2, maxZoom: 1 })`).
 *
 * The component is state-dumb: the parent owns the flow instance and
 * passes the current zoom in (tracked from move events), and performs
 * the zoom/fit actions on the emitted events. Icons are the product's
 * ant-design set (pin uses its own SVG glyphs; the minimap toggle is
 * the miniature-picture glyph, pin's map glyph).
 */
const props = withDefaults(
  defineProps<{
    miniMapVisible?: boolean;
    zoom?: number;
  }>(),
  { miniMapVisible: false, zoom: 1 },
);

const emit = defineEmits<{
  'toggle-mini-map': [];
  'zoom-in': [];
  'zoom-out': [];
  'fit-view': [];
}>();

const { t } = useI18n();

const zoomLabel = computed(() => `${Math.round(props.zoom * 100)}%`);
</script>

<template>
  <div class="lineage-zoom-controls" data-testid="lineage-zoom-controls">
    <Tooltip :title="t('lineage.mindMap')">
      <Button
        type="text"
        size="large"
        class="lineage-zoom-controls__btn"
        :class="{ 'lineage-zoom-controls__btn--active': miniMapVisible }"
        data-testid="toggle-mind-map"
        :aria-label="t('lineage.mindMap')"
        :aria-pressed="miniMapVisible ? 'true' : 'false'"
        @click="emit('toggle-mini-map')"
      >
        <template #icon><PictureOutlined /></template>
      </Button>
    </Tooltip>
    <span class="lineage-zoom-controls__divider" aria-hidden="true" />
    <Tooltip :title="t('lineage.zoomIn')">
      <Button
        type="text"
        size="large"
        class="lineage-zoom-controls__btn"
        data-testid="zoom-in"
        :aria-label="t('lineage.zoomIn')"
        @click="emit('zoom-in')"
      >
        <template #icon><ZoomInOutlined /></template>
      </Button>
    </Tooltip>
    <span class="lineage-zoom-controls__level" data-testid="zoom-level">{{ zoomLabel }}</span>
    <Tooltip :title="t('lineage.zoomOut')">
      <Button
        type="text"
        size="large"
        class="lineage-zoom-controls__btn"
        data-testid="zoom-out"
        :aria-label="t('lineage.zoomOut')"
        @click="emit('zoom-out')"
      >
        <template #icon><ZoomOutOutlined /></template>
      </Button>
    </Tooltip>
    <span class="lineage-zoom-controls__divider" aria-hidden="true" />
    <Tooltip :title="t('lineage.fitToScreen')">
      <Button
        type="text"
        size="large"
        class="lineage-zoom-controls__btn"
        data-testid="fit-screen"
        :aria-label="t('lineage.fitToScreen')"
        @click="emit('fit-view')"
      >
        <template #icon><ExpandOutlined /></template>
      </Button>
    </Tooltip>
  </div>
</template>

<style scoped>
.lineage-zoom-controls {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px;
  border: 1px solid var(--sm-border-secondary);
  border-radius: var(--sm-border-radius);
  background: var(--sm-bg-container);
  box-shadow: var(--sm-shadow-card);
}
.lineage-zoom-controls__btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0 8px;
  color: var(--sm-text-secondary);
}
.lineage-zoom-controls__btn--active {
  color: var(--sm-color-primary);
  background: var(--sm-color-primary-bg);
}
.lineage-zoom-controls__divider {
  width: 1px;
  height: 24px;
  background: var(--sm-border-secondary);
}
.lineage-zoom-controls__level {
  min-width: 40px;
  text-align: center;
  color: var(--sm-text-secondary);
  font-size: 13px;
  font-variant-numeric: tabular-nums;
}
</style>
