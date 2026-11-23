<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed } from 'vue';

/**
 * Search-term highlighting, ported from official
 * utils/EntitySearchUtils.tsx `highlightSearchText` (pin a3012259ca):
 * a case-insensitive match on the escaped search text, with matches
 * wrapped in `<span data-highlight="true" class="text-highlighter">`.
 * Segments are rendered as elements rather than HTML, so entity
 * names never pass through `v-html`.
 *
 * `searchTerms` is the multi-term form (B2-E6, D19): the matched terms
 * pulled out of the ES `highlight` fragments for the card
 * (`catalog/exploreCard.ts` `highlightNeedles`), which follow ES
 * tokenisation instead of the raw query string. Terms are tried
 * longest-first so a short term never swallows a longer one that
 * contains it.
 */
const props = withDefaults(
  defineProps<{
    text: string;
    searchText?: string;
    searchTerms?: string[];
  }>(),
  { searchTerms: () => [] },
);

interface Segment {
  text: string;
  highlighted: boolean;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const segments = computed<Segment[]>(() => {
  const terms = [...new Set([...(props.searchTerms ?? []), ...(props.searchText ? [props.searchText] : [])]
    .map((term) => term.trim())
    .filter(Boolean))].sort((a, b) => b.length - a.length);
  if (!terms.length) {
    return [{ text: props.text, highlighted: false }];
  }
  const regex = new RegExp(`(${terms.map(escapeRegExp).join('|')})`, 'gi');
  const parts = props.text.split(regex);
  const lowered = new Set(terms.map((term) => term.toLowerCase()));
  return parts
    .filter((part) => part !== '')
    .map((part) => ({
      text: part,
      highlighted: lowered.has(part.toLowerCase()),
    }));
});
</script>

<template>
  <span>
    <template v-for="(segment, index) in segments" :key="index">
      <span v-if="segment.highlighted" data-highlight="true" class="text-highlighter">
        {{ segment.text }}
      </span>
      <template v-else>{{ segment.text }}</template>
    </template>
  </span>
</template>

<style scoped>
.text-highlighter {
  background: var(--sm-color-warning-bg);
}
</style>
