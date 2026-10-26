<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { Alert, Button, Col, Empty, Row, Space, Spin, Typography } from 'ant-design-vue';
import { listActivityEvents } from '@/api/activity';
import { listAnnouncements } from '@/api/announcements';
import { listDatabaseServices } from '@/api/databaseServices';
import { listDataProducts } from '@/api/dataProducts';
import { listDomains } from '@/api/domains';
import { listIngestionPipelines } from '@/api/ingestionPipelines';
import { listKpis } from '@/api/kpi';
import { listMessagingServices } from '@/api/messagingServices';
import { searchAssets } from '@/api/search';
import { listTasks } from '@/api/tasks';
import { listTestCases } from '@/api/testCases';
import { assetLocation } from '@/catalog/entityRoutes';
import type { FacetId } from '@/catalog/searchFacets';
import HomeWidgetCard from '@/features/home/HomeWidgetCard.vue';
import { fieldTermQuery, startCaseName } from '@/features/home/fieldQuery';
import { useAuthStore } from '@/stores/auth';
import type { SearchHit, SearchPage } from '@/types/api';
import type { Announcement } from '@/types/collaboration';

interface HomeRow {
  key: string;
  title: string;
  meta?: string;
  to?: { name: string; params?: Record<string, string> };
}

interface HomeWidgetState {
  items: HomeRow[];
  total?: number;
  error: string;
  extra?: string;
}

const router = useRouter();
const auth = useAuthStore();
const { t, te } = useI18n();

const loading = ref(true);
const pageError = ref('');
const viewMode = ref<'grid' | 'list'>('grid');
const collapsed = ref(false);
const announcements = ref<Announcement[]>([]);
const systemAnnouncements = ref<Announcement[]>([]);
const announcementsError = ref('');

const emptyWidget = (): HomeWidgetState => ({ items: [], error: '' });
const platformHealth = ref<HomeWidgetState>(emptyWidget());
const dataEstate = ref<HomeWidgetState>(emptyWidget());
const totalAssets = ref<HomeWidgetState>(emptyWidget());
const myTasks = ref<HomeWidgetState>(emptyWidget());
const pipelineStatus = ref<HomeWidgetState>(emptyWidget());
const activityFeed = ref<HomeWidgetState>(emptyWidget());
const yoursAndFollowed = ref<HomeWidgetState>(emptyWidget());
const dataQuality = ref<HomeWidgetState>(emptyWidget());
const domains = ref<HomeWidgetState>(emptyWidget());
const dataProducts = ref<HomeWidgetState>(emptyWidget());
const kpis = ref<HomeWidgetState>(emptyWidget());

const greetName = computed(() => {
  const raw = auth.displayName || t('home.userFallback');
  return startCaseName(raw) || t('home.userFallback');
});
const colSpan = computed(() => (viewMode.value === 'list' ? 24 : 12));

function facetBuckets(page: SearchPage, id: FacetId) {
  return page.facets.find((facet) => facet.id === id)?.buckets ?? [];
}

function entityLabel(entityType: string): string {
  const key = `explore.entity.${entityType}`;
  return te(key) ? t(key) : entityType;
}

function announcementTitle(item: Announcement): string {
  return item.displayName || item.name || item.description || item.id;
}

function hitTitle(hit: SearchHit): string {
  return hit.displayName || hit.name;
}

function hitTo(hit: SearchHit): HomeRow['to'] | undefined {
  if (!hit.entityType || !hit.fullyQualifiedName) {
    return undefined;
  }
  return assetLocation(hit.entityType, hit.fullyQualifiedName);
}

function settled<T>(value: PromiseSettledResult<T>, fallback: T): T {
  return value.status === 'fulfilled' ? value.value : fallback;
}

function settledError(value: PromiseSettledResult<unknown>, fallback: string): string {
  if (value.status === 'fulfilled') {
    return '';
  }
  return value.reason instanceof Error ? value.reason.message : fallback;
}

