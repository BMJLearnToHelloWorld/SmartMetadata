<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { Select, Tooltip } from 'ant-design-vue';
import { onMounted } from 'vue';
import { useI18n } from 'vue-i18n';
import { useDomainStore } from '@/stores/domain';

/**
 * Official DomainSelect bridge: the active domain plus the user's
 * domains, with a scope switch. The list is wired to GET /v1/domains
 * through the domain store; a load failure leaves the scope at All
 * Domains with the failure surfaced, never a silent empty list.
 * Domain restriction (isDomainRestricted) is residual: no product
 * endpoint for it was located.
 */
withDefaults(defineProps<{ testId?: string }>(), { testId: 'domain-select' });
const { t } = useI18n();
const domainStore = useDomainStore();

onMounted(() => {
  domainStore.hydrate();
  if (!domainStore.loaded) {
    void domainStore.loadDomains();
  }
});

function onChange(value: unknown): void {
  domainStore.selectDomain(typeof value === 'string' && value ? value : null);
}
</script>

<template>
  <Tooltip :title="domainStore.errorMessage ? t('chrome.domainLoadFailed') : ''">
    <Select
      :data-testid="testId"
      :value="domainStore.activeDomainId ?? ''"
      :loading="domainStore.loading"
      :aria-label="t('chrome.domainSelect')"
      style="min-width: 160px"
      @change="onChange"
    >
      <Select.Option value="">{{ t('chrome.domainAll') }}</Select.Option>
      <Select.Option
        v-for="domain in domainStore.domains"
        :key="domain.id ?? domain.name"
        :value="domain.id ?? domain.name"
      >
        {{ domain.displayName || domain.name }}
      </Select.Option>
    </Select>
  </Tooltip>
</template>
