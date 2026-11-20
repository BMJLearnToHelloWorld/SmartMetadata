<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { Alert, Spin } from 'ant-design-vue';
import { getPipelineServiceHostIp } from '@/api/ingestionPipelines';
import AirflowMessageBanner from '@/components/ingestion/AirflowMessageBanner.vue';
import ConnectionSchemaPrompt from '@/components/ingestion/ConnectionSchemaPrompt.vue';
import ServiceConnectionFields from '@/components/ingestion/ServiceConnectionFields.vue';
import TestConnectionCard from '@/components/ingestion/TestConnectionCard.vue';
import { connectionBodyIsEmpty } from '@/ingestion/connectionCoverage';
import {
  mergeAuthBranchIntoConfig,
  missingRequiredConnectionFields,
} from '@/ingestion/connectionFields';
import { buildServiceConnection } from '@/ingestion/connections';
import { shouldTestConnection } from '@/ingestion/connectionTest';
import type { FetchConnectionSchema } from '@/ingestion/connectionSchemaLoader';
import { useConnectionGuard } from '@/ingestion/useConnectionGuard';
import type { FieldFocusMeta } from '@/ingestion/fieldFocus';
import type {
  OrchestratorStatus,
  ServiceConnectionConfig,
  ServiceFormValues,
  ServiceKind,
} from '@/types/ingestion';

/**
 * Port of official ConnectionConfigForm (pin a3012259ca,
 * components/Settings/Services/ServiceConfig/ConnectionConfigForm.tsx)
 * as the shared connection-form contract for the wizard (§5.4) and
 * the edit page (§6.5). The pin renders an RJSF schema-driven form;
 * the product renders the existing static field table
 * (ServiceConnectionFields) — the field-content对照 is U-1, and the
 * form area / gating / prompt / banner / IP-alert / test-connection
 * contract here is the pin's, with the T-2 guard as the deliberate,
 * documented safety deviation where the pin leaves submit enabled on
 * an empty schema.
 *
 * The four additional props are the pin interface's optional props
 * with the pin defaults (count 0, pending false, parent flag false,
 * absent callback reads as valid). The imperative handle exposes
 * `submit` and `isSubmitDisabled` as the pin does, plus
 * `connectionSubmitBlocked` for the T-2 dual enforcement (the
 * caller's button reads it; `submit` asserts it). The pin's
 * hideFooter prop has no product meaning — this form never renders
 * its own footer — so it is not accepted.
 *
 * Filter-pattern fields DO appear here when the pin keeps them in the
 * connection form: pin's `getFilteredSchema` excludes only the 19 known
 * filter fields (SERVICE_FILTER_PATTERN_FIELDS), so Collibra's
 * glossary/domain filter patterns render in the Scope section here
 * while the standalone filter step edits the same keys.
 */
const props = withDefaults(
  defineProps<{
    kind: ServiceKind;
    serviceType: string;
    form: ServiceFormValues;
    storedConfig?: ServiceConnectionConfig;
    serviceName?: string;
    additionalMissingFieldsCount?: number;
    isSubmitDisabled?: boolean;
    isAdditionalValidationPending?: boolean;
    onValidateAdditionalRequiredFields?: () => boolean;
    airflowStatus?: OrchestratorStatus | null;
    airflowChecked?: boolean;
    disabled?: boolean;
    fetchSchema?: FetchConnectionSchema;
  }>(),
  {
    storedConfig: undefined,
    serviceName: '',
    additionalMissingFieldsCount: 0,
    isSubmitDisabled: false,
    isAdditionalValidationPending: false,
    onValidateAdditionalRequiredFields: undefined,
    airflowStatus: null,
    airflowChecked: false,
    disabled: false,
    fetchSchema: undefined,
  },
);

const emit = defineEmits<{
  save: [config: ServiceConnectionConfig];
  'test-connection-status-change': [verified: boolean];
  focus: [fieldId: string, meta: FieldFocusMeta];
  blur: [];
}>();

const { t } = useI18n();

const guard = useConnectionGuard(
  () => props.kind,
  () => props.serviceType,
  props.fetchSchema,
);
const { schemaState, decision } = guard;

const connectionSubmitBlocked = computed(() => guard.connectionSubmitBlocked.value);
// Out-of-universe pairs (llm/mcp) have no guard decision: the form
// passes through with its existing behavior — static fields, test
// connection, and IP alert all render as before (C-2 reserved
// surface; the guard never applies there).
const isPassThrough = computed(() => decision.value === null);
const showStaticForm = computed(
  () =>
    isPassThrough.value ||
    decision.value?.formArea === 'static-form' ||
    decision.value?.formArea === 'schema-form',
);
// Five A-class rows are covered since the 2026-11-19 A2 ruling, so
// `schema-form` is reachable for them; it renders the static form like
// `static-form` until the schema-driven renderer lands under U-1.

const schemaPresent = computed(() => schemaState.value === 'present' || isPassThrough.value);

const missingRequiredCount = computed(() =>
  schemaPresent.value
    ? missingRequiredConnectionFields(
        props.serviceType,
        props.form,
        props.storedConfig === undefined,
      )
    : 0,
);

/** Pin isSubmitDisabled memo: parent flag first, empty schema false, else missing > 0. */
const isSubmitDisabled = computed(() => {
  if (props.isSubmitDisabled) {
    return true;
  }
  if (!schemaPresent.value) {
    return false;
  }
  return missingRequiredCount.value > 0;
});

