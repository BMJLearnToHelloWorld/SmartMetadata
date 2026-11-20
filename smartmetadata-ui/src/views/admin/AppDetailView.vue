<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<!--
  Vue port of pin components/Settings/Applications/AppDetails/AppDetails.tsx.
  Route param is `:fqn` (pin RouterUtils.ts:206 getApplicationDetailsPath
  builds `/settings/apps/:fqn`); the value is the FQN, fetched ByName.
  No breadcrumb (AP-C1), no description rendering, no plugin
  component (the OSS plugin registry is empty). Page title is set by the
  shell/title line, not here.
-->
<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { Button, Card, Spin, Tabs, Tooltip, message } from 'ant-design-vue';
import {
  ClockCircleOutlined,
  DeleteOutlined,
  ExportOutlined,
  LeftOutlined,
  ReloadOutlined,
  StopOutlined,
  UserOutlined,
} from '@ant-design/icons-vue';
import { compare } from 'fast-json-patch';
import {
  configureApp,
  deployApp,
  getApplicationByName,
  patchApplication,
  restoreApp,
  triggerOnDemandApp,
  uninstallApp,
} from '@/api/apps';
import NoDataPlaceholder from '@/components/shared/NoDataPlaceholder.vue';
import { useAuthStore } from '@/stores/auth';
import { useShellConfigStore } from '@/stores/shellConfig';
import type { AdminApp } from '@/types/admin';
import type { EntityRef } from '@/types/api';
import { getRelativeTime } from '@/utils/relativeTime';
import AppLiveIndexing from '@/views/marketplace/AppLiveIndexing.vue';
import AppLogo from '@/views/marketplace/AppLogo.vue';
import AppManageMenu, { type AppManageMenuItem } from '@/views/marketplace/AppManageMenu.vue';
import AppConfirmationModal from '@/views/marketplace/AppConfirmationModal.vue';
import AppRunsHistory from '@/views/marketplace/AppRunsHistory.vue';
import AppSchedule from '@/views/marketplace/AppSchedule.vue';
import ApplicationConfiguration from '@/views/marketplace/ApplicationConfiguration.vue';
import McpApplicationConfiguration from '@/views/marketplace/McpApplicationConfiguration.vue';
import { importSchema, type JsonSchema } from '@/views/marketplace/appAssets';
import {
  formatFormDataForSubmit,
} from '@/views/marketplace/formDataFormat';
import {
  getEntityName,
  isCacheWarmupApplication,
  isMcpApplication,
  isRuntimeDisabled as computeRuntimeDisabled,
} from '@/views/marketplace/appUtils';

const props = defineProps<{ fqn?: string }>();
const { t } = useI18n();
const router = useRouter();
const authStore = useAuthStore();
const shellConfig = useShellConfigStore();

const fqn = computed(() => props.fqn ?? '');
const appData = ref<AdminApp | undefined>();
const showActions = ref(false);
const showDeleteModel = ref(false);
const jsonSchema = ref<JsonSchema | undefined>();
const isSchemaLoadFailed = ref(false);
const action = ref<'enable' | 'disable' | 'uninstall' | null>(null);
const isFetchLoading = ref(true);
const isDeployLoading = ref(false);
const isRunLoading = ref(false);
const isSaveLoading = ref(false);
const activeTab = ref<string | undefined>();

const isAdminUser = computed(() => authStore.user?.isAdmin ?? false);
const isRuntimeDisabled = computed(() => computeRuntimeDisabled(appData.value));
const runtimeDisabledReason = computed(() =>
  isRuntimeDisabled.value && isCacheWarmupApplication(appData.value?.name)
    ? t('message.cache-service-not-configured-message')
    : undefined,
);
const isAppUnavailable = computed(() => Boolean(appData.value?.deleted) || isRuntimeDisabled.value);

function errorToast(error: unknown): void {
  message.error(error instanceof Error ? error.message : String(error));
}

