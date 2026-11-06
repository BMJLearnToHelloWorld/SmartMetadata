<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { Select, Typography } from 'ant-design-vue';
import { useI18n } from 'vue-i18n';
import { listTeams } from '@/api/teams';
import { listUsers, searchUsers } from '@/api/users';
import type { EntityRef } from '@/types/api';

/**
 * R-11: the product has no UserTeamSelectableList component. This picker
 * follows the product's own OwnerCellEditor idiom — antd Select multiple
 * with `user:${name}` / `team:${name}` option values, users + teams loaded
 * on mount — plus remote user search (official's picker searches; a plain
 * first-100 list would silently drop users in a large org). Teams have no
 * search endpoint in the product API layer, so teams are client-side
 * filtered only. Values are EntityRefs ({id, type, name,
 * fullyQualifiedName, displayName}); the approval/collect forms reduce
 * them to the AssigneeCandidate payload on save.
 */
const props = withDefaults(
  defineProps<{
    modelValue: EntityRef[];
    disabled?: boolean;
    testId?: string;
  }>(),
  { disabled: false, testId: 'user-team-picker' },
);
const emit = defineEmits<{ 'update:modelValue': [value: EntityRef[]] }>();

const { t } = useI18n();

interface PickerOption {
  value: string;
  label: string;
  ref: EntityRef;
}

const options = ref<PickerOption[]>([]);
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
    { value, label: ref.displayName ?? ref.name, ref },
  ];
}

// Pre-saved candidates must resolve even before the first list loads.
for (const ref of props.modelValue) {
  upsertOption(ref);
}

const selected = ref<string[]>(
  props.modelValue
    .filter((ref) => ref.name && ref.type)
    .map((ref) => `${ref.type}:${ref.name}`),
);

function onSelectChange(values: string[]): void {
  selected.value = values;
  emit(
    'update:modelValue',
    values.flatMap((value) => {
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
      :placeholder="t('workflows.builder.selectUsersAndTeams')"
      :options="options"
      :data-testid="testId"
      style="width: 100%"
      :filter-option="
        (input: string, option?: { label?: string; value?: string }) =>
          `${option?.label ?? ''} ${option?.value ?? ''}`.toLowerCase().includes(input.toLowerCase())
      "
      @change="onSelectChange"
      @search="onSearch"
    />
    <Typography.Text v-if="loadFailed" type="danger">
      {{ t('workflows.builder.userTeamLoadFailed') }}
    </Typography.Text>
  </div>
</template>
