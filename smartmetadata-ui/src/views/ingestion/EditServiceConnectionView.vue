<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { compare } from 'fast-json-patch';
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { Alert, Button, Form, Input, Spin, Typography, message } from 'ant-design-vue';
import { getOrchestratorStatus, getPipelineServiceHostIp } from '@/api/ingestionPipelines';
import { SERVICE_CATEGORIES } from '@/catalog/ingestionTabs';
import AirflowMessageBanner from '@/components/ingestion/AirflowMessageBanner.vue';
import FilterPatternCard from '@/components/ingestion/FilterPatternCard.vue';
import NavigationGuardModal from '@/components/ingestion/NavigationGuardModal.vue';
import ServiceConnectionFields from '@/components/ingestion/ServiceConnectionFields.vue';
import ServiceDocPanel from '@/components/ingestion/ServiceDocPanel.vue';
import ServiceFlowStepper from '@/components/ingestion/ServiceFlowStepper.vue';
import TestConnectionCard from '@/components/ingestion/TestConnectionCard.vue';
import PageHeader from '@/components/shared/PageHeader.vue';
import PageLayout from '@/components/shared/PageLayout.vue';
import SmBreadcrumb from '@/components/shared/SmBreadcrumb.vue';
import SmState from '@/components/shared/SmState.vue';
import { useNavigationGuard } from '@/composables/useNavigationGuard';
import {
  buildServiceConnection,
  createEmptyServiceForm,
  formValuesFromService,
  SERVICE_TYPES_BY_KIND,
} from '@/ingestion/connections';
import {
  connectionDisplayHost,
  filterPatternDefaultExcludes,
  filterPatternSchemaMeta,
  hasConnectionForm,
  hydrateAuthBranchForm,
  mergeAuthBranchIntoConfig,
  missingRequiredConnectionFields,
} from '@/ingestion/connectionFields';
import { shouldTestConnection } from '@/ingestion/connectionTest';
import { getDocPanelServiceType, useFieldFocus } from '@/ingestion/fieldFocus';
import {
  addSnowflakeSystemExcludes,
  type FilterPatternConfig,
} from '@/ingestion/filterPatterns';
import { SERVICE_GET_API, SERVICE_UPDATE_API } from '@/ingestion/serviceApis';
import { serviceFilterFieldsForType } from '@/ingestion/serviceFilterFields';
import type {
  CatalogService,
  OrchestratorStatus,
  ServiceConnection,
  ServiceConnectionConfig,
  ServiceFormValues,
  ServiceKind,
} from '@/types/ingestion';

const props = defineProps<{ kind: string; id: string }>();
const { t } = useI18n();
const router = useRouter();

const kind = (Object.keys(SERVICE_TYPES_BY_KIND) as ServiceKind[]).includes(
  props.kind as ServiceKind,
)
  ? (props.kind as ServiceKind)
  : 'database';

const loading = ref(false);
const errorMessage = ref('');
const saving = ref(false);
const service = ref<CatalogService | null>(null);
const form = reactive<ServiceFormValues>(createEmptyServiceForm());
const filterForm = reactive<Record<string, FilterPatternConfig>>({});
const currentStep = ref(1);
const testConnectionPassed = ref(false);
const showBackStepConfirm = ref(false);
const leaving = ref(false);
const orchestrator = ref<OrchestratorStatus | null>(null);
const orchestratorChecked = ref(false);
const pristinePayload = ref<object | null>(null);
const pristineFailed = ref(false);
const formRef = ref<{ validate: () => Promise<unknown> } | null>(null);

const { activeField, activeFieldMeta, handleFieldFocus, handleFieldBlur } =
  useFieldFocus();

const storedConfig = computed<ServiceConnectionConfig | undefined>(
  () => service.value?.connection?.config,
);

const filterFields = computed(() =>
  service.value
    ? serviceFilterFieldsForType(kind, service.value.serviceType)
    : [],
);

