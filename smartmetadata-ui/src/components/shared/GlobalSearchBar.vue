<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { Input } from 'ant-design-vue';
import { useI18n } from 'vue-i18n';

/**
 * Global search bar extracted from AppShell (official GlobalSearchBar
 * is a standalone component, not an inline Input.Search). Routing
 * stays with the caller: this component only reports the submitted
 * query. Suggestions and saved searches are residual (see Stage 1
 * report §4): they are not faked here.
 */
withDefaults(
  defineProps<{ initialQuery?: string; testId?: string }>(),
  { initialQuery: '', testId: 'global-search' },
);
const emit = defineEmits<{ search: [query: string] }>();
const { t } = useI18n();
</script>

<template>
  <Input.Search
    :data-testid="testId"
    class="sm-global-search"
    :placeholder="t('chrome.searchPlaceholder')"
    allow-clear
    :default-value="initialQuery"
    @search="(value) => emit('search', String(value).trim())"
  />
</template>

<style scoped>
.sm-global-search {
  max-width: 520px;
  flex: 1;
}
</style>
