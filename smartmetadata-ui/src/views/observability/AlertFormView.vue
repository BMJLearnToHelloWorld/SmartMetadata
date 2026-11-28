<!--
Copyright 2026 SmartMetadata authors.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0
-->
<script setup lang="ts">
import { DatabaseOutlined } from '@ant-design/icons-vue';
import { BellOutlined } from '@ant-design/icons-vue';
import {
  Alert,
  Button,
  Card,
  Divider,
  Input,
  message,
  Spin,
  Typography,
} from 'ant-design-vue';
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute } from 'vue-router';
import { useAlertSelection } from '@/composables/useAlertSelection';
import AlertFormSourceItem from '@/components/notifications/AlertFormSourceItem.vue';
import AlertRuleSection from '@/components/notifications/AlertRuleSection.vue';
import DestinationFormItem from '@/components/notifications/DestinationFormItem.vue';
import NoDataPlaceholder from '@/components/shared/NoDataPlaceholder.vue';
import PageLayout from '@/components/shared/PageLayout.vue';
import PermissionPlaceholder from '@/components/shared/PermissionPlaceholder.vue';
import SmBreadcrumb from '@/components/shared/SmBreadcrumb.vue';
import SmRichTextEditor from '@/components/shared/SmRichTextEditor.vue';
import SomethingWentWrongPlaceholder from '@/components/shared/SomethingWentWrongPlaceholder.vue';
import { ALERT_AI_DEFAULT_CONNECTION_TIMEOUT, DEFAULT_READ_TIMEOUT } from '@/utils/notifications/alertConstants';
import { getClassicAlertInitialValues } from '@/utils/notifications/alertSave';
import {
  getAlertSourceChanges,
  shouldShowRuleSection,
  toCapabilitiesInput,
} from '@/utils/notifications/alertSelection';
import type { TranslateFn } from '@/utils/notifications/alertUtils';
import { resolveAlertFace } from '@/utils/notifications/alertPaths';
import type { AlertSearchHooks } from '@/utils/notifications/alertSourceSearch';
import { validateAlertForm } from '@/utils/notifications/alertValidation';
import type { AlertFormDestination, AlertFormValue } from '@/types/notifications';
import type { ArgumentsInput } from '@/types/quality';
import { useAlertFormAccess } from './useAlertFormAccess';
import { useAlertFormData } from './useAlertFormData';

/**
 * Pin `AddObservabilityPage` + `ObservabilityAlertForm` +
 * `ObservabilityAlertFormFields` (AddObservabilityPage.tsx:39-172,
 * ObservabilityAlertForm.tsx:52-182, ObservabilityAlertFormFields.tsx:50-240):
 * the access placeholder first (loading, then reloadable error, then
 * denial — all without a breadcrumb), then the edit-load error with its
 * breadcrumb, then the D-chain Loader, then the System-provider block,
 * then the form. The form state is the live `ModifiedCreateEventSubscription`
 * shape; the capabilities selection follows the live sources and input;
 * validation errors compute live but show only after submit, except the
 * displayName error, which also shows once the field has been edited.
 * The Notification face never shows the Actions section.
 */
const route = useRoute();
const { t } = useI18n();
const translate = t as unknown as TranslateFn;

const face = computed(() => resolveAlertFace(route.path));
const fqn = computed(() => String(route.params.fqn ?? ''));
const isNotification = computed(() => face.value === 'Notification');

const hooks: AlertSearchHooks = {
  t: translate,
  notifyError: (text: string) => void message.error(text),
  notifyWarning: (text: string) => void message.warning(text),
};
const notifySuccess = (text: string): void => void message.success(text);

const access = useAlertFormAccess({
  isEditMode: () => fqn.value.length > 0,
  fqn: () => fqn.value,
});
const formData = useAlertFormData({
  face: face.value,
  fqn: () => fqn.value,
  hooks,
  notifySuccess,
});

const form = ref<AlertFormValue>({
  resources: [],
  destinations: [],
  input: {},
  alertType: face.value,
  provider: 'user',
  timeout: ALERT_AI_DEFAULT_CONNECTION_TIMEOUT,
  readTimeout: DEFAULT_READ_TIMEOUT,
});

watch(
  () => formData.alert.value,
  (next) => {
    if (next) {
      form.value = getClassicAlertInitialValues(next);
    }
  },
);

const selection = useAlertSelection({
  alertType: () => face.value,
  sources: () => form.value.resources ?? [],
  input: () => toCapabilitiesInput(form.value.input),
  enabled: () => access.hasAccess.value,
  t: translate,
  notifyError: hooks.notifyError,
});

const shouldShowFiltersSection = computed(() =>
  shouldShowRuleSection(
    form.value.resources ?? [],
    selection.value.support.hasFilters,
    form.value.input?.filters,
  ),
);
const shouldShowActionsSection = computed(
  () =>
    !isNotification.value &&
    shouldShowRuleSection(
      form.value.resources ?? [],
      selection.value.support.hasTriggers,
      form.value.input?.actions,
    ),
);