const heading = computed(() =>
  service.value
    ? t('ingestion.services.editConnectionPage.heading', {
        entity: service.value.fullyQualifiedName,
      })
    : '',
);

const breadcrumbItems = computed(() => {
  if (!service.value) {
    return [];
  }
  const category = SERVICE_CATEGORIES.find((row) => row.key === kind);
  return [
    {
      label: category ? t(category.labelKey) : kind,
      routeName: 'ingestion-services',
    },
    {
      label: service.value.displayName || service.value.name,
      routeName: 'ingestion-service',
      routeParams: { kind: props.kind, id: props.id },
    },
    { label: t('ingestion.services.editConnectionPage.breadcrumb') },
  ];
});

const stepperSteps = computed(() => [
  {
    name: t('ingestion.services.editConnectionPage.stepConnectionDetails'),
    step: 1,
  },
  {
    name: t('ingestion.services.editConnectionPage.stepSetDefaultFilters'),
    step: 2,
  },
]);

const airflowAvailable = computed(
  () =>
    orchestratorChecked.value &&
    orchestrator.value?.code === 200 &&
    orchestrator.value?.platform !== 'disabled',
);

const hostIp = ref<string | undefined>(undefined);

/**
 * Pin `ConnectionConfigForm.fetchHostIp` + `shouldShowIPAlert`: the
 * host IP is fetched once Airflow is available. An empty body (HTTP
 * 204, IP info disabled server-side) means no IP to show; a body
 * without an IP and any fetch failure keep pin's placeholders. The
 * runner clause of pin's predicate is inert here: `ingestionRunner`
 * is form data pin reads from the connection form, and no connection
 * schema declares it, so the Hybrid check alone decides. The schema
 * clause is the fork's `hasConnectionForm` — pin requires a
 * non-empty connection schema. The fork's `airflowAvailable` also
 * excludes the disabled platform, where the banner (not an
 * `[unknown]` IP alert) is the fork's answer.
 */
async function fetchHostIp(): Promise<void> {
  try {
    const data = await getPipelineServiceHostIp();
    hostIp.value = data === undefined ? undefined : data.ip || '[unknown]';
  } catch {
    hostIp.value = '[error - unknown]';
  }
}

watch(airflowAvailable, (available) => {
  if (available) {
    void fetchHostIp();
  }
});

const shouldShowIPAlert = computed(
  () =>
    service.value !== null &&
    hasConnectionForm(service.value.serviceType) &&
    airflowAvailable.value &&
    hostIp.value !== undefined &&
    orchestrator.value?.platform !== 'Hybrid',
);

const missingRequiredCount = computed(() =>
  service.value
    ? missingRequiredConnectionFields(service.value.serviceType, form)
    : 0,
);

function validateRequiredFields(): boolean {
  return missingRequiredCount.value === 0;
}

function buildCurrentPayload(): {
  name: string;
  serviceType: string;
  displayName: string | undefined;
  description: string | undefined;
  connection: ServiceConnection | undefined;
} {
  const connection = buildServiceConnection(form, service.value?.connection);
  if (connection?.config && service.value) {
    mergeAuthBranchIntoConfig(
      service.value.serviceType,
      form,
      connection.config,
      storedConfig.value,
    );
    for (const field of filterFields.value) {
      const pattern = filterForm[field.key];
      if (pattern !== undefined) {
        connection.config[field.key] = {
          includes: [...(pattern.includes ?? [])],
          excludes: [...(pattern.excludes ?? [])],
        };
      }
    }
  }
  return {
    name: service.value!.name,
    serviceType: service.value!.serviceType,
    displayName: form.displayName?.trim() || undefined,
    description: form.description?.trim() || undefined,
    connection,
  };
}

function normalizePayload(value: unknown): object {
  return JSON.parse(JSON.stringify(value)) as object;
}

function testConnectionGetter(): Record<string, unknown> | undefined {
  try {
    const connection = buildServiceConnection(form, service.value?.connection);
    if (!connection?.config || !service.value) {
      return undefined;
    }
    mergeAuthBranchIntoConfig(
      service.value.serviceType,
      form,
      connection.config,
      storedConfig.value,
    );
    return connection as unknown as Record<string, unknown>;
  } catch {
    return undefined;
  }
}

