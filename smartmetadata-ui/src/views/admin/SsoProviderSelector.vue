<!--
Copyright 2026 SmartMetadata authors.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0
-->
<script setup lang="ts">
import { ArrowUpOutlined } from '@ant-design/icons-vue';
import { Button } from 'ant-design-vue';
import { ref } from 'vue';
import { useI18n } from 'vue-i18n';
import {
  getSsoProviderIcon,
  SSO_PROVIDER_OPTIONS,
} from '@/admin/ssoProviders';
import SsoProviderIcon from './SsoProviderIcon.vue';

const props = defineProps<{
  selectedProvider?: string;
}>();

const emit = defineEmits<{
  'provider-select': [provider: string];
}>();

const { t } = useI18n();

// Local selection only: the initial prop seeds the state and later prop
// changes are ignored, exactly like pin's `useState(initial)`.
const selectedProvider = ref<string | undefined>(props.selectedProvider);

function handleCardClick(provider: string): void {
  selectedProvider.value = provider;
}

function handleConfigureClick(): void {
  if (selectedProvider.value) {
    emit('provider-select', selectedProvider.value);
  }
}
</script>

<template>
  <div class="sso-provider-selector-container">
    <div class="sso-provider-selector-header">
      <h5>{{ t('sso.chooseProvider') }}</h5>
      <Button
        type="primary"
        :disabled="!selectedProvider"
        data-testid="sso-provider-configure"
        @click="handleConfigureClick"
      >
        {{ t('sso.configure') }}
        <ArrowUpOutlined :style="{ fontSize: '12px', marginLeft: '8px' }" />
      </Button>
    </div>

    <div class="sso-provider-selection-container">
      <div
        v-for="provider in SSO_PROVIDER_OPTIONS"
        :key="provider.key"
        :class="[
          'sso-provider-item',
          { selected: selectedProvider === provider.key },
        ]"
        :data-testid="`sso-provider-card-${provider.key}`"
        role="button"
        :tabindex="0"
        @click="handleCardClick(provider.key)"
        @keydown="
          (event: KeyboardEvent) => {
            if (event.key === 'Enter' || event.key === ' ') {
              handleCardClick(provider.key);
            }
          }
        "
      >
        <div class="sso-provider-icon">
          <div class="sso-provider-icon-inner">
            <SsoProviderIcon
              :alt="provider.label"
              :icon="getSsoProviderIcon(provider.key)"
            />
          </div>
        </div>
        <span class="sso-provider-name">{{ provider.label }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.sso-provider-selector-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.sso-provider-selection-container {
  display: flex;
  flex-wrap: wrap;
}

.sso-provider-item {
  cursor: pointer;
}
</style>
