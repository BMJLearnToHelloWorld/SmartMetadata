<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute } from 'vue-router';
import { Card, Empty, Typography } from 'ant-design-vue';

const route = useRoute();
const { t } = useI18n();

const title = computed(() => t(String(route.meta.titleKey || 'shells.generic.title')));
const lead = computed(() => t(String(route.meta.leadKey || 'shells.generic.lead')));
const empty = computed(() => t(String(route.meta.emptyKey || 'shells.generic.empty')));
const testId = computed(() => String(route.meta.testId || 'residual-page'));
</script>

<template>
  <Card :data-testid="testId">
    <Typography.Title :level="4">{{ title }}</Typography.Title>
    <Typography.Paragraph type="secondary">{{ lead }}</Typography.Paragraph>
    <Empty data-testid="residual-empty" :description="empty" />
  </Card>
</template>