async function load(): Promise<void> {
  loading.value = true;
  pageError.value = '';
  announcementsError.value = '';
  const userId = auth.user?.id;
  const emptyPage = { total: 0, hits: [], facets: [] } satisfies SearchPage;
  const results = await Promise.allSettled([
    listAnnouncements({ active: true, system: false, limit: 8 }),
    listAnnouncements({ active: true, system: true, limit: 5 }),
    searchAssets('*', 0, 1),
    listTasks({ limit: 5, statusGroup: 'open' }),
    listIngestionPipelines({ limit: 5 }),
    listActivityEvents({ days: 7, limit: 5 }),
    userId
      ? searchAssets(fieldTermQuery('owners.id', userId), 0, 5, { includeAggregations: false })
      : Promise.resolve(emptyPage),
    userId
      ? searchAssets(fieldTermQuery('followers', userId), 0, 5, { includeAggregations: false })
      : Promise.resolve(emptyPage),
    listTestCases({ limit: 5 }),
    listDomains({ limit: 5 }),
    listDataProducts({ limit: 5 }),
    listKpis({ limit: 5 }),
    listDatabaseServices({ limit: 25 }),
    listMessagingServices({ limit: 25 }),
  ]);

  const [
    assetAnn,
    systemAnn,
    search,
    tasks,
    pipelines,
    activity,
    owned,
    followed,
    tests,
    domainPage,
    productPage,
    kpiPage,
    dbServices,
    msgServices,
  ] = results;

  announcements.value = settled(assetAnn, { data: [], total: 0 }).data;
  systemAnnouncements.value = settled(systemAnn, { data: [], total: 0 }).data;
  announcementsError.value = settledError(assetAnn, t('home.announcementsFailed'));

  const catalog = settled(search, emptyPage);
  const entityBuckets = facetBuckets(catalog, 'entityType');
  const serviceBuckets = facetBuckets(catalog, 'serviceType');
  totalAssets.value = {
    error: settledError(search, t('home.loadFailed')),
    total: catalog.total,
    extra: catalog.total ? t('home.countAssets', { count: catalog.total }) : '',
    items: entityBuckets.map((bucket) => ({
      key: bucket.key,
      title: entityLabel(bucket.key),
      meta: String(bucket.count),
      to: { name: 'search' },
    })),
  };
  dataEstate.value = {
    error: settledError(search, t('home.loadFailed')),
    total: catalog.total,
    extra: catalog.total ? t('home.countConnectors', { count: serviceBuckets.length }) : '',
    items: serviceBuckets.map((bucket) => ({
      key: bucket.key,
      title: bucket.key,
      meta: String(bucket.count),
      to: { name: 'search' },
    })),
  };

  const taskPage = settled(tasks, { data: [], total: 0 });
  myTasks.value = {
    error: settledError(tasks, t('home.loadFailed')),
    total: taskPage.total,
    extra: taskPage.total ? t('home.countOpen', { count: taskPage.total }) : '',
    items: taskPage.data.map((task) => ({
      key: task.id,
      title: task.displayName || task.name || task.type || task.id,
      meta: task.status,
      to: { name: 'task', params: { id: task.id } },
    })),
  };

  const pipelinePage = settled(pipelines, { data: [], total: 0 });
  pipelineStatus.value = {
    error: settledError(pipelines, t('home.loadFailed')),
    total: pipelinePage.total,
    extra: pipelinePage.total ? t('home.countPipelines', { count: pipelinePage.total }) : '',
    items: pipelinePage.data.map((pipeline) => ({
      key: pipeline.id,
      title: pipeline.displayName || pipeline.name,
      meta: pipeline.enabled === false ? t('home.disabled') : t('home.enabled'),
      to: { name: 'ingestion-pipeline', params: { id: pipeline.id } },
    })),
  };

  const activityPage = settled(activity, { data: [], total: 0 });
  activityFeed.value = {
    error: settledError(activity, t('home.loadFailed')),
    total: activityPage.total,
    items: activityPage.data.map((event) => ({
      key: event.id,
      title: event.summary || event.eventType,
      meta: event.entity?.displayName || event.entity?.name,
      to:
        event.entity?.type && event.entity.fullyQualifiedName
          ? assetLocation(event.entity.type, event.entity.fullyQualifiedName)
          : { name: 'activity' },
    })),
  };

  const ownedPage = settled(owned, emptyPage);
  const followedPage = settled(followed, emptyPage);
  const followedError = settledError(followed, '');
  const ownedError = settledError(owned, '');
  yoursAndFollowed.value = {
    error: ownedError || followedError,
    extra:
      ownedPage.total || followedPage.total
        ? t('home.ownedAndFollowed', { owned: ownedPage.total, followed: followedPage.total })
        : '',
    items: [
      ...ownedPage.hits.map((hit) => ({
        key: `owned-${hit.id || hit.fullyQualifiedName}`,
        title: hitTitle(hit),
        meta: t('home.owned'),
        to: hitTo(hit),
      })),
      ...followedPage.hits.map((hit) => ({
        key: `followed-${hit.id || hit.fullyQualifiedName}`,
        title: hitTitle(hit),
        meta: t('home.following'),
        to: hitTo(hit),
      })),
    ],
  };

  const testPage = settled(tests, { data: [], total: 0 });
  dataQuality.value = {
    error: settledError(tests, t('home.loadFailed')),
    total: testPage.total,
    extra: testPage.total ? t('home.countTests', { count: testPage.total }) : '',
    items: testPage.data.map((item) => ({
      key: item.id,
      title: item.displayName || item.name,
      meta: item.testCaseResult?.testCaseStatus || item.testCaseStatus,
      to: { name: 'quality-test-case', params: { id: item.id } },
    })),
  };

  const domainsResult = settled(domainPage, { data: [], total: 0 });
  domains.value = {
    error: settledError(domainPage, t('home.loadFailed')),
    total: domainsResult.total,
    items: domainsResult.data.map((item) => ({
      key: item.id || item.name,
      title: item.displayName || item.name,
      meta: item.domainType,
      to: item.id ? { name: 'governance-domain', params: { id: item.id } } : { name: 'governance-domains' },
    })),
  };

  const productsResult = settled(productPage, { data: [], total: 0 });
  dataProducts.value = {
    error: settledError(productPage, t('home.loadFailed')),
    total: productsResult.total,
    items: productsResult.data.map((item) => ({
      key: item.id || item.name,
      title: item.displayName || item.name,
      to: item.id
        ? { name: 'governance-data-product', params: { id: item.id } }
        : { name: 'governance-data-products' },
    })),
  };

  const kpiResult = settled(kpiPage, { data: [], total: 0 });
  kpis.value = {
    error: settledError(kpiPage, t('home.loadFailed')),
    total: kpiResult.total,
    items: kpiResult.data.map((item) => ({
      key: item.id || item.name,
      title: item.displayName || item.name,
      meta: item.kpiResult?.targetResult[0]?.value,
      to: { name: 'insights' },
    })),
  };

  const dbPage = settled(dbServices, { data: [], total: 0 });
  const msgPage = settled(msgServices, { data: [], total: 0 });
  const services = [...dbPage.data, ...msgPage.data];
  platformHealth.value = {
    error: settledError(dbServices, t('home.loadFailed')) || settledError(msgServices, t('home.loadFailed')),
    total: (dbPage.total ?? dbPage.data.length) + (msgPage.total ?? msgPage.data.length),
    extra: services.length ? t('home.countServices', { count: services.length }) : '',
    items: services.slice(0, 5).map((service) => ({
      key: `${service.kind}-${service.id || service.name}`,
      title: service.displayName || service.name,
      meta: service.serviceType,
      to: service.id
        ? { name: 'ingestion-service', params: { kind: service.kind, id: service.id } }
        : { name: 'ingestion-services' },
    })),
  };

  if (results.every((result) => result.status === 'rejected')) {
    pageError.value = t('home.loadFailed');
  }
  loading.value = false;
}

