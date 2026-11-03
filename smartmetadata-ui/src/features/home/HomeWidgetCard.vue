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
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  border-radius: 16px;
  border-color: var(--sm-home-card-border);
  box-shadow: var(--sm-shadow-card);
  overflow: hidden;
}
.home-widget-card :deep(.ant-card-head) {
  flex: none;
  min-height: 48px;
  padding-inline: 16px;
  border-bottom-color: var(--sm-border-secondary);
}
.home-widget-card :deep(.ant-card-head-wrapper) {
  align-items: center;
  gap: 8px;
}
.home-widget-card :deep(.ant-card-head-title) {
  overflow: hidden;
  font-size: 16px;
  font-weight: 600;
  color: var(--sm-text-primary);
  text-overflow: ellipsis;
  white-space: nowrap;
}
.home-widget-card :deep(.ant-card-extra) {
  flex: none;
}
.home-widget-card :deep(.ant-card-body) {
  flex: 1;
  min-height: 0;
  padding: 16px;
  overflow: auto;
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
  min-height: 0;
}
</style>
