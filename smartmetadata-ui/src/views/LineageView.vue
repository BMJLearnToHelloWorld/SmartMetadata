<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import LineageHomeView from './LineageHomeView.vue';

/**
 * Focused lineage route (`/lineage/:entityType/:fqn`). Pin serves both
 * lineage routes from the single PlatformLineage page; this view is the
 * thin route entry that forwards its params to it.
 */
defineProps<{
  entityType: string;
  fqn: string;
}>();
</script>

<template>
  <LineageHomeView :entity-type="entityType" :fqn="fqn" />
</template>
