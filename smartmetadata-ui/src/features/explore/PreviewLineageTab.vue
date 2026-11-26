<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { Button, Empty, Input, Spin, Typography } from 'ant-design-vue';
import { searchLineage } from '@/api/lineage';
import { assetLocation, isDetailWired } from '@/catalog/entityRoutes';
import { lineageNeighbors, mapSearchLineage, type LineageGraphNode } from '@/lineage/graphModel';

const props = defineProps<{
  entityType: string;
  fqn: string;
}>();

const { t, te } = useI18n();
const router = useRouter();

// Pin `LineageTabContent.tsx` (a3012259ca): upstream/downstream
// filter (default `downstream`, `EntitySummaryPanel.component.tsx:248`)
// + search + summary list; data fetched by `getLineageDataByFQN`
// with depth/nodes config (`getSummaryLineageConfig`:
// upstreamDepth/downstreamDepth/nodesPerLayer, defaults 1/1/50).
// The product fetch is `searchLineage`, the `getLineageDataByFQN`
// equivalent, and `mapSearchLineage` + `lineageNeighbors` are its
// `getUpstreamDownstreamNodesEdges` equivalent.
const loading = ref(true);
const upstream = ref<LineageGraphNode[]>([]);
const downstream = ref<LineageGraphNode[]>([]);
const filter = ref<'upstream' | 'downstream'>('downstream');
const searchText = ref('');

let generation = 0;

async function load(): Promise<void> {
  const current = ++generation;
  loading.value = true;
  try {
    const payload = await searchLineage({
      fqn: props.fqn,
      entityType: props.entityType,
      upstreamDepth: 1,
      downstreamDepth: 1,
      size: 50,
    });
    if (current !== generation) {
      return;
    }
    const model = mapSearchLineage(payload, props.fqn);
    const neighbors = lineageNeighbors(model);
    upstream.value = neighbors.upstream.filter((node) => node.id !== model.centerId);
    downstream.value = neighbors.downstream.filter((node) => node.id !== model.centerId);
  } catch {
    // Pin toasts and leaves `lineageData` null, which renders the
    // no-data empty state; the preview section (LineageSection) treats
    // a failed fetch the same silent way.
    if (current === generation) {
      upstream.value = [];
      downstream.value = [];
    }
  } finally {
    if (current === generation) {
      loading.value = false;
    }
  }
}

onMounted(() => {
  void load();
});

watch(
  () => [props.entityType, props.fqn],
  () => {
    void load();
  },
);

const visibleItems = computed(() => {
  const query = searchText.value.trim().toLowerCase();
  const items = filter.value === 'upstream' ? upstream.value : downstream.value;
  if (!query) {
    return items;
  }
  return items.filter((node) => {
    const name = (node.displayName || node.name || '').toLowerCase();
    const fqn = (node.fullyQualifiedName || '').toLowerCase();
    return name.includes(query) || fqn.includes(query);
  });
});

function entityLabel(entityType: string): string {
  const key = `explore.entity.${entityType}`;
  return te(key) ? t(key) : entityType;
}

// Pin links every item to its detail page
// (`getEntityLinkFromType`); the product links the wired asset types
// and renders the rest as plain text (a lineage neighbour of a
// governance type has no FQN-addressable detail route here).
function itemLocation(node: LineageGraphNode) {
  if (!node.fullyQualifiedName || !isDetailWired(node.entityType) || !router.hasRoute('asset')) {
    return null;
  }
  return assetLocation(node.entityType, node.fullyQualifiedName);
}

// Pin `renderTruncatedPath`: the FQN minus its last segment.
function pathOf(node: LineageGraphNode): string {
  const parts = (node.fullyQualifiedName || '').split('.');
  return parts.slice(0, -1).join(' > ');
}
</script>

<template>
  <div data-testid="explore-preview-lineage-tab">
    <Spin v-if="loading" data-testid="preview-lineage-loading" />
    <template v-else>
      <div class="preview-lineage-tab__filters">
        <Button
          v-for="direction in (['upstream', 'downstream'] as const)"
          :key="direction"
          type="text"
          size="small"
          :class="{ 'preview-lineage-tab__filter--active': filter === direction }"
          :data-testid="`preview-lineage-filter-${direction}`"
          @click="filter = direction"
        >
          {{ t(`lineage.${direction}`) }}
          ({{ direction === 'upstream' ? upstream.length : downstream.length }})
        </Button>
      </div>
      <Input
        v-model:value="searchText"
        :placeholder="t('label.search-for-type', { type: t('label.entity') })"
        data-testid="searchbar"
      />
      <Empty
        v-if="visibleItems.length === 0"
        data-testid="preview-lineage-empty"
        :description="t('label.no-data-found')"
      />
      <ul v-else class="preview-lineage-tab__list">
        <li
          v-for="node in visibleItems"
          :key="node.id"
          class="preview-lineage-tab__item"
          :data-testid="`preview-lineage-item-${node.id}`"
        >
          <div class="preview-lineage-tab__path">{{ pathOf(node) }}</div>
          <router-link v-if="itemLocation(node)" :to="itemLocation(node)!">
            {{ node.displayName || node.name }}
          </router-link>
          <span v-else>{{ node.displayName || node.name }}</span>
          <div class="preview-lineage-tab__meta">
            <Typography.Text type="secondary">{{ entityLabel(node.entityType) }}</Typography.Text>
          </div>
        </li>
      </ul>
    </template>
  </div>
</template>

<style scoped>
.preview-lineage-tab__filters {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-bottom: 8px;
}
.preview-lineage-tab__filter--active {
  color: var(--sm-color-primary);
  font-weight: 500;
}
.preview-lineage-tab__list {
  margin: 8px 0 0;
  padding: 0;
  list-style: none;
}
.preview-lineage-tab__item {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 8px 0;
  border-bottom: 1px solid var(--sm-border-secondary);
  font-size: 13px;
}
.preview-lineage-tab__path {
  overflow: hidden;
  color: var(--sm-text-tertiary);
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.preview-lineage-tab__meta {
  font-size: 12px;
}
</style>
