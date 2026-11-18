<!--
Copyright 2026 SmartMetadata authors.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0
-->
<script setup lang="ts">
import { Alert, Button, Modal, message } from 'ant-design-vue';
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { adoptDeploymentConfig } from '@/api/system';
import {
  getEnvSourceVariables,
  getOverriddenFields,
  type OverriddenSettingField,
  type SettingSource,
} from '@/utils/settingsSource';

/**
 * Deployment-source banner (PAT-MANAGED, 00-systemic D9), ported from
 * official `components/platform/settings/SettingsSourceBanner/
 * SettingsSourceBanner.tsx` at pin a3012259ca. Renders nothing when the
 * env variables, overridden fields, and reload errors are all empty.
 * Adopt claims exactly the fields shown, grouped by config type, so a
 * partial success still reloads the setting that changed.
 *
 * The adopt call reuses the generic endpoint implementation in
 * `@/api/system` (`adoptDeploymentConfig`, the official name).
 * Toasts go through ant-design-vue `message` directly: the
 * SSO-scoped toast resolver (401/403 suppression, SSO fallback text)
 * does not apply to the generic banner.
 */
const props = defineProps<{
  sources: SettingSource[];
  className?: string;
  /** Re-reads where the settings take their values from. */
  onRefetch: () => Promise<void>;
  /** Called once deployment values replace stored ones, so the page reloads the setting. */
  onAdopted?: () => void;
}>();

const { t } = useI18n();
const isConfirmOpen = ref(false);
const isAdopting = ref(false);

const envVariables = computed(() => getEnvSourceVariables(props.sources));
const overriddenFields = computed(() => getOverriddenFields(props.sources));
const reloadErrors = computed(() =>
  props.sources.filter((source) => Boolean(source.lastReloadError)),
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

async function handleAdopt(): Promise<void> {
  isAdopting.value = true;
  const fieldsBySetting = new Map<string, OverriddenSettingField[]>();
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
    message.error(
      failure.reason instanceof Error ? failure.reason.message : String(failure.reason),
    );
  }
  if (failures.length === 0) {
    message.success(t('message.deployment-values-adopted'), 3);
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
  <div v-if="showBanner" :class="className" data-testid="settings-source-banner">
    <Alert
      v-for="variable in envVariables"
      :key="variable"
      data-testid="settings-source-env-alert"
      :message="t('label.managed-by-deployment-configuration')"
      type="info"
    >
      <template #description>
        {{
          variable
            ? t('message.settings-managed-by-deployment', { variable })
            : t('message.settings-managed-by-deployment-without-variable')
        }}
      </template>
    </Alert>

    <Alert
      v-if="overriddenFields.length > 0"
      data-testid="settings-source-overridden-alert"
      :message="t('label.deployment-values-overridden')"
      type="warning"
    >
      <template #description>
        {{ t('message.settings-deployment-values-overridden') }}
        <ul data-testid="overridden-field-list">
          <li
            v-for="field in overriddenFields"
            :key="`${field.configType}${field.path}`"
          >
            {{
              field.envVariable
                ? t('message.overridden-field-env-variable', {
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
          {{ t('label.use-deployment-value') }}
        </Button>
      </template>
    </Alert>

    <Alert
      v-for="source in reloadErrors"
      :key="source.configType"
      data-testid="settings-source-reload-error-alert"
      :message="t('label.settings-not-applied')"
      type="error"
    >
      <template #description>
        {{ t('message.settings-reload-error', { error: source.lastReloadError }) }}
      </template>
    </Alert>

    <Modal
      :cancel-text="t('crud.cancel')"
      :keyboard="!isAdopting"
      :mask-closable="!isAdopting"
      :ok-button-props="{ loading: isAdopting }"
      :ok-text="t('label.use-deployment-value')"
      :open="isConfirmOpen"
      :title="t('label.use-deployment-value')"
      @cancel="handleCancel"
      @ok="handleAdopt"
    >
      <div data-testid="use-deployment-value-modal">
        {{ t('message.use-deployment-value-confirmation') }}
        <ul data-testid="overridden-field-list">
          <li
            v-for="field in overriddenFields"
            :key="`${field.configType}${field.path}`"
          >
            {{
              field.envVariable
                ? t('message.overridden-field-env-variable', {
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
