<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import {
  getRailStopLabelKey,
  isDeeperBand,
  LINEAGE_MAP_RAIL_STOPS,
  type LineageBand,
  type LineageLens,
} from '@/lineage/scene';

/**
 * Pin `LineageMapControls` (a3012259ca,
 * `components/Lineage/LineageMap/LineageMap.component.tsx:784-880`):
 * the vertical level rail on the right edge of the platform map —
 * Layer / Asset / Field stops on a pill track with a vertical line.
 * Only the active stop's label shows; the other labels slide in while
 * the rail is hovered or holds keyboard focus. A stop deeper than the
 * active one is disabled when nothing on the scene can be drilled into
 * (`isDeeperBand(active, stop) && !canDrill`, pin `:801`).
 */
const props = defineProps<{
  activeStop: LineageBand;
  lens: LineageLens;
  canDrill: boolean;
}>();

const emit = defineEmits<{
  'select-stop': [stop: LineageBand];
}>();

const { t } = useI18n();

const stops = computed(() =>
  LINEAGE_MAP_RAIL_STOPS.map((stop) => ({
    stop,
    label: t(getRailStopLabelKey(stop, props.lens)),
    isActive: stop === props.activeStop,
    isDisabled: isDeeperBand(props.activeStop, stop) && !props.canDrill,
  })),
);

function onSelect(stop: LineageBand): void {
  emit('select-stop', stop);
}
</script>

<template>
  <div class="lineage-map-rail" data-testid="lineage-map-rail">
    <div class="lineage-map-rail__labels">
      <div v-for="{ stop, label, isActive, isDisabled } in stops" :key="`label-${stop}`" class="lineage-map-rail__label-row">
        <button
          type="button"
          class="lineage-map-rail__label"
          :class="{ 'lineage-map-rail__label--active': isActive }"
          :data-testid="`lineage-map-band-label-${stop}`"
          :disabled="isDisabled"
          @click="onSelect(stop)"
        >
          {{ label }}
        </button>
      </div>
    </div>
    <div class="lineage-map-rail__track">
      <span class="lineage-map-rail__line" aria-hidden="true" />
      <button
        v-for="{ stop, label, isActive, isDisabled } in stops"
        :key="stop"
        type="button"
        class="lineage-map-rail__dot-btn"
        :data-testid="`lineage-map-band-${stop}`"
        :aria-label="label"
        :disabled="isDisabled"
        @click="onSelect(stop)"
      >
        <span
          class="lineage-map-rail__dot"
          :class="{ 'lineage-map-rail__dot--active': isActive }"
          aria-hidden="true"
        />
      </button>
    </div>
  </div>
</template>

<style scoped>
.lineage-map-rail {
  position: absolute;
  right: 24px;
  top: 50%;
  z-index: 5;
  display: flex;
  align-items: stretch;
  gap: 8px;
  transform: translateY(-50%);
}
.lineage-map-rail__labels {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  height: 138px;
  padding: 4px 0;
  align-items: flex-end;
}
.lineage-map-rail__label-row {
  display: flex;
  align-items: center;
  height: 24px;
}
.lineage-map-rail__label {
  border: 1px solid var(--sm-border-secondary);
  border-radius: 999px;
  background: var(--sm-bg-container);
  box-shadow: var(--sm-shadow-card);
  padding: 2px 10px;
  color: var(--sm-text-secondary);
  font-size: 12px;
  white-space: nowrap;
  cursor: pointer;
  opacity: 0;
  transform: translateX(6px);
  pointer-events: none;
  transition:
    opacity 150ms,
    transform 150ms;
}
.lineage-map-rail__label--active {
  color: var(--sm-color-primary);
  font-weight: 600;
  opacity: 1;
  transform: translateX(0);
  pointer-events: auto;
}
.lineage-map-rail:hover .lineage-map-rail__label,
.lineage-map-rail:focus-within .lineage-map-rail__label {
  opacity: 1;
  transform: translateX(0);
  pointer-events: auto;
}
.lineage-map-rail__label:disabled {
  cursor: not-allowed;
  opacity: 0.45;
}
.lineage-map-rail__track {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: space-between;
  width: 30px;
  height: 138px;
  padding: 4px 0;
  border: 1px solid var(--sm-border-secondary);
  border-radius: 999px;
  background: var(--sm-bg-container);
  box-shadow: var(--sm-shadow-card);
}
.lineage-map-rail__line {
  position: absolute;
  top: 14px;
  bottom: 14px;
  left: 50%;
  width: 2px;
  transform: translateX(-50%);
  background: var(--sm-border-secondary);
}
.lineage-map-rail__dot-btn {
  z-index: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border: 0;
  background: none;
  padding: 0;
  cursor: pointer;
}
.lineage-map-rail__dot-btn:disabled {
  cursor: not-allowed;
}
.lineage-map-rail__dot {
  width: 10px;
  height: 10px;
  border: 2px solid var(--sm-color-primary);
  border-radius: 999px;
  background: var(--sm-bg-container);
  transition: all 150ms;
}
.lineage-map-rail__dot--active {
  width: 14px;
  height: 14px;
  border-color: var(--sm-color-primary);
  background: var(--sm-color-primary);
}
</style>
