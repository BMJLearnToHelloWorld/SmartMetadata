<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute, useRouter } from 'vue-router';
import { SERVICE_COLLECTION_BY_KIND } from '@/api/serviceVersions';
import { getServiceDetailsPath } from '@/utils/fqnPaths';
import { Button, message } from 'ant-design-vue';
import { getOrchestratorStatus } from '@/api/ingestionPipelines';
import { triggerOnDemandApp } from '@/api/apps';
import SmBreadcrumb from '@/components/shared/SmBreadcrumb.vue';
import PageHeader from '@/components/shared/PageHeader.vue';
import PageLayout from '@/components/shared/PageLayout.vue';
import ConnectionConfigForm from '@/components/ingestion/ConnectionConfigForm.vue';
import FiltersConfigForm from '@/components/ingestion/FiltersConfigForm.vue';
import NavigationGuardModal from '@/components/ingestion/NavigationGuardModal.vue';
import SelectServiceType from '@/components/ingestion/SelectServiceType.vue';
import ServiceDocPanel from '@/components/ingestion/ServiceDocPanel.vue';
import ServiceFlowStepper from '@/components/ingestion/ServiceFlowStepper.vue';
import ServiceLogo from '@/components/ingestion/ServiceLogo.vue';
import ServiceNameCard from '@/components/ingestion/ServiceNameCard.vue';
import { useNavigationGuard } from '@/composables/useNavigationGuard';
import { AUTO_PILOT_APP_NAME, isExcludedAutoPilotServiceType } from '@/ingestion/autoPilot';
import { createEmptyServiceForm, entityTypeForKind } from '@/ingestion/connections';
import { connectionDisplayHost } from '@/ingestion/connectionFields';
import { useFieldFocus } from '@/ingestion/fieldFocus';
import {
  resolveServiceCategoryParam,
  serviceCategoryByKind,
  type ServiceCategoryKind,
  type ServiceCategoryRow,
} from '@/ingestion/serviceCategories';
import { getValidatedServiceType } from '@/ingestion/wizardServiceTypes';
import { useServiceNameValidation } from '@/ingestion/serviceNameValidation';
import { SERVICE_CREATE_API } from '@/ingestion/serviceApis';
import { useAuthStore } from '@/stores/auth';
import type { FilterPatternConfig } from '@/ingestion/filterPatterns';
import type {
  OrchestratorStatus,
  ServiceConnectionConfig,
  ServiceFormValues,
} from '@/types/ingestion';
import { getEntityFeedLink } from '@/utils/entityLink';

/**
 * Port of official AddServicePage (pin a3012259ca,
 * pages/AddServicePage/AddServicePage.component.tsx): the
 * three-step create-service wizard. Step 1 picks the connector
 * (SelectServiceType grid); step 2 names the service and configures
 * the connection (ServiceNameCard + the shared ConnectionConfigForm
 * with the four additional props); step 3 scopes ingestion
 * (FiltersConfigForm). Category switches and cross-category card
 * clicks navigate; a deep-linked serviceType is validated and
 * preselects step 2.
 *
 * D-17: the route carries the category as the `:serviceCategory`
 * path parameter (pin ROUTES.ADD_SERVICE, `/:serviceCategory/add-service`;
 * a ServiceCategory enum value or the 'all' sentinel). The retired
 * `?category=` query form is gone with the old route — the param is
 * always present, so no query fallback remains. An unresolvable value
 * falls back to `all` here; rejecting llm/mcp/invalid segments with
 * NOT_FOUND is the router line's D-18 work, requested in the batch
 * report.
 */
const { t } = useI18n();
const route = useRoute();
const router = useRouter();
const auth = useAuthStore();

const form = reactive<ServiceFormValues>(createEmptyServiceForm());
const step = ref(1);
const saving = ref(false);
const leaving = ref(false);
const isConnectionVerified = ref(false);
const step2Config = ref<ServiceConnectionConfig | undefined>(undefined);
const showResetConfirm = ref(false);
const showBackStepConfirm = ref(false);
const orchestrator = ref<OrchestratorStatus | null>(null);
const orchestratorChecked = ref(false);

const connectionFormRef = ref<InstanceType<typeof ConnectionConfigForm> | null>(null);
const filtersFormRef = ref<InstanceType<typeof FiltersConfigForm> | null>(null);

