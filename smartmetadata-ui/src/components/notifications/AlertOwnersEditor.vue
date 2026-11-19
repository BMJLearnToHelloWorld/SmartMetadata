<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { onMounted, ref, watch } from 'vue';
import { Select, Typography } from 'ant-design-vue';
import type { DefaultOptionType, SelectValue } from 'ant-design-vue/es/select';
import { useI18n } from 'vue-i18n';
import { listTeams } from '@/api/teams';
import { listUsers, searchUsers } from '@/api/users';
import type { EntityRef } from '@/types/api';

/**
 * Alert owners editor. Pin renders UserTeamSelectableList with
 * multiple {user: true, team: false}: users multi-selectable, teams
 * listed but not selectable. The product has no such component — the
 * workflow UserTeamPicker lets teams be picked — so this editor
 * follows that picker's idiom (antd Select multiple with
 * `user:${name}` / `team:${name}` values, users + teams loaded on
 * mount, remote user search) with team options disabled.
 */
const props = withDefaults(
  defineProps<{
    modelValue: EntityRef[];
    disabled?: boolean;
    testId?: string;
  }>(),
  { disabled: false, testId: 'alert-owners-editor' },
);
const emit = defineEmits<{ 'update:modelValue': [value: EntityRef[]] }>();
const { t } = useI18n();

interface OwnerOption {
  value: string;
  label: string;
  disabled: boolean;
  ref: EntityRef;
}

const options = ref<OwnerOption[]>([]);
const loadFailed = ref(false);
const refByValue = new Map<string, EntityRef>();

function upsertOption(ref: EntityRef): void {
  if (!ref.name || !ref.type) {
    return;
  }
  const value = `${ref.type}:${ref.name}`;
  if (refByValue.has(value)) {
    return;
  }
  refByValue.set(value, ref);
  options.value = [
    ...options.value,
    {
      value,
      label: ref.displayName ?? ref.name,
      disabled: ref.type === 'team',
      ref,
    },
  ];
}

// Pre-saved owners must resolve even before the first list loads.
for (const ref of props.modelValue) {
  upsertOption(ref);
}

const selected = ref<string[]>(
  props.modelValue
    .filter((ref) => ref.name && ref.type)
    .map((ref) => `${ref.type}:${ref.name}`),
);

watch(
  () => props.modelValue,
  (refs) => {
    for (const ref of refs) {
      upsertOption(ref);
    }
    selected.value = refs
      .filter((ref) => ref.name && ref.type)
      .map((ref) => `${ref.type}:${ref.name}`);
  },
);

function filterOption(input: string, option?: DefaultOptionType): boolean {
  const haystack = `${String(option?.label ?? '')} ${String(option?.value ?? '')}`.toLowerCase();
  return haystack.includes(input.toLowerCase());
}

function onSelectChange(values: SelectValue): void {
  const selectedValues = (
    values === undefined ? [] : Array.isArray(values) ? values : [values]
  ).map((value) =>
    typeof value === 'object' && value !== null ? String(value.value) : String(value),
  );
  selected.value = selectedValues;
  emit(
    'update:modelValue',
    selectedValues.flatMap((value) => {
      const ref = refByValue.get(value);
      return ref ? [ref] : [];
    }),
  );
}

let searchTimer: ReturnType<typeof setTimeout> | undefined;
function onSearch(text: string): void {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    void searchUsers(text, 0, 25, 'isBot:false')
      .then((page) => {
        for (const user of page.data) {
          upsertOption({
            id: user.id,
            type: 'user',
            name: user.name,
            displayName: user.displayName,
            fullyQualifiedName: user.name,
          });
        }
      })
      .catch(() => {
        // A failed remote search leaves the mounted options in place.
      });
  }, 300);
}

onMounted(async () => {
  try {
    const [users, teams] = await Promise.all([
      listUsers({ limit: 100 }),
      listTeams({ limit: 100 }),
    ]);
    for (const user of users.data) {
      upsertOption({
        id: user.id,
        type: 'user',
        name: user.name,
        displayName: user.displayName,
        fullyQualifiedName: user.name,
      });
    }
    for (const team of teams.data) {
      upsertOption({
        id: team.id,
        type: 'team',
        name: team.name,
        displayName: team.displayName,
        fullyQualifiedName: team.name,
      });
    }
  } catch {
    loadFailed.value = true;
  }
});
</script>

<template>
  <div>
    <Select
      :value="selected"
      mode="multiple"
      show-search
      :disabled="disabled"
      :placeholder="t('label.select-field', { field: t('label.owner-plural') })"
      :options="options"
      :data-testid="testId"
      style="width: 100%"
      :filter-option="filterOption"
      @change="onSelectChange"
      @search="onSearch"
    />
    <Typography.Text v-if="loadFailed" type="danger">
      {{ t('server.entity-fetch-error', { entity: t('label.owner-plural') }) }}
    </Typography.Text>
  </div>
</template>
