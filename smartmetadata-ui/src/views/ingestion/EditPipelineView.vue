<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import {
  Button,
  Card,
  Divider,
  Form,
  Input,
  InputNumber,
  Modal,
  Progress,
  Spin,
  Steps,
  Tag,
  Tooltip,
  message,
} from 'ant-design-vue';
import { EditOutlined, PlusOutlined } from '@ant-design/icons-vue';
import { compare } from 'fast-json-patch';
import {
  deployIngestionPipeline,
  getIngestionPipeline,
  getOrchestratorStatus,
  isPipelineClientDisabled,
  updateIngestionPipeline,
} from '@/api/ingestionPipelines';
import { getDerivedPermissionFlags, type OperationPermissions } from '@/api/permissions';
import AirflowMessageBanner from '@/components/ingestion/AirflowMessageBanner.vue';
import SchemaDrivenSourceConfigForm from '@/components/ingestion/SchemaDrivenSourceConfigForm.vue';
import ScheduleIntervalField from '@/components/ingestion/ScheduleIntervalField.vue';
import ServiceDocPanel from '@/components/ingestion/ServiceDocPanel.vue';
import UserTeamPicker from '@/components/governance/workflowBuilder/forms/UserTeamPicker.vue';
import PageHeader from '@/components/shared/PageHeader.vue';
import PageLayout from '@/components/shared/PageLayout.vue';
import SmBreadcrumb from '@/components/shared/SmBreadcrumb.vue';
import SmState from '@/components/shared/SmState.vue';
import ToggleField from '@/components/shared/ToggleField.vue';
import { SERVICE_KIND_BY_ENTITY_TYPE } from '@/ingestion/connections';
import { getDocPanelServiceType, useFieldFocus } from '@/ingestion/fieldFocus';
import { SERVICE_GET_API } from '@/ingestion/serviceApis';
import { buildSourceConfig } from '@/ingestion/sourceConfig';
import {
  SERVICE_CATEGORY_BY_KIND,
  getSchemaByWorkflowType,
  startCase,
  type RjsfSchema,
} from '@/ingestion/ingestionSchemas';
import { effectiveOwnersForPipeline, isSettingsPipelineType } from '@/ingestion/owners';
import { cronValidator } from '@/ingestion/schedule';
import { useAuthStore } from '@/stores/auth';
import { usePermissionStore } from '@/stores/permissions';
import type {
  CatalogService,
  IngestionPipeline,
  OrchestratorStatus,
  PipelineFormValues,
  PipelineType,
  ServiceKind,
} from '@/types/ingestion';
import type { EntityRef } from '@/types/api';

/**
 * Port of official `EditIngestionPage` + `AddIngestion` in edit mode (pin
 * a3012259ca): per-type "Edit {{workflow}} Agent" heading, category /
 * service / heading breadcrumb, the "Name this ingestion" card, owners
 * with EditOwners gating, the sectioned workflow form beside the doc
 * panel, the schedule step, and the post-save success screen with the
 * deploy-progress modal. Save semantics stay the fork's: JSON Patch,
 * then deploy-if-Airflow-available; a deploy failure is an error toast
 * and the update stands.
 */
const props = defineProps<{ id: string }>();
const { t, te } = useI18n();
const router = useRouter();
const authStore = useAuthStore();
const permissionStore = usePermissionStore();
const loading = ref(false);
const errorMessage = ref('');
const saving = ref(false);
const step = ref(0);
const pipeline = ref<IngestionPipeline | null>(null);
const service = ref<CatalogService | null>(null);
const serviceOwners = ref<EntityRef[]>([]);
const owners = ref<EntityRef[]>([]);
const ownersInvalid = ref(false);
const ownersPickerOpen = ref(false);
const pipelineOps = ref<OperationPermissions | null>(null);
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
const schemaFormReady = ref(false);
const orchestrator = ref<OrchestratorStatus | null>(null);
const orchestratorChecked = ref(false);

const { activeField, activeFieldMeta, handleFieldFocus, handleFieldBlur } = useFieldFocus();