const connectedHost = computed(() => {
  if (!service.value) {
    return '';
  }
  const tested = testConnectionGetter();
  const config = tested?.config ?? storedConfig.value;
  return connectionDisplayHost(
    (config ?? {}) as Record<string, unknown>,
    service.value.serviceType,
  );
});

function systemExcludesFor(fieldName: string): string[] {
  if (!service.value) {
    return [];
  }
  return addSnowflakeSystemExcludes(
    service.value.serviceType,
    fieldName,
    [...filterPatternDefaultExcludes(service.value.serviceType, fieldName)],
  );
}

function hasStoredFilter(fieldName: string): boolean {
  return storedConfig.value !== undefined && fieldName in storedConfig.value;
}

function setFilterValue(fieldName: string, value: FilterPatternConfig): void {
  filterForm[fieldName] = value;
}

function onFilterFocus(fieldName: string, focusedName: string): void {
  if (!focusedName) {
    handleFieldBlur();
    return;
  }
  const meta = filterPatternSchemaMeta(fieldName);
  handleFieldFocus(`root/${fieldName}`, {
    title: meta?.title,
    description: meta?.description,
    section: 'scope',
  });
}

function onIdentityFocus(fieldName: string): void {
  handleFieldFocus(`root/${fieldName}`, {
    title:
      fieldName === 'serviceName'
        ? t('crud.displayName')
        : t('crud.description'),
    description:
      fieldName === 'serviceName'
        ? t('crud.displayNameHelp')
        : t('crud.descriptionHelp'),
  });
}

const isDirty = computed(() => {
  if (!service.value) {
    return false;
  }
  if (pristineFailed.value) {
    return true;
  }
  try {
    return (
      pristinePayload.value !== null &&
      compare(pristinePayload.value, normalizePayload(buildCurrentPayload()))
        .length > 0
    );
  } catch {
    return true;
  }
});

const {
  showModal: showGuardModal,
  confirmLeave,
  cancelLeave,
} = useNavigationGuard({
  enabled: () => !leaving.value && !saving.value && isDirty.value,
});

function initFilterForm(): void {
  for (const key of Object.keys(filterForm)) {
    delete filterForm[key];
  }
  const config = storedConfig.value as Record<string, unknown> | undefined;
  if (!config) {
    return;
  }
  for (const field of filterFields.value) {
    const stored = config[field.key];
    if (stored && typeof stored === 'object' && !Array.isArray(stored)) {
      const record = stored as Record<string, unknown>;
      filterForm[field.key] = {
        includes: Array.isArray(record.includes)
          ? record.includes.filter(
              (value): value is string => typeof value === 'string',
            )
          : [],
        excludes: Array.isArray(record.excludes)
          ? record.excludes.filter(
              (value): value is string => typeof value === 'string',
            )
          : [],
      };
    }
  }
}

function capturePristine(): void {
  try {
    pristinePayload.value = normalizePayload(buildCurrentPayload());
    pristineFailed.value = false;
  } catch {
    pristinePayload.value = null;
    pristineFailed.value = true;
  }
}

async function load(): Promise<void> {
  loading.value = true;
  errorMessage.value = '';
  try {
    service.value = await SERVICE_GET_API[kind](props.id);
    Object.assign(form, formValuesFromService(service.value));
    hydrateAuthBranchForm(
      service.value.serviceType,
      service.value.connection?.config ?? {},
      form,
    );
    initFilterForm();
    capturePristine();
  } catch (error) {
    service.value = null;
    errorMessage.value =
      error instanceof Error ? error.message : t('crud.loadFailed');
  } finally {
    loading.value = false;
  }
}

function detailTarget() {
  return {
    name: 'ingestion-service',
    params: { kind: props.kind, id: props.id },
  };
}

