<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { Alert, Button, Card, Empty, Space, Spin, Tag, Typography } from 'ant-design-vue';
import PageHeader from '@/components/shared/PageHeader.vue';
import { listMarketplaceApps, type MarketplaceApp } from '@/api/marketplaceApps';
import { useAuthStore } from '@/stores/auth';
import ForbiddenView from '@/views/shell/ForbiddenView.vue';

/**
 * Installable-app catalog (A2). Official shape
 * (openmetadata-ui/.../pages/MarketPlacePage/MarketPlacePage.tsx):
 * AdminProtectedRoute-gated, PageHeader over a card grid fed by
 * getMarketPlaceApplicationList with cursor paging, each card opening
 * the app detail page. The product route deliberately does NOT reuse
 * /marketplace: that path already serves the data marketplace
 * (official /data-marketplace), so the catalog lives at
 * marketplace/apps, the parent of the existing marketplace/apps/:fqn
 * detail route. Disabled cards mirror official ApplicationCard: a
 * disabled app shows its disabled state, with the cache-warmup reason
 * when the app is CacheWarmupApplication.
 */
const { t } = useI18n();
const router = useRouter();
const authStore = useAuthStore();

const isAdmin = () => authStore.user?.isAdmin === true;
const loading = ref(false);
const loadError = ref('');
const apps = ref<MarketplaceApp[]>([]);
const total = ref<number | undefined>();
const after = ref<string | undefined>();
const before = ref<string | undefined>();

async function load(cursor?: { after?: string; before?: string }): Promise<void> {
  loading.value = true;
  loadError.value = '';
  try {
    const page = await listMarketplaceApps({ limit: 25, ...cursor });
    apps.value = page.data;
    total.value = page.total;
    after.value = page.after;
    before.value = page.before;
  } catch (error) {
    apps.value = [];
    loadError.value = error instanceof Error ? error.message : t('crud.loadFailed');
  } finally {
    loading.value = false;
  }
}

function isCacheWarmup(app: MarketplaceApp): boolean {
  return app.name === 'CacheWarmupApplication' || app.fullyQualifiedName === 'CacheWarmupApplication';
}

function openApp(app: MarketplaceApp): void {
  const fqn = app.fullyQualifiedName || app.name;
  void router.push({ name: 'marketplace-app-detail', params: { fqn } });
}

onMounted(() => {
  void load();
});
</script>

<template>
  <div data-testid="marketplace-app-catalog">
    <ForbiddenView v-if="!isAdmin()" />
    <template v-else>
      <PageHeader
        :header="t('apps.catalog.title')"
        :sub-header="t('apps.catalog.lead')"
        test-id="marketplace-app-catalog-header"
      />
      <Spin :spinning="loading" data-testid="marketplace-app-catalog-loading">
        <Alert v-if="loadError" type="error" show-icon :message="loadError" />
        <Empty
          v-if="!loading && !loadError && !apps.length"
          :description="t('apps.catalog.empty')"
          data-testid="marketplace-app-catalog-empty"
        />
        <div
          v-if="apps.length"
          style="display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 16px; margin-top: 16px"
        >
          <Card
            v-for="app in apps"
            :key="app.fullyQualifiedName || app.name"
            hoverable
            :data-testid="`marketplace-app-card-${app.name}`"
            @click="openApp(app)"
          >
            <Space direction="vertical" style="width: 100%">
              <Typography.Title :level="5" style="margin: 0">
                {{ app.displayName || app.name }}
              </Typography.Title>
              <Typography.Paragraph type="secondary" style="margin: 0">
                {{ app.description || t('apps.catalog.noDescription') }}
              </Typography.Paragraph>
              <Space wrap>
                <Tag v-if="app.enabled === false" color="default" data-testid="marketplace-app-card-disabled">
                  {{
                    isCacheWarmup(app)
                      ? t('apps.detail.cacheServiceNotConfigured')
                      : t('apps.catalog.disabled')
                  }}
                </Tag>
                <Typography.Text v-if="app.developer" type="secondary">
                  {{ t('apps.catalog.byDeveloper', { developer: app.developer }) }}
                </Typography.Text>
              </Space>
              <Button type="link" style="padding: 0" @click.stop="openApp(app)">
                {{ t('apps.catalog.viewDetails') }}
              </Button>
            </Space>
          </Card>
        </div>
        <Space v-if="before || after" style="margin-top: 16px">
          <Button :disabled="!before" data-testid="marketplace-app-catalog-prev" @click="load({ before })">
            {{ t('crud.previous') }}
          </Button>
          <Button :disabled="!after" data-testid="marketplace-app-catalog-next" @click="load({ after })">
            {{ t('crud.next') }}
          </Button>
          <Typography.Text v-if="total !== undefined" type="secondary">
            {{ t('crud.shownOf', { shown: apps.length, total }) }}
          </Typography.Text>
        </Space>
      </Spin>
    </template>
  </div>
</template>
