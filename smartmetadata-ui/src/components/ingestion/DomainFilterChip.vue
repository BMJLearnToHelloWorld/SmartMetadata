<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useDomainStore } from '@/stores/domain';

const { t } = useI18n();
const domainStore = useDomainStore();

const activeDomain = computed(() => domainStore.activeDomain);
const domainLabel = computed(
  () => activeDomain.value?.displayName || activeDomain.value?.name || '',
);

function clearDomain(): void {
  domainStore.selectDomain(null);
}
</script>

<template>
  <!--
    Port of official DomainFilterChip (pin a3012259ca):
    renders nothing when no domain is active; otherwise the
    filtered-by-domain text, the domain badge, and a clear button
    that switches the active domain off.
  -->
  <div v-if="activeDomain" class="domain-filter-chip" data-testid="domain-filter-chip">
    <span>{{ t('settings.services.domain.filteredBy') }}</span>
    <span class="domain-filter-chip__badge">{{ domainLabel }}</span>
    <button
      type="button"
      class="domain-filter-chip__clear"
      data-testid="domain-filter-chip-clear"
      :aria-label="t('settings.services.domain.clearFilter')"
      @click="clearDomain"
    >
      ×
    </button>
  </div>
</template>

<style scoped>
.domain-filter-chip {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: var(--sm-color-text);
}

.domain-filter-chip__badge {
  border: 1px solid var(--sm-border-color);
  border-radius: 999px;
  padding: 2px 10px;
  background: var(--sm-bg-container);
}

.domain-filter-chip__clear {
  border: none;
  background: transparent;
  cursor: pointer;
  font-size: 16px;
  line-height: 1;
  padding: 2px 4px;
  color: var(--sm-color-text-secondary);
}
</style>
