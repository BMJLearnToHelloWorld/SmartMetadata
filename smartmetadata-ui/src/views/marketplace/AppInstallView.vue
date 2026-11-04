<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute, useRouter } from 'vue-router';
import {
  Button,
  Card,
  Collapse,
  Empty,
  Form,
  Input,
  Space,
  Steps,
  Typography,
  message,
} from 'ant-design-vue';
import PageHeader from '@/components/shared/PageHeader.vue';
import ForbiddenView from '@/views/shell/ForbiddenView.vue';
import {
  getMarketplaceAppByFqn,
  installApp,
  type MarketplaceApp,
} from '@/api/marketplaceApps';
import { useAuthStore } from '@/stores/auth';
import AppScheduleForm from './AppScheduleForm.vue';

const props = defineProps<{ fqn?: string }>();

const { t, locale } = useI18n();
const route = useRoute();
const router = useRouter();
const authStore = useAuthStore();

/**
 * Official page shape (pages/AppInstall): a three-step install wizard —
 * verify (step 1), configure (step 2), schedule (step 3) — over the
 * marketplace definition, ending in POST /v1/apps. Steps are filtered
 * exactly like the official stepper: NoSchedule drops the schedule step,
 * allowConfiguration false drops the configure step. The official
 * configure step renders a schema-driven form from a bundled per-app
 * schema store the product does not ship, so the configuration here is
 * edited as the same appConfiguration object in a JSON editor; the
 * schema-driven widgets are a recorded gap, not a silent omission.
 * The official page is AdminProtectedRoute-gated without a permission
 * prop, so the gate here is the admin line alone.
 */
const fqn = computed(() => props.fqn ?? String(route.params.fqn ?? ''));

const isAdmin = computed(() => authStore.user?.isAdmin === true);
const loading = ref(true);
const loadError = ref('');
const appData = ref<MarketplaceApp | null>(null);
const activeStep = ref(1);
const saving = ref(false);
const saveError = ref('');

// `undefined` is a valid on-demand selection, so initialization needs its own flag.
const scheduleInitialized = ref(false);
const scheduleValue = ref<string | undefined>(undefined);
const scheduleValid = ref(true);

const configText = ref('');
const configError = ref('');

const appName = computed(() => appData.value?.displayName || appData.value?.name || '');

const stepperSteps = computed(() => {
  const steps = [
    { step: 1, title: t('apps.install.steps.details') },
    { step: 2, title: t('apps.install.steps.configure') },
    { step: 3, title: t('apps.install.steps.schedule') },
  ];
  return steps.filter((item) => {
    if (item.step === 3 && appData.value?.scheduleType === 'NoSchedule') {
      return false;
    }
    if (item.step === 2 && !appData.value?.allowConfiguration) {
      return false;
    }
    return true;
  });
});

const stepperIndex = computed(() =>
  Math.max(
    0,
    stepperSteps.value.findIndex((item) => item.step === activeStep.value),
  ),
);

const schedulePeriodOptions = computed<string[] | undefined>(() => {
  const app = appData.value;
  if (!app) {
    return undefined;
  }
  if (app.name === 'DataInsightsReportApplication') {
    return ['week'];
  }
  if (app.appType === 'External') {
    return ['day'];
  }
  // The official third source is the limits config pipelineSchedules,
  // which the product has no client for; internal apps fall back to the
  // daily default cron below.
  return undefined;
});

function getCronDefaultValue(appNameValue: string): string {
  return appNameValue === 'DataInsightsReportApplication' ? '0 0 * * 0' : '0 0 * * *';
}

function getDefaultScheduleValue(): string | undefined {
  const defaultSchedule = getCronDefaultValue(appData.value?.name ?? '');
  const includePeriodOptions = schedulePeriodOptions.value;
  if (includePeriodOptions === undefined) {
    return defaultSchedule;
  }
  if (includePeriodOptions.includes('day')) {
    return '0 0 * * *';
  }
  if (includePeriodOptions.includes('week')) {
    return '0 0 * * 0';
  }
  if (includePeriodOptions.includes('month')) {
    return '0 0 1 * *';
  }
  if (includePeriodOptions.includes('hour')) {
    return '0 * * * *';
  }
  return defaultSchedule;
}

