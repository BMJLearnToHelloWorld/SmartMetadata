<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import IngestionPipelineList from '@/components/ingestion/IngestionPipelineList.vue';
import { resolveServiceCategoryParam } from '@/ingestion/serviceCategories';

const route = useRoute();

/**
 * Interim route wrapper until the shell deletes the
 * `ingestion-pipelines` route and mounts IngestionPipelineList in
 * the Services page Pipelines tab (shell §4.2/§6.4): the category
 * travels as `?category=<segment|enumValue|testSuites>`, defaulting
 * to the database category (the pin services page's default tab).
 */
const serviceName = computed(() => {
  const param = route.query.category;
  if (param === 'testSuites') {
    return 'testSuites';
  }
  const resolved =
    typeof param === 'string' ? resolveServiceCategoryParam(param) : undefined;
  if (resolved && resolved !== 'all') {
    return resolved.enumValue;
  }
  return 'databaseServices';
});
</script>

<template>
  <IngestionPipelineList :service-name="serviceName" />
</template>