// D chain: the alert fetch plus the capabilities answer. The template chain
// never starts in OSS, so it contributes no loading flag.
const isLoading = computed(() => formData.alertLoading.value || !selection.value.ready);

const hasSubmitted = ref(false);
const displayNameTouched = ref(false);
const liveErrors = computed(() => validateAlertForm(form.value, translate));
const shownErrors = computed(() => {
  if (hasSubmitted.value) {
    return liveErrors.value;
  }
  // The displayName field re-validates on every keystroke once edited, so
  // its error shows live; every other error waits for submit.
  if (displayNameTouched.value && liveErrors.value.displayName) {
    return { displayName: liveErrors.value.displayName };
  }
  return {};
});

const pageTitle = computed(() =>
  t('label.add-entity', {
    entity: t(isNotification.value ? 'label.notification-alert' : 'label.observability'),
  }),
);

function onDisplayNameInput(value: string): void {
  displayNameTouched.value = true;
  form.value = { ...form.value, displayName: value };
}

function onSourceChange(next: string[]): void {
  const changes = getAlertSourceChanges(
    next,
    form.value.resources ?? [],
    formData.areRulesReadOnly.value,
  );
  form.value = {
    ...form.value,
    resources: changes.resources,
    ...(changes.input !== undefined ? { input: changes.input } : {}),
    ...(changes.destinations !== undefined ? { destinations: changes.destinations } : {}),
  };
}

function onFiltersChange(next: ArgumentsInput[]): void {
  form.value = { ...form.value, input: { ...form.value.input, filters: next } };
}

function onActionsChange(next: ArgumentsInput[]): void {
  form.value = { ...form.value, input: { ...form.value.input, actions: next } };
}

function onDestinationsChange(next: AlertFormDestination[]): void {
  form.value = { ...form.value, destinations: next };
}

async function submit(): Promise<void> {
  const errors = validateAlertForm(form.value, translate);
  hasSubmitted.value = true;
  if (Object.keys(errors).length === 0) {
    await formData.handleSave(form.value);
  }
}
</script>