function openScheduleStep(): void {
  if (!scheduleInitialized.value) {
    scheduleValue.value = getDefaultScheduleValue();
    scheduleInitialized.value = true;
  }
  scheduleValid.value = true;
  activeStep.value = 3;
}

function relativeTime(timestamp?: number): string {
  if (!timestamp) {
    return '';
  }
  const rtf = new Intl.RelativeTimeFormat(locale.value, { numeric: 'auto' });
  const delta = timestamp - Date.now();
  const days = Math.round(delta / 86_400_000);
  if (Math.abs(days) >= 1) {
    return rtf.format(days, 'day');
  }
  const hours = Math.round(delta / 3_600_000);
  if (Math.abs(hours) >= 1) {
    return rtf.format(hours, 'hour');
  }
  return rtf.format(Math.round(delta / 60_000), 'minute');
}

async function loadApp(): Promise<void> {
  loading.value = true;
  loadError.value = '';
  try {
    const data = await getMarketplaceAppByFqn(fqn.value, 'owners');
    appData.value = data;
    configText.value =
      data.appConfiguration !== undefined
        ? JSON.stringify(data.appConfiguration, null, 2)
        : '';
  } catch (error) {
    loadError.value = error instanceof Error ? error.message : t('crud.loadFailed');
  } finally {
    loading.value = false;
  }
}

function onCancel(): void {
  // The official cancel target is the marketplace app details page.
  void router.push({ name: 'marketplace-app-detail', params: { fqn: fqn.value } });
}

function goToAppsPage(): void {
  void router.push({ name: 'admin-apps' });
}

async function submitInstall(appConfiguration: unknown): Promise<void> {
  const app = appData.value;
  if (!app) {
    return;
  }
  saving.value = true;
  saveError.value = '';
  try {
    const cron = scheduleValue.value;
    await installApp({
      appConfiguration: appConfiguration ?? app.appConfiguration,
      appSchedule:
        app.scheduleType === 'NoSchedule'
          ? undefined
          : {
              scheduleTimeline: !cron ? 'None' : 'Custom',
              ...(cron ? { cronExpression: cron } : {}),
            },
      name: fqn.value,
      description: app.description,
      displayName: app.displayName,
    });
    message.success(t('apps.install.installed'));
    goToAppsPage();
  } catch (error) {
    saveError.value = error instanceof Error ? error.message : t('crud.loadFailed');
  } finally {
    saving.value = false;
  }
}

function onVerifyNext(): void {
  if (appData.value?.allowConfiguration) {
    activeStep.value = 2;
  } else {
    openScheduleStep();
  }
}

function onSaveConfiguration(): void {
  const text = configText.value.trim();
  let parsed: unknown;
  if (!text) {
    parsed = undefined;
  } else {
    try {
      parsed = JSON.parse(text) as unknown;
    } catch {
      configError.value = t('apps.install.invalidJson');
      return;
    }
  }
  configError.value = '';
  if (appData.value?.scheduleType !== 'NoSchedule') {
    openScheduleStep();
  } else {
    void submitInstall(parsed);
  }
}

function onDeploy(): void {
  let parsed: unknown;
  const text = configText.value.trim();
  if (!text) {
    parsed = undefined;
  } else {
    try {
      parsed = JSON.parse(text) as unknown;
    } catch {
      configError.value = t('apps.install.invalidJson');
      activeStep.value = 2;
      return;
    }
  }
  void submitInstall(parsed);
}

onMounted(() => {
  void loadApp();
});
</script>