const { activeField, activeFieldMeta, handleFieldBlur, handleFieldFocus, resetActiveField } =
  useFieldFocus();

const rawCategoryParam = computed(
  () => route.params.serviceCategory as string | undefined,
);

const resolvedCategory = computed<ServiceCategoryRow | 'all' | undefined>(() =>
  resolveServiceCategoryParam(rawCategoryParam.value),
);

/** The effective wizard category: unresolved values fall back to `all` (interim, see above). */
const wizardCategory = computed<ServiceCategoryRow | 'all'>(() => resolvedCategory.value ?? 'all');
const wizardKind = computed<ServiceCategoryKind | undefined>(() =>
  wizardCategory.value === 'all' ? undefined : wizardCategory.value.kind,
);

const {
  isServiceNameChecking,
  nameError,
  resetNameValidation,
  setNameError,
  validateServiceName,
} = useServiceNameValidation({
  enabled: () => step.value === 2 && form.serviceType !== '',
  serviceCategory: () => form.kind,
  serviceName: () => form.name,
});

const isStep2NextDisabled = computed(
  () => !form.name.trim() || Boolean(nameError.value) || isServiceNameChecking.value,
);

const isConnectionSubmitBlocked = computed(
  () => connectionFormRef.value?.connectionSubmitBlocked === true,
);

const connectedHost = computed(() =>
  connectionDisplayHost(step2Config.value ?? {}, form.serviceType),
);

const steps = computed(() => [
  {
    name: t('settings.services.wizard.selectField', {
      field: t('settings.services.wizard.serviceType'),
    }),
    step: 1,
  },
  { name: t('settings.services.wizard.stepConnect'), step: 2 },
  { name: t('settings.services.wizard.stepWhatToIngest'), step: 3 },
]);

const breadcrumbItems = computed(() => {
  const addNewService = t('settings.services.wizard.addNewService');
  if (form.serviceType) {
    return [{ label: addNewService }, { label: form.serviceType }];
  }
  const categoryLabel =
    wizardCategory.value === 'all'
      ? t('settings.services.wizard.allServices')
      : t(wizardCategory.value.titleKey);
  return [{ label: categoryLabel, routeName: 'connections' }, { label: addNewService }];
});

const headerText = computed(() =>
  form.serviceType
    ? `${form.serviceType} ${t('settings.services.service')}`
    : t('settings.services.wizard.addNewService'),
);

const hideSecondPanel = computed(() => !(form.serviceType && (step.value === 2 || step.value === 3)));

const { showModal, confirmLeave, cancelLeave } = useNavigationGuard({
  enabled: () => step.value > 1 && !saving.value && !leaving.value,
});

function resetWizardState(): void {
  const fresh = createEmptyServiceForm();
  for (const key of Object.keys(form) as Array<keyof ServiceFormValues>) {
    delete form[key];
  }
  Object.assign(form, fresh);
  form.kind = wizardKind.value ?? 'database';
  // The empty form carries the legacy default connector; the pin
  // starts with no type selected.
  form.serviceType = '';
  step2Config.value = undefined;
  isConnectionVerified.value = false;
  resetNameValidation();
  resetActiveField();
  step.value = 1;
}

/**
 * Pin deep-link rule: a state serviceType is admitted only when the
 * URL category supports it; a preselected type starts the wizard at
 * step 2. Runs on mount and on every category navigation (the
 * interim query-based navigation reuses this component, so the
 * sync is a watcher, not a mount-only effect).
 */
function syncFromRoute(): void {
  resetWizardState();
  if (!wizardKind.value) {
    return;
  }
  const preselected = getValidatedServiceType(
    router.options.history.state,
    wizardKind.value,
  );
  if (preselected) {
    form.serviceType = preselected;
    step.value = 2;
  }
}

watch(rawCategoryParam, syncFromRoute, { immediate: true });

function navigateToCategory(category: ServiceCategoryRow | 'all', serviceType?: string): void {
  // D-17: a category switch navigates (pin AddServicePage: cross-category
  // clicks navigate to that category's own add-service path).
  const serviceCategory = category === 'all' ? 'all' : category.enumValue;
  void router.push({
    name: 'ingestion-service-add',
    params: { serviceCategory },
    state: serviceType ? { serviceType } : undefined,
  });
}

