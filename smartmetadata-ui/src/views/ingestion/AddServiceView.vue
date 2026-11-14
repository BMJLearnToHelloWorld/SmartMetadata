<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed, reactive, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { Alert, Button, Form, Input, Select, Steps, message } from 'ant-design-vue';
import { SERVICE_CATEGORIES } from '@/catalog/ingestionTabs';
import ServiceConnectionFields from '@/components/ingestion/ServiceConnectionFields.vue';
import ServiceFilterFields from '@/components/ingestion/ServiceFilterFields.vue';
import { serviceFilterFieldsForKind, type ServiceFilterValues } from '@/ingestion/serviceFilterFields';
import PageHeader from '@/components/shared/PageHeader.vue';
import PageLayout from '@/components/shared/PageLayout.vue';
import { triggerOnDemandApp } from '@/api/apps';
import {
  AUTO_PILOT_APP_NAME,
  isExcludedAutoPilotServiceType,
} from '@/ingestion/autoPilot';
import {
  SERVICE_KIND_DEFAULT_TYPE,
  SERVICE_TYPES_BY_KIND,
  buildServiceConnection,
  createEmptyServiceForm,
  entityTypeForKind,
} from '@/ingestion/connections';
import { getEntityFeedLink } from '@/utils/entityLink';
import { hasConnectionForm } from '@/ingestion/connectionFields';
import { SERVICE_CREATE_API } from '@/ingestion/serviceApis';
import type { ServiceFormValues, ServiceKind } from '@/types/ingestion';

const { t } = useI18n();
const router = useRouter();
const step = ref(0);
const creating = ref(false);
const form = reactive<ServiceFormValues>(createEmptyServiceForm());
const filterForm = reactive<ServiceFilterValues>({ includeViews: true });
const filterFields = computed(() => serviceFilterFieldsForKind(form.kind));

const supportedCategories = computed(() => SERVICE_CATEGORIES.filter((row) => row.supported));
const typeOptions = computed(() => SERVICE_TYPES_BY_KIND[form.kind]);
/**
 * A9 tightening: a service type with no connection form must not be
 * created with an undefined connection. The wizard still lists the type
 * (the service entity exists server-side), but the connection step shows
 * an explicit "no connection form" note and blocks Next/Create until a
 * formed type is chosen. Only the eight kinds' default types have forms
 * in this branch; their other types stay blocked, not invented.
 */
const connectionFormMissing = computed(() => !hasConnectionForm(form.serviceType));
const steps = computed(() => [
  { title: t('ingestion.services.wizard.stepType') },
  { title: t('ingestion.services.wizard.stepConnection') },
  { title: t('ingestion.services.wizard.stepFilter') },
]);

function onKindChange(kind: ServiceKind): void {
  form.kind = kind;
  form.serviceType = SERVICE_KIND_DEFAULT_TYPE[kind];
}

function onNext(): void {
  if (step.value < 2) {
    step.value += 1;
  }
}

function onBack(): void {
  if (step.value > 0) {
    step.value -= 1;
  }
}

/**
 * P-12: the wizard no longer creates a metadata pipeline with the
 * service — a pipeline the user did not ask for. The filter step is
 * still meaningful: entered scope is carried into the service create
 * request's `connection.config`, and the add-ingestion form prefills
 * its filter defaults from there (P-08(c),
 * `getDefaultFilterPropertyValues`). Only scope beyond the defaults is
 * carried (includeViews only when false, text fields only when
 * non-blank, generateSampleData only when true), so a plain service
 * create stores no filter keys at all.
 *
 * D-11 reconciliation (ADR:2026-11-14-autopilot-agents-ui-parity):
 * official parity overrides P-12's rationale FOR THE WIZARD PATH
 * ONLY, and only via the AutoPilot trigger below — the wizard still
 * makes no direct createIngestionPipeline call. Official's wizard
 * triggers AutoPilot after a successful create, and AutoPilot (not
 * the wizard) decides which agents to generate from the connection
 * flags. The filter-scope carrying above is unaffected.
 */
function enteredFilterValues(): Record<string, unknown> {
  const values: Record<string, unknown> = {};
  if (filterForm.includeViews === false) {
    values.includeViews = false;
  }
  for (const key of [
    'includeSchemas',
    'includeTopics',
    'includeDashboards',
    'includeCharts',
    'includeContainers',
  ] as const) {
    const value = filterForm[key]?.trim();
    if (value) {
      values[key] = value;
    }
  }
  if (filterForm.generateSampleData) {
    values.generateSampleData = true;
  }
  return values;
}

/**
 * Official AddServicePage.triggerTheAutoPilotApplication (pin
 * a3012259ca): the trigger failure is caught here and toasted, so
 * the caller still shows the triggered message and navigates — the
 * pin's own quirk, ported exactly (both toasts appear when the
 * trigger fails).
 */
async function triggerAutoPilotApplication(entityType: string, fqn?: string): Promise<void> {
  try {
    await triggerOnDemandApp(AUTO_PILOT_APP_NAME, {
      entityLink: getEntityFeedLink(entityType, fqn),
    });
  } catch (error) {
    message.error(error instanceof Error ? error.message : t('crud.loadFailed'));
  }
}

