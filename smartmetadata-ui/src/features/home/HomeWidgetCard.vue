<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { Card } from 'ant-design-vue';

withDefaults(
  defineProps<{
    title: string;
    testId?: string;
  }>(),
  {
    testId: 'home-widget',
  },
);
</script>

<template>
  <Card :data-testid="testId" class="home-widget-card" :bordered="true">
    <template #title>
      <span class="home-widget-card__title">{{ title }}</span>
    </template>
    <template #extra>
      <div class="home-widget-card__extra">
        <slot name="extra" />
      </div>
    </template>
    <div class="home-widget-card__body">
      <slot />
    </div>
  </Card>
</template>

<style scoped>
.home-widget-card {
  height: 100%;
  min-height: 320px;
  border-radius: var(--sm-radius-card);
  border-color: var(--sm-border-secondary);
  box-shadow: 0 1px 2px rgba(10, 13, 18, 0.04);
}
.home-widget-card :deep(.ant-card-head) {
  min-height: 48px;
  padding-inline: 16px;
  border-bottom-color: var(--sm-border-secondary);
}
.home-widget-card :deep(.ant-card-head-title) {
  font-size: 16px;
  font-weight: 600;
  color: var(--sm-text-primary);
}
.home-widget-card :deep(.ant-card-body) {
  padding: 16px;
  height: calc(100% - 48px);
}
.home-widget-card__title {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}
.home-widget-card__extra {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}
.home-widget-card__body {
  min-height: 240px;
  height: 100%;
}
</style>
