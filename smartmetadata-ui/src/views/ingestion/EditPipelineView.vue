<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { Button, Checkbox, Form, Input, InputNumber, Spin, Steps, message } from 'ant-design-vue';
import { compare } from 'fast-json-patch';
import {
  deployIngestionPipeline,
  getIngestionPipeline,
  isPipelineClientDisabled,
  updateIngestionPipeline,
} from '@/api/ingestionPipelines';
import SchemaDrivenSourceConfigForm from '@/components/ingestion/SchemaDrivenSourceConfigForm.vue';
import ScheduleIntervalField from '@/components/ingestion/ScheduleIntervalField.vue';
import UserTeamPicker from '@/components/governance/workflowBuilder/forms/UserTeamPicker.vue';
import PageHeader from '@/components/shared/PageHeader.vue';
import PageLayout from '@/components/shared/PageLayout.vue';
import SmState from '@/components/shared/SmState.vue';
import { SERVICE_KIND_BY_ENTITY_TYPE } from '@/ingestion/connections';
import { SERVICE_GET_API } from '@/ingestion/serviceApis';
import { buildSourceConfig } from '@/ingestion/sourceConfig';
import {
  SERVICE_CATEGORY_BY_KIND,
  getSchemaByWorkflowType,
  type RjsfSchema,
} from '@/ingestion/ingestionSchemas';
import { effectiveOwnersForPipeline, isSettingsPipelineType } from '@/ingestion/owners';
import { cronValidator } from '@/ingestion/schedule';
import { isAirflowAvailable } from '@/ingestion/orchestrator';
import { useAuthStore } from '@/stores/auth';
import type {
  IngestionPipeline,
  PipelineFormValues,
  PipelineType,
  ServiceKind,
} from '@/types/ingestion';
import type { EntityRef } from '@/types/api';

const props = defineProps<{ id: string }>();
const { t } = useI18n();
const router = useRouter();
const authStore = useAuthStore();
const loading = ref(false);
const errorMessage = ref('');
const saving = ref(false);
const step = ref(0);
const pipeline = ref<IngestionPipeline | null>(null);
const serviceOwners = ref<EntityRef[]>([]);
const owners = ref<EntityRef[]>([]);
const ownersInvalid = ref(false);
const scheduleValid = ref(true);
const scheduleError = ref('');
const form = reactive<PipelineFormValues>({
  name: '',
  pipelineType: 'metadata',
  serviceId: '',
  serviceKind: 'database',
  sourceConfigData: {},
  scheduleInterval: '',
  retries: 0,
  raiseOnError: true,
  debugLog: false,
});
// The schema-driven sourceConfig form (P-08(d)): the form seeds the
// schema defaults under the saved config on mount.
const sourceSchema = ref<RjsfSchema | null>(null);
const schemaFormRef = ref<{ validate: () => boolean } | null>(null);
const schemaFormValid = ref(true);

const steps = computed(() => [
  { title: t('ingestion.pipelines.editStepConfigure') },
  { title: t('ingestion.pipelines.editStepSchedule') },
]);
const settingsPipeline = computed(() => isSettingsPipelineType(form.pipelineType));
const ownersRequired = computed(() => !settingsPipeline.value);

function serviceKindFromRef(type: string | undefined): ServiceKind {
  return (type && SERVICE_KIND_BY_ENTITY_TYPE[type]) || 'database';
}

function backToDetail(): void {
  void router.push({ name: 'ingestion-pipeline', params: { id: props.id } });
}

