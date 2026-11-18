<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { Checkbox, Input, message, Modal, Spin } from 'ant-design-vue';
import { getEntityName } from '@/components/shared/profilePictureUtils';
import NoSearchResultsPlaceholder from '@/components/shared/NoSearchResultsPlaceholder.vue';
import { listPolicies } from '@/api/policies';
import { listRoles } from '@/api/roles';
import { getErrorText } from './accessApiErrors';

/**
 * AddAttributeModal equivalent (pin RolesPage/AddAttributeModal, 211
 * lines). Fetches the full role/policy list (limit 100) on open;
 * client-side case-sensitive substring search over name/displayName/
 * description; rows toggle selection; the modal title carries the
 * hardcoded English "(n/m selected)" suffix and the raw type string
 * (pin title prop is `Add ${type}` from the caller).
 *
 * Shared with 03-access §4.2 by design (one component, not one per
 * partition). Final home (integration decision): views/admin/ — all
 * mounting consumers are admin views (RoleDetailView,
 * TeamRolesPoliciesTab); it is an admin-scoped shared component, not
 * a design-system shared component. The 03 §4 deviation list (fetch
 * fields, highlight mechanics, Checkbox selection, placeholder
 * wrapper) is recorded as an integration residual: aligning it is a
 * behavior change across all consumers and needs pin re-verification,
 * not a single-pass integration fix. Fetch failure is NOT a deviation:
 * the catch shows an error toast (pin AddAttributeModal.tsx:98-99),
 * added by the B-QR-3 fix-up with a regression test.
 */

const props = defineProps<{
  open: boolean;
  type: 'role' | 'policy';
  title: string;
  selectedKeys: string[];
  saving?: boolean;
}>();

const emit = defineEmits<{
  cancel: [];
  save: [ids: string[]];
}>();

const { t } = useI18n();

interface AttributeOption {
  id: string;
  name: string;
  displayName?: string;
  description?: string;
}

const loading = ref(false);
const searchTerm = ref('');
const data = ref<AttributeOption[]>([]);
const selectedValues = ref<string[]>([...props.selectedKeys]);

const modalTitle = computed(
  () => `${props.title} (${selectedValues.value.length}/${data.value.length} selected)`,
);

const searchedData = computed(() => {
  if (!searchTerm.value) {
    return data.value;
  }
  return data.value.filter(
    (option) =>
      option.name?.includes(searchTerm.value) ||
      option.displayName?.includes(searchTerm.value) ||
      option.description?.includes(searchTerm.value),
  );
});

watch(
  () => props.open,
  async (open) => {
    if (!open) {
      return;
    }
    selectedValues.value = [...props.selectedKeys];
    searchTerm.value = '';
    loading.value = true;
    try {
      if (props.type === 'policy') {
        const page = await listPolicies({ limit: 100 });
        data.value = page.data;
      } else {
        const page = await listRoles(100);
        data.value = page.data;
      }
    } catch (error) {
      // Pin AddAttributeModal.tsx:98-99: the fetch catch shows an error
      // toast and nothing else (no inline error surface in the modal).
      message.error(getErrorText(error, t('crud.loadFailed')));
    } finally {
      loading.value = false;
    }
  },
);

function toggleValue(id: string): void {
  selectedValues.value = selectedValues.value.includes(id)
    ? selectedValues.value.filter((value) => value !== id)
    : [...selectedValues.value, id];
}

/** Splits text on the (case-sensitive) search term for <mark> highlighting. */
function highlightParts(text: string): Array<{ text: string; match: boolean }> {
  if (!searchTerm.value) {
    return [{ text, match: false }];
  }
  const parts = text.split(searchTerm.value);
  const result: Array<{ text: string; match: boolean }> = [];
  parts.forEach((part, index) => {
    if (part) {
      result.push({ text: part, match: false });
    }
    if (index < parts.length - 1) {
      result.push({ text: searchTerm.value, match: true });
    }
  });
  return result;
}
</script>

<template>
  <Modal
    :open="open"
    :title="modalTitle"
    :ok-text="t('label.save')"
    :cancel-text="t('crud.cancel')"
    :confirm-loading="saving"
    :mask-closable="false"
    width="750"
    data-testid="modal-container"
    @ok="emit('save', [...selectedValues])"
    @cancel="emit('cancel')"
  >
    <Spin v-if="loading" :spinning="true" />
    <template v-else>
      <Input
        v-model:value="searchTerm"
        :aria-label="t('label.search-entity', { entity: type })"
        :placeholder="t('label.search-entity', { entity: type })"
        data-testid="search-input"
        class="add-attribute-modal__search"
      />
      <NoSearchResultsPlaceholder v-if="searchedData.length === 0" test-id="search-error-placeholder" />
      <div v-else>
        <div
          v-for="option in searchedData"
          :key="option.id"
          class="add-attribute-modal__row"
          :class="{ 'add-attribute-modal__row--selected': selectedValues.includes(option.id) }"
          data-testid="policy-row"
          @click="toggleValue(option.id)"
        >
          <Checkbox :checked="selectedValues.includes(option.id)" />
          <span
            ><template v-for="(part, partIndex) in highlightParts(getEntityName(option))" :key="partIndex"
              ><mark v-if="part.match">{{ part.text }}</mark
              ><template v-else>{{ part.text }}</template></template
            ></span
          >
          <span v-if="option.description" class="add-attribute-modal__desc">{{
            option.description
          }}</span>
        </div>
      </div>
    </template>
  </Modal>
</template>

<style scoped>
.add-attribute-modal__search {
  margin-bottom: 12px;
}
.add-attribute-modal__row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px;
  cursor: pointer;
}
.add-attribute-modal__row--selected {
  background: var(--sm-color-primary-bg);
}
.add-attribute-modal__desc {
  color: var(--sm-text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