function openRow(row: HomeRow): void {
  if (row.to) {
    void router.push(row.to);
  }
}

function openRoute(name: string): void {
  void router.push({ name });
}

onMounted(() => {
  void load();
});
</script>

<template>
  <div class="home" data-testid="home-page-surface">
    <div class="home__panel" data-testid="home-landing-page">
      <header class="home__greeting" data-testid="home-landing-page-header">
        <Typography.Title :level="3">{{ t('home.hiUser', { user: greetName }) }}</Typography.Title>
        <Typography.Paragraph type="secondary">{{ t('home.subtitle') }}</Typography.Paragraph>
      </header>

      <Alert
        v-for="item in systemAnnouncements"
        :key="item.id"
        class="home__critical"
        type="warning"
        show-icon
        :message="announcementTitle(item)"
        :description="item.description"
        data-testid="home-critical-announcement"
      />

      <section class="home__rail" data-testid="home-announcements-rail">
        <div class="home__rail-head">
          <Typography.Title :level="5">{{ t('home.announcements') }}</Typography.Title>
          <Button type="link" data-testid="home-announcements-view-all" @click="openRoute('announcements')">
            {{ t('home.viewAll') }}
          </Button>
        </div>
        <Empty
          v-if="!loading && !announcements.length"
          data-testid="home-announcements-empty"
          :description="announcementsError || t('home.noActiveAnnouncements')"
        />
        <div v-else class="home__rail-cards">
          <button
            v-for="item in announcements"
            :key="item.id"
            type="button"
            class="home__rail-card"
            :data-testid="`home-announcement-${item.id}`"
            @click="openRoute('announcements')"
          >
            <strong>{{ announcementTitle(item) }}</strong>
            <span>{{ item.description }}</span>
          </button>
        </div>
      </section>

      <section data-testid="topics-to-catch-up-on">
        <div class="home__topics-head">
          <div>
            <Typography.Title :level="5">{{ t('home.topicsTitle') }}</Typography.Title>
            <Typography.Paragraph type="secondary">{{ t('home.topicsSubtitle') }}</Typography.Paragraph>
          </div>
          <Space>
            <Button data-testid="home-view-grid" :type="viewMode === 'grid' ? 'primary' : 'default'" @click="viewMode = 'grid'">
              {{ t('home.grid') }}
            </Button>
            <Button data-testid="home-view-list" :type="viewMode === 'list' ? 'primary' : 'default'" @click="viewMode = 'list'">
              {{ t('home.list') }}
            </Button>
            <Button data-testid="toggle-all-widgets" @click="collapsed = !collapsed">
              {{ collapsed ? t('home.expandAll') : t('home.collapseAll') }}
            </Button>
          </Space>
        </div>
        <Spin :spinning="loading">
          <Alert v-if="pageError" type="warning" show-icon :message="pageError" class="home__alert" />
          <Row v-if="!collapsed" :gutter="[16, 16]" data-testid="home-widget-grid">
            <Col :span="colSpan">
              <HomeWidgetCard
                test-id="home-widget-platformHealth"
                :title="t('home.widgets.platformHealth')"
                :loading="loading"
                :error="platformHealth.error"
                :empty="!platformHealth.items.length"
                :empty-text="t('home.empty.platformHealth')"
                :meta="platformHealth.extra"
                :summary="t('home.summary.platformHealth')"
              >
                <template #extra>
                  <Button type="link" data-testid="home-widget-platformHealth-view" @click="openRoute('ingestion-services')">
                    {{ t('home.viewAll') }}
                  </Button>
                </template>
                <button
                  v-for="row in platformHealth.items"
                  :key="row.key"
                  type="button"
                  class="home__row"
                  @click="openRow(row)"
                >
                  <span>{{ row.title }}</span>
                  <span>{{ row.meta }}</span>
                </button>
              </HomeWidgetCard>
            </Col>
            <Col :span="colSpan">
              <HomeWidgetCard
                test-id="home-widget-dataEstate"
                :title="t('home.widgets.dataEstate')"
                :loading="loading"
                :error="dataEstate.error"
                :empty="!dataEstate.items.length"
                :empty-text="t('home.empty.dataEstate')"
                :meta="dataEstate.extra"
                :summary="t('home.summary.dataEstate')"
              >
                <template #extra>
                  <Button type="link" data-testid="home-widget-dataEstate-view" @click="openRoute('search')">
                    {{ t('home.viewAll') }}
                  </Button>
                </template>
                <button
                  v-for="row in dataEstate.items"
                  :key="row.key"
                  type="button"
                  class="home__row"
                  @click="openRow(row)"
                >
                  <span>{{ row.title }}</span>
                  <span>{{ row.meta }}</span>
                </button>
              </HomeWidgetCard>
            </Col>
            <Col :span="colSpan">
              <HomeWidgetCard
                test-id="home-widget-totalAssets"
                :title="t('home.widgets.totalAssets')"
                :loading="loading"
                :error="totalAssets.error"
                :empty="!totalAssets.items.length"
                :empty-text="t('home.empty.totalAssets')"
                :meta="totalAssets.extra"
                :summary="t('home.summary.totalAssets')"
              >
                <template #extra>
                  <Button type="link" data-testid="home-widget-totalAssets-view" @click="openRoute('search')">
                    {{ t('home.viewAll') }}
                  </Button>
                </template>
                <button
                  v-for="row in totalAssets.items"
                  :key="row.key"
                  type="button"
                  class="home__row"
                  @click="openRow(row)"
                >
                  <span>{{ row.title }}</span>
                  <span>{{ row.meta }}</span>
                </button>
              </HomeWidgetCard>
            </Col>
            <Col :span="colSpan">
              <HomeWidgetCard
                test-id="home-widget-myTasks"
                :title="t('home.widgets.myTasks')"
                :loading="loading"
                :error="myTasks.error"
                :empty="!myTasks.items.length"
                :empty-text="t('home.empty.myTasks')"
                :meta="myTasks.extra"
                :summary="t('home.summary.myTasks')"
              >
                <template #extra>
                  <Button type="link" data-testid="home-widget-myTasks-view" @click="openRoute('tasks')">
                    {{ t('home.viewAll') }}
                  </Button>
                </template>
                <button
                  v-for="row in myTasks.items"
                  :key="row.key"
                  type="button"
                  class="home__row"
                  data-testid="home-task-row"
                  @click="openRow(row)"
                >
                  <span>{{ row.title }}</span>
                  <span>{{ row.meta }}</span>
                </button>
              </HomeWidgetCard>
            </Col>
            <Col :span="colSpan">
              <HomeWidgetCard
                test-id="home-widget-pipelineStatus"
                :title="t('home.widgets.pipelineStatus')"
                :loading="loading"
                :error="pipelineStatus.error"
                :empty="!pipelineStatus.items.length"
                :empty-text="t('home.empty.pipelineStatus')"
                :meta="pipelineStatus.extra"
                :summary="t('home.summary.pipelineStatus')"
              >
                <template #extra>
                  <Button type="link" @click="openRoute('ingestion-pipelines')">{{ t('home.viewAll') }}</Button>
                </template>
                <button
                  v-for="row in pipelineStatus.items"
                  :key="row.key"
                  type="button"
                  class="home__row"
                  @click="openRow(row)"
                >
                  <span>{{ row.title }}</span>
                  <span>{{ row.meta }}</span>
                </button>
              </HomeWidgetCard>
            </Col>
            <Col :span="colSpan">
              <HomeWidgetCard
                test-id="home-widget-activityFeed"
                :title="t('home.widgets.activityFeed')"
                :loading="loading"
                :error="activityFeed.error"
                :empty="!activityFeed.items.length"
                :empty-text="t('home.empty.activityFeed')"
                :summary="t('home.summary.activityFeed')"
              >
                <template #extra>
                  <Button type="link" @click="openRoute('activity')">{{ t('home.viewAll') }}</Button>
                </template>
                <button
                  v-for="row in activityFeed.items"
                  :key="row.key"
                  type="button"
                  class="home__row"
                  data-testid="home-activity-row"
                  @click="openRow(row)"
                >
                  <span>{{ row.title }}</span>
                  <span>{{ row.meta }}</span>
                </button>
              </HomeWidgetCard>
            </Col>
            <Col :span="colSpan">
              <HomeWidgetCard
                test-id="home-widget-yoursAndFollowed"
                :title="t('home.widgets.yoursAndFollowed')"
                :loading="loading"
                :error="yoursAndFollowed.error"
                :empty="!yoursAndFollowed.items.length"
                :empty-text="t('home.empty.yoursAndFollowed')"
                :meta="yoursAndFollowed.extra"
                :summary="t('home.summary.yoursAndFollowed')"
              >
                <button
                  v-for="row in yoursAndFollowed.items"
                  :key="row.key"
                  type="button"
                  class="home__row"
                  :data-testid="row.meta === t('home.owned') ? 'owned-assets' : 'followed-assets'"
                  @click="openRow(row)"
                >
                  <span>{{ row.title }}</span>
                  <span>{{ row.meta }}</span>
                </button>
              </HomeWidgetCard>
            </Col>
            <Col :span="colSpan">
              <HomeWidgetCard
                test-id="home-widget-dataQuality"
                :title="t('home.widgets.dataQuality')"
                :loading="loading"
                :error="dataQuality.error"
                :empty="!dataQuality.items.length"
                :empty-text="t('home.empty.dataQuality')"
                :meta="dataQuality.extra"
                :summary="t('home.summary.dataQuality')"
              >
                <template #extra>
                  <Button type="link" @click="openRoute('quality-test-cases')">{{ t('home.viewAll') }}</Button>
                </template>
                <button
                  v-for="row in dataQuality.items"
                  :key="row.key"
                  type="button"
                  class="home__row"
                  @click="openRow(row)"
                >
                  <span>{{ row.title }}</span>
                  <span>{{ row.meta }}</span>
                </button>
              </HomeWidgetCard>
            </Col>
            <Col :span="colSpan">
              <HomeWidgetCard
                test-id="home-widget-domains"
                :title="t('home.widgets.domains')"
                :loading="loading"
                :error="domains.error"
                :empty="!domains.items.length"
                :empty-text="t('home.empty.domains')"
                :summary="t('home.summary.domains')"
              >
                <template #extra>
                  <Button type="link" @click="openRoute('governance-domains')">{{ t('home.viewAll') }}</Button>
                </template>
                <button
                  v-for="row in domains.items"
                  :key="row.key"
                  type="button"
                  class="home__row"
                  @click="openRow(row)"
                >
                  <span>{{ row.title }}</span>
                  <span>{{ row.meta }}</span>
                </button>
              </HomeWidgetCard>
            </Col>
            <Col :span="colSpan">
              <HomeWidgetCard
                test-id="home-widget-dataProducts"
                :title="t('home.widgets.dataProducts')"
                :loading="loading"
                :error="dataProducts.error"
                :empty="!dataProducts.items.length"
                :empty-text="t('home.empty.dataProducts')"
                :summary="t('home.summary.dataProducts')"
              >
                <template #extra>
                  <Button type="link" @click="openRoute('governance-data-products')">{{ t('home.viewAll') }}</Button>
                </template>
                <button
                  v-for="row in dataProducts.items"
                  :key="row.key"
                  type="button"
                  class="home__row"
                  @click="openRow(row)"
                >
                  <span>{{ row.title }}</span>
                </button>
              </HomeWidgetCard>
            </Col>
            <Col :span="colSpan">
              <HomeWidgetCard
                test-id="home-widget-kpi"
                :title="t('home.widgets.kpi')"
                :loading="loading"
                :error="kpis.error"
                :empty="!kpis.items.length"
                :empty-text="t('home.empty.kpi')"
                :summary="t('home.summary.kpi')"
              >
                <template #extra>
                  <Button type="link" data-testid="home-widget-kpi-view" @click="openRoute('insights')">
                    {{ t('home.viewAll') }}
                  </Button>
                </template>
                <button
                  v-for="row in kpis.items"
                  :key="row.key"
                  type="button"
                  class="home__row"
                  data-testid="home-kpi-row"
                  @click="openRow(row)"
                >
                  <span>{{ row.title }}</span>
                  <span>{{ row.meta }}</span>
                </button>
              </HomeWidgetCard>
            </Col>
          </Row>
        </Spin>
      </section>
    </div>
  </div>
