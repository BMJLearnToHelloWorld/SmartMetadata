<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { Alert, Button, Form, Input, Select, Steps, message } from 'ant-design-vue';
import { getOrchestratorStatus } from '@/api/ingestionPipelines';
import { SERVICE_CATEGORIES } from '@/catalog/ingestionTabs';
import { isServiceListKind } from '@/router/serviceTabSegments';
import ServiceConnectionFields from '@/components/ingestion/ServiceConnectionFields.vue';
import TestConnectionCard from '@/components/ingestion/TestConnectionCard.vue';
import SchemaField, { type FilterPatternFieldOptions } from '@/components/ingestion/SchemaField.vue';
import {
  serviceFilterFieldsForType,
  type ServiceFilterFieldDef,
  type ServiceFilterValues,
} from '@/ingestion/serviceFilterFields';
import type { FilterPatternConfig } from '@/ingestion/filterPatterns';
import { addSnowflakeSystemExcludes } from '@/ingestion/filterPatterns';
import type { RjsfSchema } from '@/ingestion/ingestionSchemas';
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
import {
  connectionDisplayHost,
  filterPatternDefaultExcludes,
  hasConnectionForm,
  mergeAuthBranchIntoConfig,
  missingRequiredConnectionFields,
} from '@/ingestion/connectionFields';
import { shouldTestConnection } from '@/ingestion/connectionTest';
import { SERVICE_CREATE_API } from '@/ingestion/serviceApis';
import type { OrchestratorStatus, ServiceFormValues, ServiceKind } from '@/types/ingestion';

const { t } = useI18n();
const router = useRouter();
const step = ref(0);
const creating = ref(false);
const form = reactive<ServiceFormValues>(createEmptyServiceForm());
const filterForm = reactive<ServiceFilterValues>({});
const filterFields = computed(() => serviceFilterFieldsForType(form.kind, form.serviceType));
const filterErrors = new Map<string, string>();
const testConnectionPassed = ref(false);
const orchestrator = ref<OrchestratorStatus | null>(null);
const orchestratorChecked = ref(false);

const airflowAvailable = computed(
  () =>
    orchestratorChecked.value &&
    orchestrator.value?.code === 200 &&
    orchestrator.value?.platform !== 'disabled',
);

const missingRequiredCount = computed(() =>
  missingRequiredConnectionFields(form.serviceType, form),
);

function validateRequiredFields(): boolean {
  return missingRequiredCount.value === 0;
}

function testConnectionGetter(): Record<string, unknown> | undefined {
  try {
    const connection = buildServiceConnection(form);
    if (!connection?.config) {
      return undefined;
    }
    mergeAuthBranchIntoConfig(form.serviceType, form, connection.config, undefined);
    return connection as unknown as Record<string, unknown>;
  } catch {
    return undefined;
  }
}

const connectedHost = computed(() => {
  const tested = testConnectionGetter();
  const config = tested?.config as Record<string, unknown> | undefined;
  return connectionDisplayHost(config ?? {}, form.serviceType);
});

