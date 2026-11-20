<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { Button, Spin, message } from 'ant-design-vue';
import { ApiError } from '@/api/client';
import { getOrchestratorStatus } from '@/api/ingestionPipelines';
import { patchService } from '@/api/serviceLookup';
import { SERVICE_COLLECTION_BY_KIND } from '@/api/serviceVersions';
import { SERVICE_CATEGORIES } from '@/catalog/ingestionTabs';
import ConnectionConfigForm from '@/components/ingestion/ConnectionConfigForm.vue';
import FiltersConfigForm from '@/components/ingestion/FiltersConfigForm.vue';
import NavigationGuardModal from '@/components/ingestion/NavigationGuardModal.vue';
import ServiceDocPanel from '@/components/ingestion/ServiceDocPanel.vue';
import ServiceFlowStepper from '@/components/ingestion/ServiceFlowStepper.vue';
import ServiceLogo from '@/components/ingestion/ServiceLogo.vue';
import PageHeader from '@/components/shared/PageHeader.vue';
import PageLayout from '@/components/shared/PageLayout.vue';
import SmBreadcrumb from '@/components/shared/SmBreadcrumb.vue';
import SomethingWentWrongPlaceholder from '@/components/shared/SomethingWentWrongPlaceholder.vue';
import { useNavigationGuard } from '@/composables/useNavigationGuard';
import {
  connectionDisplayHost,
  hydrateAuthBranchForm,
} from '@/ingestion/connectionFields';
import {
  createEmptyServiceForm,
  formValuesFromService,
  SERVICE_TYPES_BY_KIND,
} from '@/ingestion/connections';
import { getDocPanelServiceType, useFieldFocus } from '@/ingestion/fieldFocus';
import type { FilterPatternConfig } from '@/ingestion/filterPatterns';
import { SERVICE_GET_API } from '@/ingestion/serviceApis';
import {
  buildEditPatch,
  getEditConfigData,
  mergeEditConfig,
} from '@/ingestion/serviceEditMerge';
import type {
  CatalogService,
  OrchestratorStatus,
  ServiceConnectionConfig,
  ServiceFormValues,
  ServiceKind,
} from '@/types/ingestion';

const props = defineProps<{ kind: string; id: string }>();
const { t } = useI18n();
const router = useRouter();

// D-11: no kind fallback. An unknown kind never fetches and lands in the
// error state, like the pin's fetch-failure error state.
const kind: ServiceKind | undefined = (
  Object.keys(SERVICE_TYPES_BY_KIND) as ServiceKind[]
).includes(props.kind as ServiceKind)
  ? (props.kind as ServiceKind)
  : undefined;

const loading = ref(true);
const isError = ref(false);
const saving = ref(false);
const leaving = ref(false);
const service = ref<CatalogService | null>(null);
// Step-1 merged entity (pin `serviceConfig` state); undefined until the
// connection form saves, and stays undefined on the keep-existing path.
const serviceConfig = ref<CatalogService | undefined>(undefined);
const form = reactive<ServiceFormValues>(createEmptyServiceForm());
const currentStep = ref(1);
const testConnectionPassed = ref(false);
const showBackStepConfirm = ref(false);
const orchestrator = ref<OrchestratorStatus | null>(null);
const orchestratorChecked = ref(false);

const connectionFormRef = ref<InstanceType<typeof ConnectionConfigForm> | null>(
  null,
);
const filtersFormRef = ref<InstanceType<typeof FiltersConfigForm> | null>(null);

const { activeField, activeFieldMeta, handleFieldFocus, handleFieldBlur } =
  useFieldFocus();

const storedConfig = computed<ServiceConnectionConfig | undefined>(
  () => service.value?.connection?.config,
);

const heading = computed(() =>
  service.value
    ? t('settings.services.edit.heading', {
        entity: service.value.fullyQualifiedName,
      })
    : '',
);

const breadcrumbItems = computed(() => {
  if (!service.value || isError.value) {
    return [];
  }
  const category = SERVICE_CATEGORIES.find((row) => row.key === kind);
  return [
    {
      label: category ? t(category.labelKey) : (kind ?? props.kind),
      routeName: 'connections',
    },
    {
      label: service.value.displayName || service.value.name,
      routeName: 'ingestion-service',
      routeParams: { kind: props.kind, id: props.id },
    },
    { label: t('settings.services.edit.breadcrumb') },
  ];
});

