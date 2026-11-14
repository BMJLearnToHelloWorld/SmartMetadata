<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0 (the "License");
  you may not use this file except in compliance with the License.
  You may obtain a copy of the License at

      http://www.apache.org/licenses/LICENSE-2.0
-->
<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { Button, Checkbox, Form, Input, InputNumber, Select, Steps, message } from 'ant-design-vue';
import PageHeader from '@/components/shared/PageHeader.vue';
import PageLayout from '@/components/shared/PageLayout.vue';
import SchemaDrivenSourceConfigForm from '@/components/ingestion/SchemaDrivenSourceConfigForm.vue';
import ScheduleIntervalField from '@/components/ingestion/ScheduleIntervalField.vue';
import UserTeamPicker from '@/components/governance/workflowBuilder/forms/UserTeamPicker.vue';
import {
  createIngestionPipeline,
  deployIngestionPipeline,
  getIngestionPipelineByFqn,
  isPipelineClientDisabled,
} from '@/api/ingestionPipelines';
import { ApiError } from '@/api/client';
import { SERVICE_GET_API } from '@/ingestion/serviceApis';
import { entityTypeForKind } from '@/ingestion/connections';
import { getSupportedPipelineTypes } from '@/ingestion/supportedPipelines';
import { generateUUID, getIngestionName } from '@/ingestion/uuid';
import {
  DEFAULT_SCHEDULE_CRON_DAILY,
  cronValidator,
  getDefaultScheduleValue,
} from '@/ingestion/schedule';
import { effectiveOwnersForPipeline, isSettingsPipelineType } from '@/ingestion/owners';
import { buildSourceConfig } from '@/ingestion/sourceConfig';
import {
  SERVICE_CATEGORY_BY_KIND,
  getDefaultFilterPropertyValues,
  getSchemaByWorkflowType,
  type RjsfSchema,
} from '@/ingestion/ingestionSchemas';
import { isAirflowAvailable } from '@/ingestion/orchestrator';
import { useAuthStore } from '@/stores/auth';
import type {
  CatalogService,
  CreateIngestionPipelineRequest,
  PipelineType,
  ServiceKind,
} from '@/types/ingestion';
import { PIPELINE_TYPES } from '@/types/ingestion';
import type { EntityRef } from '@/types/api';

/**
 * Service-scoped add-ingestion page (official AddIngestionPage, route
 * ADD_INGESTION `/service/:serviceCategory/:fqn/add-ingestion/:ingestionType`).
 * Official steps (constants/Ingestions.constant.ts STEPS_FOR_ADD_INGESTION):
 * 1 configure, 2 schedule interval, then a success screen. The name input
 * is the displayName input; the persisted name is a UUID
 * (getIngestionName default). Owners are required except for settings
 * pipelines (dataInsight / elasticSearchReindex). The create payload
 * carries startDate (yesterday UTC midnight), retries, raiseOnError,
 * loggerLevel, and owners; a deploy that fails leaves the success screen
 * with a retry button instead of navigating away.
 */
const props = defineProps<{ kind: string; id: string; ingestionType?: string }>();

const { t } = useI18n();
const router = useRouter();
const authStore = useAuthStore();

const step = ref(0);
const creating = ref(false);
const deploying = ref(false);
const loading = ref(false);
const errorMessage = ref('');
const service = ref<CatalogService | null>(null);
const pipelineType = ref<PipelineType>('metadata');
const displayName = ref('');
const owners = ref<EntityRef[]>([]);
const ownersInvalid = ref(false);
const debugLog = ref(false);
// The schema-driven sourceConfig form data (P-08(d)): the
// `sourceConfig.config` object itself. The form seeds the schema defaults
// under the prefill on mount.
const sourceConfigData = ref<Record<string, unknown>>({});
const sourceSchema = ref<RjsfSchema | null>(null);
const schemaFormRef = ref<{ validate: () => boolean } | null>(null);
const schemaFormValid = ref(true);
const scheduleInterval = ref<string | undefined>(
  getDefaultScheduleValue({ defaultSchedule: DEFAULT_SCHEDULE_CRON_DAILY }),
);
const scheduleValid = ref(true);
const scheduleError = ref('');
const retries = ref(0);
const raiseOnError = ref(true);
const deployFailed = ref(false);
const createdName = ref('');
const createdId = ref('');

