<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { Spin, Switch, Tabs } from 'ant-design-vue';
import { computed, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute, useRouter } from 'vue-router';
import {
  SSO_PROVIDER_VALUES,
  getSsoProviderDisplayName,
  getSsoProviderIcon,
} from '@/admin/ssoProviders';
import type { SsoFormData } from '@/admin/ssoSchemas';
import {
  resolveSsoSecuritySources,
  type SsoSettingSource,
} from '@/admin/ssoSettingsSource';
import { showSsoErrorToast } from '@/admin/ssoToasts';
import {
  getSecurityConfigurationDocument,
  getSettingsSource,
  patchSecurityConfiguration,
} from '@/api/system';
import PageLayout from '@/components/shared/PageLayout.vue';
import SmBreadcrumb, {
  type SmBreadcrumbItem,
} from '@/components/shared/SmBreadcrumb.vue';
import SsoProviderIcon from './SsoProviderIcon.vue';
import SsoProviderSelector from './SsoProviderSelector.vue';
import SsoSchemaForm from './SsoSchemaForm.vue';
import SsoSettingsSourceBanner from './SsoSettingsSourceBanner.vue';

/**
 * Settings SSO page (pin SettingsSso.tsx): three render branches driven by
 * the URL provider parameter and the stored configuration — a loading
 * branch, a provider-selector / deployment-managed branch, a no-config
 * form branch, and the existing-config branch with provider header and
 * tabs. The page owns the GET; the form owns the configuration state.
 * No client permission checks: the server enforces authorizeAdmin on
 * GET/PUT/PATCH, and a 403 follows the GET-failure branch.
 */
const { t } = useI18n();
const route = useRoute();
const router = useRouter();

const hasExistingConfig = ref(false);
const isLoading = ref(true);
const activeTab = ref('configure');
const currentProvider = ref('');
const showProviderSelector = ref(false);
const ssoEnabled = ref(true);
const securityConfig = ref<SsoFormData | null | undefined>(undefined);
const configReloadKey = ref(0);
const sources = ref<SsoSettingSource[]>([]);

let configFetched = false;

const resolvedSources = computed(() => resolveSsoSecuritySources(sources.value));
const managedPaths = computed(() => resolvedSources.value.managedPaths);
const isReadOnly = computed(() => resolvedSources.value.isReadOnly);
const isProviderManaged = computed(() => resolvedSources.value.isProviderManaged);
const isSelfSignupManaged = computed(
  () => resolvedSources.value.isSelfSignupManaged,
);

const providerParam = computed(() => {
  const raw = route.query.provider;
  if (Array.isArray(raw)) {
    return raw[0] ?? null;
  }
  return raw ?? null;
});

const breadcrumbItems = computed<SmBreadcrumbItem[]>(() => {
  const baseBreadcrumb: SmBreadcrumbItem[] = [
    { label: t('settings.title'), routeName: 'admin-settings' },
    { label: t('settings.categories.sso.title') },
  ];
  const urlProvider = providerParam.value;

  if (urlProvider && urlProvider !== 'basic') {
    const providerDisplayName = getSsoProviderDisplayName(urlProvider);

    if (hasExistingConfig.value) {
      return [
        ...baseBreadcrumb.slice(0, -1),
        { label: providerDisplayName },
      ];
    }

    return [
      ...baseBreadcrumb.slice(0, -1),
      {
        ...baseBreadcrumb[baseBreadcrumb.length - 1],
        routeName: 'admin-settings-sso',
      },
      { label: providerDisplayName },
    ];
  }

  return baseBreadcrumb;
});

const tabItems = computed(() => {
  const items: Array<{ key: string; label: string }> = [];
  if (currentProvider.value && currentProvider.value !== 'basic') {
    items.push({ key: 'overview', label: t('sso.overview') });
  }
  items.push({ key: 'configure', label: t('sso.configure') });
  return items;
});

