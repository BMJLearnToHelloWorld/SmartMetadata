<!--
  Copyright 2026 SmartMetadata authors.

  Licensed under the Apache License, Version 2.0 (the "License");
  you may not use this file except in compliance with the License.
  You may obtain a copy of the License at

      http://www.apache.org/licenses/LICENSE-2.0
-->
<!--
  Vue port of components/common/EmptyPlaceholder/PanelEmptyPlaceholder.tsx.
  Renders the positioned host the absolutely-positioned placeholders
  fill. An active search swaps the no-data message for "no matching
  results" (title/description are NOT forwarded to the search state).
-->
<script setup lang="ts">
import { computed } from 'vue';
import NoDataPlaceholder from './NoDataPlaceholder.vue';
import NoSearchResultsPlaceholder from './NoSearchResultsPlaceholder.vue';

const props = withDefaults(
  defineProps<{
    searchText?: string;
    title?: string;
    description?: string;
    className?: string;
    testId?: string;
    searchResultsTestId?: string;
  }>(),
  { testId: 'no-data-placeholder' }
);

const searchTestId = computed(() => props.searchResultsTestId ?? props.testId);
</script>

<template>
  <div class="panel-empty-placeholder" :class="className">
    <NoSearchResultsPlaceholder v-if="searchText" :test-id="searchTestId" />
    <NoDataPlaceholder v-else :test-id="testId" :title="title" :description="description" />
  </div>
</template>

<style scoped>
.panel-empty-placeholder {
  position: relative;
  width: 100%;
  height: 100%;
  min-height: 240px;
  background-color: var(--sm-bg-container);
  border-radius: 12px;
}
</style>
