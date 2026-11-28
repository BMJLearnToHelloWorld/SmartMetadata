<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { Button, Input, Select } from 'ant-design-vue';
import { CloseCircleOutlined } from '@ant-design/icons-vue';

const ALL_OPTION_VALUE = '__all__';

const props = defineProps<{
  searchInput: string;
  entityType?: string;
  testPlatform?: string;
  entityTypeOptions: Array<{ key: string; label: string }>;
  platformOptions: Array<{ key: string; label: string }>;
}>();

const emit = defineEmits<{
  'update:searchInput': [value: string];
  searchEnter: [];
  'update:entityType': [value: string | undefined];
  'update:testPlatform': [value: string | undefined];
  clearAll: [];
}>();

const { t } = useI18n();

const hasActiveFilters = computed(
  () =>
    props.searchInput.trim().length > 0 ||
    props.entityType !== undefined ||
    props.testPlatform !== undefined,
);

function withAllOption(options: Array<{ key: string; label: string }>) {
  return [
    { value: ALL_OPTION_VALUE, label: t('label.all') },
    ...options.map((option) => ({ value: option.key, label: option.label })),
  ];
}

const entitySelectValue = computed(() => props.entityType ?? ALL_OPTION_VALUE);
const platformSelectValue = computed(() => props.testPlatform ?? ALL_OPTION_VALUE);

function onEntityChange(value: unknown): void {
  const next = value === undefined || value === ALL_OPTION_VALUE ? undefined : String(value);
  emit('update:entityType', next);
}

function onPlatformChange(value: unknown): void {
  const next = value === undefined || value === ALL_OPTION_VALUE ? undefined : String(value);
  emit('update:testPlatform', next);
}
</script>

<template>
  <div class="test-definition-filter-bar" data-testid="test-definition-filter-bar">
    <Input
      allow-clear
      data-testid="test-definition-search"
      class="test-definition-filter-bar__search"
      :placeholder="t('label.search-entity', { entity: t('label.test-definition-plural') })"
      :value="searchInput"
      @update:value="(value) => emit('update:searchInput', String(value ?? ''))"
      @pressEnter="emit('searchEnter')"
    />
    <div class="test-definition-filter-bar__select">
      <label class="test-definition-filter-bar__label">{{ t('label.entity-type') }}</label>
      <Select
        data-testid="test-library-filter-entity"
        :value="entitySelectValue"
        :options="withAllOption(entityTypeOptions)"
        @change="onEntityChange"
      />
    </div>
    <div class="test-definition-filter-bar__select">
      <label class="test-definition-filter-bar__label">{{ t('label.test-platform-plural') }}</label>
      <Select
        data-testid="test-library-filter-platform"
        :value="platformSelectValue"
        :options="withAllOption(platformOptions)"
        @change="onPlatformChange"
      />
    </div>
    <Button
      v-if="hasActiveFilters"
      type="link"
      data-testid="clear-all-filter-btn"
      @click="emit('clearAll')"
    >
      <CloseCircleOutlined />
      {{ t('label.clear-entity', { entity: t('label.all') }) }}
    </Button>
  </div>
</template>

<style scoped>
.test-definition-filter-bar {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: 12px;
  margin-bottom: 16px;
}
.test-definition-filter-bar__search {
  width: 288px;
}
.test-definition-filter-bar__select {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 176px;
}
.test-definition-filter-bar__label {
  font-size: 12px;
  color: var(--sm-color-text-secondary);
}
</style>