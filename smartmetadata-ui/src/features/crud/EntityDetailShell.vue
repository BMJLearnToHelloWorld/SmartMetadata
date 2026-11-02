<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { Alert, Breadcrumb, Card, Empty, Space, Spin, Tag, Tabs, Typography } from 'ant-design-vue';
import type { EntityBreadcrumb, EntityDetailTab } from './types';

const { t } = useI18n();
const router = useRouter();

const props = withDefaults(
  defineProps<{
    title: string;
    name?: string;
    fqn?: string;
    deleted?: boolean;
    lead?: string;
    loading?: boolean;
    error?: string;
    empty?: boolean;
    breadcrumbs?: EntityBreadcrumb[];
    tabs?: EntityDetailTab[];
    activeTab?: string;
    tabsTestId?: string;
  }>(),
  {
    name: '',
    fqn: '',
    deleted: false,
    lead: '',
    loading: false,
    error: '',
    empty: false,
    breadcrumbs: () => [],
    tabs: () => [],
    activeTab: '',
    tabsTestId: 'entity-detail-tabs',
  },
);

const emit = defineEmits<{
  'update:activeTab': [key: string];
}>();

const showName = computed(() => Boolean(props.name) && props.name !== props.title);
const currentTab = computed(() => props.activeTab || props.tabs[0]?.key || '');
const emptyDescription = computed(() => t('crud.empty'));

function onBreadcrumb(item: EntityBreadcrumb): void {
  if (item.to) {
    void router.push(item.to);
  }
}
</script>

<template>
  <Card data-testid="entity-detail-shell">
    <Spin :spinning="loading">
      <Space direction="vertical" size="middle" style="width: 100%">
        <Breadcrumb v-if="breadcrumbs.length" data-testid="entity-detail-breadcrumb">
          <Breadcrumb.Item v-for="(item, index) in breadcrumbs" :key="`${item.label}-${index}`">
            <a
              v-if="item.to"
              href="#"
              :data-testid="`entity-detail-crumb-${index}`"
              @click.prevent="onBreadcrumb(item)"
            >
              {{ item.label }}
            </a>
            <span v-else>{{ item.label }}</span>
          </Breadcrumb.Item>
        </Breadcrumb>
        <div class="entity-detail__head">
          <div>
            <Space align="center" wrap>
              <h5 class="entity-detail__title" data-testid="entity-detail-title">
                {{ title }}
              </h5>
              <Tag v-if="deleted" color="red" data-testid="entity-detail-deleted">{{ t('crud.deleted') }}</Tag>
            </Space>
            <Typography.Paragraph v-if="showName || fqn" type="secondary" data-testid="entity-detail-subtitle">
              <template v-if="showName">{{ name }}</template>
              <template v-if="showName && fqn"> · </template>
              <template v-if="fqn">{{ fqn }}</template>
            </Typography.Paragraph>
            <Typography.Paragraph v-if="lead" type="secondary" data-testid="entity-detail-lead">
              {{ lead }}
            </Typography.Paragraph>
            <slot name="meta" />
          </div>
          <Space class="entity-detail__actions" wrap>
            <slot name="actions" />
          </Space>
        </div>
        <Alert v-if="error" type="error" show-icon :message="error" data-testid="entity-detail-error" />
        <Empty
          v-if="!loading && !error && empty"
          data-testid="entity-detail-empty"
        >
          <template #description>
            <div>{{ emptyDescription }}</div>
            <Typography.Text type="secondary">{{ t('crud.emptyHint') }}</Typography.Text>
          </template>
        </Empty>
        <template v-else-if="!empty">
          <Tabs
            v-if="tabs.length"
            class="entity-detail-tabs"
            :data-testid="tabsTestId"
            :active-key="currentTab"
            @change="(key: string | number) => emit('update:activeTab', String(key))"
          >
            <Tabs.TabPane v-for="tab in tabs" :key="tab.key" :tab="tab.label" force-render :data-testid="tab.testId">
              <slot :name="tab.key" />
            </Tabs.TabPane>
          </Tabs>
          <slot v-else />
        </template>
      </Space>
    </Spin>
  </Card>
</template>

<style scoped>
.entity-detail__head {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  align-items: flex-start;
}

.entity-detail__title {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  line-height: 1.5;
  color: var(--sm-text-primary);
}

.entity-detail__actions {
  flex-shrink: 0;
}
</style>
