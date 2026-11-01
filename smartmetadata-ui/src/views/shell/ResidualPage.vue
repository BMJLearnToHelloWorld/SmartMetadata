<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute } from 'vue-router';
import { Card, Empty } from 'ant-design-vue';
import PageHeader from '@/components/shared/PageHeader.vue';
import PageLayout from '@/components/shared/PageLayout.vue';

const route = useRoute();
const { t } = useI18n();

const title = computed(() => t(String(route.meta.titleKey || 'shells.generic.title')));
const lead = computed(() => t(String(route.meta.leadKey || 'shells.generic.lead')));
const empty = computed(() => t(String(route.meta.emptyKey || 'shells.generic.empty')));
const testId = computed(() => String(route.meta.testId || 'residual-page'));
</script>

<template>
  <PageLayout :document-title="title" :test-id="testId">
    <PageHeader :header="title" :sub-header="lead" :test-id="testId" />
    <Card :data-testid="`${testId}-card`">
      <Empty data-testid="residual-empty" :description="empty" />
    </Card>
  </PageLayout>
</template>
