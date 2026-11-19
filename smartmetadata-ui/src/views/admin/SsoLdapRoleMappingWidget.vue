<!--
Copyright 2026 SmartMetadata authors.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0
-->
<script setup lang="ts">
import { DeleteOutlined, PlusOutlined } from '@ant-design/icons-vue';
import { Button, Input, Select } from 'ant-design-vue';
import type { SelectValue } from 'ant-design-vue/es/select';
import { onBeforeUnmount, onMounted, reactive, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { searchSsoRoles } from '@/api/ssoRoles';
import { showSsoErrorToast } from '@/admin/ssoToasts';

const props = withDefaults(
  defineProps<{
    fieldId: string;
    modelValue?: string;
    disabled?: boolean;
    readonly?: boolean;
  }>(),
  { modelValue: undefined, disabled: false, readonly: false },
);

const emit = defineEmits<{
  change: [value: string];
}>();

const { t } = useI18n();

interface RoleMappingEntry {
  id: string;
  ldapGroup: string;
  roles: string[];
}

interface RoleOption {
  label: string;
  value: string;
}

// Stable ids for parsed rows, keyed `${index}-${ldapGroup}`; new rows
// get `new-${Date.now()}-${Math.random()}` ids.
const stableIdMap = new Map<string, string>();
let idCounter = 0;

function getStableId(ldapGroup: string, index: number): string {
  const key = `${index}-${ldapGroup}`;
  let stableId = stableIdMap.get(key);
  if (!stableId) {
    idCounter += 1;
    stableId = `mapping-${idCounter}`;
    stableIdMap.set(key, stableId);
  }
  return stableId;
}

// The stored value is parsed ONCE, from the initial prop: later external
// changes do not re-parse (pin's isInitialMount guard), so a
// Cancel-discard leaves stale local rows until remount.
function parseInitialMappings(raw: string | undefined): RoleMappingEntry[] {
  if (!raw || typeof raw !== 'string') {
    return [];
  }
  try {
    const parsed = JSON.parse(raw) as Record<string, string[]>;
    return Object.entries(parsed).map(([ldapGroup, roles], index) => ({
      id: getStableId(ldapGroup, index),
      ldapGroup,
      roles,
    }));
  } catch {
    return [];
  }
}

const mappings = ref<RoleMappingEntry[]>(
  parseInitialMappings(props.modelValue),
);
const availableRoles = ref<RoleOption[]>([]);
const searchResults = reactive(new Map<string, RoleOption[]>());
const errors = ref<Record<string, string>>({});

function toOptions(
  roles: Array<{ displayName?: string; name: string }>,
): RoleOption[] {
  return roles.map((role) => ({
    label: role.displayName || role.name,
    value: role.name,
  }));
}

onMounted(async () => {
  try {
    availableRoles.value = toOptions(await searchSsoRoles(''));
  } catch (error) {
    showSsoErrorToast(error, t('sso.unexpectedError'), 'GET');
  }
});

function checkDuplicates(entries: RoleMappingEntry[]): boolean {
  const newErrors: Record<string, string> = {};
  const counts = new Map<string, number>();
  for (const mapping of entries) {
    if (mapping.ldapGroup.trim()) {
      const normalized = mapping.ldapGroup.trim().toLowerCase();
      counts.set(normalized, (counts.get(normalized) ?? 0) + 1);
    }
  }
  for (const mapping of entries) {
    if (mapping.ldapGroup.trim()) {
      const normalized = mapping.ldapGroup.trim().toLowerCase();
      if ((counts.get(normalized) ?? 0) > 1) {
        newErrors[mapping.id] = t('sso.ldapGroupDuplicateError');
      }
    }
  }
  errors.value = newErrors;
  return Object.keys(newErrors).length === 0;
}

function updateValue(entries: RoleMappingEntry[]): void {
  const isValid = checkDuplicates(entries);
  const result: Record<string, string[]> = {};
  for (const mapping of entries) {
    // Falsy check, not trim: a whitespace-only group IS serialized.
    if (mapping.ldapGroup) {
      result[mapping.ldapGroup] = mapping.roles;
    }
  }
  if (isValid) {
    emit('change', JSON.stringify(result));
  }
}

function handleAddMapping(): void {
  // Add does NOT call updateValue: no duplicate re-check, no onChange.
  mappings.value = [
    ...mappings.value,
    {
      id: `new-${Date.now()}-${Math.random()}`,
      ldapGroup: '',
      roles: [],
    },
  ];
}

function handleRemoveMapping(mappingId: string): void {
  const next = mappings.value.filter((m) => m.id !== mappingId);
  mappings.value = next;
  updateValue(next);
}

function handleLdapGroupChange(mappingId: string, ldapGroup: string): void {
  const next = mappings.value.map((m) =>
    m.id === mappingId ? { ...m, ldapGroup } : m,
  );
  mappings.value = next;
  updateValue(next);
}

/**
 * antd Select emits SelectValue (RawValue | LabeledValue, single or
 * array); this multiple select only ever carries plain string values,
 * so normalise to string[] here (same shape as UserTeamPicker).
 */
function asStringArray(value: SelectValue): string[] {
  const list = value === undefined ? [] : Array.isArray(value) ? value : [value];
  return list.map((item) =>
    typeof item === 'object' && item !== null ? String(item.value) : String(item),
  );
}

function handleRolesChange(mappingId: string, roles: string[]): void {
  const next = mappings.value.map((m) =>
    m.id === mappingId ? { ...m, roles } : m,
  );
  mappings.value = next;
  updateValue(next);
}

// One shared debounced search across all mappings: typing in one row
// cancels a pending search from another row.
let searchTimer: ReturnType<typeof setTimeout> | undefined;

async function runSearch(mappingId: string, searchText: string): Promise<void> {
  try {
    const results = await searchSsoRoles(searchText);
    const currentMapping = mappings.value.find((m) => m.id === mappingId);
    const selectedRoles = new Set(currentMapping?.roles ?? []);
    const selectedRoleOptions = availableRoles.value.filter((role) =>
      selectedRoles.has(role.value),
    );
    const merged: RoleOption[] = [];
    const seen = new Set<string>();
    for (const option of [
      ...selectedRoleOptions,
      ...toOptions(results),
    ]) {
      if (!seen.has(option.value)) {
        seen.add(option.value);
        merged.push(option);
      }
    }
    searchResults.set(mappingId, merged);
  } catch (error) {
    showSsoErrorToast(error, t('sso.unexpectedError'), 'GET');
  }
}

function handleRolesSearch(mappingId: string, searchText: string): void {
  if (searchTimer !== undefined) {
    clearTimeout(searchTimer);
  }
  searchTimer = setTimeout(() => {
    void runSearch(mappingId, searchText);
  }, 300);
}

onBeforeUnmount(() => {
  if (searchTimer !== undefined) {
    clearTimeout(searchTimer);
  }
});

function getRoleItems(mappingId: string): RoleOption[] {
  return searchResults.get(mappingId) ?? availableRoles.value;
}

// Pin resolves selected labels from available + per-mapping search
// results; the union keeps antd's chips labelled the same way when a
// search has replaced the dropdown options.
function getSelectOptions(mapping: RoleMappingEntry): RoleOption[] {
  const known = [
    ...availableRoles.value,
    ...(searchResults.get(mapping.id) ?? []),
  ];
  const selected = mapping.roles.map((roleName) => ({
    value: roleName,
    label: known.find((role) => role.value === roleName)?.label ?? roleName,
  }));
  const merged: RoleOption[] = [];
  const seen = new Set<string>();
  for (const option of [...getRoleItems(mapping.id), ...selected]) {
    if (!seen.has(option.value)) {
      seen.add(option.value);
      merged.push(option);
    }
  }
  return merged;
}
</script>

<template>
  <div class="ldap-role-mapping-widget" :data-testid="fieldId">
    <div v-if="mappings.length > 0" class="sso-mapping-header">
      <span>{{ t('sso.ldapGroupDn') }}</span>
      <span>{{
        t('sso.openmetadataRolePlural', { brandName: t('product.name') })
      }}</span>
      <span />
    </div>

    <div
      v-for="mapping in mappings"
      :key="mapping.id"
      class="sso-mapping-card"
      :data-testid="`mapping-card-${mapping.id}`"
    >
      <div class="sso-mapping-row">
        <div class="sso-mapping-group">
          <Input
            :aria-label="t('sso.ldapGroupDn')"
            :data-testid="`ldap-group-input-${mapping.id}`"
            :disabled="disabled || readonly"
            :placeholder="t('sso.ldapGroupDnPlaceholder')"
            :value="mapping.ldapGroup"
            @update:value="
              (ldapGroup: string) =>
                handleLdapGroupChange(mapping.id, ldapGroup)
            "
          />
          <div
            v-if="errors[mapping.id]"
            :data-testid="`ldap-group-error-${mapping.id}`"
          >
            {{ errors[mapping.id] }}
          </div>
        </div>

        <div
          class="sso-mapping-roles"
          :data-testid="`roles-select-${mapping.id}`"
        >
          <Select
            mode="multiple"
            show-search
            :aria-label="
              t('sso.openmetadataRolePlural', { brandName: t('product.name') })
            "
            :disabled="disabled || readonly"
            :filter-option="() => true"
            :options="getSelectOptions(mapping)"
            :placeholder="
              t('sso.selectField', { field: t('sso.rolePlural') })
            "
            :value="mapping.roles"
            @change="(value: SelectValue) => handleRolesChange(mapping.id, asStringArray(value))"
            @search="(text: string) => handleRolesSearch(mapping.id, text)"
          />
        </div>

        <Button
          :aria-label="
            t('sso.removeEntity', { entity: t('sso.mapping') })
          "
          :data-testid="`remove-mapping-btn-${mapping.id}`"
          :disabled="disabled || readonly"
          type="text"
          @click="handleRemoveMapping(mapping.id)"
        >
          <template #icon>
            <DeleteOutlined :style="{ fontSize: '20px' }" />
          </template>
        </Button>
      </div>
    </div>

    <Button
      v-if="!readonly"
      block
      data-testid="add-mapping-btn"
      :disabled="disabled"
      @click="handleAddMapping"
    >
      <template #icon><PlusOutlined /></template>
      {{ t('sso.addEntity', { entity: t('sso.ldapGroupMapping') }) }}
    </Button>

    <div v-if="mappings.length === 0 && readonly">
      {{ t('sso.noLdapRoleMappings') }}
    </div>
  </div>
</template>

<style scoped>
.sso-mapping-header,
.sso-mapping-row {
  display: flex;
}
</style>
