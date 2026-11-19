<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import IngestionPipelineList from '@/components/ingestion/IngestionPipelineList.vue';
import { resolveServiceCategoryParam } from '@/ingestion/serviceCategories';
import type { ListableServiceKind } from '@/router/serviceTabSegments';
import { kindToSegment } from '@/router/serviceTabSegments';

const props = defineProps<{ kindFilter?: ListableServiceKind | 'testSuites' }>();
const route = useRoute();

/**
 * Interim route wrapper until the shell deletes the
 * `ingestion-pipelines` route and mounts IngestionPipelineList in
 * the Services page Pipelines tab (shell §4.2/§6.4): the category
 * travels as `?category=<segment|enumValue|testSuites>`, defaulting
 * to the database category (the pin services page's default tab).
 *
 * Controlled tab content (DESIGN §6.4): the embedding services page
 * passes the scope as `kindFilter`, and a prop scope wins over the
 * route query. A kind scope resolves through its list segment to the
 * ServiceCategory enum value the component fetches with; the
 * 'testSuites' scope passes through as the data-observability tab
 * (the component fetches with serviceType testSuite).
 */
const serviceName = computed(() => {
  const scope = props.kindFilter;
  if (scope === 'testSuites') {
    return 'testSuites';
  }
  if (scope !== undefined) {
    const resolved = resolveServiceCategoryParam(kindToSegment(scope));
    if (resolved && resolved !== 'all') {
      return resolved.enumValue;
    }
    return 'databaseServices';
  }
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
