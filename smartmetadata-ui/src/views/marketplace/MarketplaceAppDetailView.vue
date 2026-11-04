<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute, useRouter } from 'vue-router';
import { Alert, Avatar, Button, Empty, Spin, Tooltip, Typography } from 'ant-design-vue';
import ForbiddenView from '@/views/shell/ForbiddenView.vue';
import PageHeader from '@/components/shared/PageHeader.vue';
import { getAppByName } from '@/api/apps';
import {
  getMarketplaceAppByFqn,
  type MarketplaceApp,
} from '@/api/marketplaceApps';
import { useAuthStore } from '@/stores/auth';

const props = defineProps<{ fqn?: string }>();

const { t } = useI18n();
const route = useRoute();
const router = useRouter();
const authStore = useAuthStore();

/**
 * Official page shape (components/Settings/Applications/
 * MarketPlaceAppDetails): a two-column detail page over the marketplace
 * definition — left panel with back navigation, logo, Install action
 * with its installed/disabled states, the verified line and the support
 * links; main column with the title and the description. The route is
 * AdminProtectedRoute-gated without a permission prop, so the gate here
 * is the admin line alone, the same precedent as the install page.
 * Two deliberate adaptations, both recorded, not silent: the product
 * has no markdown renderer, so the description renders as plain text;
 * the screenshot names are bundled per-app artwork the product does
 * not ship, so no screenshots region renders.
 */
const fqn = computed(() => props.fqn ?? String(route.params.fqn ?? ''));

const isAdmin = computed(() => authStore.user?.isAdmin === true);
const loading = ref(true);
const loadError = ref('');
const appData = ref<MarketplaceApp | null>(null);
const isInstalled = ref(false);

const appName = computed(() => appData.value?.displayName || appData.value?.name || '');
const appInitial = computed(() => appName.value.charAt(0).toUpperCase() || '?');
const isAppDisabled = computed(() => appData.value?.enabled === false);
const isCacheWarmupDisabled = computed(
  () =>
    isAppDisabled.value &&
    (appData.value?.name === 'CacheWarmupApplication' ||
      appData.value?.fullyQualifiedName === 'CacheWarmupApplication'),
);
const installDisabled = computed(() => isInstalled.value || isAppDisabled.value);
const tooltipTitle = computed(() => {
  if (isInstalled.value) {
    return t('apps.detail.alreadyInstalled');
  }
  if (isAppDisabled.value) {
    if (isCacheWarmupDisabled.value) {
      return t('apps.detail.cacheServiceNotConfigured');
    }
    return t('apps.detail.paidAddonDescription', { app: appName.value });
  }
  return '';
});

async function loadApp(): Promise<void> {
  loading.value = true;
  loadError.value = '';
  try {
    appData.value = await getMarketplaceAppByFqn(fqn.value, 'owners');
  } catch (error) {
    loadError.value = error instanceof Error ? error.message : t('crud.loadFailed');
  } finally {
    loading.value = false;
  }
}

async function checkInstalled(): Promise<void> {
  try {
    await getAppByName(fqn.value);
    isInstalled.value = true;
  } catch {
    isInstalled.value = false;
  }
}

function onBrowseAppsClick(): void {
  void router.push({ name: 'marketplace-overview' });
}

function onInstallClick(): void {
  void router.push({ name: 'marketplace-app-install', params: { fqn: fqn.value } });
}

onMounted(() => {
  void loadApp();
  void checkInstalled();
});
</script>

<template>
  <div data-testid="marketplace-app-detail">
    <ForbiddenView v-if="!isAdmin" />
    <template v-else>
      <PageHeader
        :header="appData ? appName : t('apps.detail.title')"
      />
      <Spin v-if="loading" data-testid="marketplace-app-detail-loading" />
      <Typography.Text
        v-if="loadError"
        type="danger"
        data-testid="marketplace-app-detail-error"
      >
        {{ loadError }}
      </Typography.Text>
      <template v-if="!loading && appData">
        <div
          style="display: flex; gap: 24px; align-items: flex-start"
          data-testid="marketplace-app-detail-body"
        >
          <div style="width: 260px; flex-shrink: 0">
            <Button data-testid="marketplace-app-detail-browse" @click="onBrowseAppsClick">
              {{ t('apps.detail.browseApps') }}
            </Button>
            <div style="text-align: center; margin: 16px 0">
              <Avatar :size="64" data-testid="marketplace-app-detail-logo">
                {{ appInitial }}
              </Avatar>
            </div>
            <Tooltip :title="tooltipTitle">
              <Button
                type="primary"
                block
                :disabled="installDisabled"
                data-testid="install-application"
                @click="onInstallClick"
              >
                {{ t('apps.detail.install') }}
              </Button>
            </Tooltip>
            <Alert
              v-if="isAppDisabled"
              type="info"
              show-icon
              style="margin-top: 16px"
              data-testid="marketplace-app-detail-disabled-alert"
            >
              <template #message>
                <span v-if="isCacheWarmupDisabled">
                  {{ t('apps.detail.cacheServiceNotConfigured') }}
                </span>
                <span v-else>
                  {{ t('apps.detail.paidAddonDescription', { app: appName }) }}
                </span>
              </template>
            </Alert>
            <Typography.Paragraph
              type="secondary"
              style="margin-top: 16px"
              data-testid="marketplace-app-detail-verified"
            >
              {{ t('apps.detail.marketplaceVerified', { brandName: 'iSmart' }) }}
            </Typography.Paragraph>
            <div style="display: flex; flex-direction: column; gap: 8px">
              <a
                v-if="appData.supportEmail"
                :href="`mailto:${appData.supportEmail}`"
                rel="noopener noreferrer"
                target="_blank"
                data-testid="app-support-email"
              >
                {{ t('apps.detail.getAppSupport') }}
              </a>
              <a
                v-if="appData.developerUrl"
                :href="appData.developerUrl"
                rel="noopener noreferrer"
                target="_blank"
                data-testid="marketplace-app-detail-developer-url"
              >
                {{ t('apps.detail.visitDeveloperWebsite') }}
              </a>
              <a
                v-if="appData.privacyPolicyUrl"
                :href="appData.privacyPolicyUrl"
                rel="noopener noreferrer"
                target="_blank"
                data-testid="marketplace-app-detail-privacy-url"
              >
                {{ t('apps.detail.privacyPolicy') }}
              </a>
            </div>
          </div>
          <div style="flex: 1; min-width: 0">
            <Typography.Paragraph data-testid="marketplace-app-detail-description">
              {{ appData.description }}
            </Typography.Paragraph>
          </div>
        </div>
      </template>
      <Empty
        v-if="!loading && !appData && !loadError"
        :description="t('apps.detail.notFound', { app: fqn })"
        data-testid="marketplace-app-detail-empty"
      />
    </template>
  </div>
</template>