async function fetchAppDetails(): Promise<void> {
  isFetchLoading.value = true;
  try {
    const data = await getApplicationByName(fqn.value, {
      fields: ['owners', 'pipelines'],
      include: 'all',
    });
    appData.value = data;
    try {
      jsonSchema.value = await importSchema(fqn.value);
      isSchemaLoadFailed.value = false;
    } catch {
      jsonSchema.value = undefined;
      isSchemaLoadFailed.value = true;
      message.error(t('server.no-application-schema-found', { appName: fqn.value }));
    }
  } catch (error) {
    errorToast(error);
  } finally {
    isFetchLoading.value = false;
  }
}

function onBrowseAppsClick(): void {
  void router.push({ name: 'admin-apps' });
}

async function handleRestore(): Promise<void> {
  if (!appData.value) {
    return;
  }
  try {
    await restoreApp(appData.value.id);
    message.success(
      t('message.entity-enabled-success', { entity: t('label.application') }),
      2,
    );
  } catch (error) {
    errorToast(error);
  } finally {
    onBrowseAppsClick();
  }
}

async function onConfirmAction(): Promise<void> {
  try {
    isSaveLoading.value = true;
    if (action.value === 'enable') {
      await handleRestore();
    } else {
      await uninstallApp(appData.value?.fullyQualifiedName ?? '', action.value === 'uninstall');
      message.success(
        action.value === 'disable'
          ? t('message.app-disabled-successfully')
          : t('message.app-uninstalled-successfully'),
      );
      await shellConfig.refreshLimitConfig();
      onBrowseAppsClick();
    }
  } catch (error) {
    errorToast(error);
  } finally {
    isSaveLoading.value = false;
  }
}

const manageButtonContent = computed<AppManageMenuItem[]>(() => [
  ...(appData.value?.deleted
    ? [
        {
          key: 'restore-button',
          id: 'restore-button',
          name: t('label.restore'),
          description: t('message.restore-action-description', {
            entityType: getEntityName(appData.value),
          }),
          icon: ReloadOutlined,
          onClick: () => {
            showActions.value = false;
            action.value = 'enable';
            showDeleteModel.value = true;
          },
        },
      ]
    : [
        {
          key: 'disable-button',
          id: 'disable-button',
          name: t('label.disable'),
          description: t('message.disable-app', { app: getEntityName(appData.value) }),
          icon: StopOutlined,
          onClick: () => {
            showDeleteModel.value = true;
            showActions.value = false;
            action.value = 'disable';
          },
        },
      ]),
  ...(appData.value?.system
    ? []
    : [
        {
          key: 'uninstall-button',
          id: 'uninstall-button',
          name: t('label.uninstall'),
          description: t('message.uninstall-app', { app: getEntityName(appData.value) }),
          icon: DeleteOutlined,
          onClick: () => {
            showDeleteModel.value = true;
            showActions.value = false;
            action.value = 'uninstall';
          },
        },
      ]),
]);

async function onConfigSave(
  formData: Record<string, unknown>,
  ingestionRunner?: EntityRef,
): Promise<void> {
  if (!appData.value) {
    return;
  }
  isSaveLoading.value = true;
  const updatedFormData = formatFormDataForSubmit(formData);
  const updatedData = {
    ...appData.value,
    appConfiguration: updatedFormData,
    ...(ingestionRunner ? { ingestionRunner } : {}),
  };
  const jsonPatch = compare(appData.value, updatedData);
  try {
    const response = await patchApplication(appData.value.id, jsonPatch);
    await configureApp(appData.value.fullyQualifiedName ?? '', updatedFormData);
    appData.value = response;
    message.success(
      t('message.entity-saved-successfully', { entity: t('label.configuration') }),
    );
  } catch (error) {
    errorToast(error);
  } finally {
    isSaveLoading.value = false;
  }
}

