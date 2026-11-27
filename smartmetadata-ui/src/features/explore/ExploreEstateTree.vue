<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed, h, type VNode } from 'vue';
import { useI18n } from 'vue-i18n';
import { Empty, Tree, Typography } from 'ant-design-vue';
import { entityIconFor } from '@/catalog/entityIcons';
import type { EstateNode } from '@/catalog/browseEstate';
import ServiceLogo from '@/components/ingestion/ServiceLogo.vue';

const props = defineProps<{
  nodes: EstateNode[];
  selectedKeys: string[];
  expandedKeys: string[];
}>();

const emit = defineEmits<{
  select: [node: EstateNode];
  expand: [keys: string[]];
}>();

const { t } = useI18n();

/**
 * Official getExploreTree / getEntityIcon keys for category roots.
 * Drive uses the directory glyph (official uses DRIVE_SERVICE); governance
 * has no dedicated product entity icon, so it uses the tag glyph also
 * used for official Governance children.
 */
const CATEGORY_ICON_TYPE: Record<string, string> = {
  databases: 'database',
  dashboards: 'dashboard',
  pipelines: 'pipeline',
  topics: 'topic',
  mlmodels: 'mlmodel',
  containers: 'container',
  searchIndexes: 'searchIndex',
  apis: 'apiCollection',
  drive: 'directory',
  governance: 'tag',
  domains: 'domain',
  contextCenter: 'page',
};

interface TreeItem {
  key: string;
  title: string;
  count: number;
  node: EstateNode;
  isLeaf?: boolean;
  children?: TreeItem[];
}

function toTreeItem(node: EstateNode): TreeItem {
  return {
    key: node.key,
    title: node.title || (node.titleKey ? t(node.titleKey) : node.key),
    count: node.count,
    node,
    isLeaf: node.isLeaf,
    children: node.children?.map(toTreeItem),
  };
}

const treeData = computed<TreeItem[]>(() => props.nodes.map(toTreeItem));

function findNode(items: TreeItem[], key: string): EstateNode | undefined {
  for (const item of items) {
    if (item.key === key) {
      return item.node;
    }
    const nested = item.children ? findNode(item.children, key) : undefined;
    if (nested) {
      return nested;
    }
  }
  return undefined;
}

function onSelect(keys: (string | number)[]): void {
  const key = String(keys[0] ?? props.selectedKeys[0] ?? '');
  const node = findNode(treeData.value, key);
  if (node) {
    emit('select', node);
  }
}

function onExpand(keys: (string | number)[]): void {
  emit(
    'expand',
    keys.map((key) => String(key)),
  );
}

function nodeIcon(node: EstateNode): VNode {
  if (node.service && !node.database) {
    return h(ServiceLogo, {
      source: {
        serviceType: node.serviceType,
        style: node.iconUrl ? { iconURL: node.iconUrl } : undefined,
      },
      size: 18,
      testId: `explore-estate-logo-${node.key}`,
    });
  }
  if (node.serviceType && !node.service) {
    return h(ServiceLogo, {
      source: { serviceType: node.serviceType },
      size: 18,
      testId: `explore-estate-logo-${node.key}`,
    });
  }
  const entityType =
    node.entityType ??
    (node.schema ? 'databaseSchema' : undefined) ??
    (node.database ? 'database' : undefined) ??
    CATEGORY_ICON_TYPE[node.categoryId] ??
    'database';
  const icon = entityIconFor(entityType);
  return h(icon, {
    class: 'estate__icon',
    style: { fontSize: '16px' },
    'data-testid': `explore-estate-icon-${node.key}`,
  });
}
</script>

<template>
  <section class="estate" data-testid="explore-estate">
    <Typography.Text strong class="estate__title">{{ t('explore.browseEstate') }}</Typography.Text>
    <Empty
      v-if="!nodes.length"
      data-testid="explore-estate-empty"
      :description="t('explore.browseEstateEmpty')"
    />
    <Tree
      v-else
      block-node
      :tree-data="treeData"
      :selected-keys="selectedKeys"
      :expanded-keys="expandedKeys"
      :selectable="true"
      @select="onSelect"
      @expand="onExpand"
    >
      <template #title="{ title, count, key, node }">
        <span class="estate__row" :data-testid="`explore-estate-${key}`">
          <span class="estate__icon-wrap" :data-testid="`explore-estate-icon-${key}`">
            <component :is="nodeIcon(node)" />
          </span>
          <span class="estate__label">{{ title }}</span>
          <span v-if="count" class="estate__count">{{ count }}</span>
        </span>
      </template>
    </Tree>
  </section>
</template>

<style scoped>
.estate__title {
  display: block;
  margin-bottom: 8px;
}
.estate__row {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  min-width: 0;
}
.estate__icon-wrap {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 18px;
  height: 18px;
}
.estate__label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.estate__count {
  margin-left: auto;
  flex-shrink: 0;
  min-width: 20px;
  padding: 0 6px;
  border-radius: 999px;
  background: var(--sm-bg-elevated);
  color: var(--sm-text-tertiary);
  font-size: 11px;
  line-height: 18px;
  text-align: center;
}
.estate__icon {
  color: var(--sm-text-secondary);
}
:deep(.ant-tree-iconEle) {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
}
</style>
