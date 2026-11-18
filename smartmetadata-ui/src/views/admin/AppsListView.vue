<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<!--
  Vue port of pin pages/Application/ApplicationPage.tsx (282 lines).
  Card grid, Disabled toggle, LimitWrapper Add button, cursor paging.
  Navigation uses the current router record (`admin-app`, `:id` param)
  with the FQN as the param value; the `:id` -> `:fqn` rename is a
  router-line request (see the batch report). The Add button navigates
  to the app-marketplace catalog route, the product's current
  equivalent of pin ROUTES.MARKETPLACE under the AP-D3 no-switch rule.
-->
<script setup lang="ts">
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { Button, Card, Col, Row, Skeleton, Switch } from 'ant-design-vue';
import { DatabaseOutlined } from '@ant-design/icons-vue';
import { getApplicationList } from '@/api/apps';
import LimitWrapper from '@/components/shared/LimitWrapper.vue';
import NextPrevious from '@/components/shared/NextPrevious.vue';
import NoDataPlaceholder from '@/components/shared/NoDataPlaceholder.vue';
import PageHeader from '@/components/shared/PageHeader.vue';
import SmBreadcrumb, { type SmBreadcrumbItem } from '@/components/shared/SmBreadcrumb.vue';
import { useCursorPagedList } from '@/composables/useCursorPagedList';
import { useAuthStore } from '@/stores/auth';
import type { AdminApp } from '@/types/admin';
import ApplicationCard from '@/views/marketplace/ApplicationCard.vue';
import { getEntityName, isCacheWarmupApplication } from '@/views/marketplace/appUtils';

const { t } = useI18n();
const router = useRouter();
const authStore = useAuthStore();
const showDisabled = ref(false);

const breadcrumbItems = computed<SmBreadcrumbItem[]>(() => [
  { label: t('label.setting-plural'), routeName: 'admin-settings' },
  { label: t('label.application-plural') },
]);

const { items, paging, isLoading, page, pageSize, showPagination, onPageChange, onPageSizeChange } =
  useCursorPagedList<AdminApp>(
    async ({ after, before, limit }) => {
      const page = await getApplicationList({
        after,
        before,
        limit,
        include: showDisabled.value ? 'deleted' : 'non-deleted',
      });
      return {
        data: page.data,
        paging: { after: page.after, before: page.before, total: page.total ?? 0 },
      };
    },
    {
      persistence: { storage: window.localStorage, userName: () => authStore.user?.name },
      resetKey: () => showDisabled.value,
    },
  );

function disabledReasonFor(app: AdminApp): string | undefined {
  return app.enabled === false && isCacheWarmupApplication(app.name)
    ? t('message.cache-service-not-configured-message')
    : undefined;
}

function viewAppDetails(app: AdminApp): void {
  void router.push({ name: 'admin-app', params: { fqn: app.fullyQualifiedName ?? '' } });
}

function handleAddApplication(): void {
  void router.push({ name: 'marketplace-app-catalog' });
}
</script>

<template>
  <div>
    <SmBreadcrumb :items="breadcrumbItems" />
    <Row :gutter="[0, 16]" align="middle">
      <Col :span="16">
        <PageHeader
          :header="t('label.extend-open-meta-data')"
          :sub-header="t('message.application-to-improve-data')"
          learning-page-id="automations"
        />
      </Col>
      <Col :span="8" style="display: flex; justify-content: flex-end; align-items: center; gap: 16px">
        <label style="display: flex; align-items: center; gap: 8px">
          <Switch
            data-testid="show-disabled"
            :checked="showDisabled"
            @change="(checked) => (showDisabled = Boolean(checked))"
          />
          <span>{{ t('label.disabled') }}</span>
        </label>
        <LimitWrapper resource="app">
          <template #default="{ limitReached }">
            <Button
              type="primary"
              :disabled="limitReached"
              data-testid="add-application"
              @click="handleAddApplication"
            >
              {{ t('label.add-entity', { entity: t('label.app-plural') }) }}
            </Button>
          </template>
        </LimitWrapper>
      </Col>
    </Row>
    <Row :gutter="[20, 20]" style="margin-top: 20px">
      <template v-if="isLoading">
        <Col v-for="key in [1, 2, 3, 4]" :key="key" :xs="24" :sm="24" :md="12" :lg="8" :xl="6">
          <Card><Skeleton active :paragraph="{ rows: 3 }" /></Card>
        </Col>
      </template>
      <Col v-if="items.length === 0 && !isLoading" :span="24" style="text-align: center">
        <div style="position: relative; min-height: 240px">
          <NoDataPlaceholder v-if="showDisabled" test-id="no-data-placeholder" />
          <NoDataPlaceholder
            v-else
            test-id="no-data-placeholder"
            :description="t('message.no-installed-applications-found')"
            :icon="DatabaseOutlined"
          />
        </div>
      </Col>
      <template v-if="!isLoading">
        <Col :span="24">
          <Row :gutter="[20, 20]">
            <Col
              v-for="item in items"
              :key="item.fullyQualifiedName"
              :xs="24"
              :sm="24"
              :md="12"
              :lg="8"
              :xl="6"
            >
              <ApplicationCard
                :app-name="item.fullyQualifiedName ?? ''"
                :deleted="item.deleted"
                :description="item.description ?? ''"
                :disabled="item.enabled === false"
                :disabled-reason="disabledReasonFor(item)"
                :link-title="t('label.configure')"
                :show-description="false"
                :title="getEntityName(item)"
                :on-click="() => viewAppDetails(item)"
              />
            </Col>
          </Row>
        </Col>
        <Col v-if="showPagination" :span="24">
          <NextPrevious
            :paging="paging"
            :paging-handler="({ currentPage }) => onPageChange(currentPage)"
            :page-size="pageSize"
            :current-page="page"
            :is-loading="isLoading"
            :on-show-size-change="onPageSizeChange"
          />
        </Col>
      </template>
    </Row>
  </div>
</template>
