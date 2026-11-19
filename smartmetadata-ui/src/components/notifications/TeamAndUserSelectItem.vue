<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref, watch } from 'vue';
import { Checkbox, Input, Popover, Tag } from 'ant-design-vue';
import { useI18n } from 'vue-i18n';
import type { NameOption } from '@/utils/notifications/alertSourceSearch';

/**
 * Team/user receiver picker, ported from pin
 * components/Alerts/DestinationFormItem/TeamAndUserSelectItem/TeamAndUserSelectItem.tsx:
 * a custom trigger showing the chosen values as tags, a popover with a
 * debounced remote search and checkbox option rows. Search failures
 * clear the options silently; the search itself owns its error toast.
 */
const props = withDefaults(
  defineProps<{
    entityType: string;
    destinationNumber: number;
    value?: string[];
    disabled?: boolean;
    onSearch: (searchText: string) => Promise<NameOption[]>;
  }>(),
  { value: () => [], disabled: false },
);
const emit = defineEmits<{ 'update:value': [value: string[]] }>();

const { t } = useI18n();

const isLoadingOptions = ref(false);
const isDropdownOpen = ref(false);
const searchText = ref('');
const options = ref<NameOption[]>([]);
const searchVersion = ref(0);
const searchTimer = ref<ReturnType<typeof setTimeout> | undefined>(undefined);
/** The search input's focus handle; antd-vue exports no InputRef type. */
const searchInputRef = ref<{ focus: () => void } | null>(null);

async function runSearch(value: string, version: number): Promise<void> {
  try {
    isLoadingOptions.value = true;
    const results = await props.onSearch(value);
    if (version === searchVersion.value) {
      options.value = results;
    }
  } catch {
    if (version === searchVersion.value) {
      options.value = [];
    }
  } finally {
    if (version === searchVersion.value) {
      isLoadingOptions.value = false;
    }
  }
}

watch(
  [searchText, () => props.entityType, () => props.disabled],
  () => {
    if (props.disabled) {
      clearTimeout(searchTimer.value);
      return;
    }
    const version = ++searchVersion.value;
    searchTimer.value = setTimeout(() => {
      void runSearch(searchText.value, version);
    }, 500);
    // Invalidate in-flight results as soon as the query or picker
    // changes, including the debounce interval before the replacement
    // request starts.
    return () => {
      searchVersion.value = version + 1;
      clearTimeout(searchTimer.value);
    };
  },
  { immediate: true },
);

onBeforeUnmount(() => {
  clearTimeout(searchTimer.value);
  searchVersion.value += 1;
});

watch(isDropdownOpen, async (open) => {
  if (open) {
    await nextTick();
    searchInputRef.value?.focus();
  }
});

function handleTriggerClick(): void {
  if (props.disabled) {
    return;
  }
  isDropdownOpen.value = !isDropdownOpen.value;
}

function handleOpenChange(open: boolean): void {
  if (props.disabled) {
    isDropdownOpen.value = false;
    return;
  }
  isDropdownOpen.value = open;
  if (!open) {
    searchText.value = '';
  }
}

function handleOptionClick(value: string): void {
  const isSelected = props.value.includes(value);
  emit(
    'update:value',
    isSelected ? props.value.filter((option) => option !== value) : [...props.value, value],
  );
}

function handleTagClose(value: string): void {
  emit(
    'update:value',
    props.value.filter((option) => option !== value),
  );
}
</script>

<template>
  <div class="team-user-select">
    <Popover :open="isDropdownOpen" trigger="click" placement="bottomLeft" @open-change="handleOpenChange">
      <template #content>
        <div :data-testid="`team-user-select-dropdown-${destinationNumber}`">
          <div data-testid="search-input">
            <Input
              ref="searchInputRef"
              v-model:value="searchText"
              data-testid="search-input-field"
              :placeholder="t('label.search-by-type', { type: entityType })"
            />
          </div>
          <div class="team-user-select__options">
            <div v-if="isLoadingOptions" class="team-user-select__loading">
              <div v-for="i in 3" :key="i" class="team-user-select__skeleton" />
            </div>
            <p v-else-if="options.length === 0" class="team-user-select__empty">
              {{ t('label.no-data-found') }}
            </p>
            <template v-else>
              <button
                v-for="option in options"
                :key="option.value"
                type="button"
                :data-testid="option.value"
                class="team-user-select__option"
                @click="handleOptionClick(option.value)"
              >
                <Checkbox
                  :data-testid="`${option.label}-option-checkbox`"
                  :checked="value.includes(option.value)"
                  class="team-user-select__checkbox"
                  tabindex="-1"
                />
                <span :data-testid="`${option.label}-option-label`" class="team-user-select__label">
                  {{ option.label }}
                </span>
              </button>
            </template>
          </div>
        </div>
      </template>
      <div
        role="button"
        :tabindex="disabled ? -1 : 0"
        :aria-disabled="disabled"
        :data-testid="`team-user-select-trigger-${destinationNumber}`"
        class="team-user-select__trigger"
        :class="{ 'team-user-select__trigger--disabled': disabled }"
        @keydown.enter.prevent="handleTriggerClick"
        @keydown.space.prevent="handleTriggerClick"
      >
        <span v-if="value.length === 0" data-testid="placeholder-text" class="team-user-select__placeholder">
          {{ t('label.please-select-entity', { entity: entityType }) }}
        </span>
        <template v-else>
          <Tag
            v-for="option in value"
            :key="option"
            :data-testid="`selected-tag-${option}`"
            :closable="!disabled"
            @click.stop
            @close="handleTagClose(option)"
          >
            {{ option }}
          </Tag>
        </template>
      </div>
    </Popover>
  </div>
</template>

<style scoped>
.team-user-select {
  position: relative;
  width: 100%;
}

.team-user-select__trigger {
  display: flex;
  min-height: 36px;
  width: 100%;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  border: 1px solid var(--sm-border);
  border-radius: var(--sm-radius-md);
  background: var(--sm-bg);
  padding: 6px 12px;
  cursor: pointer;
}

.team-user-select__trigger--disabled {
  cursor: not-allowed;
  opacity: 0.6;
}

.team-user-select__placeholder {
  color: var(--sm-text-placeholder);
  font-size: 14px;
}

.team-user-select__options {
  margin-top: 8px;
  max-height: 192px;
  overflow-y: auto;
}

.team-user-select__loading {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 8px;
}

.team-user-select__skeleton {
  height: 24px;
  border-radius: 4px;
  background: var(--sm-bg-secondary);
  animation: team-user-select-pulse 1.5s ease-in-out infinite;
}

@keyframes team-user-select-pulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.4;
  }
}

.team-user-select__empty {
  padding: 8px;
  text-align: center;
  font-size: 14px;
  color: var(--sm-text-secondary);
}

.team-user-select__option {
  display: flex;
  width: 100%;
  align-items: center;
  gap: 8px;
  border-radius: 6px;
  padding: 6px 8px;
  text-align: left;
  background: transparent;
  border: none;
  cursor: pointer;
}

.team-user-select__option:hover {
  background: var(--sm-bg-secondary);
}

.team-user-select__checkbox {
  pointer-events: none;
}

.team-user-select__label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 14px;
}
</style>
