<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute, useRouter } from 'vue-router';
import { Alert, Button, Card, Checkbox, Col, Empty, Pagination, Row, Space, Tag, Typography } from 'ant-design-vue';
import { searchAssets } from '@/api/search';
import { assetLocation, isDetailWired } from '@/catalog/entityRoutes';
import { FACET_IDS, type FacetId, type SearchFacet } from '@/catalog/searchFacets';
import { entityTypeColor, hitLocation } from '@/catalog/searchHits';
import {
  SEARCH_PAGE_SIZE,
  composeSearchQuery,
  filtersFromQuery,
  hasActiveFilters,
  searchRouteQuery,
  pageFromQuery,
  toggleFilterValue,
  type SearchFilters,
} from '@/catalog/searchQuery';
import type { SearchHit } from '@/types/api';

const route = useRoute();
const router = useRouter();
const { t, te } = useI18n();

const loading = ref(false);
const errorMessage = ref('');
const hits = ref<SearchHit[]>([]);
const total = ref(0);
const facets = ref<SearchFacet[]>([]);

const query = computed(() => (typeof route.query.q === 'string' ? route.query.q : ''));
const filters = computed(() => filtersFromQuery(route.query));
const page = computed(() => pageFromQuery(route.query.page));
const searchKey = computed(() =>
  JSON.stringify({ q: query.value, filters: filters.value, page: page.value }),
);

function entityLabel(entityType: string): string {
  const key = `explore.entity.${entityType}`;
  return te(key) ? t(key) : entityType;
}

function facetTitle(id: FacetId): string {
  return t(`explore.facets.${id}`);
}

function pushSearch(nextQuery: string, nextFilters: SearchFilters, nextPage = 0): void {
  void router.push({ name: 'search', query: searchRouteQuery(nextQuery, nextFilters, nextPage) });
}

function onToggleFacet(id: FacetId, value: string): void {
  pushSearch(query.value, toggleFilterValue(filters.value, id, value), 0);
}

function onClearFilters(): void {
  pushSearch(query.value, {}, 0);
}

function onPageChange(next: number): void {
  pushSearch(query.value, filters.value, Math.max(0, next - 1));
}

function openHit(hit: SearchHit): void {
  if (!hit.fullyQualifiedName || !hit.entityType) {
    return;
  }
  void router.push(assetLocation(hit.entityType, hit.fullyQualifiedName));
}

function hitKey(hit: SearchHit, index: number): string {
  return hit.fullyQualifiedName || hit.id || `${hit.entityType}-${index}`;
}

async function runSearch(): Promise<void> {
  loading.value = true;
  errorMessage.value = '';
  try {
    const pageResult = await searchAssets(
      composeSearchQuery(query.value, filters.value),
      page.value * SEARCH_PAGE_SIZE,
      SEARCH_PAGE_SIZE,
    );
    hits.value = pageResult.hits;
    total.value = pageResult.total;
    facets.value = pageResult.facets;
  } catch (error) {
    hits.value = [];
    total.value = 0;
    facets.value = [];
    errorMessage.value = error instanceof Error ? error.message : t('explore.failed');
  } finally {
    loading.value = false;
  }
}

watch(searchKey, () => {
  void runSearch();
}, { immediate: true });
</script>