const kind = computed<ServiceKind>(() =>
  (
    [
      'database',
      'messaging',
      'dashboard',
      'storage',
      'pipeline',
      'api',
      'mlmodel',
      'metadata',
      'drive',
      'search',
      'llm',
      'mcp',
      'security',
    ] as const
  ).includes(props.kind as ServiceKind)
    ? (props.kind as ServiceKind)
    : 'database',
);
const typeOptions = computed<readonly PipelineType[]>(() =>
  service.value
    ? getSupportedPipelineTypes(service.value, kind.value)
    : (['metadata'] as const),
);
const settingsPipeline = computed(() => isSettingsPipelineType(pipelineType.value));
const ownersRequired = computed(() => !settingsPipeline.value);
const steps = computed(() => [
  { title: t('ingestion.pipelines.addStepConfigure') },
  { title: t('ingestion.pipelines.addStepSchedule') },
  { title: t('ingestion.pipelines.successStep') },
]);

function yesterdayStartDateIso(): string {
  // Port of official `AddIngestion.component.tsx` `createNewIngestion`:
  // the Airflow start date is yesterday at UTC midnight.
  const date = new Date(Date.now());
  date.setUTCHours(0, 0, 0, 0);
  date.setDate(date.getDate() - 1);
  return date.toISOString();
}

function goToService(): void {
  void router.push({ name: 'ingestion-service', params: { kind: props.kind, id: props.id } });
}

async function load(): Promise<void> {
  loading.value = true;
  errorMessage.value = '';
  try {
    service.value = await SERVICE_GET_API[kind.value](props.id);
    const routeType = props.ingestionType;
    const initial =
      routeType && (PIPELINE_TYPES as readonly string[]).includes(routeType) ? routeType : 'metadata';
    pipelineType.value = (
      typeOptions.value.includes(initial as PipelineType)
        ? initial
        : (typeOptions.value[0] ?? 'metadata')
    ) as PipelineType;
    displayName.value = getIngestionName(service.value.name, pipelineType.value);
    // Assigned before the schema resolves: the owners do not depend on
    // it, and the step-1 validation reads them.
    owners.value = effectiveOwnersForPipeline({
      serviceOwners: service.value.owners,
      currentUser: authStore.user,
    });
    // The schema-driven form (P-08(d)): resolve the ingestion schema for
    // this (pipelineType, service category) pair and prefill the
    // filter-pattern values from the service connection.config
    // (official's getDefaultFilterPropertyValues — filter-pattern fields
    // only; other connection keys never prefill, so the schema default
    // applies instead).
    sourceSchema.value = await getSchemaByWorkflowType(
      pipelineType.value,
      SERVICE_CATEGORY_BY_KIND[kind.value],
      service.value.serviceType,
    );
    sourceConfigData.value = getDefaultFilterPropertyValues({
      isEditMode: false,
      serviceData: service.value,
      schema: sourceSchema.value,
    });
  } catch (error) {
    service.value = null;
    errorMessage.value = error instanceof Error ? error.message : t('crud.loadFailed');
  } finally {
    loading.value = false;
  }
}

function validateStep1(): boolean {
  if (ownersRequired.value && owners.value.length === 0) {
    ownersInvalid.value = true;
    return false;
  }
  if (displayName.value.trim().length === 0) {
    return false;
  }
  // The schema form validates its own fields (AJV + ownerConfig maps)
  // and shows the errors inline.
  if (schemaFormRef.value && !schemaFormRef.value.validate()) {
    return false;
  }
  return schemaFormValid.value;
}

