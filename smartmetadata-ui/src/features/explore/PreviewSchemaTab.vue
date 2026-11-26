<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { Empty, Pagination, Spin, Typography } from 'ant-design-vue';
import { assetLocation, isDetailWired } from '@/catalog/entityRoutes';
import type { AssetDetail } from '@/types/api';
import { buildPreviewSchemaSections, type PreviewSchemaSection } from './previewSchema';

const props = defineProps<{
  entityType: string;
  detail: AssetDetail | null;
  loading: boolean;
}>();

const { t } = useI18n();
const router = useRouter();

const sections = computed(() => buildPreviewSchemaSections(props.entityType, props.detail));

// E-3d: pin `ColumnSummaryList` pages at PAGE_SIZE_LARGE (50); the
// page resets when the entity changes so a new asset never opens on a
// stale page past its end.
const pageBySection = ref<Record<number, number>>({});
watch(
  () => [props.entityType, props.detail?.fullyQualifiedName],
  () => {
    pageBySection.value = {};
  },
);

function pageFor(index: number): number {
  return pageBySection.value[index] ?? 1;
}

function setPage(index: number, page: number): void {
  pageBySection.value = { ...pageBySection.value, [index]: page };
}

function pagedRows(section: Extract<PreviewSchemaSection, { kind: 'rows' }>, index: number) {
  const page = pageFor(index);
  const start = (page - 1) * section.pageSize;
  return section.rows.slice(start, start + section.pageSize);
}

// The header title is a router-link only when the router registers the
// detail route (same host-view guard as ExplorePreview's
// `resolvableLocation`): shared-preview hosts mount under routers
// without the `asset` route.
function refLocation(ref: { type?: string; fqn?: string }) {
  if (!ref.type || !ref.fqn || !isDetailWired(ref.type) || !router.hasRoute('asset')) {
    return null;
  }
  return assetLocation(ref.type, ref.fqn);
}
</script>

<template>
  <div data-testid="explore-preview-schema">
    <Spin v-if="loading" data-testid="preview-schema-loading" />
    <Empty v-else-if="sections.length === 0" data-testid="preview-schema-empty" :description="t('label.no-data-found')" />
    <template v-else>
      <section v-for="(section, index) in sections" :key="`${section.kind}-${section.headingKey}`" class="preview-schema__section">
        <Typography.Text type="secondary">{{ t(section.headingKey) }}</Typography.Text>
        <template v-if="section.kind === 'rows'">
          <ul class="preview-schema__list">
            <li
              v-for="row in pagedRows(section, index)"
              :key="row.key"
              class="preview-schema__row"
              :data-testid="`preview-schema-row-${row.key}`"
            >
              <span class="preview-schema__name">{{ row.name }}</span>
              <span v-if="row.dataType" class="preview-schema__type">{{ row.dataType }}</span>
              <span v-if="row.description" class="preview-schema__description">{{ row.description }}</span>
            </li>
          </ul>
          <Pagination
            v-if="section.rows.length > section.pageSize"
            :current="pageFor(index)"
            :page-size="section.pageSize"
            :total="section.rows.length"
            hide-on-single-page
            size="small"
            @change="(page: number) => setPage(index, page)"
          />
          <Typography.Text v-if="section.rows.length === 0" type="secondary">
            {{ t('label.no-data-found') }}
          </Typography.Text>
        </template>
        <template v-else-if="section.kind === 'tasks'">
          <ul class="preview-schema__list">
            <li
              v-for="task in section.tasks"
              :key="task.key"
              class="preview-schema__row"
              :data-testid="`preview-schema-row-${task.key}`"
            >
              <span class="preview-schema__name">{{ task.name }}</span>
              <span v-if="task.dataType" class="preview-schema__type">{{ task.dataType }}</span>
              <span v-if="task.description" class="preview-schema__description">{{ task.description }}</span>
            </li>
          </ul>
          <Typography.Text v-if="section.tasks.length === 0" type="secondary">
            {{ t('label.no-data-found') }}
          </Typography.Text>
        </template>
        <template v-else-if="section.kind === 'refs'">
          <ul class="preview-schema__list">
            <li
              v-for="ref in section.refs"
              :key="ref.key"
              class="preview-schema__row"
              :data-testid="`preview-schema-row-${ref.key}`"
            >
              <router-link v-if="refLocation(ref)" :to="refLocation(ref)!">{{ ref.name }}</router-link>
              <span v-else class="preview-schema__name">{{ ref.name }}</span>
            </li>
          </ul>
          <Typography.Text v-if="section.refs.length === 0" type="secondary">
            {{ t('label.no-data-found') }}
          </Typography.Text>
        </template>
        <pre v-else class="preview-schema__code">{{ section.json }}</pre>
      </section>
    </template>
  </div>
</template>

<style scoped>
.preview-schema__section {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-bottom: 12px;
}
.preview-schema__list {
  margin: 0;
  padding: 0;
  list-style: none;
}
.preview-schema__row {
  display: flex;
  flex-wrap: wrap;
  gap: 2px 8px;
  align-items: baseline;
  padding: 4px 0;
  border-bottom: 1px solid var(--sm-border-secondary);
  font-size: 13px;
}
.preview-schema__name {
  font-weight: 500;
}
.preview-schema__type {
  color: var(--sm-text-tertiary);
  font-size: 12px;
}
.preview-schema__description {
  flex-basis: 100%;
  color: var(--sm-text-tertiary);
  font-size: 12px;
}
.preview-schema__code {
  overflow: auto;
  max-height: 320px;
  margin: 0;
  padding: 8px;
  border-radius: var(--sm-border-radius);
  background: var(--sm-bg-elevated);
  font-size: 12px;
  white-space: pre-wrap;
  word-break: break-word;
}
</style>