function onBack(): void {
  if (currentStep.value === 2) {
    showBackStepConfirm.value = true;
    return;
  }
  void router.push(detailTarget());
}

function confirmBackStep(): void {
  showBackStepConfirm.value = false;
  currentStep.value = 1;
}

async function onNext(): Promise<void> {
  try {
    await formRef.value?.validate();
  } catch {
    return;
  }
  currentStep.value = 2;
}

async function onSave(): Promise<void> {
  if (!service.value || saving.value) {
    return;
  }
  saving.value = true;
  try {
    const payload = buildCurrentPayload();
    const normalized = normalizePayload(payload);
    if (
      !pristineFailed.value &&
      pristinePayload.value !== null &&
      compare(pristinePayload.value, normalized).length === 0
    ) {
      leaving.value = true;
      await router.push(detailTarget());
      return;
    }
    await SERVICE_UPDATE_API[kind](payload);
    message.success(t('ingestion.services.updated'));
    leaving.value = true;
    await router.push(detailTarget());
  } catch (error) {
    message.error(
      error instanceof Error ? error.message : t('crud.updateFailed'),
    );
  } finally {
    saving.value = false;
  }
}

onMounted(() => {
  void load();
  getOrchestratorStatus()
    .then((status) => {
      orchestrator.value = status;
    })
    .catch(() => {
      orchestrator.value = null;
    })
    .finally(() => {
      orchestratorChecked.value = true;
    });
});
</script>

