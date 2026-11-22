/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
<script setup lang="ts">
import { getMetricHierarchyContext, type Metric, type MetricHierarchyContext } from '@/api/metrics';
import type { AssetDetail } from '@/types/api';
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';

/**
 * Official MetricHierarchyCard
 * (openmetadata-ui/.../Metric/MetricHierarchyCard/MetricHierarchyCard.tsx
 * + useMetricHierarchyCard.ts), metric only: group row, ancestors
 * root-to-parent, the current metric leading its level, children, then
 * same-parent siblings, 25 per page with load-more and dedup. A deleted
 * metric renders its own row only — the hierarchy endpoint only
 * resolves live metrics. The add-child button calls the caller's
 * onAddChild, which owns the shared create drawer (the drawer handle
 * is created once per view, so the cell must not mint its own).
 *
 * Named deviations: pin's Tailwind depth-indent classes become inline
 * paddingLeft per depth (0/20/54/82/110px, pin INDENT_CLASS_BY_DEPTH);
 * pin's owner avatar group becomes owner names as text — the product
 * has no avatar-group primitive for this row.
 */
const PAGE_LIMIT = 25;
const INDENT_PX_BY_DEPTH = [0, 20, 54, 82, 110];

const props = defineProps<{
  metric: AssetDetail;
  canAddChild: boolean;
  onAddChild: () => void;
}>();

const { t } = useI18n();
const context = ref<MetricHierarchyContext | null>(null);
const children = ref<Metric[]>([]);
const siblings = ref<Metric[]>([]);
const loading = ref(true);
const loadFailed = ref(false);
const loadingChildren = ref(false);
const loadingSiblings = ref(false);

const ancestors = computed(() => context.value?.ancestors ?? []);
const group = computed(() => context.value?.group);
const isStandalone = computed(
  () =>
    !group.value &&
    ancestors.value.length === 0 &&
    siblings.value.length === 0 &&
    children.value.length === 0,
);
const currentDepth = computed(() => (group.value ? 1 : 0) + ancestors.value.length);
const hasMoreChildren = computed(
  () => children.value.length < (context.value?.childrenTotal ?? 0),
);
const hasMoreSiblings = computed(
  () => siblings.value.length < (context.value?.siblingTotal ?? 0),
);

function indent(depth: number): number {
  return INDENT_PX_BY_DEPTH[Math.min(depth, INDENT_PX_BY_DEPTH.length - 1)];
}

function ownerText(metric: Metric): string {
  return metric.owners.map((owner) => owner.displayName || owner.name).join(', ');
}

async function load(): Promise<void> {
  if (!props.metric.id || props.metric.deleted) {
    loading.value = false;
    return;
  }
  loading.value = true;
  loadFailed.value = false;
  try {
    const result = await getMetricHierarchyContext(props.metric.id, {
      childLimit: PAGE_LIMIT,
      childOffset: 0,
      siblingLimit: PAGE_LIMIT,
      siblingOffset: 0,
    });
    context.value = result;
    children.value = result.children;
    siblings.value = result.siblings.filter((sibling) => sibling.id !== props.metric.id);
  } catch {
    loadFailed.value = true;
  } finally {
    loading.value = false;
  }
}

async function loadMoreChildren(): Promise<void> {
  if (!props.metric.id || !hasMoreChildren.value || loadingChildren.value) {
    return;
  }
  loadingChildren.value = true;
  try {
    const result = await getMetricHierarchyContext(props.metric.id, {
      childLimit: PAGE_LIMIT,
      childOffset: children.value.length,
    });
    const known = new Set(children.value.map((child) => child.id));
    children.value = [
      ...children.value,
      ...result.children.filter((child) => !known.has(child.id)),
    ];
  } finally {
    loadingChildren.value = false;
  }
}

async function loadMoreSiblings(): Promise<void> {
  if (!props.metric.id || !hasMoreSiblings.value || loadingSiblings.value) {
    return;
  }
  loadingSiblings.value = true;
  try {
    const result = await getMetricHierarchyContext(props.metric.id, {
      siblingLimit: PAGE_LIMIT,
      siblingOffset: siblings.value.length,
    });
    const known = new Set(siblings.value.map((sibling) => sibling.id));
    siblings.value = [
      ...siblings.value,
      ...result.siblings
        .filter((sibling) => sibling.id !== props.metric.id)
        .filter((sibling) => !known.has(sibling.id)),
    ];
  } finally {
    loadingSiblings.value = false;
  }
}

onMounted(load);
</script>