async function handleDeploy(): Promise<boolean> {
  if (!(await isAirflowAvailable())) {
    message.warning(t('ingestion.pipelines.deploySkippedAirflowUnavailable'));
    // A skipped deploy is presented like a failed one, so the success
    // screen still offers the Deploy retry.
    deployFailed.value = true;
    return false;
  }
  deploying.value = true;
  try {
    const result = await deployIngestionPipeline(createdId.value);
    // Only the specific "Pipeline Client Disabled" reason (or a
    // non-200 code) means the deploy did nothing: on success the
    // server fills `reason` with the plugin's raw response body, so a
    // bare truthiness check would report every successful deploy as a
    // failure. A throw is a deploy failure too, not an unhandled
    // rejection — the pipeline is already created.
    if (
      isPipelineClientDisabled(result) ||
      (result.code !== undefined && result.code !== 200)
    ) {
      message.error(t('ingestion.pipelines.deployEntityError'));
      deployFailed.value = true;
      return false;
    }
    deployFailed.value = false;
    return true;
  } catch {
    message.error(t('ingestion.pipelines.deployEntityError'));
    deployFailed.value = true;
    return false;
  } finally {
    deploying.value = false;
  }
}

async function onCreate(): Promise<void> {
  if (!service.value) {
    return;
  }
  const cronErrorKey = await cronValidator(scheduleInterval.value ?? '');
  if (cronErrorKey) {
    scheduleError.value = t(cronErrorKey);
    return;
  }
  creating.value = true;
  try {
    const name = generateUUID();
    const payload: CreateIngestionPipelineRequest = {
      name,
      displayName: displayName.value.trim(),
      pipelineType: pipelineType.value,
      service: { id: service.value.id, type: entityTypeForKind(kind.value) },
      sourceConfig: buildSourceConfig({
        pipelineType: pipelineType.value,
        serviceKind: kind.value,
        sourceConfigData: sourceConfigData.value,
      }),
      airflowConfig: {
        scheduleInterval: scheduleInterval.value,
        startDate: yesterdayStartDateIso(),
        retries: Math.max(0, Number(retries.value)),
      },
      raiseOnError: raiseOnError.value,
      loggerLevel: debugLog.value ? 'DEBUG' : 'INFO',
      owners: owners.value,
    };
    let created;
    try {
      created = await createIngestionPipeline(payload);
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) {
        // Port of official `handleCreateError`: a 409 is an already-exists
        // name collision, surfaced directly.
        message.error(
          t('ingestion.pipelines.alreadyExists', { entity: displayName.value.trim() }),
        );
        return;
      }
      // A non-409 failure may still have created the pipeline (the create
      // succeeded but the deploy failed, or the response was lost). Look
      // it up by FQN: if it exists, the failure was in the deploy, so
      // enter the success screen with a deploy retry; otherwise the
      // create itself failed.
      const existing = await getIngestionPipelineByFqn(`${service.value.name}.${name}`).catch(
        () => null,
      );
      if (existing) {
        createdId.value = existing.id;
        createdName.value = existing.name;
        deployFailed.value = true;
        message.error(t('ingestion.pipelines.deployEntityError'));
        step.value = 2;
        return;
      }
      message.error(t('crud.createFailed'));
      return;
    }
    createdId.value = created.id;
    createdName.value = created.name;
    step.value = 2;
    await handleDeploy();
  } finally {
    creating.value = false;
  }
}

onMounted(() => {
  void load();
});
</script>

