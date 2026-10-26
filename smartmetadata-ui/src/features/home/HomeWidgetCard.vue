<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { Empty, Spin, Typography } from 'ant-design-vue';

defineProps<{
  title: string;
  testId: string;
  loading?: boolean;
  error?: string;
  empty?: boolean;
  emptyText?: string;
  meta?: string;
  summary?: string;
}>();
</script>

<template>
  <section class="home-widget" :data-testid="testId">
    <header class="home-widget__head">
      <div>
        <Typography.Title :level="5" class="home-widget__title">{{ title }}</Typography.Title>
        <Typography.Text v-if="meta" type="secondary" class="home-widget__meta">{{ meta }}</Typography.Text>
      </div>
      <div class="home-widget__extra">
        <slot name="extra" />
      </div>
    </header>
    <Typography.Paragraph v-if="summary" type="secondary" class="home-widget__summary">
      {{ summary }}
    </Typography.Paragraph>
    <Spin :spinning="Boolean(loading)">
      <Empty
        v-if="!loading && (error || empty)"
        :data-testid="`${testId}-empty`"
        :description="error || emptyText"
      />
      <div v-else-if="!loading" class="home-widget__body">
        <slot />
      </div>
    </Spin>
  </section>
</template>

<style scoped>
.home-widget {
  height: 100%;
  min-height: 220px;
  padding: 16px 16px 12px;
  background: var(--sm-bg-container);
  border: 1px solid var(--sm-border-secondary);
  border-radius: var(--sm-radius-card);
  box-shadow: 0 1px 2px rgba(10, 13, 18, 0.04);
}
.home-widget__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 8px;
}
.home-widget__title {
  margin: 0 !important;
}
.home-widget__meta,
.home-widget__summary {
  display: block;
  font-size: 12px;
  margin-bottom: 8px;
}
.home-widget__body {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
</style>
