<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { RouterLink } from 'vue-router';
import { Card, Col, Row, Typography } from 'ant-design-vue';
import { SETTINGS_CATEGORIES } from '@/settings/hub';
import PageHeader from '@/components/shared/PageHeader.vue';
import PageLayout from '@/components/shared/PageLayout.vue';

const { t } = useI18n();
</script>

<template>
  <PageLayout test-id="settings-hub">
    <PageHeader :header="t('settings.title')" :sub-header="t('settings.lead')" test-id="settings-hub-title" />
    <Row :gutter="[16, 16]">
      <Col v-for="category in SETTINGS_CATEGORIES" :key="category.key" :xs="24" :md="12" :xl="8">
        <Card class="settings-hub__card" :data-testid="`settings-category-${category.key}`" size="small">
          <Typography.Title :level="5">{{ t(category.titleKey) }}</Typography.Title>
          <Typography.Paragraph type="secondary">{{ t(category.descriptionKey) }}</Typography.Paragraph>
          <ul class="settings-hub__items">
            <li v-for="item in category.items" :key="item.key">
              <RouterLink
                v-if="item.kind === 'route' && item.routeName"
                :to="{ name: item.routeName }"
                :data-testid="`settings-link-${item.key}`"
              >
                {{ t(item.titleKey) }}
              </RouterLink>
              <span
                v-else
                class="settings-hub__residual"
                :data-testid="`settings-residual-${item.key}`"
              >
                {{ t(item.titleKey) }}
                <span class="settings-hub__residual-why">{{ t(item.residualKey ?? 'settings.residual.generic') }}</span>
              </span>
            </li>
          </ul>
        </Card>
      </Col>
    </Row>
  </PageLayout>
</template>

<style scoped>
.settings-hub__card {
  height: 100%;
}
.settings-hub__items {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.settings-hub__residual {
  color: var(--sm-text-secondary);
  display: flex;
  flex-direction: column;
  gap: 2px;
  font-size: 14px;
}
.settings-hub__residual-why {
  color: var(--sm-text-tertiary);
  font-size: 12px;
}
</style>
