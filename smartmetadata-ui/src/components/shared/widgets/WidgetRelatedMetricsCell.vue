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
import { searchAssets } from '@/api/search';
import { composeSearchQuery } from '@/catalog/searchQuery';
import type { AssetDetail, EntityRef } from '@/types/api';
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';

/**
 * Official RelatedMetrics widget
 * (openmetadata-ui/.../Metric/RelatedMetrics/RelatedMetrics.tsx): the
 * metric's related metrics, five visible with a show-more toggle, each a
 * link to its detail page. Editing picks metrics from an entity search
 * that excludes the metric itself; the save goes through the caller's
 * onSave and a failed save keeps the editor open.
 *
 * Named deviation: pin edits inline under the list; the product edits
 * in an antd Modal + Select, the batch contract for grid-editable
 * widgets. Pin renders MetricTag rows; the product renders text links.
 */
const props = defineProps<{
  metric: AssetDetail;
  hasEditAccess: boolean;
  onSave: (refs: EntityRef[]) => Promise<void>;
}>();

const { t } = useI18n();
const expanded = ref(false);
const editing = ref(false);
const saving = ref(false);
const saveError = ref(false);
const selectedIds = ref<string[]>([]);
const optionRefs = ref(new Map<string, EntityRef>());
const searching = ref(false);

const related = computed(() => props.metric.relatedMetrics ?? []);
const visible = computed(() => (expanded.value ? related.value : related.value.slice(0, 5)));
const canEdit = computed(() => props.hasEditAccess && !props.metric.deleted);

let searchTimer: ReturnType<typeof setTimeout> | undefined;

function refKey(ref: EntityRef): string {
  return ref.id ?? ref.fullyQualifiedName ?? ref.name;
}

function registerOptions(refs: EntityRef[]): void {
  const next = new Map(optionRefs.value);
  for (const ref of refs) {
    next.set(refKey(ref), ref);
  }
  optionRefs.value = next;
}

function openEditor(): void {
  registerOptions(related.value);
  selectedIds.value = related.value.map(refKey);
  saveError.value = false;
  editing.value = true;
}

async function searchOptions(query: string): Promise<void> {
  if (searchTimer) {
    clearTimeout(searchTimer);
  }
  searchTimer = setTimeout(async () => {
    searching.value = true;
    try {
      const page = await searchAssets(
        composeSearchQuery(query, { entityType: ['metric'] }),
        0,
        20,
      );
      registerOptions(
        page.hits
          .filter((hit) => hit.fullyQualifiedName !== props.metric.fullyQualifiedName)
          .map((hit) => ({
            id: hit.id,
            name: hit.name,
            displayName: hit.displayName,
            fullyQualifiedName: hit.fullyQualifiedName,
            type: 'metric',
          })),
      );
    } finally {
      searching.value = false;
    }
  }, 250);
}

async function save(): Promise<void> {
  saving.value = true;
  saveError.value = false;
  try {
    const refs = selectedIds.value
      .map((id) => optionRefs.value.get(id))
      .filter((ref): ref is EntityRef => ref !== undefined);
    await props.onSave(refs);
    editing.value = false;
  } catch {
    saveError.value = true;
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <div class="related-metrics-cell" data-testid="related-metrics">
    <div class="related-metrics-cell__header">
      <span class="related-metrics-cell__title">{{ t('label.related-metric-plural') }}</span>
      <a-button
        v-if="canEdit"
        size="small"
        type="link"
        data-testid="related-metrics-edit"
        @click="openEditor"
      >
        {{ t('label.edit') }}
      </a-button>
    </div>
    <a-list v-if="related.length > 0" :data-source="visible" size="small">
      <template #renderItem="{ item }: { item: EntityRef }">
        <a-list-item :key="item.id ?? item.fullyQualifiedName" data-testid="related-metrics-row">
          <RouterLink
            :to="{ name: 'governance-metric', params: { fqn: item.fullyQualifiedName } }"
          >
            {{ item.displayName || item.name }}
          </RouterLink>
        </a-list-item>
      </template>
    </a-list>
    <span v-else class="related-metrics-cell__empty">
      {{ t('label.no-entity-available', { entity: t('label.related-metric-plural') }) }}
    </span>
    <a-button
      v-if="related.length > 5"
      type="link"
      size="small"
      data-testid="related-metrics-toggle"
      @click="expanded = !expanded"
    >
      {{
        expanded
          ? t('label.show-less')
          : t('label.show-more-entity', { entity: t('label.related-metric-plural') })
      }}
    </a-button>
    <a-modal
      :open="editing"
      :title="t('label.related-metric-plural')"
      :confirm-loading="saving"
      :ok-text="t('label.save')"
      :cancel-text="t('label.cancel')"
      data-testid="related-metrics-modal"
      @ok="save"
      @cancel="editing = false"
    >
      <a-alert
        v-if="saveError"
        type="error"
        :message="t('message.something-went-wrong')"
        show-icon
        data-testid="related-metrics-save-error"
      />
      <a-select
        v-model:value="selectedIds"
        mode="multiple"
        show-search
        :filter-option="false"
        :loading="searching"
        style="width: 100%"
        :placeholder="t('label.related-metric-plural')"
        data-testid="related-metrics-select"
        @search="searchOptions"
      >
        <a-select-option
          v-for="[id, ref] in optionRefs"
          :key="id"
          :value="id"
          :label="ref.displayName || ref.name"
        >
          {{ ref.displayName || ref.name }}
        </a-select-option>
      </a-select>
    </a-modal>
  </div>
</template>

<style scoped>
.related-metrics-cell__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}

.related-metrics-cell__title {
  font-weight: 600;
}
</style>