<template>
  <PageLayout>
    <SmBreadcrumb :items="breadcrumbItems" />
    <PageHeader :header="heading" />
    <ServiceFlowStepper :steps="stepperSteps" :active-step="currentStep" />
    <div class="edit-connection-layout">
      <div class="edit-connection-main">
        <Spin :spinning="loading">
          <SmState
            v-if="errorMessage"
            state="error"
            test-id="edit-connection-error"
            :error-text="errorMessage"
          />
          <template v-else-if="service">
            <div
              v-if="currentStep === 1"
              data-testid="edit-connection-step-connection"
            >
              <AirflowMessageBanner
                :status="orchestrator"
                :checked="orchestratorChecked"
                :disabled-message="t('ingestion.pipelines.orchestratorDisabled')"
                :unreachable-message="
                  t('ingestion.pipelines.orchestratorUnreachable')
                "
              />
              <Form
                ref="formRef"
                layout="vertical"
                :model="form"
                data-testid="edit-connection-form"
              >
                <Form.Item
                  :label="t('crud.displayName')"
                  :extra="t('crud.displayNameHelp')"
                  name="displayName"
                >
                  <Input
                    v-model:value="form.displayName"
                    data-testid="edit-connection-display-name"
                    @focus="onIdentityFocus('serviceName')"
                    @blur="handleFieldBlur"
                  />
                </Form.Item>
                <Form.Item
                  :label="t('crud.description')"
                  :extra="t('crud.descriptionHelp')"
                  name="description"
                >
                  <Input.TextArea
                    v-model:value="form.description"
                    :rows="3"
                    data-testid="edit-connection-description"
                    @focus="onIdentityFocus('serviceDescription')"
                    @blur="handleFieldBlur"
                  />
                </Form.Item>
                <ServiceConnectionFields
                  :form="form"
                  :stored-config="storedConfig"
                  @focus="handleFieldFocus"
                  @blur="handleFieldBlur"
                />
              </Form>
              <Alert
                v-if="!hasConnectionForm(service.serviceType)"
                type="warning"
                show-icon
                data-testid="edit-connection-no-form"
                :message="t('ingestion.services.wizard.noConnectionForm')"
                style="margin: 16px 0"
              />
              <Alert
                v-if="shouldShowIPAlert"
                type="info"
                show-icon
                data-testid="ip-address"
                :message="t('ingestion.services.editConnectionPage.pipelineServerIpAddress')"
                :description="
                  t('ingestion.services.editConnectionPage.airflowHostIpAddress', {
                    brandName: t('product.name'),
                    hostIp,
                  })
                "
                style="margin: 16px 0"
              />
              <TestConnectionCard
                v-if="
                  hasConnectionForm(service.serviceType) &&
                  shouldTestConnection(service.serviceType)
                "
                :connection-type="service.serviceType"
                :kind="kind"
                :service-name="service.name"
                :get-connection="testConnectionGetter"
                :airflow-available="airflowAvailable"
                :host-ip="hostIp"
                :missing-required-fields-count="missingRequiredCount"
                :on-validate-form-required-fields="validateRequiredFields"
                @status-change="testConnectionPassed = $event"
              />
            </div>
            <div v-else data-testid="edit-connection-step-filters">
              <Typography.Title :level="4">
                {{ t('ingestion.services.editConnectionPage.whatToIngest') }}
              </Typography.Title>
              <Typography.Paragraph type="secondary">
                {{
                  t(
                    'ingestion.services.editConnectionPage.whatToIngestDescription',
                    { brandName: t('product.name') },
                  )
                }}
              </Typography.Paragraph>
              <Alert
                v-if="testConnectionPassed"
                type="success"
                show-icon
                :message="
                  t('ingestion.services.editConnectionPage.connectedToHost', {
                    host: connectedHost,
                  })
                "
                :description="
                  t(
                    'ingestion.services.editConnectionPage.connectionVerifiedScope',
                  )
                "
                data-testid="edit-connection-connected"
              />
              <template v-if="filterFields.length > 0">
                <FilterPatternCard
                  v-for="(field, index) in filterFields"
                  :key="field.key"
                  :field-name="field.key"
                  :model-value="filterForm[field.key]"
                  :schema-title="filterPatternSchemaMeta(field.key)?.title"
                  :default-open="index < 2"
                  :system-excludes="systemExcludesFor(field.key)"
                  :has-existing-data="hasStoredFilter(field.key)"
                  @update:model-value="setFilterValue(field.key, $event)"
                  @focus="onFilterFocus(field.key, $event)"
                />
              </template>
              <Typography.Paragraph v-else data-testid="no-config-available">
                {{ t('forms.filter.noPatternsAvailable') }}
              </Typography.Paragraph>
            </div>
            <div class="edit-connection-footer">
              <Button
                data-testid="edit-connection-back"
                :disabled="saving"
                @click="onBack"
              >
                {{ t('crud.back') }}
              </Button>
              <Button
                v-if="currentStep === 1"
                type="primary"
                data-testid="edit-connection-next"
                @click="onNext"
              >
                {{ t('ingestion.services.editConnectionPage.next') }}
              </Button>
              <Button
                v-else
                type="primary"
                :loading="saving"
                data-testid="edit-connection-save"
                @click="onSave"
              >
                {{ t('crud.save') }}
              </Button>
            </div>
          </template>
        </Spin>
      </div>
      <ServiceDocPanel
        v-if="service?.serviceType"
        class="edit-connection-docs"
        :service-name="service.serviceType"
        :service-type="getDocPanelServiceType(kind)"
        :active-field="activeField"
        :active-field-meta="activeFieldMeta"
      />
    </div>
    <NavigationGuardModal
      :open="showGuardModal"
      @leave="confirmLeave"
      @stay="cancelLeave"
    />
    <NavigationGuardModal
      :open="showBackStepConfirm"
      test-id="navigation-guard-back-step-modal"
      @leave="confirmBackStep"
      @stay="showBackStepConfirm = false"
    />
  </PageLayout>
</template>

<style scoped>
.edit-connection-layout {
  display: flex;
  gap: 24px;
  align-items: flex-start;
}

.edit-connection-main {
  flex: 1;
  min-width: 0;
}

.edit-connection-docs {
  flex: 0.3;
  min-width: 400px;
}

.edit-connection-footer {
  display: flex;
  justify-content: space-between;
  margin-top: 24px;
}

@media (max-width: 900px) {
  .edit-connection-layout {
    flex-direction: column;
  }

  .edit-connection-docs {
    min-width: 0;
    width: 100%;
  }
}
</style>
