<!--
Copyright 2026 SmartMetadata authors.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0
-->
<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import SmMarkdown from '@/components/shared/SmMarkdown.vue';
import { isDescriptionContentEmpty } from '@/utils/richTextUtils';

/**
 * Description cell (PAT-COLUMNS COL-1/COL-6). Mirrors official
 * `RichTextEditorPreviewerNew`'s empty branch: empty content renders
 * the `label.no-description` span, anything else renders through the
 * product markdown previewer (`SmMarkdown`, the Q8-approved renderer).
 * Callers pass search-highlighted markdown when the page highlights
 * (official Services/Bots hand-written columns pass highlighted text
 * into the same previewer); highlighting itself is the caller's.
 *
 * Bounded: the official read-more/overflow variant (ResizeObserver +
 * BlockEditor) is not reproduced — it belongs to the rich-text
 * previewer line, not to this cell.
 */
const props = withDefaults(
  defineProps<{
    markdown?: string;
    testId?: string;
  }>(),
  { markdown: '', testId: 'sm-markdown' },
);

const { t } = useI18n();
</script>

<template>
  <span v-if="isDescriptionContentEmpty(props.markdown)" class="description-cell__empty">
    {{ t('label.no-description') }}
  </span>
  <SmMarkdown v-else :markdown="props.markdown" :test-id="props.testId" />
</template>

<style scoped>
.description-cell__empty {
  color: var(--sm-text-secondary);
}
</style>
