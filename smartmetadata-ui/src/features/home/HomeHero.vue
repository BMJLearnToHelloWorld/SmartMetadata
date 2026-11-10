<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { Input, Select } from 'ant-design-vue';
import SmIcon from '@/components/shared/SmIcon.vue';

const props = withDefaults(
  defineProps<{
    domains: Array<{ value: string; label: string }>;
    selectedDomain: string;
    serviceChips: Array<{ key: string; count: number }>;
    domainsUnavailable?: boolean;
  }>(),
  {
    domainsUnavailable: false,
  },
);

const emit = defineEmits<{
  search: [query: string];
  'update:selectedDomain': [value: string];
  selectService: [name: string];
}>();

const { t } = useI18n();
const query = ref('');

const domainOptions = computed(() => [
  { value: '', label: t('home.allDomains') },
  ...props.domains,
]);

function onSearch(): void {
  emit('search', query.value.trim());
}

function onDomainChange(value: unknown): void {
  emit('update:selectedDomain', typeof value === 'string' ? value : '');
}
</script>

<template>
  <section class="home-hero" data-testid="home-hero">
    <span class="home-hero__mark" aria-hidden="true" />
    <!-- D-2: the welcome line lives in the page-top greeting header
         now, so this hero keeps only its tools — search, domain
         filter and service chips. -->
    <div class="home-hero__tools">
      <div class="home-hero__search-row">
      <Input
        v-model:value="query"
        data-testid="home-hero-search"
        class="home-hero__search"
        size="large"
        allow-clear
        :placeholder="t('home.searchPlaceholder')"
        @pressEnter="onSearch"
      >
        <template #prefix>
          <SmIcon icon-key="action-search" />
        </template>
      </Input>
      <Select
        data-testid="home-hero-domain"
        class="home-hero__domain"
        size="large"
        :value="selectedDomain"
        :options="domainOptions"
        :disabled="domainsUnavailable && !domains.length"
        :aria-label="t('home.allDomains')"
        @change="onDomainChange"
      >
        <template #suffixIcon>
          <SmIcon icon-key="action-globe" />
        </template>
      </Select>
      </div>
      <p v-if="domainsUnavailable && !domains.length" class="home-hero__domain-note" data-testid="home-hero-domain-residual">
        {{ t('home.domainsResidual') }}
      </p>
      <div v-if="serviceChips.length" class="home-hero__chips" data-testid="home-hero-chips">
        <button
          v-for="chip in serviceChips"
          :key="chip.key"
          type="button"
          class="home-hero__chip"
          :data-testid="`home-hero-chip-${chip.key}`"
          @click="emit('selectService', chip.key)"
        >
          {{ chip.key }}
        </button>
      </div>
    </div>
  </section>
</template>

<style scoped>
.home-hero {
  position: relative;
  display: flex;
  flex-direction: column;
  justify-content: center;
  height: auto;
  min-height: 168px;
  margin: 0;
  padding: 28px 24px;
  overflow: hidden;
  border-radius: 16px;
  background: var(--sm-color-primary);
  box-shadow: var(--sm-shadow-card);
}
.home-hero__mark {
  position: absolute;
  right: -22px;
  bottom: -36px;
  width: 92px;
  height: 92px;
  border-radius: 28px;
  background: var(--sm-text-on-primary);
  opacity: 0.14;
  transform: rotate(18deg);
}
.home-hero__tools {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.home-hero__search-row {
  display: flex;
  gap: 12px;
}
.home-hero__search {
  flex: 1;
  min-width: 0;
}
.home-hero__domain {
  flex-shrink: 0;
  width: 200px;
}
.home-hero__domain-note {
  margin: 0;
  color: var(--sm-color-primary-25);
  font-size: 12px;
}
.home-hero__chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.home-hero__chip {
  padding: 4px 12px;
  border: 1px solid rgba(255, 255, 255, 0.4);
  border-radius: 999px;
  background: transparent;
  color: var(--sm-text-on-primary);
  cursor: pointer;
  font-size: 12px;
}
</style>
