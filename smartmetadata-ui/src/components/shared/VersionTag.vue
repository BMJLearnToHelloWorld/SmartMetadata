<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { useI18n } from 'vue-i18n';

/**
 * Server version label (official NavBar version element, reduced to
 * what is wired): the shell config store fetches /v1/system/version,
 * strips -SNAPSHOT and caches for 1 hour. The official version-mismatch
 * alert is residual — this console has no client version constant to
 * compare against — so no mismatch alert is rendered or faked.
 */
withDefaults(defineProps<{ version?: string; testId?: string }>(), {
  version: undefined,
  testId: 'app-version',
});
const { t } = useI18n();
</script>

<template>
  <span class="sm-version-tag" :data-testid="testId" :title="t('chrome.versionLabel')">
    {{ version ? `v${version}` : t('chrome.helpVersionUnknown') }}
  </span>
</template>

<style scoped>
.sm-version-tag {
  color: var(--sm-text-tertiary);
  font-size: 12px;
  white-space: nowrap;
}
</style>
