<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<!--
  Vue port of pin components/Settings/Applications/MarketPlaceAppDetails/
  MarketPlaceAppDetails.tsx. Loading renders a bare spinner; a failed
  definition fetch toasts only (the page still renders, with an empty
  name); the installed probe fails silently. No PageHeader, no error
  text, no Empty state. The admin gate lives on the route (meta guard
  'admin-only', the bare AdminProtectedRoute equivalent); the view
  carries no inline gate (DEL-22 HOLD lifted). The paid-addon interpolation
  passes the bare displayName (not getEntityName) in the bold span,
  and the verify line interpolates the product name as brandName.
  The `message.paid-addon-description` locale value must be written in
  vue-i18n syntax (`{app} is a paid add-on for Collate customers.`),
  not pin's i18next literal (`<0>{{app}}</0> ...`).
-->
<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute, useRouter } from 'vue-router';
import { Alert, Button, Spin, Tooltip, message } from 'ant-design-vue';
import { LeftOutlined } from '@ant-design/icons-vue';
import checkmarkIconUrl from '@/assets/svg/ic-cloud-checkmark.svg';
import { getApplicationByName } from '@/api/apps';
import {
  getMarketPlaceApplicationByFqn,
  type MarketplaceApp,
} from '@/api/marketplaceApps';
import SmMarkdown from '@/components/shared/SmMarkdown.vue';
import AppLogo from './AppLogo.vue';
import AppScreenshots, { type AppScreenshotItem } from './AppScreenshots.vue';
import { getAppScreenshotUrl } from './appScreenshots';
import { getEntityName, isCacheWarmupApplication } from './appUtils';

const props = defineProps<{ fqn?: string }>();

const { t } = useI18n();
const route = useRoute();
const router = useRouter();

const fqn = computed(() => props.fqn ?? String(route.params.fqn ?? ''));

const isLoading = ref(true);
const appData = ref<MarketplaceApp | undefined>();
const isInstalled = ref(false);

const screenshotItems = computed<AppScreenshotItem[]>(() =>
  (appData.value?.appScreenshots ?? []).map((name) => ({
    key: name,
    name,
    src: getAppScreenshotUrl(name),
  })),
);
const isAppDisabled = computed(() => appData.value?.enabled === false);
const isCacheWarmupDisabled = computed(
  () =>
    isAppDisabled.value &&
    isCacheWarmupApplication(appData.value?.name ?? appData.value?.fullyQualifiedName),
);
const installDisabled = computed(() => isInstalled.value || isAppDisabled.value);
const showPaidAddonTooltip = computed(
  () => !isInstalled.value && isAppDisabled.value && !isCacheWarmupDisabled.value,
);
const tooltipTitleText = computed(() => {
  if (isInstalled.value) {
    return t('message.app-already-installed');
  }
  if (isAppDisabled.value && isCacheWarmupDisabled.value) {
    return t('message.cache-service-not-configured-message');
  }
  return undefined;
});

async function fetchAppDetails(): Promise<void> {
  isLoading.value = true;
  try {
    appData.value = await getMarketPlaceApplicationByFqn(fqn.value, 'owners');
  } catch (error) {
    message.error(error instanceof Error ? error.message : String(error));
  } finally {
    isLoading.value = false;
  }
}

async function fetchInstalledAppDetails(): Promise<void> {
  try {
    await getApplicationByName(fqn.value, { fields: ['owners'], include: 'all' });
    isInstalled.value = true;
  } catch {
    isInstalled.value = false;
  }
}

function loadAll(): void {
  void fetchAppDetails();
  void fetchInstalledAppDetails();
}

function onBrowseAppsClick(): void {
  void router.push({ name: 'marketplace-app-catalog' });
}

function onInstallClick(): void {
  void router.push({ name: 'marketplace-app-install', params: { fqn: fqn.value } });
}

onMounted(() => {
  loadAll();
});

watch(
  () => fqn.value,
  () => {
    loadAll();
  },
);
</script>

<template>
  <div data-testid="marketplace-app-detail">
    <div v-if="isLoading" style="display: flex; justify-content: center; padding: 48px 0">
      <Spin size="large" />
    </div>
    <div v-else style="display: flex; gap: 24px; align-items: flex-start">
      <div style="width: 260px; flex-shrink: 0; padding: 16px 16px 0">
        <Button type="text" size="small" @click="onBrowseAppsClick">
          <template #icon><LeftOutlined /></template>
          {{ t('label.browse-app-plural') }}
        </Button>
        <div style="display: flex; justify-content: center; margin-top: 16px">
          <AppLogo :app-name="appData?.fullyQualifiedName ?? ''" />
        </div>
        <Tooltip :title="tooltipTitleText">
          <template v-if="showPaidAddonTooltip" #title>
            <i18n-t keypath="message.paid-addon-description">
              <template #app>
                <span data-testid="appName" style="font-weight: 600">
                  {{ appData?.displayName }}
                </span>
              </template>
            </i18n-t>
          </template>
          <Button
            type="primary"
            block
            style="margin-top: 16px"
            :disabled="installDisabled"
            data-testid="install-application"
            @click="onInstallClick"
          >
            {{ t('label.install') }}
          </Button>
        </Tooltip>
        <Alert
          v-if="isAppDisabled"
          type="info"
          :show-icon="false"
          style="margin-top: 16px"
        >
          <template #message>
            <span v-if="isCacheWarmupDisabled">
              {{ t('message.cache-service-not-configured-message') }}
            </span>
            <span v-else>
              <i18n-t keypath="message.paid-addon-description">
                <template #app>
                  <span data-testid="appName" style="font-weight: 600">
                    {{ appData?.displayName }}
                  </span>
                </template>
              </i18n-t>
              <span style="display: block">{{ t('message.please-contact-us') }}</span>
            </span>
          </template>
        </Alert>
        <div style="margin-top: 16px">
          <img
            :src="checkmarkIconUrl"
            alt=""
            style="vertical-align: middle; margin-right: 4px"
          />
          <span style="font-size: 12px">
            {{ t('message.marketplace-verify-msg', { brandName: t('product.name') }) }}
          </span>
        </div>
        <div style="display: flex; flex-direction: column; gap: 8px; padding-top: 24px">
          <a
            v-if="appData?.supportEmail"
            :href="`mailto:${appData.supportEmail}`"
            rel="noopener noreferrer"
            target="_blank"
            data-testid="app-support-email"
          >
            {{ t('label.get-app-support') }}
          </a>
          <a
            v-if="appData?.developerUrl"
            :href="appData.developerUrl"
            rel="noopener noreferrer"
            target="_blank"
          >
            {{ t('label.visit-developer-website') }}
          </a>
          <a
            v-if="appData?.privacyPolicyUrl"
            :href="appData.privacyPolicyUrl"
            rel="noopener noreferrer"
            target="_blank"
          >
            {{ t('label.privacy-policy') }}
          </a>
        </div>
      </div>
      <div style="flex: 1; min-width: 0">
        <h2 style="margin: 0; padding: 16px 16px 0">{{ getEntityName(appData) }}</h2>
        <AppScreenshots :key="fqn" :screenshots="screenshotItems" />
        <div style="padding: 16px">
          <SmMarkdown :markdown="appData?.description ?? ''" />
        </div>
      </div>
    </div>
  </div>
</template>
