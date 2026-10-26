<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed, nextTick, onMounted, reactive, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute, useRouter } from 'vue-router';
import { DownOutlined } from '@ant-design/icons-vue';
import {
  Alert,
  Button,
  Card,
  Col,
  Dropdown,
  Empty,
  Menu,
  Row,
  Select,
  Space,
  Spin,
  Tabs,
  Typography,
} from 'ant-design-vue';
import { listGlossaryTerms } from '@/api/glossaryTerms';
import { searchAssets } from '@/api/search';
import { isTestCaseSearchListAvailable, listTestCases } from '@/api/testCases';
import { listTestDefinitions } from '@/api/testDefinitions';
import { isTestSuiteSearchListAvailable, listTestSuites } from '@/api/testSuites';
import type { SearchFacet } from '@/catalog/searchFacets';
import SmChart from '@/features/charts/SmChart.vue';
import { namedSeries } from '@/features/charts/series';
import { seriesWindow } from '@/features/charts/types';
import {
  coverageFrom,
  dimensionCards,
  facetOptions,
  governanceFiltersActive,
  healthFromCases,
  healthFromTableSuites,
  parseDqTab,
  statusCountsFromCases,
  tableCountFromFacets,
  uniqueCoveredAssets,
  type CoverageCounts,
  type DimensionCard,
  type DqGovernanceFilters,
  type DqLandingTab,
  type HealthCounts,
  type StatusCounts,
} from '@/quality/landing';
import type { TestCase, TestDefinition, TestSuite } from '@/types/quality';
import TestCasesListView from './TestCasesListView.vue';
import TestSuitesListView from './TestSuitesListView.vue';

const { t, te } = useI18n();
const route = useRoute();
const router = useRouter();

const loading = ref(false);
const activeTab = ref<DqLandingTab>(parseDqTab(route.query.tab));
const rangeDays = ref(30);
const range = ref(seriesWindow(30));
const filters = reactive<DqGovernanceFilters>({});
const facets = ref<SearchFacet[]>([]);
const glossaryOptions = ref<Array<{ value: string; label: string }>>([]);
const preferCaseSearch = ref(false);
const preferSuiteSearch = ref(false);
const residualNotes = ref<string[]>([]);
const casesError = ref('');
const coverage = ref<CoverageCounts | null>(null);
const health = ref<HealthCounts | null>(null);
const results = ref<StatusCounts | null>(null);
const dimensions = ref<DimensionCard[]>([]);
const casesView = ref<{ openCreate: () => void } | null>(null);
const suitesView = ref<{ openCreate: () => void } | null>(null);

const ownerOptions = computed(() => facetOptions(facets.value, 'owner'));
const tierOptions = computed(() => facetOptions(facets.value, 'tier'));
const certOptions = computed(() => facetOptions(facets.value, 'certification'));
const tagOptions = computed(() => facetOptions(facets.value, 'tagFqn'));
const productOptions = computed(() => facetOptions(facets.value, 'dataProduct'));

const coverageSeries = computed(() =>
  coverage.value && coverage.value.total
    ? namedSeries(t('quality.landing.coverage'), [
        { label: t('quality.landing.covered'), value: coverage.value.covered },
        { label: t('quality.landing.notCovered'), value: coverage.value.notCovered },
      ])
    : [],
);
const healthSeries = computed(() =>
  health.value && health.value.total
    ? namedSeries(t('quality.landing.healthyAssets'), [
        { label: t('quality.landing.healthy'), value: health.value.healthy },
        { label: t('quality.landing.unhealthy'), value: health.value.unhealthy },
      ])
    : [],
);
const resultsSeries = computed(() =>
  results.value && results.value.total
    ? namedSeries(t('quality.landing.testResults'), [
        { label: t('quality.landing.success'), value: results.value.success },
        { label: t('quality.landing.failed'), value: results.value.failed },
        { label: t('quality.landing.aborted'), value: results.value.aborted },
      ])
    : [],
);

const governanceActive = computed(() => governanceFiltersActive(filters));
const searchListResidual = computed(
  () => governanceActive.value && !(preferCaseSearch.value || preferSuiteSearch.value),
);

