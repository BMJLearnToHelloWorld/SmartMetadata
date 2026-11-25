<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { HomeOutlined } from '@ant-design/icons-vue';
import { getLensRootLabelKey, type LineageSceneBreadcrumb, type LineageLens } from '@/lineage/scene';

/**
 * Pin `LineageMapBreadcrumbs` (a3012259ca,
 * `components/Lineage/LineageMap/LineageMap.component.tsx:880-910`):
 * the top-left pill over the platform map — one button per crumb, the
 * root crumb (no FQN) carrying the home icon and the lens root label.
 * Returns nothing when the trail is empty (pin returns null; at the
 * platform root there is no pill). Clicking a crumb focuses that scene.
 */
const props = defineProps<{
  breadcrumbs: LineageSceneBreadcrumb[];
  lens: LineageLens;
}>();

const emit = defineEmits<{
  focus: [breadcrumb: LineageSceneBreadcrumb];
}>();

const { t } = useI18n();

function isRoot(crumb: LineageSceneBreadcrumb): boolean {
  return !crumb.fullyQualifiedName;
}
</script>

<template>
  <nav
    v-if="breadcrumbs.length"
    class="lineage-map-breadcrumbs"
    data-testid="lineage-map-breadcrumbs"
    :aria-label="t(getLensRootLabelKey(lens))"
  >
    <template v-for="(crumb, index) in breadcrumbs" :key="crumb.id">
      <span v-if="index > 0" class="lineage-map-breadcrumbs__separator" aria-hidden="true">/</span>
      <button
        type="button"
        class="lineage-map-breadcrumbs__crumb"
        :class="{ 'lineage-map-breadcrumbs__crumb--current': index === breadcrumbs.length - 1 }"
        :data-testid="`lineage-map-crumb-${crumb.id}`"
        @click="emit('focus', crumb)"
      >
        <HomeOutlined v-if="isRoot(crumb)" class="lineage-map-breadcrumbs__home" />
        {{ crumb.label }}
      </button>
    </template>
  </nav>
</template>

<style scoped>
.lineage-map-breadcrumbs {
  position: absolute;
  left: 12px;
  top: 12px;
  z-index: 10;
  display: flex;
  align-items: center;
  gap: 6px;
  max-width: min(760px, calc(100vw - 520px));
  padding: 8px 12px;
  border: 1px solid var(--sm-border-secondary);
  border-radius: 999px;
  background: var(--sm-bg-container);
  box-shadow: var(--sm-shadow-card);
}
.lineage-map-breadcrumbs__separator {
  color: var(--sm-text-quaternary);
}
.lineage-map-breadcrumbs__crumb {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  border: 0;
  background: none;
  padding: 0;
  color: var(--sm-color-primary);
  cursor: pointer;
  font-size: 12px;
  max-width: 180px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.lineage-map-breadcrumbs__crumb--current {
  color: var(--sm-text-primary);
  cursor: default;
  font-weight: 600;
}
.lineage-map-breadcrumbs__home {
  font-size: 12px;
}
</style>
