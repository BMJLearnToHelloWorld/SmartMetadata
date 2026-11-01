<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { Card, Col, Row } from 'ant-design-vue';
import PageHeader from '@/components/shared/PageHeader.vue';
import PageLayout from '@/components/shared/PageLayout.vue';
import SmState from '@/components/shared/SmState.vue';
import { APP_ANALYTICS_BLOCKS } from '@/catalog/insightsTabs';

const { t } = useI18n();
</script>

<template>
  <PageLayout test-id="app-analytics-layout">
    <PageHeader :header="t('insights.tabs.appAnalytics')" :sub-header="t('insights.appAnalyticsEmpty')" />
    <Row :gutter="[16, 16]">
      <Col v-for="block in APP_ANALYTICS_BLOCKS" :key="block.key" :xs="24" :lg="12">
        <Card size="small" :title="t(block.titleKey)">
          <SmState state="empty" :test-id="`app-analytics-${block.key}-empty`" :empty-text="t(block.reasonKey)" />
        </Card>
      </Col>
    </Row>
  </PageLayout>
</template>
