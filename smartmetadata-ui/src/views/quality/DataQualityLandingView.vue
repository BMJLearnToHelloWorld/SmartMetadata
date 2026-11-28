<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute, useRouter } from 'vue-router';
import SmIcon from '@/components/shared/SmIcon.vue';
import { Button, Dropdown, Menu, Tabs } from 'ant-design-vue';
import PageHeader from '@/components/shared/PageHeader.vue';
import PageLayout from '@/components/shared/PageLayout.vue';
import DataQualityDashboard from '@/features/quality/DataQualityDashboard.vue';
import TestCaseFormDrawer from '@/components/quality/TestCaseFormDrawer.vue';
import LogicalTestSuiteDrawer from '@/components/quality/LogicalTestSuiteDrawer.vue';
import { parseDqTab, type DqLandingTab } from '@/quality/landing';
import TestCasesListView from './TestCasesListView.vue';
import TestSuitesListView from './TestSuitesListView.vue';

/**
 * Official DataQualityPage: page header, tab-specific add chrome, and
 * independent tab bodies. The Summary tab mounts the shared official
 * DataQualityDashboard (filter bar, pies, status/incident area charts).
 * Official does not share a page-level filter bar with the list tabs;
 * list drills arrive only through the official test-case query.
 */
const { t } = useI18n();
const route = useRoute();
const router = useRouter();

const activeTab = ref<DqLandingTab>(parseDqTab(route.params.tab ?? route.query.tab));
const isTestCaseModalOpen = ref(false);
const isBundleSuiteModalOpen = ref(false);

function queryString(value: unknown): string | undefined {
  return typeof value === 'string' && value ? value : undefined;
}

function queryStrings(value: unknown): string | undefined {
  const list = (Array.isArray(value) ? value : [value]).filter(
    (item): item is string => typeof item === 'string' && Boolean(item),
  );
  return list.length ? list.join(',') : undefined;
}

/**
 * Pin getTestCaseTabPath accepts a status array (health pie: [Success,
 * Queued] / [Failed, Aborted]) — the drill query carries it as repeated
 * `testCaseStatus=` params, so the list drill keeps the array (a single
 * value stays a plain string for the single-select filter).
 */
function queryStatus(value: unknown): string | string[] | undefined {
  const list = (Array.isArray(value) ? value : [value]).filter(
    (item): item is string => typeof item === 'string' && Boolean(item),
  );
  if (list.length === 0) {
    return undefined;
  }
  return list.length === 1 ? list[0] : list;
}

function queryNumber(value: unknown): number | undefined {
  const num = Number(value);
  return Number.isFinite(num) && num > 0 ? num : undefined;
}

const listDrill = computed(() => ({
  testCaseStatus: queryStatus(route.query.testCaseStatus),
  dataQualityDimension: queryString(route.query.dataQualityDimension),
  tags: queryStrings(route.query.tags),
  tier: queryString(route.query.tier),
  dataProductFqn: queryString(route.query.dataProductFqn),
  tableFqn: queryString(route.query.tableFqn),
  startTs: queryNumber(route.query.startTs),
  endTs: queryNumber(route.query.endTs),
}));

function onAddMenu({ key }: { key: string | number }): void {
  if (key === 'case') {
    void openCreateCase();
  } else if (key === 'suite') {
    void openCreateSuite();
  }
}

function dqQueryWithoutTab() {
  const query = { ...route.query };
  delete query.tab;
  return query;
}

function dataQualityPagePath(tab: DqLandingTab, subTab?: string): string {
  if (tab === 'test-suites' && subTab) {
    return '/data-quality/' + tab + '/' + subTab;
  }
  return '/data-quality/' + tab;
}

function onTabChange(key: string | number): void {
  const tab = parseDqTab(key);
  activeTab.value = tab;
  void router.replace({ path: dataQualityPagePath(tab), query: dqQueryWithoutTab() });
}

