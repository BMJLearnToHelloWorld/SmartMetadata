<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { RouterLink, useRoute } from 'vue-router';
import { Card, Empty, Space } from 'ant-design-vue';
import PageHeader from '@/components/shared/PageHeader.vue';
import PageLayout from '@/components/shared/PageLayout.vue';
import type { ResidualPageLink } from '@/layouts/residualPages';

const route = useRoute();
const { t } = useI18n();

const title = computed(() => t(String(route.meta.titleKey || 'shells.generic.title')));
const lead = computed(() => t(String(route.meta.leadKey || 'shells.generic.lead')));
const empty = computed(() => t(String(route.meta.emptyKey || 'shells.generic.empty')));
const testId = computed(() => String(route.meta.testId || 'residual-page'));
const links = computed(() => (Array.isArray(route.meta.links) ? (route.meta.links as ResidualPageLink[]) : []));
</script>

<template>
  <PageLayout :document-title="title" :test-id="testId">
    <PageHeader :header="title" :sub-header="lead" :test-id="testId" />
    <Card :data-testid="`${testId}-card`">
      <Empty data-testid="residual-empty" :description="empty" />
      <Space v-if="links.length > 0" style="margin-top: 12px" data-testid="residual-links">
        <span>{{ t('shells.availableLinks') }}</span>
        <RouterLink
          v-for="link in links"
          :key="link.routeName"
          :data-testid="`residual-link-${link.routeName}`"
          :to="{ name: link.routeName }"
        >
          {{ t(link.titleKey) }}
        </RouterLink>
      </Space>
    </Card>
  </PageLayout>
</template>
