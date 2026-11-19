<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { CloseOutlined } from '@ant-design/icons-vue';
import { Button, Tooltip } from 'ant-design-vue';
import type { EntityVersion } from '@/api/entities';
import VersionButton from '@/components/ingestion/VersionButton.vue';
import { partitionVersionTimeline } from '@/ingestion/versionDiff';

/**
 * Port of official EntityVersionTimeLine (pin a3012259ca,
 * components/Entity/EntityVersionTimeLine/EntityVersionTimeLine.tsx:
 * 40-120): the version-history aside. Truncation follows the pin's
 * `maxAllowed > 0` rule exactly (R-T3): -1 or 0 renders everything
 * with no upgrade prompt; a positive limit truncates only when the
 * list actually overflows, and the hidden entries still render
 * inside the `+N more versions` tooltip. The upgrade prompt keeps
 * the pin's two text lines but carries NO clickable CTA, no empty
 * button, and no dead link — there is no billing destination in
 * this build (T-3 narrow product exception).
 */
const props = defineProps<{
  versions: EntityVersion[];
  currentVersion: string | number;
  maxVersions?: number;
}>();

const emit = defineEmits<{
  select: [version: string];
  close: [];
}>();

const { t } = useI18n();

const partition = computed(() => partitionVersionTimeline(props.versions, props.maxVersions));

function isSelected(version: number | string | undefined): boolean {
  return String(version) === String(props.currentVersion);
}
</script>

<template>
  <aside
    role="dialog"
    :aria-label="t('settings.services.version.historyTitle')"
    data-testid="versions-list-container"
  >
    <div class="service-version-timeline__header">
      <span class="service-version-timeline__title">
        {{ t('settings.services.version.historyTitle') }}
      </span>
      <Button type="text" size="small" data-testid="versions-list-close" @click="emit('close')">
        <CloseOutlined />
      </Button>
    </div>
    <div class="service-version-timeline__body">
      <VersionButton
        v-for="entry in partition.visible"
        :key="String(entry.version)"
        :entry="entry"
        :selected="isSelected(entry.version)"
        @select="emit('select', $event)"
      />
      <template v-if="partition.hidden.length > 0">
        <Tooltip
          :title="t('settings.services.version.moreVersions', { count: partition.hidden.length })"
        >
          <div class="service-version-timeline__hidden">
            <VersionButton
              v-for="entry in partition.hidden"
              :key="String(entry.version)"
              :entry="entry"
              :selected="isSelected(entry.version)"
              @select="emit('select', $event)"
            />
          </div>
        </Tooltip>
        <div class="service-version-timeline__upgrade">
          <h4>{{ t('settings.services.version.unlockAllHistory') }}</h4>
          <p>{{ t('settings.services.version.upgradeToPaidPlan') }}</p>
        </div>
      </template>
    </div>
  </aside>
</template>

<style scoped>
.service-version-timeline__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-bottom: 8px;
}

.service-version-timeline__title {
  font-weight: 500;
}

.service-version-timeline__upgrade {
  margin-top: 8px;
}

.service-version-timeline__upgrade h4 {
  margin: 0 0 4px;
  font-weight: 500;
}

.service-version-timeline__upgrade p {
  margin: 0;
  color: var(--hatch-widget-muted, rgba(0, 0, 0, 0.45));
}
</style>
