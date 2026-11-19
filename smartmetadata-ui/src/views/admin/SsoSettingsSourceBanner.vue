<!--
Copyright 2026 SmartMetadata authors.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0
-->
<script setup lang="ts">
import { Alert, Button, Modal } from 'ant-design-vue';
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { adoptDeploymentConfig } from '@/api/system';
import {
  getSsoEnvSourceVariables,
  getSsoOverriddenFields,
  type SsoOverriddenSettingField,
  type SsoSettingSource,
} from '@/admin/ssoSettingsSource';
import {
  showSsoErrorToast,
  showSsoSuccessToast,
} from '@/admin/ssoToasts';

const props = defineProps<{
  sources: SsoSettingSource[];
  onRefetch: () => Promise<void>;
  onAdopted?: () => void;
}>();

const { t } = useI18n();
const isConfirmOpen = ref(false);
const isAdopting = ref(false);

const envVariables = computed(() => getSsoEnvSourceVariables(props.sources));
const overriddenFields = computed(() => getSsoOverriddenFields(props.sources));
const reloadErrors = computed(() =>
  props.sources.filter(
    (source) => source.lastReloadError && source.lastReloadError !== '',
  ),
);
const showBanner = computed(
  () =>
    envVariables.value.length > 0 ||
    overriddenFields.value.length > 0 ||
    reloadErrors.value.length > 0,
);

function handleCancel(): void {
  if (!isAdopting.value) {
    isConfirmOpen.value = false;
  }
}

// Adopts exactly the fields the admin was shown, grouped by setting so a
// partial success still reloads the setting that changed.
async function handleAdopt(): Promise<void> {
  isAdopting.value = true;
  const fieldsBySetting = new Map<string, SsoOverriddenSettingField[]>();
  for (const field of overriddenFields.value) {
    const group = fieldsBySetting.get(field.configType) ?? [];
    group.push(field);
    fieldsBySetting.set(field.configType, group);
  }
  const results = await Promise.allSettled(
    [...fieldsBySetting.values()].map((fields) =>
      adoptDeploymentConfig(
        fields[0].configType,
        fields.map((field) => field.path),
      ),
    ),
  );
  const failures = results.filter(
    (result): result is PromiseRejectedResult => result.status === 'rejected',
  );
  for (const failure of failures) {
    showSsoErrorToast(failure.reason, t('sso.unexpectedError'), 'POST');
  }
  if (failures.length === 0) {
    showSsoSuccessToast(t('sso.deploymentValuesAdopted'));
  }
  isAdopting.value = false;
  isConfirmOpen.value = false;
  await props.onRefetch();
  if (failures.length < results.length) {
    props.onAdopted?.();
  }
}
</script>

<template>
  <div v-if="showBanner" data-testid="settings-source-banner">
    <Alert
      v-for="variable in envVariables"
      :key="variable"
      data-testid="settings-source-env-alert"
      :message="t('sso.managedByDeploymentConfiguration')"
      type="info"
    >
      <template #description>
        {{
          variable
            ? t('sso.settingsManagedByDeployment', { variable })
            : t('sso.settingsManagedByDeploymentWithoutVariable')
        }}
      </template>
    </Alert>

    <Alert
      v-if="overriddenFields.length > 0"
      data-testid="settings-source-overridden-alert"
      :message="t('sso.deploymentValuesOverridden')"
      type="warning"
    >
      <template #description>
        {{ t('sso.settingsDeploymentValuesOverridden') }}
        <ul data-testid="overridden-field-list">
          <li
            v-for="field in overriddenFields"
            :key="`${field.configType}${field.path}`"
          >
            {{
              field.envVariable
                ? t('sso.overriddenFieldEnvVariable', {
                    field: field.path,
                    variable: field.envVariable,
                  })
                : field.path
            }}
          </li>
        </ul>
        <Button
          data-testid="use-deployment-value-button"
          size="small"
          @click="isConfirmOpen = true"
        >
          {{ t('sso.useDeploymentValue') }}
        </Button>
      </template>
    </Alert>

    <Alert
      v-for="source in reloadErrors"
      :key="source.configType"
      data-testid="settings-source-reload-error-alert"
      :message="t('sso.settingsNotApplied')"
      type="error"
    >
      <template #description>
        {{ t('sso.settingsReloadError', { error: source.lastReloadError }) }}
      </template>
    </Alert>

    <Modal
      :cancel-text="t('crud.cancel')"
      :mask-closable="!isAdopting"
      :ok-button-props="{ loading: isAdopting }"
      :ok-text="t('sso.useDeploymentValue')"
      :open="isConfirmOpen"
      :title="t('sso.useDeploymentValue')"
      @cancel="handleCancel"
      @ok="handleAdopt"
    >
      <div data-testid="use-deployment-value-modal">
        {{ t('sso.useDeploymentValueConfirmation') }}
        <ul data-testid="overridden-field-list">
          <li
            v-for="field in overriddenFields"
            :key="`${field.configType}${field.path}`"
          >
            {{
              field.envVariable
                ? t('sso.overriddenFieldEnvVariable', {
                    field: field.path,
                    variable: field.envVariable,
                  })
                : field.path
            }}
          </li>
        </ul>
      </div>
    </Modal>
  </div>
</template>