/** Pin `IngestionActionMessage`: hardcoded English literals, not i18n. */
const IngestionActionMessage = {
  Updating: 'Updating',
  Deploying: 'Deploying',
  Deployed: 'Successfully deployed',
  DeployingError: 'Error while deploying',
} as const;
/** Pin `DeployIngestionLoaderModal` progress constants. */
const DEPLOY_PROGRESS_START = 20;
const DEPLOY_PROGRESS_END = 80;
const DEPLOY_PROGRESS_DEPLOYED = 100;
const deployModalOpen = ref(false);
const deployProgress = ref(DEPLOY_PROGRESS_START);
const deployAction = ref<string>(IngestionActionMessage.Updating);
const showDeployButton = ref(false);
let deployModalTimer: ReturnType<typeof setTimeout> | undefined;

const steps = computed(() => [
  { title: t('ingestion.pipelines.editStepConfigure') },
  { title: t('ingestion.pipelines.editStepSchedule') },
]);
const settingsPipeline = computed(() => isSettingsPipelineType(form.pipelineType));

/** Pin `getIngestionHeadingName(type, EDIT)`: "Edit {{workflow}} Agent". */
const heading = computed(() => {
  const labelKey = `ingestion.pipelines.workflowLabels.${form.pipelineType}`;
  const workflow = te(labelKey) ? t(labelKey) : startCase(form.pipelineType);
  return t('ingestion.pipelines.editWorkflowAgent', { workflow });
});

const categoryLabel = computed(() => {
  const key = `ingestion.serviceCategories.${form.serviceKind}`;
  return te(key) ? t(key) : startCase(form.serviceKind);
});

/** Pin `getBreadCrumbsArray`: category / service / heading (settings pipelines: type / heading). */
const breadcrumbs = computed(() => {
  if (settingsPipeline.value) {
    return [{ label: startCase(form.pipelineType) }, { label: heading.value }];
  }
  const items: { label: string; routeName?: string; routeParams?: Record<string, string> }[] = [
    { label: categoryLabel.value, routeName: 'ingestion-services' },
  ];
  if (service.value) {
    items.push({
      label: service.value.name,
      routeName: 'ingestion-service',
      routeParams: { kind: form.serviceKind, id: form.serviceId },
    });
  }
  items.push({ label: heading.value });
  return items;
});

const serviceType = computed(() => service.value?.serviceType ?? '');
/** Pin `getServiceType(category)`: the doc panel's `serviceType` is the category word. */
const docPanelServiceType = computed(() => getDocPanelServiceType(form.serviceKind));
const supportsIncremental = computed(() =>
  Boolean(service.value?.connection?.config?.supportsIncrementalMetadataExtraction),
);
const supportsAutoPartition = computed(() =>
  Boolean(service.value?.connection?.config?.supportsAutoPartitionDetection),
);

/**
 * Pin `useEntityPermissions(INGESTION_PIPELINE)` + `PermissionDerivation`:
 * EditOwners prioritized over EditAll, revoked when deleted. The fork
 * reads the same permission endpoint through the permission store; a
 * missing or failed fetch fails closed (read-only owners).
 */
const canEditOwners = computed(() => {
  if (!pipelineOps.value) {
    return false;
  }
  return getDerivedPermissionFlags(
    pipelineOps.value,
    pipeline.value?.deleted ?? false,
  ).can('EditOwners');
});
/** Read-only mode shows the SAVED owners, never the seeded fallbacks (pin). */
const effectiveOwners = computed(() =>
  canEditOwners.value ? owners.value : (pipeline.value?.owners ?? []),
);
const ownersRequired = computed(() => !settingsPipeline.value && canEditOwners.value);

const ingestionName = computed(
  () => form.displayName?.trim() || pipeline.value?.displayName || pipeline.value?.name || '',
);
const viewServiceText = computed(() =>
  settingsPipeline.value
    ? t('ingestion.pipelines.viewPipelineDetails')
    : t('ingestion.pipelines.viewService'),
);
const airflowAvailable = computed(() => orchestrator.value?.code === 200);

function serviceKindFromRef(type: string | undefined): ServiceKind {
  return (type && SERVICE_KIND_BY_ENTITY_TYPE[type]) || 'database';
}

function backToDetail(): void {
  void router.push({ name: 'ingestion-pipeline', params: { id: props.id } });
}

/** Step-1 Back / View Service: the service's Agents tab in pin; the fork
 * has no Agents-tab deep link, so this lands on the service page. */
function goToService(): void {
  if (settingsPipeline.value || !form.serviceId) {
    backToDetail();
    return;
  }
  void router.push({
    name: 'ingestion-service',
    params: { kind: form.serviceKind, id: form.serviceId },
  });
}

