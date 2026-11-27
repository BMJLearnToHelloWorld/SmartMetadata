<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed, ref, type VNode } from 'vue';

defineOptions({ name: 'ExploreFilterChipField' });
import { useI18n } from 'vue-i18n';
import { DownOutlined } from '@ant-design/icons-vue';
import { Button, Checkbox, Dropdown, Input, Spin } from 'ant-design-vue';

export interface FilterChipOption {
  value: string;
  label: string | VNode;
}

const props = defineProps<{
  title: string;
  options: FilterChipOption[];
  value: string[];
  searching?: boolean;
}>();

const emit = defineEmits<{
  change: [values: string[]];
  open: [open: boolean];
  search: [text: string];
}>();

const { t } = useI18n();
const open = ref(false);
const searchText = ref('');

const triggerLabel = computed(() => {
  // Official FilterSelect showSelectedCounts: the trigger stays the field
  // label plus an optional selected count, e.g. 数据资产:(1). Selected
  // values render in the query bar, not as tags in the trigger.
  if (props.value.length) {
    return `${props.title}:(${props.value.length})`;
  }
  return props.title;
});

function onOpenChange(next: boolean): void {
  open.value = next;
  if (!next) {
    searchText.value = '';
  }
  emit('open', next);
}

function onSearch(text: string): void {
  searchText.value = text;
  emit('search', text);
}

function toggle(optionValue: string): void {
  const selected = props.value.includes(optionValue)
    ? props.value.filter((item) => item !== optionValue)
    : [...props.value, optionValue];
  emit('change', selected);
}
</script>

<template>
  <div class="chip-field">
  <Dropdown :open="open" :trigger="['click']" @openChange="onOpenChange">
    <Button type="text" size="small" class="chip-field__trigger" :aria-label="title">
      {{ triggerLabel }}
      <Spin v-if="searching" size="small" class="chip-field__spin" />
      <DownOutlined />
    </Button>
    <template #overlay>
      <div class="chip-field__menu" @click.stop>
        <Input
          :value="searchText"
          size="small"
          allow-clear
          class="chip-field__search"
          :placeholder="t('explore.chipEmpty')"
          @update:value="onSearch"
        />
        <div class="chip-field__options" role="listbox">
          <button
            v-for="option in options"
            :key="option.value"
            type="button"
            class="chip-field__option"
            :class="{ 'chip-field__option--selected': value.includes(option.value) }"
            :data-testid="`explore-chip-option-${option.value}`"
            role="option"
            :aria-selected="value.includes(option.value)"
            @click="toggle(option.value)"
          >
            <Checkbox :checked="value.includes(option.value)" @click.prevent />
            <span class="chip-field__option-label">
              <template v-if="typeof option.label === 'string'">{{ option.label }}</template>
              <component :is="() => option.label" v-else />
            </span>
          </button>
          <div v-if="!options.length" class="chip-field__empty">{{ t('explore.chipEmpty') }}</div>
        </div>
      </div>
    </template>
  </Dropdown>
  </div>
</template>

<style scoped>
.chip-field__trigger {
  font-size: 14px;
  color: var(--sm-text-secondary);
  padding-inline: 6px;
}
.chip-field__spin {
  margin-inline: 4px;
}
.chip-field__menu {
  min-width: 220px;
  max-width: 320px;
  padding: 8px;
  border-radius: var(--sm-border-radius);
  background: var(--sm-bg-container);
  box-shadow: 0 6px 16px rgba(0, 0, 0, 0.08);
}
.chip-field__search {
  margin-bottom: 8px;
}
.chip-field__options {
  display: flex;
  flex-direction: column;
  max-height: 240px;
  overflow: auto;
}
.chip-field__option {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 4px 6px;
  border: none;
  border-radius: 4px;
  background: transparent;
  text-align: left;
  cursor: pointer;
}
.chip-field__option:hover,
.chip-field__option--selected {
  background: var(--sm-bg-elevated, rgba(0, 0, 0, 0.04));
}
.chip-field__option-label {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
}
.chip-field__empty {
  padding: 8px 6px;
  color: var(--sm-text-tertiary);
  font-size: 13px;
}
</style>