/** Pin DataQualityPage: page-level TestCaseFormDrawer, no tab switch. */
function openCreateCase(): void {
  isTestCaseModalOpen.value = true;
}

/** Pin BundleSuiteFormDrawer on the current tab. */
function openCreateSuite(): void {
  isBundleSuiteModalOpen.value = true;
}

watch(
  () => [route.params.tab, route.query.tab],
  () => {
    activeTab.value = parseDqTab(route.params.tab ?? route.query.tab);
  },
);
</script>

<template>
  <PageLayout test-id="dq-landing-layout">
  <div class="dq-landing" data-testid="dq-landing" data-tour-step="data-quality-data-health" data-tour-page>
    <div class="dq-landing__head">
      <div data-testid="dq-landing-title">
        <PageHeader
          :header="t('label.data-quality')"
          :sub-header="t('message.page-sub-header-for-data-quality')"
          learning-page-id="dataQuality"
        />
      </div>
      <Dropdown v-if="activeTab === 'dashboard'" :trigger="['click']">
        <Button type="primary" data-testid="data-quality-add-button-menu">
          {{ t('label.add') }}
          <SmIcon icon-key="action-chevron-down" />
        </Button>
        <template #overlay>
          <Menu @click="onAddMenu">
            <Menu.Item key="case" data-testid="dq-landing-add-case">{{ t('label.add-a-entity', { entity: t('label.test-case') }) }}</Menu.Item>
            <Menu.Item key="suite" data-testid="dq-landing-add-suite">{{ t('label.add-a-entity', { entity: t('label.bundle-suite') }) }}</Menu.Item>
          </Menu>
        </template>
      </Dropdown>
      <Button
        v-else-if="activeTab === 'test-cases'"
        type="primary"
        data-testid="add-test-case-btn"
        @click="openCreateCase"
      >
        {{ t('label.add-a-entity', { entity: t('label.test-case') }) }}
      </Button>
      <Button
        v-else
        type="primary"
        data-testid="add-test-suite-btn"
        @click="openCreateSuite"
      >
        {{ t('label.add-a-entity', { entity: t('label.bundle-suite') }) }}
      </Button>
    </div>

    <Tabs :active-key="activeTab" data-testid="dq-landing-tabs" @change="onTabChange">
      <Tabs.TabPane key="dashboard" :tab="t('label.summary')" />
      <Tabs.TabPane key="test-cases" :tab="t('label.test-case-plural')" />
      <Tabs.TabPane key="test-suites" :tab="t('label.test-suite-plural')" />
    </Tabs>

    <DataQualityDashboard v-if="activeTab === 'dashboard'" />

    <TestCasesListView
      v-if="activeTab === 'test-cases'"
      embedded
      :prefer-search="true"
      :tier="listDrill.tier"
      :tags="listDrill.tags"
      :data-product-fqn="listDrill.dataProductFqn"
      :start-ts="listDrill.startTs"
      :end-ts="listDrill.endTs"
      :status="listDrill.testCaseStatus"
      :data-quality-dimension="listDrill.dataQualityDimension"
      :entity-fqn="listDrill.tableFqn"
    />

    <TestSuitesListView
      v-if="activeTab === 'test-suites'"
      embedded
      :prefer-search="true"
      :initial-sub-tab="typeof route.query.subTab === 'string' ? route.query.subTab : 'table-suites'"
    />
  </div>
  <TestCaseFormDrawer
    :open="isTestCaseModalOpen"
    @cancel="isTestCaseModalOpen = false"
    @submitted="isTestCaseModalOpen = false"
  />
  <LogicalTestSuiteDrawer
    :open="isBundleSuiteModalOpen"
    @cancel="isBundleSuiteModalOpen = false"
    @submitted="isBundleSuiteModalOpen = false"
  />
  </PageLayout>
</template>

<style scoped>
.dq-landing__head {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  align-items: flex-start;
}
</style>