async function load(): Promise<void> {
  loading.value = true;
  errorMessage.value = '';
  schemaFormReady.value = false;
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
    // The whole service is kept: owners seed the fallback, the
    // connection flags gate workflow fields, and the breadcrumb shows
    // the service name. A failed service fetch leaves the saved owners
    // (then the current user) as the fallback.
    if (current.service?.id) {
      const getter = SERVICE_GET_API[kind];
      const fetched = await getter(current.service.id).catch(() => null);
      service.value = fetched;
      serviceOwners.value = fetched?.owners ?? [];
    }
    owners.value = effectiveOwnersForPipeline({
      savedOwners: current.owners,
      serviceOwners: serviceOwners.value,
      currentUser: authStore.user,
    });
    pipelineOps.value = current.fullyQualifiedName
      ? await permissionStore
          .getEntityPermissionByFqn('ingestionPipeline', current.fullyQualifiedName)
          .catch(() => null)
      : null;
    sourceSchema.value = await getSchemaByWorkflowType(
      form.pipelineType as PipelineType,
      SERVICE_CATEGORY_BY_KIND[kind],
      service.value?.serviceType,
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

function scheduleDeployModalClose(): void {
  clearTimeout(deployModalTimer);
  deployModalTimer = setTimeout(() => {
    deployModalOpen.value = false;
  }, 500);
}

/** One deploy attempt: probe the orchestrator, deploy when available.
 * Returns false when the deploy was skipped or failed; the update
 * stands either way and the success screen offers a retry. */
async function attemptDeploy(): Promise<boolean> {
  orchestrator.value = await getOrchestratorStatus().catch(() => null);
  orchestratorChecked.value = true;
  if (orchestrator.value?.code !== 200) {
    message.warning(t('ingestion.pipelines.deploySkippedAirflowUnavailable'));
    showDeployButton.value = true;
    return false;
  }
  try {
    const result = await deployIngestionPipeline(props.id);
    if (isPipelineClientDisabled(result) || (result.code !== undefined && result.code !== 200)) {
      message.error(t('ingestion.pipelines.deployEntityError'));
      deployAction.value = IngestionActionMessage.DeployingError;
      showDeployButton.value = true;
      return false;
    }
    return true;
  } catch {
    message.error(t('ingestion.pipelines.deployEntityError'));
    deployAction.value = IngestionActionMessage.DeployingError;
    showDeployButton.value = true;
    return false;
  }
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
  deployAction.value = IngestionActionMessage.Updating;
  if (!pipeline.value.deployed) {
    deployProgress.value = DEPLOY_PROGRESS_START;
  }
  deployModalOpen.value = true;
  try {
    // The patch base is the loaded pipeline spread whole, and the
    // sourceConfig is built from the schema form's data — which starts
    // from the SAVED config on edit, so `compare` only emits ops for
    // fields this form actually changed. Unmodelled sourceConfig keys
    // (notably `excludes`) survive because they are in the form data
    // from the start, not because the server keeps them: a rebuild
    // from the form's fields alone would emit `remove` ops for every
    // saved key the form never saw. Without EditOwners the `owners`
    // key is omitted entirely, so no `/owners` patch op is emitted.
    const updated: IngestionPipeline = {
      ...pipeline.value,
      displayName: form.displayName?.trim() || undefined,
      ...(canEditOwners.value ? { owners: owners.value } : {}),
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
    deployProgress.value = DEPLOY_PROGRESS_END;
    deployAction.value = IngestionActionMessage.Deploying;
    if (await attemptDeploy()) {
      deployProgress.value = DEPLOY_PROGRESS_DEPLOYED;
      deployAction.value = IngestionActionMessage.Deployed;
      showDeployButton.value = false;
    }
    step.value = 2;
    scheduleDeployModalClose();
  } catch (error) {
    deployModalOpen.value = false;
    message.error(error instanceof Error ? error.message : t('crud.updateFailed'));
  } finally {
    saving.value = false;
  }
}

async function handleDeployClick(): Promise<void> {
  if (!pipeline.value) {
    return;
  }
  deployAction.value = IngestionActionMessage.Deploying;
  deployProgress.value = DEPLOY_PROGRESS_END;
  deployModalOpen.value = true;
  if (await attemptDeploy()) {
    deployProgress.value = DEPLOY_PROGRESS_DEPLOYED;
    deployAction.value = IngestionActionMessage.Deployed;
    showDeployButton.value = false;
  }
  scheduleDeployModalClose();
}

onMounted(() => {
  void load();
});

onUnmounted(() => {
  clearTimeout(deployModalTimer);
});
</script>

<template>
  <PageLayout>
    <SmBreadcrumb :items="breadcrumbs" />
    <PageHeader :header="heading" />
    <Spin :spinning="loading">
      <SmState
        v-if="errorMessage"
        state="error"
        test-id="edit-pipeline-error"
        :error-text="errorMessage"
      />
      <template v-else-if="pipeline">
        <div style="display: flex; gap: 16px; align-items: flex-start">
          <div style="flex: 1; min-width: 0">
            <Steps :current="step" data-testid="edit-pipeline-steps" style="margin-bottom: 24px">
              <Steps.Step v-for="item in steps" :key="item.title" :title="item.title" />
            </Steps>
            <div v-if="step === 0" data-testid="edit-pipeline-step-configure">
              <Form layout="vertical">
                <Card data-testid="ingestion-name-card" style="margin-bottom: 16px">
                  <h3 style="margin: 0 0 4px">{{ t('ingestion.pipelines.nameThisIngestion') }}</h3>
                  <p style="margin: 0">
                    {{ t('ingestion.pipelines.nameThisIngestionDescription') }}
                  </p>
                  <Divider />
                  <Form.Item
                    :label="t('crud.name')"
                    required
                    :validate-status="!(form.displayName ?? '').trim() ? 'error' : undefined"
                    :help="
                      !(form.displayName ?? '').trim()
                        ? t('crud.fieldRequired', { field: t('crud.name') })
                        : undefined
                    "
                  >
                    <Input
                      v-model:value="form.displayName"
                      :placeholder="t('crud.name')"
                      data-testid="ingestion-display-name"
                      @focus="handleFieldFocus('displayName')"
                      @blur="handleFieldBlur"
                    />
                  </Form.Item>
                  <fieldset data-testid="ingestion-owners-field" style="border: none; padding: 0; margin: 0">
                    <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px">
                      <label>{{ t('ingestion.pipelines.owners') }}</label>
                      <span v-if="ownersRequired" style="color: var(--sm-color-error)">*</span>
                      <Tooltip
                        v-if="canEditOwners"
                        :title="
                          owners.length
                            ? t('ingestion.pipelines.editOwners')
                            : t('ingestion.pipelines.addOwners')
                        "
                      >
                        <Button
                          type="text"
                          size="small"
                          :data-testid="owners.length ? 'edit-owner' : 'add-owner'"
                          @click="ownersPickerOpen = true"
                        >
                          <EditOutlined v-if="owners.length" />
                          <PlusOutlined v-else />
                        </Button>
                      </Tooltip>
                    </div>
                    <div data-testid="ingestion-owners" style="display: flex; gap: 8px; flex-wrap: wrap">
                      <Tag v-for="owner in effectiveOwners" :key="owner.id">
                        {{ owner.displayName || owner.name }}
                      </Tag>
                    </div>
                    <p
                      v-if="ownersRequired && ownersInvalid"
                      data-testid="owners-error"
                      style="color: var(--sm-color-error); margin: 4px 0 0"
                    >
                      {{
                        t('crud.fieldRequiredPlural', {
                          field: t('ingestion.pipelines.owners'),
                        })
                      }}
                    </p>
                  </fieldset>
                </Card>
                <SchemaDrivenSourceConfigForm
                  v-if="sourceSchema"
                  :key="`${form.serviceKind}-${form.pipelineType}`"
                  ref="schemaFormRef"
                  :schema="sourceSchema"
                  v-model="form.sourceConfigData"
                  v-model:debug-log="form.debugLog"
                  :pipeline-type="form.pipelineType as PipelineType"
                  :supports-incremental="supportsIncremental"
                  :supports-auto-partition="supportsAutoPartition"
                  :on-field-focus="handleFieldFocus"
                  :on-field-blur="handleFieldBlur"
                  @validity-change="(valid) => (schemaFormValid = valid)"
                  @ready="schemaFormReady = true"
                />
              </Form>
            </div>
            <div v-if="step === 1" data-testid="edit-pipeline-step-schedule">
              <Form layout="vertical">
                <ScheduleIntervalField
                  :model-value="form.scheduleInterval || undefined"
                  :disabled="form.pipelineType === 'dataInsight'"
                  test-id-prefix="edit-pipeline-schedule"
                  @validity-change="(valid) => (scheduleValid = valid)"
                  @update:model-value="(value) => (form.scheduleInterval = value ?? '')"
                />
                <p
                  v-if="scheduleError"
                  data-testid="edit-pipeline-schedule-error"
                  style="color: var(--sm-color-error); margin: 4px 0 0"
                >
                  {{ scheduleError }}
                </p>
                <Form.Item :label="t('ingestion.pipelines.numberOfRetries')">
                  <InputNumber
                    v-model:value="form.retries"
                    :min="0"
                    data-testid="edit-pipeline-retries"
                    @focus="handleFieldFocus('root/retries')"
                    @blur="handleFieldBlur"
                  />
                </Form.Item>
                <ToggleField
                  :model-value="form.raiseOnError ?? true"
                  :label="t('ingestion.pipelines.raiseOnError')"
                  field-id="raiseOnError"
                  test-id="edit-pipeline-raise-on-error"
                  @update:model-value="(next) => (form.raiseOnError = next)"
                  @focus="handleFieldFocus('raiseOnError')"
                />
              </Form>
            </div>
            <div
              v-if="step === 2"
              data-testid="success-screen-container"
              style="display: flex; flex-direction: column; gap: 16px"
            >
              <AirflowMessageBanner
                :status="orchestrator"
                :checked="orchestratorChecked"
                :disabled-message="t('ingestion.pipelines.orchestratorDisabled')"
                :unreachable-message="t('ingestion.pipelines.orchestratorUnreachable')"
              />
              <p data-testid="success-line" style="margin: 0">
                "{{ ingestionName }}"{{
                  t(
                    showDeployButton
                      ? 'ingestion.pipelines.actionDoneDeployFailed'
                      : 'ingestion.pipelines.actionDoneDeployed',
                    { action: t('ingestion.pipelines.updatedLowercase') },
                  )
                }}
              </p>
              <div style="display: flex; gap: 8px">
                <Button
                  type="primary"
                  data-testid="view-service-button"
                  @click="goToService()"
                >
                  {{ viewServiceText }}
                </Button>
                <Button
                  v-if="showDeployButton"
                  data-testid="deploy-ingestion-button"
                  :disabled="!airflowAvailable"
                  @click="handleDeployClick"
                >
                  {{ t('ingestion.pipelines.deploy') }}
                </Button>
              </div>
            </div>
            <div v-if="step <= 1" style="margin-top: 24px; display: flex; gap: 8px">
              <Button data-testid="edit-pipeline-back" @click="step === 0 ? goToService() : (step = 0)">
                {{ t('ingestion.pipelines.editBack') }}
              </Button>
              <Button
                v-if="step === 0"
                type="primary"
                data-testid="edit-pipeline-next"
                :disabled="!schemaFormReady"
                @click="validateStep1() && (step = 1)"
              >
                {{ t('ingestion.pipelines.editNext') }}
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
          </div>
          <div v-if="serviceType" style="min-width: 400px; flex: 0.3">
            <ServiceDocPanel
              :service-name="serviceType"
              :service-type="docPanelServiceType"
              :active-field="activeField"
              :active-field-meta="activeFieldMeta"
              is-workflow
              :workflow-type="form.pipelineType"
            />
          </div>
        </div>
      </template>
    </Spin>
    <Modal
      v-model:open="ownersPickerOpen"
      :footer="null"
      :title="t('ingestion.pipelines.owners')"
      @cancel="ownersPickerOpen = false"
    >
      <div data-testid="owners-picker-modal">
        <UserTeamPicker
          v-model="owners"
          :candidates="[...serviceOwners, ...owners]"
          @update:model-value="ownersInvalid = false"
        />
        <div style="display: flex; justify-content: flex-end; margin-top: 16px">
          <Button data-testid="owners-picker-done" @click="ownersPickerOpen = false">
            {{ t('crud.close') }}
          </Button>
        </div>
      </div>
    </Modal>
    <Modal
      :open="deployModalOpen"
      :width="520"
      :closable="false"
      :mask-closable="false"
      :keyboard="false"
      :footer="null"
    >
      <div data-testid="deploy-modal">
        <Progress :percent="deployProgress" />
        <p data-testid="body-text" style="margin: 12px 0 0">
          {{ deployAction }} “{{ ingestionName }}”
        </p>
      </div>
    </Modal>
  </PageLayout>
</template>
