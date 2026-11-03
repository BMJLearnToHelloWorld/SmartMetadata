<!--
  Copyright 2026 SmartMetadata authors.

  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { listUsers } from '@/api/users';
import { Checkbox } from 'ant-design-vue';
import type { AdminUser } from '@/types/admin';

/**
 * Lazy user multi-select, shared by the persona create modal and the
 * detail add-users modal. Users load once when the picker opens; a
 * load failure leaves an empty list with a note instead of blocking
 * the surrounding form, mirroring the owners-picker tolerance used
 * for marketplace creates.
 */
const props = defineProps<{
  modelValue: string[];
  excludedIds?: string[];
}>();

const emit = defineEmits<{ 'update:modelValue': [ids: string[]] }>();

const { t } = useI18n();
const users = ref<AdminUser[]>([]);
const loaded = ref(false);
const loadFailed = ref(false);

async function load(): Promise<void> {
  if (loaded.value) {
    return;
  }
  loaded.value = true;
  try {
    const page = await listUsers({ limit: 100 });
    users.value = page.data.filter((user) => !(props.excludedIds ?? []).includes(user.id));
  } catch {
    loadFailed.value = true;
    users.value = [];
  }
}

watch(
  () => props.modelValue,
  () => {
    void load();
  },
  { immediate: true },
);

function onChange(ids: string[]): void {
  emit('update:modelValue', ids);
}
</script>

<template>
  <div data-testid="persona-user-picker">
    <Checkbox.Group :model-value="modelValue" @change="(ids) => onChange(ids as string[])">
      <div v-for="user in users" :key="user.id" class="persona-user-picker__row">
        <Checkbox :value="user.id" :data-testid="`persona-user-option-${user.id}`">
          {{ user.displayName || user.name }}
        </Checkbox>
      </div>
    </Checkbox.Group>
    <p v-if="loadFailed" class="persona-user-picker__error">{{ t('persona.usersLoadFailed') }}</p>
    <p v-if="!loadFailed && users.length === 0" class="persona-user-picker__empty">
      {{ t('persona.noUsersAvailable') }}
    </p>
  </div>
</template>

<style scoped>
.persona-user-picker__row {
  margin: 4px 0;
}
.persona-user-picker__error {
  color: var(--sm-color-error-text);
}
</style>