<template>
  <Row :gutter="16" class="explore">
    <Col :xs="24" :lg="6">
      <Card size="small" class="explore__facets" data-testid="search-facets">
        <div class="explore__facets-head">
          <Typography.Text strong>{{ t('explore.filters') }}</Typography.Text>
          <Button
            v-if="hasActiveFilters(filters)"
            type="link"
            size="small"
            data-testid="search-clear-filters"
            @click="onClearFilters"
          >
            {{ t('explore.clearFilters') }}
          </Button>
        </div>
        <Empty v-if="!facets.length && !loading" :description="t('explore.empty')" />
        <section v-for="facet in facets" :key="facet.id" class="explore__facet" :data-testid="`search-facet-${facet.id}`">
          <Typography.Text class="explore__facet-title">{{ facetTitle(facet.id) }}</Typography.Text>
          <label
            v-for="bucket in facet.buckets"
            :key="bucket.key"
            class="explore__bucket"
            :data-testid="`search-facet-${facet.id}-${bucket.key}`"
            @click.prevent="onToggleFacet(facet.id, bucket.key)"
          >
            <Checkbox :checked="(filters[facet.id] ?? []).includes(bucket.key)" />
            <span class="explore__bucket-key">{{ facet.id === 'entityType' ? entityLabel(bucket.key) : bucket.key }}</span>
            <Typography.Text type="secondary">{{ bucket.count }}</Typography.Text>
          </label>
        </section>
      </Card>
    </Col>
    <Col :xs="24" :lg="18">
      <Card size="small">
        <Typography.Title :level="4">{{ t('explore.title') }}</Typography.Title>
        <Typography.Paragraph type="secondary">
          {{ t('explore.lead') }}
          <template v-if="query"> {{ t('explore.leadQuery', { query }) }} </template>
          <template v-else> {{ t('explore.leadDefault') }}</template>
        </Typography.Paragraph>
        <Space v-if="hasActiveFilters(filters)" wrap class="explore__active">
          <template v-for="id in FACET_IDS" :key="id">
            <Tag
              v-for="value in filters[id] ?? []"
              :key="`${id}:${value}`"
              closable
              :data-testid="`search-active-${id}-${value}`"
              @close="onToggleFacet(id, value)"
            >
              {{ facetTitle(id) }}: {{ id === 'entityType' ? entityLabel(value) : value }}
            </Tag>
          </template>
        </Space>
        <Alert v-if="errorMessage" type="error" show-icon :message="errorMessage" class="explore__error" />
        <div data-testid="search-results" class="explore__results">
          <Empty v-if="!loading && !hits.length && !errorMessage" :description="t('explore.empty')" />
          <article
            v-for="(hit, index) in hits"
            :key="hitKey(hit, index)"
            class="explore__card"
            :data-testid="`search-card-${hit.fullyQualifiedName || hit.name}`"
          >
            <div class="explore__card-head">
              <Tag :color="entityTypeColor(hit.entityType)">{{ entityLabel(hit.entityType) }}</Tag>
              <a href="#" class="explore__card-name" @click.prevent="openHit(hit)">
                {{ hit.displayName || hit.name }}
              </a>
              <Typography.Text v-if="!isDetailWired(hit.entityType)" type="secondary">
                {{ t('explore.unwired') }}
              </Typography.Text>
            </div>
            <Typography.Paragraph v-if="hit.fullyQualifiedName" class="explore__fqn" type="secondary">
              {{ hit.fullyQualifiedName }}
            </Typography.Paragraph>
            <Typography.Paragraph
              v-if="hit.description"
              class="explore__desc"
              :ellipsis="{ rows: 2 }"
              :content="hit.description"
            />
            <div class="explore__meta">
              <Typography.Text type="secondary">
                {{ hitLocation(hit) || t('explore.locationMissing') }}
              </Typography.Text>
              <Typography.Text v-if="hit.serviceType" type="secondary">{{ hit.serviceType }}</Typography.Text>
              <Typography.Text v-if="hit.tier" type="secondary">{{ hit.tier }}</Typography.Text>
            </div>
            <Space wrap>
              <span v-for="owner in hit.owners" :key="owner.name">{{ owner.displayName || owner.name }}</span>
              <Tag v-for="tag in hit.tags" :key="tag.tagFQN">{{ tag.name }}</Tag>
            </Space>
          </article>
        </div>
        <div v-if="!loading && !errorMessage" class="explore__footer">
          <Typography.Text type="secondary">
            {{
              total
                ? t('explore.shownOf', { shown: hits.length, total })
                : t('explore.shown', { shown: hits.length })
            }}
          </Typography.Text>
          <Pagination
            v-if="total > SEARCH_PAGE_SIZE"
            data-testid="search-pagination"
            size="small"
            :current="page + 1"
            :page-size="SEARCH_PAGE_SIZE"
            :total="total"
            :show-size-changer="false"
            @change="onPageChange"
          />
        </div>
      </Card>
    </Col>
  </Row>
</template>

<style scoped>
.explore__facets-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 8px;
}
.explore__facet {
  margin-bottom: 12px;
}
.explore__facet-title {
  display: block;
  font-size: 12px;
  font-weight: 600;
  margin-bottom: 4px;
}
.explore__bucket {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 28px;
  cursor: pointer;
}
.explore__bucket-key {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.explore__active {
  margin-bottom: 12px;
}
.explore__error {
  margin-bottom: 12px;
}
.explore__results {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.explore__card {
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  padding: 10px 12px;
}
.explore__card-head {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.explore__card-name {
  font-weight: 600;
}
.explore__fqn,
.explore__desc {
  margin-bottom: 4px;
}
.explore__meta {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 12px;
  margin-bottom: 4px;
  font-size: 12px;
}
.explore__footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-top: 12px;
}
</style>