onMounted(() => {
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

/**
 * One minimal filter-pattern schema per declared field, rendered by
 * SchemaField as a FilterPatternCard composer (pin's step 3 renders
 * `FilterPatternField`, the same composer, via `FiltersConfigForm`).
 * The control keys off the object shape (exactly `includes` +
 * `excludes` string arrays), so no connection schema is needed to
 * render it; the label is the field's translated name. The composer
 * itself is the Issue-4 (D-L6) shared component — the wizard renders
 * it here because pin's step 3 does, which crosses the D-L3
 * payload-only boundary in effect; the wizard built no composer of
 * its own.
 *
 * Card options are pin's `FiltersConfigForm` uiSchema: the first two
 * cards start open, `hasExistingData` is false on a fresh create, and
 * the system excludes are the schema defaults (plus the Snowflake
 * sample-database rule) — the card seeds them into a fresh field's
 * state, and they reach the stored config on the first user edit.
 */
const filterSchemas = computed(() =>
  filterFields.value.map((field, index) => ({
    field,
    schema: {
      type: 'object',
      title: t(field.labelKey),
      properties: {
        includes: { type: 'array', items: { type: 'string' } },
        excludes: { type: 'array', items: { type: 'string' } },
      },
    } satisfies RjsfSchema,
    options: {
      defaultOpen: index < 2,
      hasExistingData: false,
      systemExcludes: addSnowflakeSystemExcludes(
        form.serviceType,
        field.key,
        [...filterPatternDefaultExcludes(form.serviceType, field.key)],
      ),
    } satisfies FilterPatternFieldOptions,
  })),
);

// C-2: the wizard offers only kinds with a §4.3 list segment. llm/mcp
// creation is removed (no list tab, no wizard choice); the shared
// SERVICE_CATEGORIES table is untouched — the staged services list
// keeps its kind Tabs — and existing llm/mcp services remain
// editable through their detail pages.
const supportedCategories = computed(() =>
  SERVICE_CATEGORIES.filter((row) => row.supported && isServiceListKind(row.key)),
);
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

/**
 * Filter scope belongs to the selected (kind, type): a pattern entered
 * for one type may be undeclared on another's connection schema, so a
 * kind or type change drops everything entered rather than carrying it
 * into a config that cannot legally hold it. Pin remounts the filter
 * form when the field set changes (its form key is the field list);
 * this is the same reset, stated directly.
 */
function resetFilterForm(): void {
  for (const key of Object.keys(filterForm) as Array<keyof ServiceFilterValues>) {
    delete filterForm[key];
  }
}

function onKindChange(kind: ServiceKind): void {
  form.kind = kind;
  form.serviceType = SERVICE_KIND_DEFAULT_TYPE[kind];
  resetFilterForm();
}

function onServiceTypeChange(serviceType: string): void {
  form.serviceType = serviceType;
  resetFilterForm();
}

function setFilterValue(field: ServiceFilterFieldDef, value: unknown): void {
  if (value === undefined) {
    delete filterForm[field.key];
  } else {
    filterForm[field.key] = value as FilterPatternConfig;
  }
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
 * `getDefaultFilterPropertyValues`). Only entered scope is carried —
 * a field whose includes and excludes are both empty stores nothing —
 * so a plain service create stores no filter keys at all.
 *
 * D-L3: the carried scope is exactly the declared `*FilterPattern`
 * objects, as in pin's `FiltersConfigForm` — each entered field merges
 * as `{includes, excludes}`, the shape pin's `buildPatternFromState`
 * emits. The merge iterates the selected type's declared fields only,
 * so no key outside that set can reach `connection.config`: the flat
 * keys the old wizard wrote (`includeSchemas`, `includeViews`,
 * `generateSampleData`) are undeclared on every connection schema and
 * the server rejects them on encrypt. `includeViews` belongs on the
 * pipeline form only, where the schema-driven form renders it.
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
  for (const field of filterFields.value) {
    const pattern = filterForm[field.key];
    const includes = pattern?.includes ?? [];
    const excludes = pattern?.excludes ?? [];
    if (includes.length > 0 || excludes.length > 0) {
      values[field.key] = { includes, excludes };
    }
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
    if (connection?.config) {
      mergeAuthBranchIntoConfig(form.serviceType, form, connection.config, undefined);
    }
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
          <Select :value="form.serviceType" data-testid="wizard-service-type" @update:value="(value) => onServiceTypeChange(value as string)">
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
      <TestConnectionCard
        v-if="!connectionFormMissing && shouldTestConnection(form.serviceType)"
        :connection-type="form.serviceType"
        :kind="form.kind"
        :service-name="form.name"
        :get-connection="testConnectionGetter"
        :airflow-available="airflowAvailable"
        :missing-required-fields-count="missingRequiredCount"
        :on-validate-form-required-fields="validateRequiredFields"
        @status-change="testConnectionPassed = $event"
      />
    </div>

    <div v-if="step === 2" data-testid="wizard-step-filter">
      <!-- Pin threads the test status into the filters step's connected
           message (AddServicePage); the message keys are shared with the
           edit page, as pin uses one message pair for both pages. -->
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
          t('ingestion.services.editConnectionPage.connectionVerifiedScope')
        "
        data-testid="wizard-connected"
        style="margin-bottom: 16px"
      />
      <Form layout="vertical">
        <SchemaField
          v-for="entry in filterSchemas"
          :key="entry.field.key"
          :schema="entry.schema"
          :value="filterForm[entry.field.key]"
          :path="[entry.field.key]"
          :root-schema="entry.schema"
          :errors="filterErrors"
          :show-errors="false"
          test-id-prefix="wizard-filter"
          :filter-pattern-options="entry.options"
          @update:value="(value) => setFilterValue(entry.field, value)"
        />
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