const caseSearchTags = computed(() =>
  [filters.tag, filters.glossaryTerm, filters.certification].filter((item): item is string => Boolean(item)).join(','),
);

function dimensionLabel(id: string): string {
  const key = id === 'No Dimension' ? 'quality.landing.dimensions.none' : `quality.landing.dimensions.${id.toLowerCase()}`;
  return te(key) ? t(key) : id;
}

function onAddMenu({ key }: { key: string | number }): void {
  if (key === 'case') {
    void openCreateCase();
  } else if (key === 'suite') {
    void openCreateSuite();
  }
}

async function settle<T>(promise: Promise<T>, fallback: T, residualKey?: string): Promise<T> {
  try {
    return await promise;
  } catch (error) {
    if (residualKey) {
      residualNotes.value.push(residualKey);
    }
    if (!casesError.value && residualKey === 'quality.landing.residualCases') {
      casesError.value = error instanceof Error ? error.message : t('crud.loadFailed');
    }
    return fallback;
  }
}

async function loadSummary(): Promise<void> {
  loading.value = true;
  residualNotes.value = [];
  casesError.value = '';
  try {
    const [casesPage, suitesPage, defsPage, searchPage, caseSearch, suiteSearch, glossaryPage] = await Promise.all([
      settle(listTestCases({ limit: 100, includeAllTests: true }), { data: [] as TestCase[], total: undefined }, 'quality.landing.residualCases'),
      settle(listTestSuites({ limit: 100, includeEmptyTestSuites: true, testSuiteType: 'basic' }), { data: [] as TestSuite[], total: undefined }, 'quality.landing.residualSuites'),
      settle(listTestDefinitions({ limit: 100 }), { data: [] as TestDefinition[] }, 'quality.landing.residualDefinitions'),
      settle(searchAssets('*', 0, 1), { total: 0, hits: [], facets: [] as SearchFacet[] }, 'quality.landing.residualSearch'),
      settle(isTestCaseSearchListAvailable(), false, undefined),
      settle(isTestSuiteSearchListAvailable(), false, undefined),
      settle(listGlossaryTerms({ limit: 50 }), { data: [] }, undefined),
    ]);
    preferCaseSearch.value = caseSearch;
    preferSuiteSearch.value = suiteSearch;
    facets.value = searchPage.facets ?? [];
    glossaryOptions.value = glossaryPage.data.map((term) => ({
      value: term.fullyQualifiedName || term.name,
      label: term.displayName || term.name,
    }));
    const tableCount = tableCountFromFacets(facets.value);
    const coveredFromSuites = suitesPage.total ?? (suitesPage.data.length || undefined);
    const coveredFromCases = uniqueCoveredAssets(casesPage.data) || undefined;
    coverage.value = coverageFrom(coveredFromSuites ?? coveredFromCases, tableCount);
    const suiteHealth = healthFromTableSuites(suitesPage.data);
    const caseHealth = healthFromCases(casesPage.data);
    health.value = suiteHealth.total ? suiteHealth : caseHealth.total ? caseHealth : null;
    const status = statusCountsFromCases(casesPage.data);
    results.value = status.total ? status : null;
    dimensions.value = dimensionCards(casesPage.data, defsPage.data);
    residualNotes.value.push('quality.landing.residualReport');
    if (!caseSearch) {
      residualNotes.value.push('quality.landing.residualSearchList');
    }
  } finally {
    loading.value = false;
  }
}

function onTabChange(key: string | number): void {
  const tab = parseDqTab(key);
  activeTab.value = tab;
  void router.replace({ query: { ...route.query, tab } });
}

function setFilter(id: keyof DqGovernanceFilters, value: unknown): void {
  filters[id] = typeof value === 'string' && value ? value : undefined;
}

function openCases(): void {
  onTabChange('test-cases');
}

function openSuites(): void {
  onTabChange('test-suites');
}

async function openCreateCase(): Promise<void> {
  onTabChange('test-cases');
  await nextTick();
  casesView.value?.openCreate();
}

async function openCreateSuite(): Promise<void> {
  onTabChange('test-suites');
  await nextTick();
  suitesView.value?.openCreate();
}

watch(rangeDays, (days) => {
  range.value = seriesWindow(days);
});

watch(
  () => route.query.tab,
  (value) => {
    activeTab.value = parseDqTab(value);
  },
);