<template>
  <div data-testid="app-install">
    <ForbiddenView v-if="!isAdmin" />
    <template v-else>
      <PageHeader
        :header="appData ? t('apps.install.titleWithApp', { app: appName }) : t('apps.install.title')"
        :sub-header="appData?.description"
      />
      <Typography.Text v-if="loadError" type="danger" data-testid="app-install-error">
        {{ loadError }}
      </Typography.Text>
      <Typography.Text v-if="saveError" type="danger" data-testid="app-install-save-error">
        {{ saveError }}
      </Typography.Text>
      <template v-if="!loading && appData">
        <Steps :current="stepperIndex" style="margin-bottom: 16px" data-testid="app-install-steps">
          <Steps.Step v-for="step in stepperSteps" :key="step.step" :title="step.title" />
        </Steps>
        <div v-if="activeStep === 1" data-testid="app-install-verify">
          <Card style="max-width: 500px; margin: 0 auto">
            <Typography.Title :level="5" style="margin-top: 0">
              {{ t('apps.install.authorizeApp', { app: appName }) }}
            </Typography.Title>
            <Typography.Paragraph type="secondary">
              {{ appName }} {{ t('apps.install.by') }}
              <a
                v-if="appData.developerUrl"
                :href="appData.developerUrl"
                target="_blank"
                rel="noreferrer"
              >
                {{ appData.developer }}
              </a>
              <span v-else>{{ appData.developer }}</span>
            </Typography.Paragraph>
            <Typography.Paragraph type="secondary">
              {{ t('apps.install.wantsAccess', { username: authStore.displayName }) }}
            </Typography.Paragraph>
            <Collapse style="margin: 16px 0">
              <Collapse.Panel key="permissions" :header="t('apps.install.allMetadata')">
                <Empty :description="t('shared.empty')" :image="Empty.PRESENTED_IMAGE_SIMPLE" />
              </Collapse.Panel>
            </Collapse>
            <Space style="width: 100%; justify-content: flex-end">
              <Button data-testid="app-install-cancel" @click="onCancel">
                {{ t('crud.cancel') }}
              </Button>
              <Button
                type="primary"
                data-testid="app-install-next"
                @click="onVerifyNext"
              >
                {{ appData.allowConfiguration ? t('apps.install.configure') : t('apps.install.schedule') }}
              </Button>
            </Space>
          </Card>
          <Card style="max-width: 500px; margin: 16px auto 0">
            <Space style="width: 100%; justify-content: space-between">
              <Typography.Text type="secondary">
                {{ t('apps.install.developedBy', { developer: appData.developer ?? '' }) }}
              </Typography.Text>
              <Typography.Text type="secondary">
                {{ t('apps.install.updated', { time: relativeTime(appData.updatedAt) }) }}
              </Typography.Text>
            </Space>
          </Card>
        </div>
        <div v-if="activeStep === 2" data-testid="app-install-configure">
          <Card style="max-width: 720px; margin: 0 auto">
            <Typography.Title :level="5" style="margin-top: 0">
              {{ t('apps.install.configureTitle') }}
            </Typography.Title>
            <Typography.Paragraph type="secondary">
              {{ t('apps.install.configureHelp') }}
            </Typography.Paragraph>
            <Form layout="vertical">
              <Form.Item
                :validate-status="configError ? 'error' : undefined"
                :help="configError || undefined"
              >
                <Input.TextArea
                  v-model:value="configText"
                  data-testid="app-install-config"
                  :rows="12"
                  style="font-family: monospace"
                  :placeholder="t('apps.install.configPlaceholder')"
                />
              </Form.Item>
            </Form>
            <Space style="width: 100%; justify-content: flex-end">
              <Button data-testid="app-install-back" @click="activeStep = 1">
                {{ t('crud.back') }}
              </Button>
              <Button
                type="primary"
                data-testid="app-install-save-config"
                :loading="saving"
                @click="onSaveConfiguration"
              >
                {{ appData.scheduleType === 'NoSchedule' ? t('crud.create') : t('apps.install.schedule') }}
              </Button>
            </Space>
          </Card>
        </div>
        <div v-if="activeStep === 3" data-testid="app-install-schedule">
          <Card style="max-width: 720px; margin: 0 auto">
            <Typography.Title :level="5" style="margin-top: 0">
              {{ t('apps.install.schedule') }}
            </Typography.Title>
            <AppScheduleForm
              v-model:model-value="scheduleValue"
              :period-options="schedulePeriodOptions"
              @update:valid="scheduleValid = $event"
            />
            <Space style="width: 100%; justify-content: flex-end; margin-top: 16px">
              <Button
                data-testid="app-install-schedule-back"
                @click="activeStep = appData.allowConfiguration ? 2 : 1"
              >
                {{ t('crud.back') }}
              </Button>
              <Button
                type="primary"
                data-testid="app-install-deploy"
                :disabled="!scheduleValid"
                :loading="saving"
                @click="onDeploy"
              >
                {{ t('crud.create') }}
              </Button>
            </Space>
          </Card>
        </div>
      </template>
      <Empty
        v-if="!loading && !appData && !loadError"
        :description="t('apps.install.notFound', { app: fqn })"
      />
    </template>
  </div>
</template>