const airflowAvailable = computed(
  () =>
    props.airflowChecked &&
    props.airflowStatus?.code === 200 &&
    props.airflowStatus?.platform !== 'disabled',
);

const hostIp = ref<string | undefined>(undefined);

async function fetchHostIp(): Promise<void> {
  try {
    const data = await getPipelineServiceHostIp();
    hostIp.value = data === undefined ? undefined : data.ip || '[unknown]';
  } catch {
    hostIp.value = '[error - unknown]';
  }
}

watch(
  airflowAvailable,
  (available) => {
    if (available) {
      void fetchHostIp();
    }
  },
  { immediate: true },
);

/** Pin shouldShowIPAlert: schema non-empty + airflow + host IP + non-hybrid. */
const shouldShowIPAlert = computed(
  () =>
    schemaPresent.value &&
    airflowAvailable.value &&
    hostIp.value !== undefined &&
    props.airflowStatus?.platform !== 'Hybrid',
);

/** Pin shouldShowTestConnection: schema non-empty + shouldTestConnection + !disabled. */
const shouldShowTestConnection = computed(
  () => schemaPresent.value && shouldTestConnection(props.serviceType) && !props.disabled,
);

function testConnectionGetter(): Record<string, unknown> | undefined {
  try {
    const connection = buildServiceConnection(props.form);
    if (!connection?.config) {
      return undefined;
    }
    mergeAuthBranchIntoConfig(props.serviceType, props.form, connection.config, props.storedConfig);
    return connection as unknown as Record<string, unknown>;
  } catch {
    return undefined;
  }
}

/** Pin handleRequiredFieldsValidation: form validity ∧ additional callback. */
function validateRequiredFields(): boolean {
  const isFormValid = missingRequiredCount.value === 0;
  const isAdditionalValid = props.onValidateAdditionalRequiredFields?.() ?? true;
  return isFormValid && isAdditionalValid;
}

function submit(): boolean {
  // T-2 handler assertion: the second enforcement point. The first
  // is the caller's disabled button reading connectionSubmitBlocked.
  if (connectionSubmitBlocked.value) {
    return false;
  }
  if (isSubmitDisabled.value) {
    return false;
  }
  const connection = buildServiceConnection(props.form);
  if (!connection) {
    return false;
  }
  const config = connection.config;
  if (!config) {
    return false;
  }
  mergeAuthBranchIntoConfig(props.serviceType, props.form, config, props.storedConfig);
  // Q4 payload defense: an empty or type-only body is never a new
  // connection, even when the required set is empty.
  if (connectionBodyIsEmpty(config as Record<string, unknown>)) {
    return false;
  }
  emit('save', config);
  return true;
}

// `guardDecision` lets the edit page branch on the guard area without
// re-deriving it: prompt and load-failure areas advance with the stored
// connection kept (Q2a; the pin advances with an empty merge on schema
// load failure), the loader area does not submit. The wizard never reads
// it — its Next button is disabled by connectionSubmitBlocked.
defineExpose({ submit, isSubmitDisabled, connectionSubmitBlocked, guardDecision: guard.decision });
</script>

<template>
  <div class="connection-config-form">
    <AirflowMessageBanner
      :status="props.airflowStatus"
      :checked="props.airflowChecked"
      :disabled-message="t('settings.services.pipeline.disabledFallback')"
      :unreachable-message="t('settings.services.pipeline.unreachableFallback')"
    />
    <div
      v-if="schemaState === 'loading'"
      data-testid="connection-schema-loader"
      class="connection-config-form__loader"
    >
      <Spin size="small" />
    </div>
    <template v-else-if="showStaticForm">
      <ServiceConnectionFields
        :form="props.form"
        :stored-config="props.storedConfig"
        @focus="(fieldId, meta) => emit('focus', fieldId, meta)"
        @blur="emit('blur')"
      />
      <Alert
        v-if="shouldShowIPAlert"
        type="info"
        show-icon
        data-testid="ip-address"
        :message="t('settings.services.connectionForm.pipelineServerIpAddress')"
        :description="
          t('settings.services.connectionForm.airflowHostIpAddress', {
            brandName: t('product.name'),
            hostIp,
          })
        "
        style="margin: 16px 0"
      />
      <TestConnectionCard
        v-if="shouldShowTestConnection"
        :connection-type="props.serviceType"
        :kind="props.kind"
        :service-name="props.serviceName"
        :get-connection="testConnectionGetter"
        :airflow-available="airflowAvailable"
        :host-ip="hostIp"
        :missing-required-fields-count="
          missingRequiredCount + props.additionalMissingFieldsCount
        "
        :is-form-validation-pending="props.isAdditionalValidationPending"
        :on-validate-form-required-fields="validateRequiredFields"
        @status-change="emit('test-connection-status-change', $event)"
      />
    </template>
    <ConnectionSchemaPrompt
      v-else-if="decision"
      :area="
        decision.formArea === 'load-failed'
          ? 'load-failed'
          : decision.formArea === 'no-config'
            ? 'no-config'
            : 'read-only-prompt'
      "
      :uncovered-class="guard.coverage.value?.uncoveredClass"
    />
  </div>
</template>

<style scoped>
.connection-config-form__loader {
  display: flex;
  justify-content: center;
  padding: 40px 0;
}
</style>
