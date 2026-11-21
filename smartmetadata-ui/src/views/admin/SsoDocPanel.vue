<!--
Copyright 2026 SmartMetadata authors.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0
-->
<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import {
  resolveSsoActiveField,
  resolveSsoDocServiceName,
} from '@/admin/ssoDocSections';
import {
  getSsoProviderDisplayName,
  getSsoProviderIcon,
} from '@/admin/ssoProviders';
import ServiceDocPanel from '@/components/ingestion/ServiceDocPanel.vue';
import SsoProviderIcon from './SsoProviderIcon.vue';

/**
 * SSO doc panel (pin `components/SettingsSso/SSODocPanel/SSODocPanel.tsx`):
 * a thin wrapper over the shared ServiceDocPanel — provider header plus
 * the provider-file and field-name mappings, then the shared panel in
 * its full-document mode (no `focusedMode`, as in pin). The fetch,
 * section splitting, and active-field highlight all live in the shared
 * panel now.
 */
const props = defineProps<{
  serviceName: string;
  activeField?: string;
}>();

const { t } = useI18n();

const resolvedServiceName = computed(() =>
  resolveSsoDocServiceName(props.serviceName),
);
const resolvedField = computed(() => resolveSsoActiveField(props.activeField));
const title = computed(() =>
  props.serviceName === 'basic'
    ? t('label.basic-configuration')
    : `${getSsoProviderDisplayName(props.serviceName)} ${t('label.sso-configuration')}`,
);
</script>

<template>
  <div class="sso-doc-panel">
    <div class="sso-doc-header">
      <div v-if="getSsoProviderIcon(serviceName)" class="sso-provider-icon">
        <SsoProviderIcon
          :alt="`${serviceName} icon`"
          :icon="getSsoProviderIcon(serviceName)"
          :size="22"
        />
      </div>
      <h1 class="sso-provider-title">{{ title }}</h1>
    </div>
    <ServiceDocPanel
      :active-field="resolvedField"
      :service-name="resolvedServiceName"
      service-type="SSO"
    />
  </div>
</template>