<template>
  <PageLayout :document-title="pageTitle">
    <div v-if="access.isPermissionLoading.value" class="alert-form__loader">
      <Spin />
    </div>
    <div
      v-else-if="access.permissionError.value"
      class="alert-form__placeholder-box"
    >
      <SomethingWentWrongPlaceholder :on-reload="access.refreshPermission" />
    </div>
    <div
      v-else-if="!access.hasAccess.value"
      class="alert-form__placeholder-box"
    >
      <PermissionPlaceholder
        :permission-value="
          t(formData.isEditMode.value ? 'label.edit-entity' : 'label.create-entity', {
            entity: t('label.alert'),
          })
        "
      />
    </div>
    <div v-else-if="formData.alertError.value" class="alert-form__error">
      <SmBreadcrumb :items="formData.breadcrumb.value" />
      <div class="alert-form__placeholder-box">
        <NoDataPlaceholder
          v-if="formData.alertError.value.status === 404"
          :icon="BellOutlined"
          :title="t('label.alert-not-found')"
          :description="t('message.alert-not-found-description')"
        />
        <PermissionPlaceholder
          v-else-if="formData.alertError.value.status === 403"
          :permission-value="t('label.edit-entity', { entity: t('label.alert') })"
        />
        <SomethingWentWrongPlaceholder v-else :on-reload="formData.fetchAlert" />
      </div>
    </div>
    <div
      v-else-if="isLoading || (formData.isEditMode.value && !formData.alert.value)"
      class="alert-form__loader"
    >
      <Spin />
    </div>
    <div
      v-else-if="formData.alert.value?.provider === 'system'"
      class="alert-form__system-block"
    >
      <NoDataPlaceholder
        test-id="no-data-placeholder"
        :icon="DatabaseOutlined"
        :description="t('message.system-alert-edit-message')"
      />
    </div>
    <div v-else class="alert-form__panel">
      <Card>
        <div class="alert-form">
          <SmBreadcrumb :items="formData.breadcrumb.value" />
          <div>
            <Typography.Title :level="5">
              {{
                t(formData.isEditMode.value ? 'label.edit-entity' : 'label.add-entity', {
                  entity: t('label.alert'),
                })
              }}
            </Typography.Title>
            <Typography.Text>{{ t('message.alerts-description') }}</Typography.Text>
          </div>

          <div class="alert-form__field">
            <label class="alert-form__label" for="alert-display-name">
              {{ t('label.name') }} *
            </label>
            <Input
              id="alert-display-name"
              :value="form.displayName ?? ''"
              data-testid="displayName"
              :placeholder="t('label.name')"
              :status="shownErrors.displayName ? 'error' : undefined"
              @update:value="onDisplayNameInput"
            />
            <p v-if="shownErrors.displayName" class="alert-form__hint">
              {{ shownErrors.displayName }}
            </p>
          </div>

          <div class="alert-form__field">
            <span class="alert-form__label">{{ t('label.description') }}</span>
            <SmRichTextEditor
              data-testid="description"
              :initial-value="formData.alert.value?.description"
              @text-change="form = { ...form, description: $event }"
            />
          </div>

          <div class="alert-form__rule-row" data-testid="alert-form-rule-row">
            <div class="alert-form__rule-col">
              <AlertFormSourceItem
                :value="form.resources ?? []"
                :error="shownErrors.resources"
                :selection="selection"
                @update:value="onSourceChange"
              />
              <Alert
                v-if="
                  formData.areRulesReadOnly.value &&
                  (shouldShowFiltersSection || shouldShowActionsSection)
                "
                class="alert-form__rules-read-only"
                data-testid="alert-rules-read-only"
                type="info"
                :message="t('message.alert-rules-read-only')"
              />
            </div>
            <template v-if="shouldShowFiltersSection">
              <Divider type="vertical" dashed class="alert-form__rule-divider" data-testid="alert-form-rule-divider" />
              <div class="alert-form__rule-col">
                <AlertRuleSection
                  field="filters"
                  :title="t('label.filter-plural')"
                  :is-view-only="formData.areRulesReadOnly.value"
                  :rules="form.input?.filters ?? []"
                  :selection="selection"
                  :validation-errors="shownErrors"
                  :hooks="hooks"
                  @update:rules="onFiltersChange"
                />
              </div>
            </template>
            <template v-if="shouldShowActionsSection">
              <Divider type="vertical" dashed class="alert-form__rule-divider" data-testid="alert-form-rule-divider" />
              <div class="alert-form__rule-col">
                <AlertRuleSection
                  field="actions"
                  :title="t('label.trigger')"
                  :is-view-only="formData.areRulesReadOnly.value"
                  :rules="form.input?.actions ?? []"
                  :selection="selection"
                  :validation-errors="shownErrors"
                  :hooks="hooks"
                  @update:rules="onActionsChange"
                />
              </div>
            </template>
            <Divider type="vertical" dashed class="alert-form__rule-divider" data-testid="alert-form-rule-divider" />
            <div class="alert-form__rule-col">
              <DestinationFormItem
                :destinations="form.destinations ?? []"
                :timeout="form.timeout"
                :read-timeout="form.readTimeout"
                :sources="form.resources ?? []"
                :selection="selection"
                :validation-errors="shownErrors"
                :hooks="hooks"
                @update:destinations="onDestinationsChange"
                @update:timeout="form = { ...form, timeout: $event }"
                @update:read-timeout="form = { ...form, readTimeout: $event }"
                @request-validation="hasSubmitted = true"
              />
            </div>
          </div>

          <Alert
            v-if="formData.inlineAlertDetails.value"
            closable
            type="error"
            :message="formData.inlineAlertDetails.value.heading"
            @close="formData.inlineAlertDetails.value = undefined"
          >
            <template #description>
              <div>{{ formData.inlineAlertDetails.value.description }}</div>
              <div>{{ formData.inlineAlertDetails.value.subDescription }}</div>
            </template>
          </Alert>

          <div class="alert-form__buttons">
            <Button data-testid="cancel-button" @click="formData.handleCancel">
              {{ t('label.cancel') }}
            </Button>
            <Button
              type="primary"
              data-testid="save-button"
              :loading="formData.saving.value"
              @click="submit"
            >
              {{ t('label.save') }}
            </Button>
          </div>
        </div>
      </Card>
    </div>
  </PageLayout>
</template>

<style scoped>
.alert-form__loader {
  display: flex;
  justify-content: center;
  padding: 48px 0;
}

.alert-form__placeholder-box {
  position: relative;
  min-height: calc(100vh - 16rem);
  width: 100%;
}

.alert-form__error {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 16px 0;
}

.alert-form__system-block {
  position: relative;
  height: 100%;
  width: 100%;
  min-height: 240px;
}

.alert-form__panel {
  min-width: 700px;
}

.alert-form {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.alert-form__field {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.alert-form__label {
  font-weight: 500;
}

.alert-form__hint {
  color: var(--sm-color-error);
  margin: 0;
}

.alert-form__buttons {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

/** Pin ObservabilityAlertFormFields layout-row + vertical Dividers between rule columns. */
.alert-form__rule-row {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  align-items: flex-start;
  gap: 8px 0;
  width: 100%;
}

.alert-form__rule-col {
  flex: 1 1 17rem;
  min-width: 0;
  max-width: 100%;
}

.alert-form__rule-divider {
  height: 1.5rem;
  margin: 8px 8px 0;
  align-self: flex-start;
  border-color: var(--sm-border-secondary, rgba(0, 0, 0, 0.12));
}

.alert-form__rules-read-only {
  margin-top: 1rem;
}
</style>
