<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { RouterLink, type RouteLocationRaw } from 'vue-router';
import HighlightedText from './HighlightedText.vue';

/**
 * Name cell, ported from official `DisplayName` (pin a3012259ca) as
 * the main-tab and version-page name columns use it: the name on the
 * first line, and the displayName on a second block line when one
 * exists — both lines linked when the row has a detail page, both
 * search-highlighted. The data-models and drive tables do not use
 * this cell: pin renders their names single-line.
 */
defineProps<{
  name: string;
  displayName?: string;
  to?: RouteLocationRaw | null;
  searchText?: string;
  testId?: string;
}>();
</script>

<template>
  <span class="service-child-name-cell">
    <component
      :is="to ? RouterLink : 'span'"
      v-bind="to ? { to } : {}"
      :data-testid="testId"
    >
      <HighlightedText :text="name" :search-text="searchText" />
    </component>
    <component
      :is="to ? RouterLink : 'span'"
      v-if="displayName"
      v-bind="to ? { to } : {}"
      class="service-child-name-cell__display"
      data-testid="column-display-name"
    >
      <HighlightedText :text="displayName" :search-text="searchText" />
    </component>
  </span>
</template>

<style scoped>
.service-child-name-cell {
  display: inline-flex;
  flex-direction: column;
  min-width: 0;
}

.service-child-name-cell__display {
  display: block;
}
</style>
