<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import type { EntityVersion } from '@/api/entities';
import UserPopOverCard from '@/components/shared/UserPopOverCard.vue';
import {
  getSummary,
  isMajorVersionForEntry,
  type TranslateFn,
} from '@/ingestion/versionDiff';
import { getUserPath } from '@/utils/fqnPaths';

/**
 * Port of official VersionButton (pin a3012259ca,
 * components/Entity/EntityVersionTimeLine/VersionButton.tsx:43-113):
 * one version entry — `vX.Y` text, Major badge, change summary,
 * user link with popover card, and timestamp. The version text
 * normalizes through `parseFloat(...).toFixed(1)`; selection is the
 * caller's string comparison.
 */
const props = defineProps<{
  entry: EntityVersion;
  selected: boolean;
}>();

const emit = defineEmits<{
  select: [version: string];
}>();

const { t } = useI18n();
const translate: TranslateFn = (key, params) => t(key, params ?? {});

const versionText = `v${Number.parseFloat(String(props.entry.version)).toFixed(1)}`;
const isMajor = isMajorVersionForEntry(
  props.entry.version,
  props.entry.changeDescription?.previousVersion,
);
const summary = getSummary({ changeDescription: props.entry.changeDescription }, translate);

function onSelect(): void {
  emit('select', String(props.entry.version));
}
</script>

<template>
  <div
    role="button"
    tabindex="0"
    :aria-label="versionText"
    :data-testid="`version-entry-${versionText}`"
    :class="['version-button', { 'version-button--selected': props.selected }]"
    @click="onSelect"
    @keydown.enter="onSelect"
    @keydown.space.prevent="onSelect"
  >
    <span
      :data-testid="`version-selector-${versionText}`"
      :class="['version-button__rounder', { 'version-button__rounder--major': isMajor }]"
    />
    <div>
      <div class="version-button__version">
        <span>{{ versionText }}</span>
        <span v-if="isMajor" class="version-button__major">
          {{ t('settings.services.version.major') }}
        </span>
      </div>
      <div data-testid="version-change-description">
        <p v-for="(paragraph, index) in summary" :key="index">{{ paragraph }}</p>
      </div>
      <div class="version-button__meta">
        <UserPopOverCard
          :user-name="props.entry.updatedBy ?? ''"
          show-user-name
          :profile-width="16"
          :to="getUserPath(props.entry.updatedBy ?? '')"
        />
        <span class="version-button__timestamp">
          {{ props.entry.updatedAt ? new Date(props.entry.updatedAt).toLocaleString() : '' }}
        </span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.version-button {
  display: flex;
  gap: 12px;
  padding-bottom: 16px;
  cursor: pointer;
}

.version-button__rounder {
  width: 12px;
  height: 12px;
  flex-shrink: 0;
  border-radius: 50%;
  border: 2px solid var(--hatch-widget-border, rgba(0, 0, 0, 0.15));
  background: var(--sm-bg-container);
}

.version-button--selected .version-button__rounder {
  border-color: var(--sm-color-primary);
}

.version-button__version {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 500;
}

.version-button__major {
  font-size: 12px;
  font-weight: 500;
  padding: 0 4px;
  border-radius: 4px;
  background-color: var(--sm-version-major-bg);
}

.version-button__meta {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
}

.version-button__timestamp {
  font-style: italic;
  font-weight: 500;
}
</style>