// Pin getRenderedActiveTab: the selected tab when it is rendered, else the
// first rendered tab.
const renderedActiveTab = computed(() =>
  tabItems.value.some((item) => item.key === activeTab.value)
    ? activeTab.value
    : tabItems.value[0].key,
);

async function handleSSOToggle(checked: boolean): Promise<void> {
  ssoEnabled.value = checked;

  try {
    await patchSecurityConfiguration([
      {
        op: 'replace',
        path: '/authenticationConfiguration/enableSelfSignup',
        value: checked,
      },
    ]);
  } catch (error) {
    ssoEnabled.value = !checked;
    showSsoErrorToast(error, t('sso.unexpectedError'), 'PATCH');
  }
}

function handleChangeProvider(): void {
  void router.push({ query: { provider: 'basic' } });
}

// The deployment values may name a different identity provider, so the page
// reloads the configuration without the provider the URL pinned.
function handleSettingsAdopted(): void {
  configFetched = false;
  isLoading.value = true;
  void router.replace({ query: {} });
  configReloadKey.value += 1;
}

function handleProviderSelect(provider: string): void {
  currentProvider.value = provider;
  showProviderSelector.value = false;
  void router.push({ query: { provider } });
  hasExistingConfig.value = false;
}

function handleTabChange(key: string): void {
  activeTab.value = key;
}

async function refetchSources(): Promise<void> {
  try {
    sources.value = await getSettingsSource();
  } catch {
    // A failed source request renders as DB-only (pin useSettingsSource).
    sources.value = [];
  }
}

onMounted(refetchSources);

// Combined watcher handling URL parameters and the existing configuration
// (pin's combined effect, deps [searchParams, configReloadKey]).
watch(
  () => [providerParam.value, configReloadKey.value],
  () => {
    const param = providerParam.value;

    // If URL explicitly shows provider=basic, show provider selector
    // immediately without fetching.
    if (param === 'basic') {
      currentProvider.value = param;
      hasExistingConfig.value = false;
      showProviderSelector.value = true;
      activeTab.value = 'configure';
      isLoading.value = false;
      return;
    }

    if (param && (SSO_PROVIDER_VALUES as readonly string[]).includes(param)) {
      currentProvider.value = param;
      showProviderSelector.value = false;
    } else {
      showProviderSelector.value = true;
      currentProvider.value = '';
    }

    const applyNoConfigState = () => {
      hasExistingConfig.value = false;
      activeTab.value = 'configure';
      // Only show provider selector if no specific provider in URL.
      if (!param) {
        showProviderSelector.value = true;
        currentProvider.value = '';
      }
    };

    const checkExistingConfig = async () => {
      // Prevent duplicate API calls.
      if (configFetched) {
        return;
      }
      configFetched = true;

      try {
        const config = await getSecurityConfigurationDocument();
        // Carry the two document sections into the form shape; the
        // document type has no index signature, so assign the sections
        // explicitly rather than the whole document object.
        securityConfig.value = {
          authenticationConfiguration: config.authenticationConfiguration,
          authorizerConfiguration: config.authorizerConfiguration,
        };

        if (config?.authenticationConfiguration?.provider) {
          if (config.authenticationConfiguration.provider !== 'basic') {
            hasExistingConfig.value = true;
            ssoEnabled.value = Boolean(
              config.authenticationConfiguration.enableSelfSignup,
            );

            // Default tab: Overview for Google, Azure and Okta.
            const provider = config.authenticationConfiguration.provider;
            if (
              provider === 'azure' ||
              provider === 'okta' ||
              provider === 'google'
            ) {
              activeTab.value = 'overview';
            } else {
              activeTab.value = 'configure';
            }

            // Set current provider for breadcrumb display only if no URL
            // parameter, writing the stored provider back to the URL.
            if (!param) {
              // The stored provider is a string on the wire; narrow the
              // untyped document value before it reaches the breadcrumb/URL.
              const providerName = typeof provider === 'string' ? provider : '';
              currentProvider.value = providerName;
              void router.replace({
                query: { provider: providerName },
              });
            }
            showProviderSelector.value = false;
          } else {
            applyNoConfigState();
          }
        } else {
          applyNoConfigState();
        }
      } catch (error) {
        configFetched = false; // Reset on error to allow retry.
        showSsoErrorToast(error, t('sso.unexpectedError'), 'GET');
        applyNoConfigState();
      } finally {
        isLoading.value = false;
      }
    };

    void checkExistingConfig();
  },
  { immediate: true },
);
</script>

