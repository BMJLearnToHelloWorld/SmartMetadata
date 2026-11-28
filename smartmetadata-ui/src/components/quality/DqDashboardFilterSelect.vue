<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
  Pin FilterSelectDropdown + FilterSelect triggerVariant="button" with
  immediate commit (official default). Vue3 + ant-design-vue; no CCL copy.
-->
<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { Badge, Button, Checkbox, Dropdown, Input, Spin } from 'ant-design-vue';
import type { CheckboxValueType } from 'ant-design-vue/es/checkbox/interface';

export interface DqDashboardFilterOption {
  value: string;
  label: string;
}

const props = withDefaults(
  defineProps<{
    modelValue: string[];
    label: string;
    options: DqDashboardFilterOption[];
    loading?: boolean;
    /** Official FilterSelectDropdown `searchKey` → `search-dropdown-${searchKey}`. */
    searchKey: string;
    /** Product dashboard filter bar anchors (e.g. dq-dashboard-filter-tier). */
    testId: string;
  }>(),
  { loading: false },
);

const officialTriggerTestId = computed(() => `search-dropdown-${props.searchKey}`);

const emit = defineEmits<{
  'update:modelValue': [value: string[]];
  search: [query: string];
  openChange: [open: boolean];
}>();

const { t } = useI18n();

const hasSelection = computed(() => props.modelValue.length > 0);

function onOpenChange(open: boolean): void {
  emit('openChange', open);
}

function onCheckboxChange(values: CheckboxValueType[]): void {
  emit(
    'update:modelValue',
    values.map((value) => String(value)),
  );
}

function selectAll(): void {
  emit(
    'update:modelValue',
    props.options.map((option) => option.value),
  );
}
</script>

<template>
  <div class="dq-dashboard-filter-select" :data-testid="testId">
    <Dropdown trigger="click" @open-change="onOpenChange">
      <Button
        :type="hasSelection ? 'primary' : 'default'"
        :data-testid="officialTriggerTestId"
        class="dq-dashboard-filter-select__trigger"
      >
        {{ label }}
        <Badge
          v-if="hasSelection"
          :count="modelValue.length"
          class="dq-dashboard-filter-select__badge"
        />
      </Button>
      <template #overlay>
        <div class="dq-dashboard-filter-select__panel" @mousedown.prevent>
          <Input
            allow-clear
            size="small"
            :placeholder="label"
            :data-testid="`search-dropdown-search-${searchKey}`"
            class="dq-dashboard-filter-select__search"
            @update:value="(q) => emit('search', q)"
          />
          <Button type="link" size="small" class="dq-dashboard-filter-select__select-all" @click="selectAll">
            {{ t('label.select-all') }}
          </Button>
          <Spin :spinning="loading">
            <Checkbox.Group
              :value="modelValue"
              class="dq-dashboard-filter-select__options"
              @change="onCheckboxChange"
            >
              <div v-for="option in options" :key="option.value" class="dq-dashboard-filter-select__option">
                <Checkbox :value="option.value">{{ option.label }}</Checkbox>
              </div>
            </Checkbox.Group>
          </Spin>
        </div>
      </template>
    </Dropdown>
  </div>
</template>

<style scoped>
.dq-dashboard-filter-select__trigger {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.dq-dashboard-filter-select__badge :deep(.ant-badge-count) {
  background: var(--sm-color-primary);
}

.dq-dashboard-filter-select__panel {
  padding: 8px 12px;
  min-width: 220px;
  max-width: 320px;
  max-height: 320px;
  overflow: auto;
  background: var(--sm-bg-elevated, #fff);
  border-radius: var(--sm-radius-md, 8px);
  box-shadow: 0 6px 16px rgba(0, 0, 0, 0.08);
}

.dq-dashboard-filter-select__search {
  margin-bottom: 4px;
  width: 100%;
}

.dq-dashboard-filter-select__select-all {
  padding: 0;
  height: auto;
  margin-bottom: 8px;
}

.dq-dashboard-filter-select__options {
  display: flex;
  flex-direction: column;
  gap: 4px;
  width: 100%;
}

.dq-dashboard-filter-select__option {
  display: block;
}
</style>