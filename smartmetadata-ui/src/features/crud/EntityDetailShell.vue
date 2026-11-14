<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { Alert, Breadcrumb, Card, Empty, Space, Spin, Tag, Tabs, Typography, message } from 'ant-design-vue';
import PageHeader from '@/components/shared/PageHeader.vue';
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
    isBeta?: boolean;
    learningPageId?: string;
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
    isBeta: false,
    learningPageId: undefined,
  },
);

const emit = defineEmits<{
  'update:activeTab': [key: string];
}>();

const showName = computed(() => Boolean(props.name) && props.name !== props.title);

/** Subtitle text for PageHeader: name and FQN joined, empty when neither. */
const subtitleText = computed(() => {
  const parts: string[] = [];
  if (showName.value && props.name) {
    parts.push(props.name);
  }
  if (props.fqn) {
    parts.push(props.fqn);
  }
  return parts.join(' · ');
});
const currentTab = computed(() => props.activeTab || props.tabs[0]?.key || '');
const emptyDescription = computed(() => t('crud.empty'));

function onBreadcrumb(item: EntityBreadcrumb): void {
  if (item.to) {
    // Fix1 nav contract: a failed navigation must surface, never vanish silently.
    // vue-router throws synchronously for an unresolvable name, so .catch
    // alone is not enough — the try/catch covers the synchronous throw.
    try {
      router.push(item.to).catch(() => {
        message.error(t('chrome.navFailed'));
      });
    } catch {
      message.error(t('chrome.navFailed'));
    }
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
          <PageHeader
            :header="title"
            :sub-header="subtitleText || undefined"
            :is-beta="isBeta"
            :learning-page-id="learningPageId"
            test-id="entity-detail"
          >
            <template #badge>
              <Tag v-if="deleted" color="red" data-testid="entity-detail-deleted">{{ t('crud.deleted') }}</Tag>
            </template>
            <template #below>
              <Typography.Paragraph v-if="lead" type="secondary" data-testid="entity-detail-lead">
                {{ lead }}
              </Typography.Paragraph>
              <slot name="meta" />
            </template>
          </PageHeader>
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
            <Tabs.TabPane v-for="tab in tabs" :key="tab.key" force-render :data-testid="tab.testId">
              <!-- No :tab prop: antd's parseTabList prefers the prop over
                   the slot, so the label (and the count pill) must come
                   from this slot for every tab. -->
              <template #tab>
                <template v-if="tab.count !== undefined">
                  <span class="entity-detail-tab-label">{{ tab.label }}</span>
                  <span
                    class="entity-detail-tab-count"
                    :data-testid="tab.testId ? `${tab.testId}-count` : undefined"
                  >
                    {{ tab.count }}
                  </span>
                </template>
                <template v-else>{{ tab.label }}</template>
              </template>
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

.entity-detail__actions {
  flex-shrink: 0;
}

.entity-detail-tab-count {
  display: inline-block;
  margin-left: 6px;
  padding: 0 6px;
  border-radius: var(--sm-border-radius);
  background: var(--sm-color-primary-bg);
  color: var(--sm-brand);
  font-size: 12px;
  line-height: 18px;
}
</style>