<template>
  <PageLayout>
    <PageHeader :header="t('ingestion.pipelines.addTitle')" :sub-header="t('ingestion.pipelines.addLead')" />
    <p v-if="errorMessage" data-testid="add-ingestion-error">{{ errorMessage }}</p>
    <div v-if="loading">{{ t('crud.loading') }}</div>
    <div v-else-if="service" data-testid="add-ingestion-form">
      <Steps :current="step" data-testid="add-ingestion-steps" style="margin-bottom: 24px">
        <Steps.Step v-for="item in steps" :key="item.title" :title="item.title" />
      </Steps>
      <div v-if="step === 0" data-testid="add-ingestion-step-configure">
        <Form layout="vertical">
          <Form.Item :label="t('ingestion.services.title')" required>
            <Input :value="service.displayName || service.name" disabled data-testid="add-ingestion-service" />
          </Form.Item>
          <Form.Item
            :label="t('crud.type')"
            required
            :extra="t('ingestion.pipelines.pipelineTypeHelp')"
          >
            <Select :value="pipelineType" data-testid="add-ingestion-type" disabled>
              <Select.Option v-for="type in typeOptions" :key="type" :value="type">{{
                t(`ingestion.pipelines.types.${type}`)
              }}</Select.Option>
            </Select>
          </Form.Item>
          <Form.Item
            :label="t('crud.name')"
            required
            :validate-status="!displayName.trim() ? 'error' : undefined"
            :help="
              !displayName.trim() ? t('crud.fieldRequired', { field: t('crud.name') }) : undefined
            "
          >
            <Input v-model:value="displayName" data-testid="pipeline-name" />
          </Form.Item>
          <Form.Item
            :label="t('ingestion.pipelines.owners')"
            :validate-status="ownersInvalid ? 'error' : undefined"
            :help="
              ownersInvalid
                ? t('crud.fieldRequired', { field: t('ingestion.pipelines.owners') })
                : undefined
            "
          >
            <UserTeamPicker
              v-model="owners"
              :candidates="[...(service.owners ?? []), ...owners]"
              @update:model-value="ownersInvalid = false"
            />
          </Form.Item>
          <Form.Item>
            <Checkbox v-model:checked="debugLog" data-testid="add-ingestion-debug-log">{{
              t('ingestion.pipelines.enableDebugLog')
            }}</Checkbox>
          </Form.Item>
          <SchemaDrivenSourceConfigForm
            v-if="sourceSchema"
            :key="`${kind}-${pipelineType}`"
            ref="schemaFormRef"
            :schema="sourceSchema"
            v-model="sourceConfigData"
            :supports-auto-partition="pipelineType === 'profiler'"
            @validity-change="(valid) => (schemaFormValid = valid)"
          />
        </Form>
      </div>
      <div v-else-if="step === 1" data-testid="add-ingestion-step-schedule">
        <Form layout="vertical">
          <Form.Item
            :label="t('ingestion.pipelines.scheduleInterval')"
            :validate-status="scheduleError ? 'error' : undefined"
            :help="scheduleError || undefined"
          >
            <ScheduleIntervalField
              v-model="scheduleInterval"
              :disabled="pipelineType === 'dataInsight'"
              test-id-prefix="add-ingestion-schedule"
              @validity-change="(valid) => (scheduleValid = valid)"
            />
          </Form.Item>
          <Form.Item :label="t('ingestion.pipelines.numberOfRetries')">
            <InputNumber v-model:value="retries" :min="0" data-testid="add-ingestion-retries" />
          </Form.Item>
          <Form.Item>
            <Checkbox v-model:checked="raiseOnError" data-testid="add-ingestion-raise-on-error">{{
              t('ingestion.pipelines.raiseOnError')
            }}</Checkbox>
          </Form.Item>
        </Form>
      </div>
      <div v-else data-testid="add-ingestion-step-success">
        <p>{{ t('ingestion.pipelines.createSuccess', { name: createdName }) }}</p>
        <p v-if="deployFailed">{{ t('ingestion.pipelines.createSuccessDeployFailed') }}</p>
      </div>
      <div style="margin-top: 24px; display: flex; gap: 8px">
        <Button
          v-if="step === 0"
          data-testid="add-ingestion-cancel"
          @click="goToService"
        >
          {{ t('crud.cancel') }}
        </Button>
        <Button
          v-if="step > 0 && step < 2"
          data-testid="add-ingestion-back"
          @click="step -= 1"
        >
          {{ t('crud.previous') }}
        </Button>
        <Button
          v-if="step === 0"
          type="primary"
          data-testid="add-ingestion-next"
          @click="validateStep1() && (step = 1)"
        >
          {{ t('crud.next') }}
        </Button>
        <Button
          v-if="step === 1"
          type="primary"
          data-testid="add-ingestion-create"
          :loading="creating"
          :disabled="!scheduleValid"
          @click="onCreate"
        >
          {{ t('ingestion.pipelines.createAndDeploy') }}
        </Button>
        <Button
          v-if="step === 2"
          type="primary"
          data-testid="add-ingestion-view-service"
          @click="goToService"
        >
          {{ t('ingestion.pipelines.viewService') }}
        </Button>
        <Button
          v-if="step === 2 && deployFailed"
          data-testid="add-ingestion-deploy-retry"
          :loading="deploying"
          @click="handleDeploy"
        >
          {{ t('ingestion.pipelines.deploy') }}
        </Button>
      </div>
    </div>
  </PageLayout>
</template>
