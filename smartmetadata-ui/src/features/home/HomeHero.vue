<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { GlobalOutlined, SearchOutlined } from '@ant-design/icons-vue';
import { Input, Select, Typography } from 'ant-design-vue';

const props = withDefaults(
  defineProps<{
    userName: string;
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
    <Typography.Title :level="2" class="home-hero__welcome" data-testid="home-hero-welcome">
      {{ t('home.welcome', { name: userName || t('chrome.signedIn') }) }}
    </Typography.Title>
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
          <SearchOutlined />
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
          <GlobalOutlined />
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
  </section>
</template>

<style scoped>
.home-hero {
  background-color: #1570ef;
  background-image:
    linear-gradient(45deg, rgba(255, 255, 255, 0.06) 25%, transparent 25%),
    linear-gradient(-45deg, rgba(255, 255, 255, 0.06) 25%, transparent 25%),
    linear-gradient(45deg, transparent 75%, rgba(255, 255, 255, 0.06) 75%),
    linear-gradient(-45deg, transparent 75%, rgba(255, 255, 255, 0.06) 75%);
  background-size: 28px 28px;
  background-position: 0 0, 0 14px, 14px -14px, -14px 0;
  color: #fff;
  padding: 48px 24px 40px;
  text-align: center;
}
.home-hero__welcome {
  color: #fff !important;
  margin-bottom: 24px !important;
  font-weight: 650;
}
.home-hero__search-row {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 12px;
  max-width: 820px;
  margin: 0 auto;
}
.home-hero__search {
  flex: 1;
  max-width: 640px;
}
.home-hero__search :deep(.ant-input-affix-wrapper),
.home-hero__search.ant-input-affix-wrapper {
  border-radius: 999px;
  border-color: transparent;
  box-shadow: 0 8px 24px rgba(10, 13, 18, 0.12);
}
.home-hero__domain {
  min-width: 160px;
}
.home-hero__domain :deep(.ant-select-selector) {
  border-radius: 999px !important;
  border-color: transparent !important;
}
.home-hero__domain-note {
  margin: 12px 0 0;
  color: rgba(255, 255, 255, 0.85);
  font-size: 12px;
}
.home-hero__chips {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 8px;
  margin-top: 20px;
}
.home-hero__chip {
  border: 0;
  background: #fff;
  color: var(--sm-text-primary);
  border-radius: 999px;
  padding: 6px 14px;
  cursor: pointer;
  box-shadow: 0 2px 8px rgba(10, 13, 18, 0.08);
}
.home-hero__chip:hover {
  color: var(--sm-color-primary);
}
</style>