</template>

<style scoped>
.home {
  min-height: 100%;
}
.home__panel {
  background: var(--sm-bg-container);
  border: 1px solid var(--sm-border-secondary);
  border-radius: var(--sm-radius-card);
  padding: 24px 20px 32px;
}
.home__greeting :deep(.ant-typography) {
  margin-bottom: 4px;
}
.home__greeting :deep(.ant-typography.ant-typography-secondary) {
  margin-bottom: 0;
}
.home__critical {
  margin-top: 16px;
}
.home__rail {
  margin: 28px 0 32px;
}
.home__rail-head,
.home__topics-head {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 12px;
}
.home__rail-head :deep(.ant-typography),
.home__topics-head :deep(.ant-typography) {
  margin-bottom: 0;
}
.home__topics-head :deep(.ant-typography.ant-typography-secondary) {
  margin-top: 2px;
}
.home__rail-cards {
  display: flex;
  gap: 12px;
  overflow-x: auto;
  padding-bottom: 4px;
}
.home__rail-card {
  flex: 0 0 240px;
  text-align: left;
  padding: 12px 14px;
  border: 1px solid var(--sm-border-secondary);
  border-radius: var(--sm-border-radius);
  background: var(--sm-bg-container);
  cursor: pointer;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.home__rail-card strong {
  color: var(--sm-text-primary);
}
.home__rail-card span {
  color: var(--sm-text-tertiary);
  font-size: 12px;
}
.home__rail-card:hover {
  border-color: var(--sm-color-primary);
}
.home__alert {
  margin-bottom: 16px;
}
.home__row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  width: 100%;
  text-align: left;
  padding: 8px 4px;
  border: 0;
  border-bottom: 1px solid var(--sm-border-secondary);
  background: transparent;
  cursor: pointer;
  color: var(--sm-text-primary);
}
.home__row:last-child {
  border-bottom: 0;
}
.home__row:hover {
  color: var(--sm-color-primary);
}
.home__row span:last-child {
  color: var(--sm-text-tertiary);
  font-size: 12px;
}
</style>
