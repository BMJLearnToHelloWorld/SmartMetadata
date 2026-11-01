<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { Pagination } from 'ant-design-vue';

/**
 * Shared pagination wrapper over Ant Pagination. Page state lives in
 * the calling page (or paging.ts); this component only renders it.
 */
withDefaults(
  defineProps<{
    total: number;
    current: number;
    pageSize: number;
    testId?: string;
  }>(),
  { testId: 'sm-pagination' },
);
const emit = defineEmits<{ change: [page: number, pageSize: number] }>();
</script>

<template>
  <Pagination
    :data-testid="testId"
    :total="total"
    :current="current"
    :page-size="pageSize"
    show-size-changer
    @change="(page, size) => emit('change', page, size)"
  />
</template>
