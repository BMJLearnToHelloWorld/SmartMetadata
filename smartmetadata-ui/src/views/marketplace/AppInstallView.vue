<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<!--
  Vue port of pin pages/AppInstall/AppInstall.tsx. The page declares no
  PageHeader/breadcrumb (08-D4: the install page is out of D4 V1-V5
  scope); the step-2 panels belong to the nested ApplicationConfiguration
  component. Steps are dynamically filtered (NoSchedule drops step 3,
  !allowConfiguration drops step 2) — never a fixed three steps. Any
  load failure (definition or schema) toasts the single
  `server.no-application-schema-found` message. The inline admin gate
  is kept under the DEL-22 HOLD (see the batch report). The schedule
  field seeds its display from the model value, not pin's
  `defaultSchedule` prop (ScheduleIntervalField has no such prop) — a
  display-only divergence for DataInsightsReportApplication's weekly
  default, recorded in the batch report.
-->
<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute, useRouter } from 'vue-router';
import { Button, Spin, message } from 'ant-design-vue';
import {
  getMarketPlaceApplicationByFqn,
  installApplication,
  type EntityReferenceInput,
  type MarketplaceApp,
} from '@/api/marketplaceApps';
import ScheduleIntervalField from '@/components/ingestion/ScheduleIntervalField.vue';
import NoDataPlaceholder from '@/components/shared/NoDataPlaceholder.vue';
import { getCronDefaultValue, getDefaultScheduleValue } from '@/ingestion/schedule';
import { useAuthStore } from '@/stores/auth';
import { useShellConfigStore } from '@/stores/shellConfig';
import type { EntityRef } from '@/types/api';
import PermissionPlaceholder from '@/components/shared/PermissionPlaceholder.vue';
import AppInstallStepper from './AppInstallStepper.vue';
import AppInstallVerifyCard from './AppInstallVerifyCard.vue';
import ApplicationConfiguration from './ApplicationConfiguration.vue';
import { importSchema, type JsonSchema } from './appAssets';
import { getScheduleOptionsForApp, getEntityName } from './appUtils';
import { formatFormDataForSubmit } from './formDataFormat';

const props = defineProps<{ fqn?: string }>();

const { t, locale } = useI18n();
const route = useRoute();
const router = useRouter();
const authStore = useAuthStore();
const shellConfig = useShellConfigStore();

const fqn = computed(() => props.fqn ?? String(route.params.fqn ?? ''));
const isAdmin = computed(() => authStore.user?.isAdmin === true);
const appData = ref<MarketplaceApp | undefined>();
const isLoading = ref(true);
const isSavingLoading = ref(false);
const scheduleValue = ref<string | undefined>();
const scheduleInitialized = ref(false);
const isScheduleValid = ref(true);
const activeServiceStep = ref(1);
const storedAppConfiguration = ref<Record<string, unknown> | undefined>();
const jsonSchema = ref<JsonSchema | undefined>();
const selectedIngestionRunner = ref<EntityReferenceInput | undefined>();

const shouldShowIngestionRunner = computed(
  () => appData.value?.appType === 'External' && appData.value?.supportsIngestionRunner,
);

const stepperList = computed(() => {
  let steps = [
    { name: t('label.detail-plural'), step: 1 },
    { name: t('label.configure'), step: 2 },
    { name: t('label.schedule'), step: 3 },
  ];
  if (appData.value?.scheduleType === 'NoSchedule') {
    steps = steps.filter((item) => item.step !== 3);
  }
  if (!appData.value?.allowConfiguration) {
    steps = steps.filter((item) => item.step !== 2);
  }
  return steps;
});

const initialOptions = computed(() => {
  if (!appData.value) {
    return undefined;
  }
  const feature = shellConfig.limit?.limits.config.featureLimits.find(
    (entry) => entry.name === 'app',
  );
  return getScheduleOptionsForApp(
    appData.value.name,
    appData.value.appType,
    feature?.pipelineSchedules,
  );
});

const defaultValue = computed(() => getCronDefaultValue(appData.value?.name ?? ''));

// Pin pageTitle (AppInstall.component.tsx:368-373): the install-entity
// label with the app name once loaded, the applications plural before
// (and when the load fails). title.ts has no dynamic-title mechanism,
// so the view owns its document.title; the locale watch re-renders it
// on language switches, and the immediate run covers the loading state.
watch(
  [appData, locale],
  () => {
    document.title = appData.value
      ? t('label.install-entity', { entity: getEntityName(appData.value) })
      : t('label.application-plural');
  },
  { immediate: true },
);

function openScheduleStep(): void {
  if (!scheduleInitialized.value) {
    scheduleValue.value = getDefaultScheduleValue({
      defaultSchedule: defaultValue.value,
      includePeriodOptions: initialOptions.value,
      allowNoSchedule: true,
    });
    scheduleInitialized.value = true;
  }
  isScheduleValid.value = true;
  activeServiceStep.value = 3;
}

async function fetchAppDetails(): Promise<void> {
  isLoading.value = true;
  try {
    const data = await getMarketPlaceApplicationByFqn(fqn.value, 'owners');
    appData.value = data;
    jsonSchema.value = await importSchema(fqn.value);
  } catch {
    message.error(t('server.no-application-schema-found', { appName: fqn.value }));
  } finally {
    isLoading.value = false;
  }
}

