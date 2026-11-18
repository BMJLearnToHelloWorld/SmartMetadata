<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { Breadcrumb } from 'ant-design-vue';
import { RouterLink } from 'vue-router';

/**
 * Shared breadcrumb (official HeaderBreadcrumb equivalent): items are
 * passed per page as data, never hard-coded per route here. Every item
 * with a route name links, including the last one — pin's TitleBreadcrumb
 * renders a Link for any item with a URL, and the Data Asset Rules trail
 * (DESIGN §9.4) keeps its last-item link. An empty list renders nothing.
 */
export interface SmBreadcrumbItem {
  label: string;
  routeName?: string;
  routeParams?: Record<string, string>;
}

withDefaults(defineProps<{ items?: SmBreadcrumbItem[]; testId?: string }>(), {
  items: () => [],
  testId: 'sm-breadcrumb',
});
</script>

<template>
  <Breadcrumb v-if="items.length" :data-testid="testId">
    <Breadcrumb.Item v-for="(item, index) in items" :key="`${item.label}-${index}`">
      <RouterLink
        v-if="item.routeName"
        :to="{ name: item.routeName, params: item.routeParams }"
      >
        {{ item.label }}
      </RouterLink>
      <span v-else>{{ item.label }}</span>
    </Breadcrumb.Item>
  </Breadcrumb>
</template>
