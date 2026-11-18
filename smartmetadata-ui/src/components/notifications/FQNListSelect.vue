<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue';
import { Select, Tag } from 'ant-design-vue';
import type { SelectValue } from 'ant-design-vue/es/select';
import {
  reportErrorToast,
  resolveWildcardFqns,
  type AlertSearchHooks,
  type NameSearch,
} from '@/utils/notifications/alertSourceSearch';

/**
 * FQN multi-select, ported from pin
 * components/Alerts/FQNListSelect/FQNListSelect.component.tsx. Search
 * is debounced 400ms with a request-id staleness guard; saved FQNs
 * that name a container entity show the display-only `.*` subtree
 * hint, which is never persisted. Failures toast the server's message.
 */
const props = withDefaults(
  defineProps<{
    api: NameSearch;
    value?: string[];
    searchIndex: string | string[];
    containerEntities?: string[];
    placeholder?: string;
    testId?: string;
    disabled?: boolean;
    hint?: string;
    hooks: AlertSearchHooks;
  }>(),
  {
    value: () => [],
    containerEntities: () => [],
    placeholder: undefined,
    testId: 'fqn-list-select',
    disabled: false,
    hint: undefined,
  },
);
const emit = defineEmits<{ 'update:value': [value: string[]] }>();

interface Item {
  id: string;
  label: string;
}

const wildcards = ref<string[]>([]);
const items = ref<Item[]>([]);
const loading = ref(false);
const requestId = ref(0);

let wildcardRun = 0;
watch(
  [() => props.value, () => props.searchIndex, () => props.containerEntities],
  () => {
    const run = ++wildcardRun;
    void resolveWildcardFqns(props.value, props.searchIndex, props.containerEntities).then(
      (found) => {
        if (run === wildcardRun) {
          wildcards.value = found;
        }
      },
    );
  },
  { immediate: true },
);

let searchTimer: ReturnType<typeof setTimeout> | undefined;
function search(text: string): void {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    const id = ++requestId.value;
    loading.value = true;
    props
      .api(text)
      .then((options) => {
        if (id === requestId.value) {
          const seen = new Set<string>();
          items.value = options
            .map((option) => ({ id: option.value, label: option.label }))
            .filter((item) => {
              if (seen.has(item.id)) {
                return false;
              }
              seen.add(item.id);
              return true;
            });
        }
      })
      .catch((error: unknown) => {
        if (id === requestId.value) {
          reportErrorToast(error, props.hooks);
        }
      })
      .finally(() => {
        if (id === requestId.value) {
          loading.value = false;
        }
      });
  }, 400);
}

watch(
  () => props.api,
  () => {
    clearTimeout(searchTimer);
    requestId.value += 1;
    search('');
  },
  { immediate: true },
);

onBeforeUnmount(() => {
  clearTimeout(searchTimer);
  requestId.value += 1;
});

function onChange(values: SelectValue): void {
  const next = (Array.isArray(values) ? values : [values]).map((value) => String(value));
  emit('update:value', [...new Set(next)]);
}
</script>

<template>
  <div>
    <Select
      :value="value"
      mode="multiple"
      show-search
      :filter-option="() => true"
      :loading="loading"
      :disabled="disabled"
      :placeholder="placeholder"
      :data-testid="testId"
      :status="hint ? 'error' : undefined"
      :aria-label="placeholder"
      style="width: 100%"
      :options="
        items.map((item) => ({ value: item.id, label: item.label }))
      "
      @search="search"
      @change="onChange"
    >
      <template #tagRender="{ value: tagValue, label, closable, onClose }">
        <Tag :closable="closable && !disabled" @close="onClose">
          {{ wildcards.includes(String(tagValue)) ? `${tagValue}.*` : label }}
        </Tag>
      </template>
    </Select>
    <div v-if="hint" class="fqn-list-select__hint">{{ hint }}</div>
  </div>
</template>

<style scoped>
.fqn-list-select__hint {
  color: var(--sm-color-error);
  font-size: 12px;
  margin-top: 4px;
}
</style>