const stepperSteps = computed(() => [
  {
    name: t('settings.services.edit.stepConnectionDetails'),
    step: 1,
  },
  {
    name: t('settings.services.edit.stepSetDefaultFilters'),
    step: 2,
  },
]);

// Pin getEntityMissingError (EntityDisplayPureUtils.tsx:94-96): "{Capitalize
// (entityType)} instance for {fqn} not found", where entityType is the
// service-category enum value. The address is the fetched FQN when known
// (OpenMetadata guard), otherwise the id that was fetched.
const missingEntityMessage = computed(() => {
  const enumValue = kind ? SERVICE_COLLECTION_BY_KIND[kind] : props.kind;
  const entity = enumValue.charAt(0).toUpperCase() + enumValue.slice(1);
  return t('settings.services.edit.entityMissing', {
    entity,
    fqn: service.value?.fullyQualifiedName ?? props.id,
  });
});

const connectedHost = computed(() => {
  if (!service.value) {
    return '';
  }
  return connectionDisplayHost(
    serviceConfig.value?.connection?.config ?? storedConfig.value ?? {},
    service.value.serviceType,
  );
});

function detailTarget() {
  return {
    name: 'ingestion-service',
    params: { kind: props.kind, id: props.id },
  };
}

// Pin isLeaving effect (EditConnectionFormPage.tsx:226-235): the empty-patch
// path leaves through this watcher, not through an inline navigation.
watch(leaving, (value) => {
  if (value) {
    void router.push(detailTarget());
  }
});

// Pin NavigationBlocker (EditConnectionFormPage.tsx:404-419): enabled
// whenever not saving and not leaving — NOT a dirty gate. The dirty
// machinery (isDirty/pristinePayload) is deleted with the guard change.
const {
  showModal: showGuardModal,
  confirmLeave,
  cancelLeave,
} = useNavigationGuard({
  enabled: () => !saving.value && !leaving.value,
});

async function load(): Promise<void> {
  loading.value = true;
  isError.value = false;
  if (!kind) {
    isError.value = true;
    loading.value = false;
    return;
  }
  try {
    const fetched = await SERVICE_GET_API[kind](props.id);
    service.value = fetched;
    // Post-fetch OpenMetadata guard: the pin guards pre-fetch on the FQN
    // route param (EditConnectionFormPage.tsx:92-107); the product fetches
    // by id, so the FQN is only known after the fetch. The resulting error
    // state is identical. Transitional until FQN addressing (§8.2).
    if (fetched.fullyQualifiedName === 'OpenMetadata') {
      isError.value = true;
      return;
    }
    Object.assign(form, formValuesFromService(fetched));
    hydrateAuthBranchForm(
      fetched.serviceType,
      fetched.connection?.config ?? {},
      form,
    );
  } catch (error) {
    service.value = null;
    // Pin fetch split (EditConnectionFormPage.tsx:191-222): 404 enters the
    // error state; any other failure toasts and the page renders its empty
    // shell (header/stepper/footer, no forms).
    if (error instanceof ApiError && error.status === 404) {
      isError.value = true;
    } else {
      message.error(error instanceof Error ? error.message : t('crud.loadFailed'));
    }
  } finally {
    loading.value = false;
  }
}

function onBack(): void {
  if (currentStep.value === 2) {
    showBackStepConfirm.value = true;
    return;
  }
  // Pin cancel (EditConnectionFormPage.tsx:237-239): history back, not a
  // fixed detail-route push.
  router.back();
}

function confirmBackStep(): void {
  showBackStepConfirm.value = false;
  currentStep.value = 1;
}

function onNext(): void {
  if (!service.value) {
    return;
  }
  const formRef = connectionFormRef.value;
  if (!formRef) {
    return;
  }
  // The guard decision branches without re-deriving it. The loader area
  // never submits; prompt and load-failure areas advance with the stored
  // connection kept (Q2a — the pin advances with an empty merge on schema
  // load failure, which is the same merged outcome); form areas submit.
  const area = formRef.guardDecision?.formArea;
  if (area === 'loader') {
    return;
  }
  if (
    area === 'load-failed' ||
    area === 'no-config' ||
    area === 'read-only-prompt'
  ) {
    serviceConfig.value = undefined;
    currentStep.value = 2;
    return;
  }
  formRef.submit();
}

function handleConfigSave(config: ServiceConnectionConfig): void {
  if (!service.value) {
    return;
  }
  serviceConfig.value = getEditConfigData(service.value, config);
  currentStep.value = 2;
}

