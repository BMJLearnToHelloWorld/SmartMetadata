<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<!--
  Vue port of pin pages/MarketPlacePage/MarketPlacePage.tsx.
  Loading renders a bare spinner; an empty or failed fetch renders no
  empty/error UI at all (pin behavior). The inline admin gate is kept
  under the DEL-22 HOLD (see the batch report): the meta guard does
  not exist yet, so removing the check would open a no-guard window.
  Pin's PageHeader `title` prop feeds only the learning icon's title
  attribute, so there is no visible eyebrow to port.
-->
<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { Col, Row, Spin } from 'ant-design-vue';
import headingIconUrl from '@/assets/svg/marketplace-heading.svg';
import { getMarketPlaceApplicationList, type MarketplaceApp } from '@/api/marketplaceApps';
import NextPrevious from '@/components/shared/NextPrevious.vue';
import PageHeader from '@/components/shared/PageHeader.vue';
import SmBreadcrumb, { type SmBreadcrumbItem } from '@/components/shared/SmBreadcrumb.vue';
import { useCursorPagedList } from '@/composables/useCursorPagedList';
import { useAuthStore } from '@/stores/auth';
import ForbiddenView from '@/views/shell/ForbiddenView.vue';
import ApplicationCard from './ApplicationCard.vue';
import { getEntityName, isCacheWarmupApplication } from './appUtils';

const { t } = useI18n();
const router = useRouter();
const authStore = useAuthStore();

const isAdmin = computed(() => authStore.user?.isAdmin === true);

const breadcrumbItems = computed<SmBreadcrumbItem[]>(() => [
  { label: t('label.application-plural'), routeName: 'admin-apps' },
  { label: t('label.market-place') },
]);

const { items, paging, isLoading, page, pageSize, showPagination, onPageChange, onPageSizeChange } =
  useCursorPagedList<MarketplaceApp>(
    async ({ after, before, limit }) => {
      // Pin never mounts this page for non-admins (AdminProtectedRoute);
      // the inline gate renders ForbiddenView instead, so skip the
      // request entirely rather than surfacing a 403 toast behind it.
      // The resetKey below restarts the list once the user loads.
      if (!isAdmin.value) {
        return { data: [], paging: { total: 0 } };
      }
      const page = await getMarketPlaceApplicationList({ after, before, limit });
      return {
        data: page.data,
        paging: { after: page.after, before: page.before, total: page.total ?? 0 },
      };
    },
    {
      persistence: { storage: window.localStorage, userName: () => authStore.user?.name },
      resetKey: () => isAdmin.value,
    },
  );

function disabledReasonFor(app: MarketplaceApp): string | undefined {
  return app.enabled === false && isCacheWarmupApplication(app.name)
    ? t('message.cache-service-not-configured-message')
    : undefined;
}

function viewAppDetails(app: MarketplaceApp): void {
  void router.push({
    name: 'marketplace-app-detail',
    params: { fqn: app.fullyQualifiedName ?? '' },
  });
}
</script>

<template>
  <div data-testid="marketplace-app-catalog">
    <ForbiddenView v-if="!isAdmin" />
    <template v-else>
      <div v-if="isLoading" style="display: flex; justify-content: center; padding: 48px 0">
        <Spin size="large" />
      </div>
      <template v-else>
        <SmBreadcrumb :items="breadcrumbItems" />
        <div style="display: flex; justify-content: center">
          <div style="max-width: 75%; flex: 0 0 75%">
            <div style="display: flex; align-items: center; justify-content: space-between">
              <PageHeader
                :header="t('label.extend-open-meta-data')"
                :sub-header="t('message.application-to-improve-data')"
                learning-page-id="automations"
              />
              <img :src="headingIconUrl" alt="" />
            </div>
          </div>
        </div>
        <div style="display: flex; justify-content: center; margin-top: 20px">
          <div style="max-width: 83.33333333333334%; flex: 0 0 83.33333333333334%">
            <Row :gutter="[20, 20]">
              <Col
                v-for="item in items"
                :key="item.fullyQualifiedName"
                :xs="24"
                :sm="24"
                :md="12"
                :lg="8"
              >
                <ApplicationCard
                  :app-name="item.fullyQualifiedName ?? ''"
                  :description="item.description ?? ''"
                  :disabled="item.enabled === false"
                  :disabled-reason="disabledReasonFor(item)"
                  :link-title="t('label.read-type', { type: t('label.more') })"
                  :title="getEntityName(item)"
                  :on-click="() => viewAppDetails(item)"
                />
              </Col>
            </Row>
          </div>
        </div>
        <div style="display: flex; justify-content: center">
          <div style="max-width: 75%; flex: 0 0 75%">
            <NextPrevious
              v-if="showPagination"
              :paging="paging"
              :paging-handler="({ currentPage }) => onPageChange(currentPage)"
              :page-size="pageSize"
              :current-page="page"
              :is-loading="isLoading"
              :on-show-size-change="onPageSizeChange"
            />
          </div>
        </div>
      </template>
    </template>
  </div>
</template>
