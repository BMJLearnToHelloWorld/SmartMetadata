<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { Input, Select, Typography } from 'ant-design-vue';
import { listTeams } from '@/api/teams';
import { listUsers } from '@/api/users';
import { ownersFromCell } from '@/features/csv/metricBulkEdit';

/**
 * Official CSV owner editor (CSVUtilsClassBase getCsvOwnerEditor):
 * a user/team dropdown whose cell value is `type:name` entries joined by
 * ';'. Options come from the real user + team listings (first 100 each,
 * client-side filtered); if either listing fails, the editor falls back
 * to a plain text input so the cell stays editable instead of dead.
 */
const props = defineProps<{ modelValue: string; testId?: string }>();
const emit = defineEmits<{ 'update:modelValue': [value: string] }>();
const { t } = useI18n();

interface OwnerOption {
  value: string;
  label: string;
}

const options = ref<OwnerOption[]>([]);
const loadFailed = ref(false);

const selected = computed({
  get: () =>
    ownersFromCell(props.modelValue).map((owner) =>
      owner.type ? `${owner.type}:${owner.name}` : owner.name,
    ),
  set: (values: string[]) => {
    emit('update:modelValue', values.join(';'));
  },
});

onMounted(async () => {
  try {
    const [users, teams] = await Promise.all([
      listUsers({ limit: 100 }),
      listTeams({ limit: 100 }),
    ]);
    options.value = [
      ...users.data.map((user) => ({
        value: `user:${user.name}`,
        label: user.displayName ?? user.name,
      })),
      ...teams.data.map((team) => ({
        value: `team:${team.name}`,
        label: team.displayName ?? team.name,
      })),
    ];
  } catch {
    loadFailed.value = true;
  }
});
</script>

<template>
  <Input
    v-if="loadFailed"
    :value="modelValue"
    :data-testid="testId"
    @change="(event: Event) => emit('update:modelValue', (event.target as HTMLInputElement).value)"
  />
  <template v-else>
    <Select
      v-model:value="selected"
      mode="multiple"
      show-search
      :placeholder="t('bulkImport.ownerPlaceholder')"
      :options="options"
      :data-testid="testId"
      style="width: 100%"
      :filter-option="
        (input: string, option?: { label?: string; value?: string }) =>
          `${option?.label ?? ''} ${option?.value ?? ''}`.toLowerCase().includes(input.toLowerCase())
      "
    />
    <Typography.Text v-if="options.length === 0" type="secondary">
      {{ t('bulkImport.ownerLoading') }}
    </Typography.Text>
  </template>
</template>
