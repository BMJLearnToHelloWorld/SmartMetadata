<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
  Official NoProfilerBanner: title, message, and Learn More docs link.
  Vue3 + ant-design-vue. No CCL React/CSS copy.
-->
<script setup lang="ts">
import { useI18n } from 'vue-i18n';

/** Official DocumentationLinksClassBase.DATA_QUALITY_PROFILER_WORKFLOW_DOCS. */
const PROFILER_WORKFLOW_DOCS =
  'https://docs.open-metadata.org/latest/how-to-guides/data-quality-observability/profiler/workflow';

const { t } = useI18n();
</script>

<template>
  <div class="no-profiler-banner" data-testid="no-profiler-placeholder">
    <div class="no-profiler-banner__copy">
      <p class="no-profiler-banner__title" data-testid="profiler-title">
        {{ t('message.no-profiler-title') }}
      </p>
      <p class="no-profiler-banner__description" data-testid="profiler-description">
        {{ t('message.no-profiler-message') }}
      </p>
    </div>
    <a
      class="no-profiler-banner__link"
      data-testid="documentation-link"
      :href="PROFILER_WORKFLOW_DOCS"
      rel="noreferrer"
      target="_blank"
    >
      {{ t('label.learn-more') }}
    </a>
  </div>
</template>

<style scoped>
.no-profiler-banner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 16px;
  border: 1px solid var(--sm-border-color);
  border-radius: 8px;
  background: var(--sm-bg-container);
}
.no-profiler-banner__copy {
  flex: 1;
}
.no-profiler-banner__title {
  margin: 0 0 4px;
  font-weight: 600;
  color: var(--sm-text-primary);
}
.no-profiler-banner__description {
  margin: 0;
  color: var(--sm-text-secondary);
}
.no-profiler-banner__link {
  flex-shrink: 0;
  font-weight: 600;
  color: var(--sm-color-primary);
}
</style>