async function onAppScheduleSave(cron: string): Promise<void> {
  if (!appData.value) {
    return;
  }
  const updatedData = {
    ...appData.value,
    appSchedule: {
      scheduleTimeline: cron ? 'Custom' : 'None',
      ...(cron ? { cronExpression: cron } : {}),
    },
  };
  const jsonPatch = compare(appData.value, updatedData);
  try {
    const response = await patchApplication(appData.value.id, jsonPatch);
    appData.value = response;
    message.success(
      t('message.entity-saved-successfully', { entity: t('label.schedule') }),
    );
  } catch (error) {
    errorToast(error);
  }
}

async function onDemandTrigger(): Promise<void> {
  try {
    isRunLoading.value = true;
    await triggerOnDemandApp(appData.value?.fullyQualifiedName ?? '');
    message.success(
      t('message.application-action-successfully', {
        action: t('label.triggered-lowercase'),
      }),
    );
  } catch (error) {
    errorToast(error);
  } finally {
    isRunLoading.value = false;
  }
}

async function onDeployTrigger(): Promise<void> {
  try {
    isDeployLoading.value = true;
    await deployApp(appData.value?.fullyQualifiedName ?? '');
    message.success(
      t('message.application-action-successfully', { action: t('label.deploy') }),
    );
    void fetchAppDetails();
  } catch (error) {
    errorToast(error);
  } finally {
    isDeployLoading.value = false;
  }
}

interface DetailTab {
  key: string;
  label: string;
}

const tabs = computed<DetailTab[]>(() => {
  const showScheduleTab = appData.value?.scheduleType !== 'NoSchedule';
  const showMcpConfigTab = Boolean(
    isMcpApplication(appData.value?.name) &&
      isAdminUser.value &&
      jsonSchema.value &&
      !isRuntimeDisabled.value,
  );
  const showAppConfigTab = Boolean(
    !showMcpConfigTab &&
      appData.value?.appConfiguration &&
      appData.value.allowConfiguration &&
      jsonSchema.value &&
      !isRuntimeDisabled.value,
  );
  const list: DetailTab[] = [];
  if (showScheduleTab) {
    list.push({ key: 'schedule', label: t('label.schedule') });
  }
  if (showMcpConfigTab || showAppConfigTab) {
    list.push({ key: 'configuration', label: t('label.configuration') });
  }
  if (!isAppUnavailable.value && showScheduleTab) {
    list.push({ key: 'recent-runs', label: t('label.recent-run-plural') });
  }
  if (!isAppUnavailable.value && appData.value?.name === 'SearchIndexingApplication') {
    list.push({ key: 'live-indexing', label: t('label.live-indexing') });
  }
  return list;
});

const showMcpConfigTab = computed(
  () =>
    isMcpApplication(appData.value?.name) &&
    isAdminUser.value &&
    Boolean(jsonSchema.value) &&
    !isRuntimeDisabled.value,
);

watch(tabs, (next) => {
  if (next.length > 0 && !next.some((tab) => tab.key === activeTab.value)) {
    activeTab.value = next[0].key;
  }
});

const actionText = computed(() => {
  switch (action.value) {
    case 'enable':
      return t('label.enable-lowercase');
    case 'disable':
      return t('label.disable-lowercase');
    case 'uninstall':
      return t('label.uninstall-lowercase');
    default:
      return '';
  }
});

onMounted(() => {
  void fetchAppDetails();
});

watch(
  () => fqn.value,
  () => {
    void fetchAppDetails();
  },
);
</script>