function onSave(): void {
  filtersFormRef.value?.submit();
}

async function handleFiltersSave(
  values: Record<string, FilterPatternConfig>,
): Promise<void> {
  if (!service.value || !kind) {
    return;
  }
  const original = service.value;
  // Pin handleFiltersSave (EditConnectionFormPage.tsx:136-155): three-way
  // config merge, then a whole-entity rebuild over the fetched entity.
  const configData: CatalogService = {
    ...original,
    ...(serviceConfig.value ?? {}),
    connection: {
      config: mergeEditConfig(
        original.connection?.config,
        serviceConfig.value?.connection?.config,
        values,
      ),
    },
  };
  // No Q4 payload defense here: the merged config derives from the STORED
  // config, which is authoritative, and the shared form's submit already
  // refuses type-only NEW bodies. Refusing a type-only merged config would
  // break keep-existing saves for no-config types (whose stored config IS
  // type-only); the empty-patch path below is the correct no-change
  // handling, exactly as in the pin.
  const patch = buildEditPatch(original, configData);
  if (patch.length === 0) {
    // Pin empty-patch path (:160-164): no request, leave via the watcher.
    leaving.value = true;
    return;
  }
  saving.value = true;
  try {
    const response = await patchService(kind, original.id, patch);
    // Pin owners fallback (:173-183): the patched response may omit
    // owners; fall back to the fetched entity's owners. No success toast.
    serviceConfig.value = {
      ...response,
      owners: response.owners ?? original.owners,
    };
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
    <div v-if="loading" class="edit-connection-loading">
      <Spin size="large" />
    </div>
    <SomethingWentWrongPlaceholder
      v-else-if="isError"
      test-id="edit-connection-error"
      :title="t('settings.services.edit.somethingWentWrong')"
      :description="missingEntityMessage"
    />
    <template v-else>
      <div class="edit-connection-header">
        <ServiceLogo v-if="service" :source="service" :size="40" />
        <PageHeader test-id="header" :header="heading" />
      </div>
      <ServiceFlowStepper :steps="stepperSteps" :active-step="currentStep" />
      <div class="edit-connection-layout">
        <div class="edit-connection-main">
          <div
            v-if="currentStep === 1 && service && kind"
            data-testid="edit-connection-step-connection"
          >
            <ConnectionConfigForm
              ref="connectionFormRef"
              :kind="kind"
              :service-type="service.serviceType"
              :form="form"
              :stored-config="storedConfig"
              :service-name="service.name"
              :airflow-status="orchestrator"
              :airflow-checked="orchestratorChecked"
              @save="handleConfigSave"
              @test-connection-status-change="testConnectionPassed = $event"
              @focus="(fieldId, meta) => handleFieldFocus(fieldId, meta)"
              @blur="handleFieldBlur"
            />
          </div>
          <div
            v-if="currentStep === 2 && service && kind"
            data-testid="edit-connection-step-filters"
          >
            <!-- Named, reasoned deviation from pin (EditConnectionFormPage.tsx:383
              seeds the filter step from the STORED serviceDetails): when step 1
              changed a filter-pattern key (e.g. Collibra's
              glossaryFilterPattern), seeding from the stored config would show
              the stale value and silently overwrite the step-1 edit on save.
              Seed from the step-1 merged config when it exists (symmetric
              with the create wizard's step2Config seeding), falling back to
              the stored config on the keep-existing path. -->
            <FiltersConfigForm
              ref="filtersFormRef"
              :kind="kind"
              :service-type="service.serviceType"
              :initial-config="serviceConfig?.connection?.config ?? service.connection?.config"
              :show-connected-message="testConnectionPassed"
              :connected-host="connectedHost"
              @save="handleFiltersSave"
            />
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
              {{ t('crud.next') }}
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
        </div>
        <ServiceDocPanel
          v-if="service?.serviceType && kind"
          focused-mode
          class="edit-connection-docs"
          :service-name="service.serviceType"
          :service-type="getDocPanelServiceType(kind)"
          :active-field="activeField"
          :active-field-meta="activeFieldMeta"
        />
      </div>
    </template>
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
.edit-connection-loading {
  display: flex;
  justify-content: center;
  padding: 48px 0;
}

.edit-connection-header {
  display: flex;
  align-items: center;
  gap: 12px;
}

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