onMounted(() => {
  void loadSummary();
});
</script>

<template>
  <div class="dq-landing" data-testid="dq-landing">
    <div class="dq-landing__head">
      <div>
        <Typography.Title :level="4" data-testid="dq-landing-title">{{ t('quality.landing.title') }}</Typography.Title>
        <Typography.Paragraph type="secondary" data-testid="dq-landing-lead">
          {{ t('quality.landing.lead') }}
        </Typography.Paragraph>
      </div>
      <Dropdown :trigger="['click']">
        <Button type="primary" data-testid="dq-landing-add">
          {{ t('quality.landing.add') }}
          <DownOutlined />
        </Button>
        <template #overlay>
          <Menu @click="onAddMenu">
            <Menu.Item key="case" data-testid="dq-landing-add-case">{{ t('quality.landing.addCase') }}</Menu.Item>
            <Menu.Item key="suite" data-testid="dq-landing-add-suite">{{ t('quality.landing.addSuite') }}</Menu.Item>
          </Menu>
        </template>
      </Dropdown>
    </div>

    <Tabs :active-key="activeTab" data-testid="dq-landing-tabs" @change="onTabChange">
      <Tabs.TabPane key="summary" :tab="t('quality.landing.tabs.summary')" />
      <Tabs.TabPane key="test-cases" :tab="t('quality.landing.tabs.testCases')" />
      <Tabs.TabPane key="test-suites" :tab="t('quality.landing.tabs.testSuites')" />
    </Tabs>

    <div class="dq-landing__filters" data-testid="dq-landing-filters">
      <Select
        :value="filters.owner"
        allow-clear
        show-search
        :placeholder="t('quality.landing.filters.owner')"
        :options="ownerOptions"
        data-testid="dq-filter-owner"
        class="dq-landing__filter"
        @change="(value) => setFilter('owner', value)"
      />
      <Select
        :value="filters.tier"
        allow-clear
        show-search
        :placeholder="t('quality.landing.filters.tier')"
        :options="tierOptions"
        data-testid="dq-filter-tier"
        class="dq-landing__filter"
        @change="(value) => setFilter('tier', value)"
      />
      <Select
        :value="filters.certification"
        allow-clear
        show-search
        :placeholder="t('quality.landing.filters.certification')"
        :options="certOptions"
        data-testid="dq-filter-certification"
        class="dq-landing__filter"
        @change="(value) => setFilter('certification', value)"
      />
      <Select
        :value="filters.tag"
        allow-clear
        show-search
        :placeholder="t('quality.landing.filters.tag')"
        :options="tagOptions"
        data-testid="dq-filter-tag"
        class="dq-landing__filter"
        @change="(value) => setFilter('tag', value)"
      />
      <Select
        :value="filters.glossaryTerm"
        allow-clear
        show-search
        :placeholder="t('quality.landing.filters.glossaryTerm')"
        :options="glossaryOptions"
        data-testid="dq-filter-glossary"
        class="dq-landing__filter"
        @change="(value) => setFilter('glossaryTerm', value)"
      />
      <Select
        :value="filters.dataProduct"
        allow-clear
        show-search
        :placeholder="t('quality.landing.filters.dataProduct')"
        :options="productOptions"
        data-testid="dq-filter-data-product"
        class="dq-landing__filter"
        @change="(value) => setFilter('dataProduct', value)"
      />
      <Select
        v-model:value="rangeDays"
        data-testid="dq-filter-range"
        class="dq-landing__filter dq-landing__filter--range"
        :aria-label="t('quality.landing.filters.range')"
      >
        <Select.Option :value="7">{{ t('quality.landing.range7') }}</Select.Option>
        <Select.Option :value="30">{{ t('quality.landing.range30') }}</Select.Option>
      </Select>
    </div>

    <Alert
      v-if="searchListResidual"
      type="info"
      show-icon
      class="dq-landing__alert"
      data-testid="dq-landing-filter-residual"
      :message="t('quality.landing.residualFilterApply')"
    />

    <div v-if="activeTab === 'summary'">
      <Spin :spinning="loading">
        <Space direction="vertical" size="middle" style="width: 100%">
          <Alert
            v-for="note in residualNotes"
            :key="note"
            type="info"
            show-icon
            class="dq-landing__alert"
            :data-testid="`dq-residual-${note.split('.').pop()}`"
            :message="t(note)"
          />
          <Alert v-if="casesError" type="error" show-icon :message="casesError" data-testid="dq-landing-cases-error" />

          <Card data-testid="dq-health" :title="t('quality.landing.healthTitle')">
            <Typography.Paragraph type="secondary">{{ t('quality.landing.healthLead') }}</Typography.Paragraph>
            <Empty
              v-if="!loading && !coverage?.total && !health?.total && !results?.total"
              data-testid="dq-health-empty"
              :description="t('quality.landing.healthEmpty')"
            >
              <Button type="primary" data-testid="dq-health-empty-cta" @click="openCreateCase">
                {{ t('quality.testCases.create') }}
              </Button>
            </Empty>
            <Row v-else :gutter="[16, 16]">
              <Col :xs="24" :lg="8">
                <button class="dq-donut" data-testid="dq-coverage-card" type="button" @click="openSuites">
                  <div class="dq-donut__title">{{ t('quality.landing.coverage') }}</div>
                  <div class="dq-donut__center">{{ t('quality.landing.tables', { count: coverage?.total ?? 0 }) }}</div>
                  <SmChart
                    kind="donut"
                    test-id="dq-coverage-chart"
                    :series="coverageSeries"
                    :empty="t('quality.landing.chartEmpty')"
                    :height="200"
                  />
                  <div class="dq-donut__legend">
                    {{ t('quality.landing.covered') }} {{ coverage?.covered ?? 0 }} ·
                    {{ t('quality.landing.notCovered') }} {{ coverage?.notCovered ?? 0 }}
                  </div>
                </button>
              </Col>
              <Col :xs="24" :lg="8">
                <button class="dq-donut" data-testid="dq-healthy-card" type="button" @click="openCases">
                  <div class="dq-donut__title">{{ t('quality.landing.healthyAssets') }}</div>
                  <div class="dq-donut__center">{{ t('quality.landing.entities', { count: health?.total ?? 0 }) }}</div>
                  <SmChart
                    kind="donut"
                    test-id="dq-healthy-chart"
                    :series="healthSeries"
                    :empty="t('quality.landing.chartEmpty')"
                    :height="200"
                  />
                  <div class="dq-donut__legend">
                    {{ t('quality.landing.healthy') }} {{ health?.healthy ?? 0 }} ·
                    {{ t('quality.landing.unhealthy') }} {{ health?.unhealthy ?? 0 }}
                  </div>
                </button>
              </Col>
              <Col :xs="24" :lg="8">
                <button class="dq-donut" data-testid="dq-results-card" type="button" @click="openCases">
                  <div class="dq-donut__title">{{ t('quality.landing.testResults') }}</div>
                  <div class="dq-donut__center">{{ t('quality.landing.tests', { count: results?.total ?? 0 }) }}</div>
                  <SmChart
                    kind="donut"
                    test-id="dq-results-chart"
                    :series="resultsSeries"
                    :empty="t('quality.landing.chartEmpty')"
                    :height="200"
                  />
                  <div class="dq-donut__legend">
                    {{ t('quality.landing.success') }} {{ results?.success ?? 0 }} ·
                    {{ t('quality.landing.failed') }} {{ results?.failed ?? 0 }} ·
                    {{ t('quality.landing.aborted') }} {{ results?.aborted ?? 0 }}
                  </div>
                </button>
              </Col>
            </Row>
          </Card>

          <Card data-testid="dq-dimensions" :title="t('quality.landing.dimensionsTitle')">
            <Typography.Paragraph type="secondary">{{ t('quality.landing.dimensionsLead') }}</Typography.Paragraph>
            <div class="dq-dims">
              <button
                v-for="card in dimensions"
                :key="card.id"
                class="dq-dim"
                type="button"
                :data-testid="`dq-dimension-${card.id}`"
                @click="openCases"
              >
                <div class="dq-dim__name">{{ dimensionLabel(card.id) }}</div>
                <div class="dq-dim__total">{{ card.total }}</div>
                <div class="dq-dim__pills">
                  <span class="dq-dim__pill dq-dim__pill--success">{{ card.success }}</span>
                  <span class="dq-dim__pill dq-dim__pill--failed">{{ card.failed }}</span>
                  <span class="dq-dim__pill dq-dim__pill--aborted">{{ card.aborted }}</span>
                </div>
              </button>
            </div>
          </Card>

          <Card data-testid="dq-status" :title="t('quality.landing.statusTitle')">
            <Typography.Paragraph type="secondary">{{ t('quality.landing.statusLead') }}</Typography.Paragraph>
            <Row :gutter="[16, 16]">
              <Col :xs="24" :md="8">
                <button class="dq-status" type="button" data-testid="dq-status-success" @click="openCases">
                  <div class="dq-status__label">{{ t('quality.landing.success') }}</div>
                  <div class="dq-status__value">{{ results?.success ?? 0 }}</div>
                </button>
              </Col>
              <Col :xs="24" :md="8">
                <button class="dq-status" type="button" data-testid="dq-status-aborted" @click="openCases">
                  <div class="dq-status__label">{{ t('quality.landing.aborted') }}</div>
                  <div class="dq-status__value">{{ results?.aborted ?? 0 }}</div>
                </button>
              </Col>
              <Col :xs="24" :md="8">
                <button class="dq-status" type="button" data-testid="dq-status-failed" @click="openCases">
                  <div class="dq-status__label">{{ t('quality.landing.failed') }}</div>
                  <div class="dq-status__value">{{ results?.failed ?? 0 }}</div>
                </button>
              </Col>
            </Row>
          </Card>
        </Space>
      </Spin>
    </div>

    <TestCasesListView
      v-if="activeTab === 'test-cases'"
      ref="casesView"
      embedded
      :prefer-search="preferCaseSearch"
      :owner-fqn="filters.owner"
      :tier="filters.tier"
      :tags="caseSearchTags"
      :data-product-fqn="filters.dataProduct"
      :start-ts="range.startTs"
      :end-ts="range.endTs"
    />

    <TestSuitesListView
      v-if="activeTab === 'test-suites'"
      ref="suitesView"
      embedded
      :prefer-search="preferSuiteSearch"
      :owner-fqn="filters.owner"
      :initial-sub-tab="typeof route.query.subTab === 'string' ? route.query.subTab : 'table-suites'"
    />
  </div>