function handleCategoryChange(category: ServiceCategoryKind | 'all'): void {
  if (category === 'all') {
    navigateToCategory('all');
    return;
  }
  const row = serviceCategoryByKind(category);
  if (row) {
    navigateToCategory(row);
  }
}

function handleServiceTypeClick(payload: { category: ServiceCategoryKind; type: string }): void {
  // Cross-category (including every click from the `all` grid):
  // continue in that category's own wizard with the connector
  // deep-linked, as the pin does.
  if (wizardCategory.value === 'all' || payload.category !== wizardKind.value) {
    const row = serviceCategoryByKind(payload.category);
    if (row) {
      navigateToCategory(row, payload.type);
    }
    return;
  }
  resetNameValidation();
  isConnectionVerified.value = false;
  const fresh = createEmptyServiceForm();
  for (const key of Object.keys(form) as Array<keyof ServiceFormValues>) {
    delete form[key];
  }
  Object.assign(form, fresh);
  form.kind = payload.category;
  form.serviceType = payload.type;
  step.value = 2;
}

function handleConnectorChangeClick(): void {
  resetWizardState();
}

function handleNameCardFocus(field: 'serviceName' | 'serviceDescription'): void {
  handleFieldFocus(field);
}

function validateAdditionalRequiredFields(): boolean {
  if (!form.name.trim()) {
    setNameError(
      t('settings.services.fieldTextRequired', {
        fieldText: t('settings.services.wizard.serviceName'),
      }),
    );
    document.getElementById('service-name')?.focus();
    return false;
  }
  if (nameError.value || isServiceNameChecking.value) {
    document.getElementById('service-name')?.focus();
    return false;
  }
  return true;
}

async function handleConfigUpdate(config: ServiceConnectionConfig): Promise<void> {
  form.name = form.name.trim();
  const valid = await validateServiceName();
  if (!valid) {
    return;
  }
  step2Config.value = config;
  step.value = 3;
}

function handleResetConfirmLeave(): void {
  showResetConfirm.value = false;
  handleConnectorChangeClick();
}

function handleFooterBack(): void {
  showBackStepConfirm.value = true;
}

function handleConfirmedStepBack(): void {
  showBackStepConfirm.value = false;
  if (step.value === 2) {
    handleConnectorChangeClick();
  } else {
    step.value = 2;
  }
}

function handleFooterNext(): void {
  if (step.value === 2) {
    connectionFormRef.value?.submit();
  } else {
    filtersFormRef.value?.submit();
  }
}