<template>
  <div class="metric-hierarchy-cell" data-testid="metric-hierarchy">
    <div class="metric-hierarchy-cell__header">
      <span class="metric-hierarchy-cell__title">{{ t('label.metric-hierarchy') }}</span>
      <a-button
        v-if="canAddChild"
        size="small"
        data-testid="metric-hierarchy-add-child"
        @click="onAddChild"
      >
        {{ t('label.add-child-metric') }}
      </a-button>
    </div>
    <a-skeleton v-if="loading" active data-testid="metric-hierarchy-loading" />
    <a-alert
      v-else-if="loadFailed"
      data-testid="metric-hierarchy-error"
      type="error"
      :message="t('server.entity-fetch-error', { entity: t('label.metric-hierarchy') })"
      show-icon
    >
      <template #action>
        <a-button size="small" data-testid="metric-hierarchy-retry" @click="load">
          {{ t('label.try-again') }}
        </a-button>
      </template>
    </a-alert>
    <div v-else-if="metric.deleted" class="metric-hierarchy-cell__row" data-testid="metric-tree-current">
      <span class="metric-hierarchy-cell__name">{{ metric.displayName || metric.name }}</span>
      <a-tag>{{ t('label.deleted') }}</a-tag>
    </div>
    <div v-else>
      <p
        v-if="isStandalone"
        class="metric-hierarchy-cell__empty"
        data-testid="metric-tree-empty"
      >
        {{ t('message.metric-not-in-hierarchy') }}
      </p>
      <RouterLink
        v-if="group"
        data-testid="metric-tree-group"
        class="metric-hierarchy-cell__row metric-hierarchy-cell__row--link"
        :to="{
          name: 'governance-metrics',
          query: { highlight: group.fullyQualifiedName },
        }"
      >
        <span class="metric-hierarchy-cell__name">{{ group.displayName || group.name }}</span>
        <span class="metric-hierarchy-cell__meta">{{ t('label.metric-group') }}</span>
        <a-badge
          :count="group.metricCount ?? group.metrics?.length ?? 0"
          :overflow-count="9999"
          show-zero
        />
      </RouterLink>
      <div
        v-for="(ancestor, index) in ancestors"
        :key="ancestor.id"
        class="metric-hierarchy-cell__row"
        :style="{ paddingLeft: `${indent((group ? 1 : 0) + index)}px` }"
        :data-testid="`metric-tree-ancestor-${ancestor.id}`"
      >
        <RouterLink :to="{ name: 'governance-metric', params: { fqn: ancestor.fullyQualifiedName } }">
          {{ ancestor.displayName || ancestor.name }}
        </RouterLink>
        <span v-if="ownerText(ancestor)" class="metric-hierarchy-cell__meta">
          {{ ownerText(ancestor) }}
        </span>
        <a-tag v-if="ancestor.deleted">{{ t('label.deleted') }}</a-tag>
      </div>
      <div
        class="metric-hierarchy-cell__row metric-hierarchy-cell__row--current"
        :style="{ paddingLeft: `${indent(currentDepth)}px` }"
        data-testid="metric-tree-current"
      >
        <span class="metric-hierarchy-cell__name">{{ metric.displayName || metric.name }}</span>
        <a-tag color="blue">{{ t('label.you-are-here') }}</a-tag>
      </div>
      <div
        v-for="child in children"
        :key="child.id"
        class="metric-hierarchy-cell__row"
        :style="{ paddingLeft: `${indent(currentDepth + 1)}px` }"
        :data-testid="`metric-tree-child-${child.id}`"
      >
        <RouterLink :to="{ name: 'governance-metric', params: { fqn: child.fullyQualifiedName } }">
          {{ child.displayName || child.name }}
        </RouterLink>
        <span v-if="ownerText(child)" class="metric-hierarchy-cell__meta">
          {{ ownerText(child) }}
        </span>
        <a-tag v-if="child.deleted">{{ t('label.deleted') }}</a-tag>
      </div>
      <a-button
        v-if="hasMoreChildren"
        type="link"
        size="small"
        :loading="loadingChildren"
        data-testid="metric-tree-more-children"
        @click="loadMoreChildren"
      >
        {{ t('label.show-more-entity', { entity: t('label.variant-plural') }) }}
      </a-button>
      <div
        v-for="sibling in siblings"
        :key="sibling.id"
        class="metric-hierarchy-cell__row"
        :style="{ paddingLeft: `${indent(currentDepth)}px` }"
        :data-testid="`metric-tree-peer-${sibling.id}`"
      >
        <RouterLink :to="{ name: 'governance-metric', params: { fqn: sibling.fullyQualifiedName } }">
          {{ sibling.displayName || sibling.name }}
        </RouterLink>
        <span v-if="ownerText(sibling)" class="metric-hierarchy-cell__meta">
          {{ ownerText(sibling) }}
        </span>
        <a-tag v-if="sibling.deleted">{{ t('label.deleted') }}</a-tag>
      </div>
      <a-button
        v-if="hasMoreSiblings"
        type="link"
        size="small"
        :loading="loadingSiblings"
        data-testid="metric-tree-more-peers"
        @click="loadMoreSiblings"
      >
        {{ t('label.show-more-entity', { entity: t('label.metric-plural') }) }}
      </a-button>
    </div>
  </div>
</template>

<style scoped>
.metric-hierarchy-cell__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}

.metric-hierarchy-cell__title {
  font-weight: 600;
}

.metric-hierarchy-cell__row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  padding-top: 6px;
  padding-bottom: 6px;
}

.metric-hierarchy-cell__row--current {
  font-weight: 600;
}

.metric-hierarchy-cell__row--link {
  text-decoration: none;
}

.metric-hierarchy-cell__name {
  font-weight: 600;
}

.metric-hierarchy-cell__meta {
  color: var(--sm-text-secondary);
  font-size: 12px;
}

.metric-hierarchy-cell__empty {
  color: var(--sm-text-secondary);
  padding: 8px 12px;
}
</style>