<template>
  <div v-if="isFetchLoading" style="display: flex; justify-content: center; padding: 48px 0">
    <Spin size="large" />
  </div>
  <div v-else>
    <div style="display: flex; justify-content: space-between; align-items: center">
      <Button type="text" size="small" data-testid="admin-app-browse-apps" @click="onBrowseAppsClick">
        <template #icon><LeftOutlined /></template>
        {{ t('label.browse-app-plural') }}
      </Button>
      <AppManageMenu
        :items="manageButtonContent"
        :label="t('label.manage-entity', { entity: t('label.application') })"
        :open="showActions"
        @open-change="(open) => (showActions = open)"
      />
    </div>
    <div
      data-testid="admin-app-overview"
      style="display: flex; align-items: center; gap: 24px; margin-top: 16px"
    >
      <AppLogo :app-name="appData?.fullyQualifiedName ?? ''" />
      <div style="min-width: 0; flex: 1">
        <h4 style="margin: 0">{{ getEntityName(appData) }}</h4>
        <Tooltip v-if="isRuntimeDisabled" :title="runtimeDisabledReason">
          <div data-testid="runtime-disabled-badge" style="display: inline-flex; align-items: center; gap: 4px">
            <StopOutlined :style="{ fontSize: '12px' }" />
            {{ t('label.disabled') }}
          </div>
        </Tooltip>
        <div style="display: flex; align-items: center; flex-wrap: wrap; gap: 24px; margin-top: 8px">
          <span style="display: inline-flex; align-items: center; gap: 8px; font-size: 12px">
            <ClockCircleOutlined />
            {{ `${t('label.installed')} ${getRelativeTime(appData?.updatedAt)}` }}
          </span>
          <span style="display: inline-flex; align-items: center; gap: 8px; font-size: 12px">
            <UserOutlined />
            {{ t('label.developed-by-developer', { developer: appData?.developer }) }}
          </span>
          <span v-if="appData?.developerUrl" style="display: inline-flex; align-items: center; gap: 8px">
            <ExportOutlined :style="{ fontSize: '14px' }" />
            <a
              style="font-size: 12px"
              :href="appData.developerUrl"
              rel="noopener noreferrer"
              target="_blank"
            >
              {{ t('label.visit-developer-website') }}
            </a>
          </span>
        </div>
      </div>
    </div>
    <div style="margin-top: 16px">
      <Card v-if="tabs.length === 0" style="position: relative; min-height: 240px">
        <NoDataPlaceholder
          test-id="no-data-placeholder"
          :description="
            isSchemaLoadFailed
              ? t('server.no-application-schema-found', { appName: fqn })
              : t('message.app-no-settings-to-manage', { app: getEntityName(appData) })
          "
        />
      </Card>
      <Tabs v-else v-model:active-key="activeTab" data-testid="tabs">
        <Tabs.TabPane v-for="tab in tabs" :key="tab.key">
          <template #tab>
            <span :data-testid="tab.key">{{ tab.label }}</span>
          </template>
          <div v-if="tab.key === 'schedule'" style="padding: 24px">
            <AppSchedule
              v-if="appData"
              :app-data="appData"
              :disabled="isRuntimeDisabled"
              :disabled-reason="runtimeDisabledReason"
              :json-schema="jsonSchema"
              :loading="{ isRunLoading, isDeployLoading }"
              :on-save="onAppScheduleSave"
              :on-demand-trigger="onDemandTrigger"
              :on-deploy-trigger="onDeployTrigger"
            />
          </div>
          <McpApplicationConfiguration
            v-else-if="tab.key === 'configuration' && showMcpConfigTab && jsonSchema"
            :app-name="appData?.name ?? ''"
            :json-schema="jsonSchema"
          />
          <ApplicationConfiguration
            v-else-if="tab.key === 'configuration' && jsonSchema && appData"
            :app-data="appData"
            :is-loading="isSaveLoading"
            :json-schema="jsonSchema"
            :on-config-save="onConfigSave"
          />
          <AppRunsHistory
            v-else-if="tab.key === 'recent-runs'"
            :app-data="appData"
            :json-schema="jsonSchema"
          />
          <AppLiveIndexing v-else-if="tab.key === 'live-indexing' && appData" :app-data="appData" />
        </Tabs.TabPane>
      </Tabs>
    </div>
    <AppConfirmationModal
      :visible="showDeleteModel"
      :header="t('message.are-you-sure')"
      :body-text="
        t('message.are-you-sure-action-property', {
          action: actionText,
          propertyName: getEntityName(appData),
        })
      "
      :cancel-text="t('label.cancel')"
      :confirm-text="t('label.ok')"
      :is-loading="isSaveLoading"
      @cancel="showDeleteModel = false"
      @confirm="onConfirmAction"
    />
  </div>
</template>
