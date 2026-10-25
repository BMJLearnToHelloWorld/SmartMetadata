<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { Empty, Input, Spin, Tag } from 'ant-design-vue';
import { searchAssets } from '@/api/search';
import { entityTypeColor } from '@/catalog/searchHits';
import { lineageTargetFromHit } from '@/lineage/entry';
import type { SearchHit } from '@/types/api';

const emit = defineEmits<{
  select: [target: { entityType: string; fqn: string }];
}>();

const { t, te } = useI18n();
const query = ref('');
const hits = ref<SearchHit[]>([]);
const loading = ref(false);
const searched = ref(false);
let timer: ReturnType<typeof setTimeout> | undefined;
let requestSeq = 0;

function entityLabel(entityType: string): string {
  const key = `explore.entity.${entityType}`;
  return te(key) ? t(key) : entityType;
}

async function runSearch(value: string): Promise<void> {
  const seq = ++requestSeq;
  loading.value = true;
  try {
    const page = await searchAssets(value, 0, 8);
    if (seq !== requestSeq) {
      return;
    }
    hits.value = page.hits;
    searched.value = true;
  } catch {
    if (seq !== requestSeq) {
      return;
    }
    hits.value = [];
    searched.value = true;
  } finally {
    if (seq === requestSeq) {
      loading.value = false;
    }
  }
}

function onQuery(value: string): void {
  query.value = value;
  if (timer) {
    clearTimeout(timer);
  }
  timer = setTimeout(() => {
    void runSearch(value);
  }, 250);
}

function pick(hit: SearchHit): void {
  const target = lineageTargetFromHit(hit);
  if (target) {
    emit('select', target);
  }
}
</script>

<template>
  <div class="lineage-search" data-testid="lineage-entity-search">
    <Input.Search
      :value="query"
      allow-clear
      data-testid="lineage-entity-search-input"
      :placeholder="t('lineage.searchPlaceholder')"
      @update:value="onQuery"
      @search="runSearch"
    />
    <Spin :spinning="loading">
      <div v-if="hits.length" class="lineage-search__results" data-testid="lineage-entity-results">
        <button
          v-for="hit in hits"
          :key="hit.fullyQualifiedName || hit.id || hit.name"
          type="button"
          class="lineage-search__hit"
          :data-testid="`lineage-entity-option-${hit.fullyQualifiedName}`"
          @click="pick(hit)"
        >
          <Tag :color="entityTypeColor(hit.entityType)">{{ entityLabel(hit.entityType) }}</Tag>
          <span class="lineage-search__name">{{ hit.displayName || hit.name }}</span>
          <span class="lineage-search__fqn">{{ hit.fullyQualifiedName }}</span>
        </button>
      </div>
      <Empty
        v-else-if="searched && !loading"
        data-testid="lineage-entity-empty"
        :description="t('lineage.searchEmpty')"
      />
    </Spin>
  </div>
</template>

<style scoped>
.lineage-search {
  width: 100%;
  max-width: 520px;
}
.lineage-search__results {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-top: 8px;
}
.lineage-search__hit {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  text-align: left;
  border: 1px solid #e5e7eb;
  border-radius: 6px;
  background: #fff;
  padding: 6px 8px;
  cursor: pointer;
}
.lineage-search__hit:hover {
  border-color: #1677ff;
}
.lineage-search__name {
  font-weight: 600;
  color: #0f172a;
}
.lineage-search__fqn {
  margin-left: auto;
  color: #64748b;
  font-size: 12px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 46%;
}
</style>
