<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { RouterLink } from 'vue-router';
import { Card, Col, Row, Typography } from 'ant-design-vue';
import { SETTINGS_CATEGORIES } from '@/settings/hub';

const { t } = useI18n();
</script>

<template>
  <div class="settings-hub" data-testid="settings-hub">
    <Typography.Title :level="4" data-testid="settings-hub-title">{{ t('settings.title') }}</Typography.Title>
    <Typography.Paragraph type="secondary" data-testid="settings-hub-lead">
      {{ t('settings.lead') }}
    </Typography.Paragraph>
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
  </div>
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
  color: #64748b;
  display: flex;
  flex-direction: column;
  gap: 2px;
  font-size: 13px;
}
.settings-hub__residual-why {
  color: #94a3b8;
  font-size: 12px;
}
</style>
