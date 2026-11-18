<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed } from 'vue';
import type { DiffPart, TextDiffResult } from '@/ingestion/versionDiff';

/**
 * Renders a word-level diff (pin EntityDiffUtils.tsx:55-142): a plain
 * result renders verbatim text; a diff result renders one span per
 * part with testids `diff-added` / `diff-removed` / `diff-normal`
 * (added underlined, removed grey strikethrough). A bare part list
 * (from getDiffValue) renders with the pin's two-way rule — added
 * parts take `diff-added`, every other part takes `diff-removed`,
 * including unchanged parts, whose quirk is encoded by the helper.
 */
const props = defineProps<{
  diff: TextDiffResult | DiffPart[];
}>();

type Segment = { text: string; testId: 'diff-added' | 'diff-removed' | 'diff-normal' };

const segments = computed<Segment[] | null>(() => {
  if (!Array.isArray(props.diff)) {
    if (props.diff.type === 'plain') {
      return null;
    }
    return props.diff.parts.map((part) => ({
      text: part.value,
      testId: part.added ? 'diff-added' : part.removed ? 'diff-removed' : 'diff-normal',
    }));
  }
  return props.diff.map((part) => ({
    text: part.value,
    testId: part.added ? 'diff-added' : 'diff-removed',
  }));
});

const plainText = computed(() =>
  !Array.isArray(props.diff) && props.diff.type === 'plain' ? props.diff.text : '',
);
</script>

<template>
  <span v-if="segments === null" class="version-diff-text">{{ plainText }}</span>
  <span v-else class="version-diff-text">
    <span
      v-for="(segment, index) in segments"
      :key="index"
      :data-testid="segment.testId"
      :class="`version-diff-text__${segment.testId}`"
      data-diff="true"
      >{{ segment.text }}</span
    >
  </span>
</template>

<style scoped>
.version-diff-text__diff-added {
  text-decoration: underline;
}

.version-diff-text__diff-removed {
  color: var(--hatch-widget-muted, rgba(0, 0, 0, 0.45));
  text-decoration: line-through;
}
</style>
