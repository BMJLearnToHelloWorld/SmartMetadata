<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { RouterLink } from 'vue-router';
import { Card, Col, Row, Typography } from 'ant-design-vue';
import { SETTINGS_CATEGORIES, sortSettingsItemsByRenderedTitle } from '@/settings/hub';
import PageHeader from '@/components/shared/PageHeader.vue';
import PageLayout from '@/components/shared/PageLayout.vue';

const { t } = useI18n();

/** Categories render as authored, except flagged ones sort by rendered title (R-2). */
const sortedCategories = computed(() =>
  SETTINGS_CATEGORIES.map((category) => ({
    ...category,
    items: category.sortItemsByRenderedTitle
      ? sortSettingsItemsByRenderedTitle(category.items, (key) => t(key))
      : category.items,
  })),
);
</script>

<template>
  <PageLayout test-id="settings-hub">
    <PageHeader :header="t('settings.title')" :sub-header="t('settings.lead')" test-id="settings-hub-title" />
    <Row :gutter="[16, 16]">
      <Col v-for="category in sortedCategories" :key="category.key" :xs="24" :md="12" :xl="8">
        <Card class="settings-hub__card" :data-testid="`settings-category-${category.key}`" size="small">
          <Typography.Title :level="5">{{ t(category.titleKey) }}</Typography.Title>
          <Typography.Paragraph type="secondary">{{ t(category.descriptionKey) }}</Typography.Paragraph>
          <ul class="settings-hub__items">
            <li v-for="item in category.items" :key="item.key">
              <RouterLink
                v-if="item.kind === 'route' && item.routeName"
                :to="{ name: item.routeName, params: item.routeParams }"
                :data-testid="`settings-link-${item.key}`"
                class="settings-hub__link"
              >
                <component :is="item.icon" v-if="item.icon" class="settings-hub__icon" />
                <span class="settings-hub__link-text">
                  <span>{{ t(item.titleKey) }}</span>
                  <span
                    v-if="item.descriptionKey"
                    class="settings-hub__item-description"
                  >
                    {{
                      item.descriptionEntityKey
                        ? t(item.descriptionKey, { entity: t(item.descriptionEntityKey) })
                        : t(item.descriptionKey)
                    }}
                  </span>
                </span>
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
.settings-hub__link {
  display: flex;
  gap: 8px;
  align-items: flex-start;
  color: var(--sm-color-primary);
}
.settings-hub__icon {
  flex-shrink: 0;
  margin-top: 2px;
  font-size: 14px;
}
.settings-hub__link-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}
.settings-hub__item-description {
  color: var(--sm-text-tertiary);
  font-size: 12px;
}
.settings-hub__residual {
  color: var(--sm-text-tertiary);
  display: flex;
  flex-direction: column;
  gap: 2px;
  font-size: 14px;
}
.settings-hub__residual-why {
  color: var(--sm-text-quaternary);
  font-size: 12px;
}
</style>