function onCancel(): void {
  void router.push({ name: 'marketplace-app-detail', params: { fqn: fqn.value } });
}

function goToAppPage(): void {
  void router.push({ name: 'admin-apps' });
}

async function installAppRequest(data: {
  appConfiguration?: unknown;
  appSchedule?: { scheduleTimeline: 'None' | 'Custom'; cronExpression?: string };
  name: string;
  description?: string;
  displayName?: string;
  ingestionRunner?: EntityReferenceInput;
}): Promise<void> {
  try {
    isSavingLoading.value = true;
    await installApplication(data);
    message.success(t('message.app-installed-successfully'));
    await shellConfig.refreshLimitConfig();
    goToAppPage();
  } catch (error) {
    message.error(error instanceof Error ? error.message : String(error));
  } finally {
    isSavingLoading.value = false;
  }
}

async function onSubmit(): Promise<void> {
  const cron = scheduleValue.value;
  await installAppRequest({
    appConfiguration:
      storedAppConfiguration.value ?? (appData.value?.appConfiguration as unknown),
    appSchedule: {
      scheduleTimeline: !cron ? 'None' : 'Custom',
      ...(cron ? { cronExpression: cron } : {}),
    },
    name: fqn.value,
    description: appData.value?.description,
    displayName: appData.value?.displayName,
    ingestionRunner: shouldShowIngestionRunner.value
      ? selectedIngestionRunner.value
      : undefined,
  });
}

function onSaveConfiguration(
  formData: Record<string, unknown>,
  ingestionRunner?: EntityRef,
): void {
  const updatedFormData = formatFormDataForSubmit(formData);
  storedAppConfiguration.value = updatedFormData;
  const ingestionRunnerRef = ingestionRunner?.id
    ? {
        id: ingestionRunner.id,
        type: 'ingestionRunner',
        name: ingestionRunner.name,
        fullyQualifiedName: ingestionRunner.fullyQualifiedName,
      }
    : undefined;
  selectedIngestionRunner.value = ingestionRunnerRef;

  if (appData.value?.scheduleType !== 'NoSchedule') {
    openScheduleStep();
  } else {
    void installAppRequest({
      appConfiguration: updatedFormData,
      name: fqn.value,
      description: appData.value?.description,
      displayName: appData.value?.displayName,
      ...(ingestionRunnerRef ? { ingestionRunner: ingestionRunnerRef } : {}),
    });
  }
}

const missingErrorTitle = computed(
  () =>
    `${t('label.application')} ${t('label.instance-lowercase')} ${t('label.for-lowercase')} ${fqn.value} ${t('label.not-found-lowercase')}`,
);

onMounted(() => {
  if (isAdmin.value) {
    void fetchAppDetails();
  } else {
    isLoading.value = false;
  }
});

watch(isAdmin, (admin) => {
  if (admin) {
    void fetchAppDetails();
  }
});

watch(
  () => fqn.value,
  () => {
    if (isAdmin.value) {
      void fetchAppDetails();
    }
  },
);
</script>

<template>
  <div data-testid="app-install">
    <PermissionPlaceholder v-if="!isAdmin" :permission-value="t('crud.view')" />
    <template v-else>
      <div v-if="isLoading" style="display: flex; justify-content: center; padding: 48px 0">
        <Spin size="large" />
      </div>
      <div
        v-else-if="!appData"
        style="position: relative; min-height: 240px"
      >
        <NoDataPlaceholder test-id="no-data-placeholder" :title="missingErrorTitle" />
      </div>
      <div v-else>
        <AppInstallStepper :steps="stepperList" :active-step="activeServiceStep" />
        <div v-if="appData && jsonSchema" style="margin-top: 16px">
          <AppInstallVerifyCard
            v-if="activeServiceStep === 1"
            :app-data="appData"
            :next-button-label="
              appData.allowConfiguration ? t('label.configure') : t('label.schedule')
            "
            :on-save="
              () => {
                if (appData?.allowConfiguration) {
                  activeServiceStep = 2;
                } else {
                  openScheduleStep();
                }
              }
            "
            :on-cancel="onCancel"
          />
          <ApplicationConfiguration
            v-else-if="activeServiceStep === 2"
            :app-data="appData"
            :is-loading="false"
            :json-schema="jsonSchema"
            :on-cancel="() => (activeServiceStep = 1)"
            :on-config-save="onSaveConfiguration"
          />
          <div
            v-else-if="activeServiceStep === 3"
            style="margin: 0 auto; width: 60%; padding: 16px"
          >
            <h5 style="margin: 0 0 16px">{{ t('label.schedule') }}</h5>
            <ScheduleIntervalField
              :model-value="scheduleValue"
              :include-period-options="initialOptions"
              test-id-prefix="app-install-schedule"
              @update:model-value="(value) => (scheduleValue = value)"
              @validity-change="(valid) => (isScheduleValid = valid)"
            />
            <div style="margin-top: 16px; display: flex; justify-content: flex-end; gap: 12px">
              <Button
                data-testid="back-button"
                @click="activeServiceStep = appData.allowConfiguration ? 2 : 1"
              >
                {{ t('label.back') }}
              </Button>
              <Button
                type="primary"
                data-testid="deploy-button"
                :disabled="!isScheduleValid"
                :loading="isSavingLoading"
                @click="onSubmit"
              >
                {{ t('label.create') }}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>
