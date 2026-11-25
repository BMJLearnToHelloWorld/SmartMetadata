<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { RouterLink } from 'vue-router';
import { Drawer, Spin, Tag } from 'ant-design-vue';
import { apiRequest } from '@/api/client';
import { assetLocation, resolveDetailEndpoint } from '@/catalog/entityRoutes';

/**
 * Pin `LineageOverlays` (a3012259ca,
 * `components/Lineage/Lineage/LineageOverlays.tsx:111-130`): the node
 * detail drawer — a 576px slideout (`data-testid="lineage-entity-panel"`)
 * whose header renders the entity name as a detail-page link
 * (`EntityTitleSection.tsx:177-182`, `data-testid="entity-link"`) and
 * whose body is the entity summary panel (`EntitySummaryPanel
 * isSideDrawer`). The product has no `EntitySummaryPanel`, so the body
 * is a compact summary fetched from the entity detail endpoint
 * (description, service, domains, tags, owners, data products); a
 * failed fetch only drops the summary — the name and link still
 * render. The drawer is dismissable (mask + Escape) and destroyed on
 * close.
 */
const props = defineProps<{
  open: boolean;
  entityType: string;
  fqn: string;
  displayName?: string;
  pathLabel?: string;
}>();

const emit = defineEmits<{
  close: [];
}>();

const { t } = useI18n();

interface EntitySummary {
  description?: string;
  service?: { name?: string; displayName?: string };
  domains?: Array<{ name?: string; displayName?: string }>;
  tags?: Array<{ tagFQN?: string }>;
  owners?: Array<{ name?: string; displayName?: string }>;
  dataProducts?: Array<{ name?: string; displayName?: string }>;
}

const summary = ref<EntitySummary | null>(null);
const loading = ref(false);

const detailLink = computed(() => assetLocation(props.entityType, props.fqn));
const title = computed(() => props.displayName || props.fqn);
const serviceName = computed(
  () => summary.value?.service?.displayName || summary.value?.service?.name,
);

function labelOf(item: { name?: string; displayName?: string }): string {
  return item.displayName || item.name || '';
}

async function loadSummary(): Promise<void> {
  const endpoint = resolveDetailEndpoint(props.entityType, props.fqn);
  if (!endpoint) {
    summary.value = null;
    return;
  }
  loading.value = true;
  try {
    summary.value = await apiRequest<EntitySummary>(endpoint.path, {
      query: { fields: endpoint.fields },
    });
  } catch {
    summary.value = null;
  } finally {
    loading.value = false;
  }
}

watch(
  () => [props.open, props.entityType, props.fqn] as const,
  ([open]) => {
    if (open) {
      void loadSummary();
    }
  },
  { immediate: true },
);
</script>

<template>
  <Drawer
    :open="open"
    :width="576"
    placement="right"
    :footer="null"
    :destroy-on-close="true"
    @close="emit('close')"
  >
    <template #title>
      <span class="lineage-entity-drawer__title">
        <RouterLink :to="detailLink" data-testid="entity-link" @click="emit('close')">
          {{ title }}
        </RouterLink>
        <Tag class="lineage-entity-drawer__type">{{ entityType }}</Tag>
      </span>
    </template>
    <!-- The panel testid lives on this native div, not on <Drawer>:
      antd drops fallthrough attrs on the drawer root (same class of
      issue as the #341 Spin fallthrough-class bug), so a testid there
      never reaches the DOM. -->
    <div class="lineage-entity-drawer__body" data-testid="lineage-entity-panel">
      <Spin v-if="loading" :tip="t('shared.loading')" />
      <template v-else>
        <p v-if="pathLabel" class="lineage-entity-drawer__path">{{ pathLabel }}</p>
        <p v-if="summary?.description" class="lineage-entity-drawer__description">
          {{ summary.description }}
        </p>
        <dl v-if="summary" class="lineage-entity-drawer__fields">
          <template v-if="serviceName">
            <dt>{{ t('lineage.lensServiceName') }}</dt>
            <dd>{{ serviceName }}</dd>
          </template>
          <template v-if="summary.domains?.length">
            <dt>{{ t('lineage.filterDomains') }}</dt>
            <dd>
              <Tag v-for="domain in summary.domains" :key="domain.name">{{ labelOf(domain) }}</Tag>
            </dd>
          </template>
          <template v-if="summary.dataProducts?.length">
            <dt>{{ t('lineage.lensDataProductName') }}</dt>
            <dd>
              <Tag v-for="product in summary.dataProducts" :key="product.name">
                {{ labelOf(product) }}
              </Tag>
            </dd>
          </template>
          <template v-if="summary.tags?.length">
            <dt>{{ t('lineage.impactTags') }}</dt>
            <dd>
              <Tag v-for="tag in summary.tags" :key="tag.tagFQN">{{ tag.tagFQN }}</Tag>
            </dd>
          </template>
          <template v-if="summary.owners?.length">
            <dt>{{ t('lineage.filterOwners') }}</dt>
            <dd>{{ summary.owners.map(labelOf).filter(Boolean).join(', ') }}</dd>
          </template>
        </dl>
        <p class="lineage-entity-drawer__fqn">{{ fqn }}</p>
      </template>
    </div>
  </Drawer>
</template>

<style scoped>
.lineage-entity-drawer__title {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}
.lineage-entity-drawer__title a {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.lineage-entity-drawer__type {
  flex-shrink: 0;
}
.lineage-entity-drawer__body {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.lineage-entity-drawer__path,
.lineage-entity-drawer__fqn {
  margin: 0;
  color: var(--sm-text-secondary);
  font-size: 13px;
  overflow-wrap: anywhere;
}
.lineage-entity-drawer__description {
  margin: 0;
  color: var(--sm-text-primary);
  font-size: 14px;
  white-space: pre-wrap;
}
.lineage-entity-drawer__fields {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 8px 16px;
  margin: 0;
}
.lineage-entity-drawer__fields dt {
  color: var(--sm-text-secondary);
  font-size: 13px;
}
.lineage-entity-drawer__fields dd {
  margin: 0;
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  font-size: 13px;
}
</style>
