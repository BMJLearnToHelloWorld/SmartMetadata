<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { Button, Modal, Spin } from 'ant-design-vue';
import { computed, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { getIngestionPipelineByFqn } from '@/api/ingestionPipelines';
import ScheduleIntervalField from '@/components/ingestion/ScheduleIntervalField.vue';
import { getCronDefaultValue } from '@/ingestion/schedule';
import { ensureCronstrueLoaded } from '@/ingestion/scheduleDescription';
import { useShellConfigStore } from '@/stores/shellConfig';
import type { AdminApp } from '@/types/admin';
import type { JsonSchema } from './appAssets';
import AppRunsHistory, { type AppRunsHistoryExposed } from './AppRunsHistory.vue';
import { getAppCronExpression, getScheduleOptionsForApp } from './appUtils';
import type { AppRunRecordWithId } from '@/api/apps';

const props = withDefaults(
  defineProps<{
    appData: AdminApp;
    loading: { isRunLoading: boolean; isDeployLoading: boolean };
    jsonSchema?: JsonSchema;
    disabled?: boolean;
    disabledReason?: string;
    canEdit?: boolean;
    canTrigger?: boolean;
    canDeploy?: boolean;
    runsHistoryVariant?: string;
    onSave: (cron: string) => Promise<void> | void;
    onDemandTrigger: () => Promise<void> | void;
    onDeployTrigger: () => void;
    onEditSchedule?: () => void;
    onViewRunConfig?: (record: AppRunRecordWithId) => void;
  }>(),
  {
    jsonSchema: undefined,
    disabled: false,
    disabledReason: undefined,
    canEdit: true,
    canTrigger: true,
    canDeploy: true,
    runsHistoryVariant: undefined,
    onEditSchedule: undefined,
    onViewRunConfig: undefined,
  },
);

const { t } = useI18n();
const shellConfig = useShellConfigStore();

/**
 * Official AppSchedule (components/Settings/Applications/AppSchedule/
 * AppSchedule.component.tsx, pin a3012259ca): a summary (raw schedule
 * timeline + cronstrue interval text), action buttons gated on their
 * own flags, and one embedded runs-history row. The whole tab shows a
 * loader while the pipeline-deployed check runs; the check is keyed
 * on appType + first pipeline FQN only, so a schedule save (which
 * replaces appData) neither flashes the loader nor remounts the runs
 * history. The edit dialog is non-dismissable, 650 wide, and seeds
 * from the current cron expression with validity reset.
 */
const showModal = ref(false);
const runsHistoryRef = ref<AppRunsHistoryExposed | null>(null);
const isPipelineDeployed = ref(false);
const isLoading = ref(true);
const isSaveLoading = ref(false);
const scheduleValue = ref<string | undefined>(undefined);
const isScheduleValid = ref(true);
const cronString = ref('');

const isAppDisabled = computed(() => props.disabled || Boolean(props.appData.deleted));
const showRunNowButton = computed(() =>
  ['ScheduledOrManual', 'OnlyManual'].includes(props.appData.scheduleType ?? ''),
);

const pipelineFqn = computed(() => {
  const first = props.appData.pipelines?.[0];
  return first ? (first.fullyQualifiedName ?? '') : undefined;
});

async function fetchPipelineDetails(): Promise<void> {
  isLoading.value = true;
  try {
    if (props.appData.appType === 'external' && pipelineFqn.value !== undefined) {
      const pipelineData = await getIngestionPipelineByFqn(pipelineFqn.value);
      isPipelineDeployed.value = pipelineData.deployed ?? false;
    } else {
      isPipelineDeployed.value = false;
    }
  } catch {
    isPipelineDeployed.value = false;
  } finally {
    isLoading.value = false;
  }
}

watch(
  [() => props.appData.appType, pipelineFqn],
  () => {
    void fetchPipelineDetails();
  },
);

onMounted(() => {
  void fetchPipelineDetails();
});

let cronRun = 0;
watch(
  () => props.appData,
  async (appData) => {
    const run = ++cronRun;
    const cronExpression = getAppCronExpression(appData.appSchedule);
    if (!cronExpression) {
      cronString.value = '';
      return;
    }
    const module = await ensureCronstrueLoaded();
    if (run === cronRun) {
      cronString.value = module.default.toString(cronExpression, {
        throwExceptionOnParseError: false,
      });
    }
  },
  { immediate: true },
);

// Pin passes `defaultCron` (getCronDefaultValue) into the picker as its
// display default when the app has no cron; the field's
// `defaultSchedule` prop carries it. Display-only: the picker never
// emits on mount, so an untouched dialog saves exactly what it seeded
// from (the app's cron, or '' when there is none).
const initialOptions = computed(() => {
  const feature = shellConfig.limit?.limits.config.featureLimits.find(
    (entry) => entry.name === 'app',
  );
  return getScheduleOptionsForApp(
    props.appData.name,
    props.appData.appType,
    feature?.pipelineSchedules,
  );
});

const showRunsHistory = computed(
  () => !isAppDisabled.value && (props.appData.appType === 'internal' || isPipelineDeployed.value),
);

function onDialogCancel(): void {
  showModal.value = false;
}

function onDialogOpen(): void {
  scheduleValue.value = getAppCronExpression(props.appData.appSchedule);
  isScheduleValid.value = true;
  showModal.value = true;
}

async function onDialogSave(): Promise<void> {
  isSaveLoading.value = true;
  await props.onSave(scheduleValue.value ?? '');
  isSaveLoading.value = false;
  showModal.value = false;
}

async function onAppTrigger(): Promise<void> {
  await props.onDemandTrigger();
  // Refresh the app history after 750ms: the run is triggered
  // asynchronously, so the latest run is not visible immediately.
  setTimeout(() => {
    runsHistoryRef.value?.refreshAppHistory();
  }, 750);
}
</script>

<template>
  <Spin v-if="isLoading" data-testid="app-schedule-loader" style="display: flex; justify-content: center; padding: 48px" />
  <div v-else style="display: flex; flex-wrap: wrap">
    <div style="flex: auto">
      <template v-if="appData.appSchedule">
        <div style="display: flex; align-items: center; gap: 8px">
          <span>{{ t('label.schedule-type') }}</span>
          <strong data-testid="schedule-type">{{ appData.appSchedule.scheduleTimeline ?? '' }}</strong>
        </div>
        <div v-if="cronString" style="display: flex; align-items: center; gap: 8px">
          <span>{{ t('label.schedule-interval') }}</span>
          <strong data-testid="cron-string">{{ cronString }}</strong>
        </div>
      </template>
    </div>
    <div v-if="!isAppDisabled" style="flex: 0 0 200px; display: flex; align-items: center; justify-content: flex-end">
      <div style="display: flex; align-items: center; gap: 8px">
        <Button
          v-if="canDeploy && appData.appType === 'external'"
          data-testid="deploy-button"
          :loading="loading.isDeployLoading"
          size="small"
          @click="onDeployTrigger"
        >
          {{ t('label.deploy') }}
        </Button>
        <Button
          v-if="canEdit && !appData.system"
          data-testid="edit-button"
          size="small"
          @click="() => (onEditSchedule ? onEditSchedule() : onDialogOpen())"
        >
          {{ t('label.edit') }}
        </Button>
        <Button
          v-if="canTrigger && showRunNowButton"
          data-testid="run-now-button"
          :loading="loading.isRunLoading"
          size="small"
          type="primary"
          @click="onAppTrigger"
        >
          {{ t('label.run-now') }}
        </Button>
      </div>
    </div>
    <div style="max-width: 100%; flex: 0 0 100%; margin-top: 16px">
      <AppRunsHistory
        v-if="showRunsHistory"
        ref="runsHistoryRef"
        :app-data="appData"
        :json-schema="jsonSchema"
        :max-records="1"
        :show-pagination="false"
        :variant="runsHistoryVariant"
        :on-view-run-config="onViewRunConfig"
      />
      <div v-else-if="isAppDisabled">
        {{ disabledReason ?? t('message.application-disabled-message') }}
      </div>
      <div v-else>{{ t('message.no-ingestion-pipeline-found') }}</div>
    </div>
  </div>
  <Modal
    :closable="false"
    :footer="null"
    :keyboard="false"
    :mask-closable="false"
    :open="showModal"
    :width="650"
    @cancel="onDialogCancel"
  >
    <div data-testid="update-schedule-modal">
      <div style="font-weight: 600; margin-bottom: 16px">
        {{ t('label.update-entity', { entity: t('label.schedule') }) }}
      </div>
      <ScheduleIntervalField
        :include-period-options="initialOptions"
        :default-schedule="getCronDefaultValue(props.appData.name)"
        :model-value="scheduleValue"
        test-id-prefix="update-schedule"
        @update:model-value="scheduleValue = $event"
        @validity-change="isScheduleValid = $event"
      />
      <div style="display: flex; justify-content: flex-end; gap: 12px; margin-top: 16px">
        <Button data-testid="back-button" size="small" @click="onDialogCancel">
          {{ t('label.cancel') }}
        </Button>
        <Button
          data-testid="deploy-button"
          :disabled="!isScheduleValid"
          :loading="isSaveLoading"
          size="small"
          type="primary"
          @click="onDialogSave"
        >
          {{ t('label.save') }}
        </Button>
      </div>
    </div>
  </Modal>
</template>