<template>
  <PageLayout
    test-id="sso-settings-layout"
    :document-title="t('settings.categories.sso.title')"
  >
    <template v-if="isLoading">
      <SmBreadcrumb :items="breadcrumbItems" />
      <Spin />
    </template>

    <template
      v-else-if="showProviderSelector || (!hasExistingConfig && isProviderManaged)"
    >
      <SmBreadcrumb :items="breadcrumbItems" />
      <SsoSettingsSourceBanner
        :sources="sources"
        :on-refetch="refetchSources"
        :on-adopted="handleSettingsAdopted"
      />
      <p
        v-if="isProviderManaged"
        data-testid="sso-provider-set-by-deployment"
      >
        {{ t('sso.providerSetByDeployment') }}
      </p>
      <div v-else class="sso-provider-selection">
        <SsoProviderSelector
          :selected-provider="currentProvider"
          @provider-select="handleProviderSelect"
        />
      </div>
    </template>

    <template v-else-if="!hasExistingConfig">
      <SmBreadcrumb :items="breadcrumbItems" />
      <SsoSettingsSourceBanner
        :sources="sources"
        :on-refetch="refetchSources"
        :on-adopted="handleSettingsAdopted"
      />
      <SsoSchemaForm
        :is-read-only="isReadOnly"
        :managed-paths="managedPaths"
        :security-config="securityConfig"
        :selected-provider="currentProvider"
        :on-change-provider="handleChangeProvider"
        :on-provider-select="handleProviderSelect"
      />
    </template>

    <template v-else>
      <SmBreadcrumb :items="breadcrumbItems" />
      <SsoSettingsSourceBanner
        :sources="sources"
        :on-refetch="refetchSources"
        :on-adopted="handleSettingsAdopted"
      />
      <div class="settings-sso">
        <div
          v-if="currentProvider && currentProvider !== 'basic'"
          class="sso-provider-header"
        >
          <div class="provider-icon-container">
            <SsoProviderIcon
              v-if="getSsoProviderIcon(currentProvider)"
              :alt="getSsoProviderDisplayName(currentProvider)"
              :icon="getSsoProviderIcon(currentProvider)"
              :size="22"
            />
          </div>
          <h1>{{ getSsoProviderDisplayName(currentProvider) }}</h1>
        </div>

        <Tabs :active-key="renderedActiveTab" @change="(key) => handleTabChange(String(key))">
          <Tabs.TabPane
            v-if="currentProvider && currentProvider !== 'basic'"
            key="overview"
            :tab="t('sso.overview')"
            force-render
          >
            <div class="enable-sso-card-container">
              <div>
                <h1 class="enable-self-signup-header">
                  {{ t('sso.enableSso') }}
                </h1>
                <p class="enable-self-signup-desc">
                  {{ t('sso.allowUserToLoginViaSso') }}
                </p>
              </div>
              <Switch
                :checked="ssoEnabled"
                :disabled="isSelfSignupManaged"
                @change="(checked) => handleSSOToggle(checked === true)"
              />
            </div>
          </Tabs.TabPane>
          <Tabs.TabPane
            key="configure"
            :tab="t('sso.configure')"
            force-render
          >
            <SsoSchemaForm
              hide-border
              :force-edit-mode="activeTab === 'configure'"
              :is-read-only="isReadOnly"
              :managed-paths="managedPaths"
              :security-config="securityConfig"
              :on-change-provider="handleChangeProvider"
            />
          </Tabs.TabPane>
        </Tabs>
      </div>
    </template>
  </PageLayout>
</template>