async function onCreate(): Promise<void> {
  if (connectionFormMissing.value) {
    message.error(t('ingestion.services.wizard.noConnectionForm'));
    return;
  }
  creating.value = true;
  try {
    const connection = buildServiceConnection(form);
    const filterValues = enteredFilterValues();
    const created = await SERVICE_CREATE_API[form.kind]({
      name: form.name.trim(),
      serviceType: form.serviceType,
      displayName: form.displayName?.trim() || undefined,
      description: form.description?.trim() || undefined,
      connection: connection
        ? {
            ...connection,
            config: { ...connection.config, ...filterValues },
          }
        : undefined,
    });
    // Official AddServicePage: after a successful create, every
    // service type except security triggers AutoPilot, then shows
    // the triggered message (5s — antd takes seconds, the pin's
    // 5000 is milliseconds) and navigates. Security services get no
    // trigger and no toast; the navigation is the confirmation.
    const entityType = entityTypeForKind(form.kind);
    if (!isExcludedAutoPilotServiceType(entityType)) {
      await triggerAutoPilotApplication(entityType, created.fullyQualifiedName);
      message.success(t('ingestion.agents.autoPilotTriggeredMessage'), 5);
    }
    await router.push({ name: 'ingestion-service', params: { kind: form.kind, id: created.id } });
  } catch (error) {
    message.error(error instanceof Error ? error.message : t('crud.createFailed'));
  } finally {
    creating.value = false;
  }
}
</script>

<template>
  <PageLayout>
    <PageHeader :header="t('ingestion.services.wizard.title')" :sub-header="t('ingestion.services.wizard.lead')" />
    <Steps :current="step" data-testid="add-service-steps" style="margin-bottom: 24px">
      <Steps.Step v-for="item in steps" :key="item.title" :title="item.title" />
    </Steps>

    <div v-if="step === 0" data-testid="wizard-step-type">
      <Form layout="vertical">
        <Form.Item :label="t('ingestion.services.kind')" required>
          <Select :value="form.kind" data-testid="wizard-service-kind" @update:value="(value) => onKindChange(value as ServiceKind)">
            <Select.Option v-for="row in supportedCategories" :key="row.key" :value="row.key">
              {{ t(row.labelKey) }}
            </Select.Option>
          </Select>
        </Form.Item>
        <Form.Item :label="t('crud.type')" required>
          <Select v-model:value="form.serviceType" data-testid="wizard-service-type">
            <Select.Option v-for="type in typeOptions" :key="type" :value="type">{{ type }}</Select.Option>
          </Select>
        </Form.Item>
      </Form>
    </div>

    <div v-if="step === 1" data-testid="wizard-step-connection">
      <Form layout="vertical">
        <Form.Item :label="t('crud.name')" required>
          <Input v-model:value="form.name" data-testid="wizard-service-name" />
        </Form.Item>
        <Form.Item :label="t('crud.displayName')" :extra="t('crud.displayNameHelp')">
          <Input v-model:value="form.displayName" data-testid="wizard-service-display-name" />
        </Form.Item>
        <Form.Item :label="t('crud.description')" :extra="t('crud.descriptionHelp')">
          <Input.TextArea v-model:value="form.description" :rows="3" data-testid="wizard-service-description" />
        </Form.Item>
        <ServiceConnectionFields :form="form" />
        <Alert
          v-if="connectionFormMissing"
          type="warning"
          show-icon
          data-testid="wizard-no-connection-form"
          :message="t('ingestion.services.wizard.noConnectionForm')"
          style="margin-top: 16px"
        />
      </Form>
      <Alert
        type="info"
        show-icon
        data-testid="wizard-test-connection-residual"
        :message="t('ingestion.services.wizard.testConnectionResidual')"
        style="margin-top: 16px"
      />
    </div>

    <div v-if="step === 2" data-testid="wizard-step-filter">
      <Form layout="vertical">
        <ServiceFilterFields :kind="form.kind" :values="filterForm" />
        <p v-if="!filterFields.length" data-testid="wizard-no-filter-patterns">
          {{ t('ingestion.pipelines.noFilterPatterns') }}
        </p>
      </Form>
      <Alert
        type="info"
        show-icon
        data-testid="wizard-filter-residual"
        :message="t('ingestion.services.wizard.filterResidual')"
        style="margin-top: 16px"
      />
    </div>

    <div style="margin-top: 24px; display: flex; gap: 8px">
      <Button v-if="step > 0" data-testid="wizard-back" @click="onBack">
        {{ t('crud.previous') }}
      </Button>
      <Button
        v-if="step < 2"
        type="primary"
        data-testid="wizard-next"
        :disabled="(step === 1 && !form.name.trim()) || (step === 1 && connectionFormMissing)"
        @click="onNext"
      >
        {{ step === 1 ? t('ingestion.services.wizard.nextFilter') : t('crud.next') }}
      </Button>
      <Button
        v-if="step === 2"
        type="primary"
        data-testid="wizard-create"
        :loading="creating"
        @click="onCreate"
      >
        {{ t('ingestion.services.wizard.createAndDeploy') }}
      </Button>
    </div>
  </PageLayout>
</template>