async function load(): Promise<void> {
  loading.value = true;
  errorMessage.value = '';
  try {
    const current = await getIngestionPipeline(props.id);
    pipeline.value = current;
    const kind = serviceKindFromRef(current.service?.type);
    form.name = current.name;
    form.displayName = current.displayName || '';
    form.pipelineType = current.pipelineType || 'metadata';
    form.serviceId = current.service?.id || '';
    form.serviceKind = kind;
    // The form data is the saved config itself, so keys the form does
    // not model survive the edit (the P-07 guarantee); the form seeds
    // the schema defaults under it on mount.
    form.sourceConfigData = { ...(current.sourceConfig?.config ?? {}) };
    // The saved schedule is kept as-is; an empty value is on-demand and
    // is never backfilled with a default.
    form.scheduleInterval = current.airflowConfig?.scheduleInterval || '';
    form.retries = current.airflowConfig?.retries ?? 0;
    form.raiseOnError = current.raiseOnError ?? true;
    form.debugLog = current.loggerLevel === 'DEBUG';
    // Service owners seed the owners fallback; a failed service fetch
    // leaves the saved owners (then the current user) as the fallback.
    // Assigned before the schema resolves: the owners do not depend on
    // it, and the step-1 validation reads them.
    let serviceType: string | undefined;
    if (current.service?.id) {
      const getter = SERVICE_GET_API[kind];
      const fetched = await getter(current.service.id).catch(() => null);
      serviceOwners.value = fetched?.owners ?? [];
      serviceType = fetched?.serviceType;
    }
    owners.value = effectiveOwnersForPipeline({
      savedOwners: current.owners,
      serviceOwners: serviceOwners.value,
      currentUser: authStore.user,
    });
    sourceSchema.value = await getSchemaByWorkflowType(
      form.pipelineType as PipelineType,
      SERVICE_CATEGORY_BY_KIND[kind],
      serviceType,
    );
  } catch (error) {
    pipeline.value = null;
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
  if ((form.displayName ?? '').trim().length === 0) {
    return false;
  }
  // The schema form validates its own fields (AJV + ownerConfig maps)
  // and shows the errors inline.
  if (schemaFormRef.value && !schemaFormRef.value.validate()) {
    return false;
  }
  return schemaFormValid.value;
}

async function onSave(): Promise<void> {
  if (!pipeline.value) {
    return;
  }
  const cronErrorKey = await cronValidator(form.scheduleInterval ?? '');
  if (cronErrorKey) {
    scheduleError.value = t(cronErrorKey);
    return;
  }
  saving.value = true;
  try {
    // The patch base is the loaded pipeline spread whole, and the
    // sourceConfig is built from the schema form's data — which starts
    // from the SAVED config on edit, so `compare` only emits ops for
    // fields this form actually changed. Unmodelled sourceConfig keys
    // (notably `excludes`) survive because they are in the form data
    // from the start, not because the server keeps them: a rebuild
    // from the form's fields alone would emit `remove` ops for every
    // saved key the form never saw.
    const updated: IngestionPipeline = {
      ...pipeline.value,
      displayName: form.displayName?.trim() || undefined,
      owners: owners.value,
      loggerLevel: form.debugLog ? 'DEBUG' : 'INFO',
      raiseOnError: form.raiseOnError ?? true,
      airflowConfig: {
        ...pipeline.value.airflowConfig,
        scheduleInterval: form.scheduleInterval?.trim() || undefined,
        retries: Math.max(0, Number(form.retries ?? 0)),
      },
      sourceConfig: buildSourceConfig({
        pipelineType: form.pipelineType as PipelineType,
        serviceKind: form.serviceKind,
        sourceConfigData: form.sourceConfigData ?? {},
      }),
    };
    const ops = compare(pipeline.value, updated);
    await updateIngestionPipeline(props.id, ops);
    // P-20: deploy after a successful update. A deploy failure is a
    // deploy-entity-error toast, not a failed save — the update stands.
    // The deploy is wrapped on its own: a throw must not turn the
    // already-saved update into a failed save that never navigates.
    if (await isAirflowAvailable()) {
      try {
        const result = await deployIngestionPipeline(props.id);
        if (
          isPipelineClientDisabled(result) ||
          (result.code !== undefined && result.code !== 200)
        ) {
          message.error(t('ingestion.pipelines.deployEntityError'));
        }
      } catch {
        message.error(t('ingestion.pipelines.deployEntityError'));
      }
    } else {
      message.warning(t('ingestion.pipelines.deploySkippedAirflowUnavailable'));
    }
    message.success(t('ingestion.pipelines.updated'));
    backToDetail();
  } catch (error) {
    message.error(error instanceof Error ? error.message : t('crud.updateFailed'));
  } finally {
    saving.value = false;
  }
}

onMounted(() => {
  void load();
});
</script>

<template>
  <PageLayout>
    <PageHeader :header="t('ingestion.pipelines.editTitle')" />
    <Spin :spinning="loading">
      <SmState
        v-if="errorMessage"
        state="error"
        test-id="edit-pipeline-error"
        :error-text="errorMessage"
      />
      <template v-else-if="pipeline">
        <Steps :current="step" data-testid="edit-pipeline-steps" style="margin-bottom: 24px">
          <Steps.Step v-for="item in steps" :key="item.title" :title="item.title" />
        </Steps>
        <div v-if="step === 0" data-testid="edit-pipeline-step-configure">
          <Form layout="vertical">
            <Form.Item :label="t('crud.name')">
              <Input :value="form.name" disabled data-testid="edit-pipeline-name" />
            </Form.Item>
            <Form.Item
              :label="t('crud.displayName')"
              :extra="t('crud.displayNameHelp')"
              :validate-status="!(form.displayName ?? '').trim() ? 'error' : undefined"
              :help="
                !(form.displayName ?? '').trim()
                  ? t('crud.fieldRequired', { field: t('crud.displayName') })
                  : undefined
              "
            >
              <Input v-model:value="form.displayName" data-testid="edit-pipeline-display-name" />
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
                :candidates="[...serviceOwners, ...owners]"
                @update:model-value="ownersInvalid = false"
              />
            </Form.Item>
            <Form.Item>
              <Checkbox v-model:checked="form.debugLog" data-testid="edit-pipeline-debug-log">{{
                t('ingestion.pipelines.enableDebugLog')
              }}</Checkbox>
            </Form.Item>
            <SchemaDrivenSourceConfigForm
              v-if="sourceSchema"
              :key="`${form.serviceKind}-${form.pipelineType}`"
              ref="schemaFormRef"
              :schema="sourceSchema"
              v-model="form.sourceConfigData"
              @validity-change="(valid) => (schemaFormValid = valid)"
            />
          </Form>
        </div>
        <div v-if="step === 1" data-testid="edit-pipeline-step-schedule">
          <Form layout="vertical">
            <Form.Item
              :label="t('ingestion.pipelines.scheduleInterval')"
              :validate-status="scheduleError ? 'error' : undefined"
              :help="scheduleError || undefined"
            >
              <ScheduleIntervalField
                :model-value="form.scheduleInterval || undefined"
                :disabled="form.pipelineType === 'dataInsight'"
                test-id-prefix="edit-pipeline-schedule"
                @validity-change="(valid) => (scheduleValid = valid)"
                @update:model-value="(value) => (form.scheduleInterval = value ?? '')"
              />
            </Form.Item>
            <Form.Item :label="t('ingestion.pipelines.numberOfRetries')">
              <InputNumber v-model:value="form.retries" :min="0" data-testid="edit-pipeline-retries" />
            </Form.Item>
            <Form.Item>
              <Checkbox v-model:checked="form.raiseOnError" data-testid="edit-pipeline-raise-on-error">{{
                t('ingestion.pipelines.raiseOnError')
              }}</Checkbox>
            </Form.Item>
          </Form>
        </div>
        <div style="margin-top: 24px; display: flex; gap: 8px">
          <Button data-testid="edit-pipeline-back" @click="step === 0 ? backToDetail() : (step = 0)">
            {{ t('crud.previous') }}
          </Button>
          <Button
            v-if="step === 0"
            type="primary"
            data-testid="edit-pipeline-next"
            @click="validateStep1() && (step = 1)"
          >
            {{ t('crud.next') }}
          </Button>
          <Button
            v-else
            type="primary"
            data-testid="edit-pipeline-submit"
            :loading="saving"
            :disabled="!scheduleValid"
            @click="onSave"
          >
            {{ t('crud.submit') }}
          </Button>
        </div>
      </template>
    </Spin>
  </PageLayout>
</template>