</template>

<style scoped>
.dq-landing__head {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  align-items: flex-start;
}
.dq-landing__filters {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 16px;
}
.dq-landing__filter {
  min-width: 160px;
}
.dq-landing__filter--range {
  margin-left: auto;
}
.dq-landing__alert {
  margin-bottom: 12px;
}
.dq-donut {
  display: block;
  width: 100%;
  padding: 8px;
  border: 0;
  background: transparent;
  text-align: center;
  cursor: pointer;
  color: inherit;
}
.dq-donut__title {
  font-weight: 600;
}
.dq-donut__center,
.dq-donut__legend {
  color: var(--ant-color-text-secondary, #667085);
  font-size: 12px;
}
.dq-dims {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 12px;
}
.dq-dim,
.dq-status {
  display: block;
  width: 100%;
  padding: 12px;
  border: 1px solid var(--ant-color-border, #d0d5dd);
  border-radius: 8px;
  background: var(--ant-color-bg-container, #fff);
  text-align: left;
  cursor: pointer;
  color: inherit;
}
.dq-dim__name {
  font-size: 12px;
  color: var(--ant-color-text-secondary, #667085);
}
.dq-dim__total,
.dq-status__value {
  font-size: 22px;
  font-weight: 600;
}
.dq-dim__pills {
  display: flex;
  gap: 6px;
  margin-top: 8px;
}
.dq-dim__pill {
  min-width: 24px;
  padding: 0 6px;
  border-radius: 4px;
  font-size: 12px;
  text-align: center;
}
.dq-dim__pill--success {
  background: #ecfdf3;
  color: #067647;
}
.dq-dim__pill--failed {
  background: #fef3f2;
  color: #b42318;
}
.dq-dim__pill--aborted {
  background: #fffaeb;
  color: #b54708;
}
.dq-status__label {
  color: var(--ant-color-text-secondary, #667085);
}
</style>