/**
 * Official AddServicePage.triggerTheAutoPilotApplication: the
 * trigger failure is caught here and toasted, so the caller still
 * shows the triggered message and navigates — the pin's own quirk.
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

async function handleFiltersSave(filterValues: Record<string, FilterPatternConfig>): Promise<void> {
  saving.value = true;
  let createdFqn: string | undefined;
  try {
    const userId = auth.user?.id;
    const created = await SERVICE_CREATE_API[form.kind]({
      name: form.name.trim(),
      serviceType: form.serviceType,
      description: form.description?.trim() || undefined,
      owners: userId ? [{ id: userId, type: 'user' }] : undefined,
      connection: {
        config: { ...(step2Config.value ?? {}), ...filterValues },
      },
    });
    createdFqn = created.fullyQualifiedName;
    const entityType = entityTypeForKind(form.kind);
    if (!isExcludedAutoPilotServiceType(entityType)) {
      await triggerAutoPilotApplication(entityType, created.fullyQualifiedName);
      message.success(t('ingestion.agents.autoPilotTriggeredMessage'), 5);
    }
  } catch (error) {
    message.error(error instanceof Error ? error.message : t('crud.createFailed'));
  } finally {
    saving.value = false;
    // Official AddService pin: always navigate to the service detail,
    // even on create failure (the detail may not exist). Official
    // getServiceDetailsPath is FQN-addressed, so success uses the
    // created FQN and failure falls back to the typed service name.
    leaving.value = true;
    const category = SERVICE_COLLECTION_BY_KIND[form.kind];
    const fqn = createdFqn ?? form.name.trim();
    if (category && fqn) {
      await router.push(getServiceDetailsPath(fqn, category));
    }
  }
}

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
</script>

<template>
  <PageLayout>
    <SmBreadcrumb :items="breadcrumbItems" />
    <div data-testid="add-new-service-container" style="display: flex; align-items: center; gap: 12px">
      <ServiceLogo v-if="form.serviceType" :source="{ serviceType: form.serviceType }" :size="40" />
      <PageHeader :header="headerText" test-id="header" />
    </div>
    <ServiceFlowStepper :steps="steps" :active-step="step" />

    <div class="add-service-layout">
      <div class="add-service-main">
        <div v-if="step === 1" data-testid="wizard-step-type">
          <SelectServiceType
            :category="wizardKind ?? 'all'"
            :show-error="false"
            @category-change="handleCategoryChange"
            @select="handleServiceTypeClick"
          />
        </div>

        <div v-if="step === 2" data-testid="wizard-step-connection">
          <ServiceNameCard
            :service-type="form.serviceType"
            :name="form.name"
            :description="form.description ?? ''"
            :name-error="nameError"
            @update:name="form.name = $event"
            @update:description="form.description = $event"
            @focus="handleNameCardFocus"
            @blur="handleFieldBlur"
          />
          <ConnectionConfigForm
            ref="connectionFormRef"
            :kind="form.kind"
            :service-type="form.serviceType"
            :form="form"
            :service-name="form.name"
            :additional-missing-fields-count="isStep2NextDisabled ? 1 : 0"
            :is-submit-disabled="isStep2NextDisabled"
            :is-additional-validation-pending="isServiceNameChecking"
            :on-validate-additional-required-fields="validateAdditionalRequiredFields"
            :airflow-status="orchestrator"
            :airflow-checked="orchestratorChecked"
            @save="handleConfigUpdate"
            @test-connection-status-change="isConnectionVerified = $event"
            @focus="(fieldId, meta) => handleFieldFocus(fieldId, meta)"
            @blur="handleFieldBlur"
          />
        </div>

        <div v-if="step === 3" data-testid="wizard-step-filter">
          <FiltersConfigForm
            ref="filtersFormRef"
            :kind="form.kind"
            :service-type="form.serviceType"
            :initial-config="step2Config"
            :show-connected-message="isConnectionVerified"
            :connected-host="connectedHost"
            @save="handleFiltersSave"
          />
        </div>

        <div v-if="step === 2 || step === 3" style="margin-top: 24px; display: flex; gap: 8px">
          <Button data-testid="wizard-back" @click="handleFooterBack">
            {{ t('crud.previous') }}
          </Button>
          <Button
            type="primary"
            data-testid="wizard-next"
            :disabled="
              step === 2
                ? isStep2NextDisabled || isConnectionSubmitBlocked
                : saving
            "
            :loading="step === 3 && saving"
            @click="handleFooterNext"
          >
            {{
              step === 3
                ? t('settings.services.wizard.createAndDeploy')
                : t('settings.services.wizard.nextWhatToIngest')
            }}
          </Button>
        </div>
      </div>

      <div v-if="!hideSecondPanel" class="add-service-doc-panel">
        <ServiceDocPanel
          focused-mode
          :service-name="form.serviceType"
          :service-type="entityTypeForKind(form.kind)"
          :active-field="activeField"
          :active-field-meta="activeFieldMeta"
        />
      </div>
    </div>

    <NavigationGuardModal :open="showModal" @leave="confirmLeave" @stay="cancelLeave" />
    <!-- The reset confirm opens from the breadcrumb's add-service
         action once the shell §9 constructor lands (SmBreadcrumb
         cannot express click actions); the modal and its handler are
         wired and ready. -->
    <NavigationGuardModal
      :open="showResetConfirm"
      test-id="navigation-guard-reset"
      @leave="handleResetConfirmLeave"
      @stay="showResetConfirm = false"
    />
    <NavigationGuardModal
      :open="showBackStepConfirm"
      test-id="navigation-guard-back-step"
      @leave="handleConfirmedStepBack"
      @stay="showBackStepConfirm = false"
    />
  </PageLayout>
</template>

<style scoped>
.add-service-layout {
  display: flex;
  align-items: flex-start;
  gap: 24px;
  margin-top: 24px;
}

.add-service-main {
  flex: 1;
  min-width: 0;
}

.add-service-doc-panel {
  flex: 0.3;
  min-width: 400px;
}
</style>
