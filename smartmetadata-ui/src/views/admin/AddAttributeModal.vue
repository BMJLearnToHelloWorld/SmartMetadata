<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { Input, message, Modal, Spin } from 'ant-design-vue';
import { CheckOutlined } from '@ant-design/icons-vue';
import { getEntityName } from '@/components/shared/profilePictureUtils';
import HighlightedText from '@/components/ingestion/HighlightedText.vue';
import NoSearchResultsPlaceholder from '@/components/shared/NoSearchResultsPlaceholder.vue';
import SmMarkdown from '@/components/shared/SmMarkdown.vue';
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
 * a design-system shared component.
 *
 * R-9 alignment (pin re-verified per item, see BENCHMARK.md):
 * - fetch fields: pin `getPolicies('', …, 100)` / `getRoles('', …,
 *   false, 100)` (AddAttributeModal.tsx:74,78) — the modal passes
 *   `fields: ''` and roles `default=false`, not the list defaults.
 * - fetch failure: the catch shows an error toast (pin :98-99).
 * - description: pin renders a markdown preview with the search term
 *   highlighted (AddAttributeModal.tsx:185-192) — `SmMarkdown` with
 *   the `highlight` prop; an empty description shows the grey
 *   `label.no-description` text, as pin's previewer does.
 * - highlight: pin `highlightSearchText` is case-insensitive
 *   (EntitySearchUtils.tsx:119-133) — `HighlightedText` for the name.
 * - selection: pin shows a Check icon only when selected
 *   (AddAttributeModal.tsx:193-200), no checkbox.
 * - empty state: pin wraps the placeholder in a relative, full-size,
 *   min-h-60, rounded, surface div (AddAttributeModal.tsx:161).
 * - dismissal: pin `isDismissable={false}` (:137) disables only the
 *   overlay click (SimpleModal); the product Modal matches it with
 *   `mask-closable="false"` plus the default close button and Escape.
 * Row layout follows pin's Grid 6/16/2 (name / description / check).
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
        const page = await listPolicies({ limit: 100, fields: '' });
        data.value = page.data;
      } else {
        const page = await listRoles(100, undefined, '', false);
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
      <div v-if="searchedData.length === 0" class="add-attribute-modal__empty">
        <NoSearchResultsPlaceholder test-id="search-error-placeholder" />
      </div>
      <div v-else>
        <div
          v-for="option in searchedData"
          :key="option.id"
          class="add-attribute-modal__row"
          :class="{ 'add-attribute-modal__row--selected': selectedValues.includes(option.id) }"
          data-testid="policy-row"
          @click="toggleValue(option.id)"
        >
          <div class="add-attribute-modal__name">
            <HighlightedText :text="getEntityName(option)" :search-text="searchTerm" />
          </div>
          <div class="add-attribute-modal__desc">
            <SmMarkdown
              v-if="option.description"
              :markdown="option.description"
              :highlight="searchTerm"
            />
            <span v-else class="add-attribute-modal__no-desc">{{ t('label.no-description') }}</span>
          </div>
          <div class="add-attribute-modal__check">
            <CheckOutlined
              v-if="selectedValues.includes(option.id)"
              data-testid="selected-check-icon"
            />
          </div>
        </div>
      </div>
    </template>
  </Modal>
</template>

<style scoped>
.add-attribute-modal__search {
  margin-bottom: 12px;
}
/* Pin AddAttributeModal.tsx:161: relative, full-size, min-h-60,
   rounded, surface — radii/surface translated to product tokens. */
.add-attribute-modal__empty {
  position: relative;
  height: 100%;
  width: 100%;
  min-height: 240px;
  border-radius: var(--sm-radius-card);
  background: var(--sm-bg-elevated);
}
.add-attribute-modal__row {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 12px;
  cursor: pointer;
}
.add-attribute-modal__row--selected {
  background: var(--sm-color-primary-bg);
}
/* Pin Grid 6/16/2: name ~25%, description flexible, check fixed. */
.add-attribute-modal__name {
  flex: 0 0 25%;
  min-width: 0;
  overflow-wrap: break-word;
}
.add-attribute-modal__desc {
  flex: 1 1 auto;
  min-width: 0;
  color: var(--sm-text-secondary);
}
.add-attribute-modal__no-desc {
  color: var(--sm-text-secondary);
}
.add-attribute-modal__check {
  flex: 0 0 auto;
  width: 24px;
  color: var(--sm-color-primary);
  text-align: center;
}
</style>
