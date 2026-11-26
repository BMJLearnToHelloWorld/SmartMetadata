<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { Alert, Button, Input, Spin, Typography, message } from 'ant-design-vue';
import { ADD_CUSTOM_PROPERTIES_DOCS, getPropertyTypeBadge } from '@/api/customProperties';
import PermissionPlaceholder from '@/components/shared/PermissionPlaceholder.vue';
import CustomPropertiesEditModal from '@/features/crud/CustomPropertiesEditModal.vue';
import type { CustomPropertyDef } from '@/types/collaboration';
import {
  fetchPreviewTypeDetail,
  filterPreviewCustomProperties,
  isCustomPropertyValueEmpty,
  summarizeCustomPropertyValue,
} from './previewCustomProperties';

const props = defineProps<{
  entityType: string;
  /** Formatted entity-type name for the empty state (pin `emptyStateMessage`). */
  entityLabel: string;
  extension: Record<string, unknown>;
  entityId: string | undefined;
  /** True while the parent's entity fetch is still running. */
  loading: boolean;
  /** Pin `viewCustomPropertiesPermission` (`canViewCustomFields`). */
  canView: boolean;
  /** Pin `hasEditPermissions` (`canEditCustomFields`); rows render read-only without it. */
  canEdit: boolean;
  /**
   * Whole-record save (the edit modal emits the full next extension,
   * mirroring the detail pages' `onSaveCustomProperties`); the parent
   * PATCHes it and refetches. Throws on failure so the modal stays open.
   */
  onSave: (next: Record<string, unknown>) => Promise<void>;
}>();

const { t, te } = useI18n();

// Pin CustomPropertiesSection: the tab fetches the type detail on
// activation (EntitySummaryPanel.component.tsx:895-896). This component
// is mounted with v-if when the tab becomes active, so onMounted is the
// activation fetch; `Loader` shows while entity/type detail loads
// (:112-114).
const defs = ref<CustomPropertyDef[]>([]);
const typeLoading = ref(true);
const typeError = ref<string | null>(null);
const searchText = ref('');
const modalOpen = ref(false);
const saving = ref(false);

onMounted(async () => {
  try {
    const type = await fetchPreviewTypeDetail(props.entityType);
    defs.value = type.customProperties ?? [];
  } catch (error) {
    typeError.value = error instanceof Error ? error.message : t('crud.loadFailed');
  } finally {
    typeLoading.value = false;
  }
});

const filteredDefs = computed(() => filterPreviewCustomProperties(defs.value, searchText.value));

function typeLabel(def: CustomPropertyDef): string {
  const badge = getPropertyTypeBadge(def.propertyType);
  return badge.labelKey && te(badge.labelKey) ? t(badge.labelKey) : badge.fallbackLabel;
}

function valueText(def: CustomPropertyDef): string | null {
  const value = props.extension[def.name];
  if (isCustomPropertyValueEmpty(def.propertyType, value)) {
    return null;
  }
  return summarizeCustomPropertyValue(def.propertyType, value, (key, params) => t(key, params ?? {}));
}

async function handleModalSave(next: Record<string, unknown>): Promise<void> {
  saving.value = true;
  try {
    await props.onSave(next);
    modalOpen.value = false;
  } catch (error) {
    message.error(error instanceof Error ? error.message : t('asset.updateFailed'));
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <div class="preview-custom-properties" data-testid="explore-preview-custom-properties">
    <Spin v-if="loading || typeLoading" data-testid="explore-preview-custom-properties-loading" />
    <!-- Pin CustomPropertiesSection.tsx:118-127: without
         canViewCustomFields the tab shows a PermissionPlaceholder. -->
    <PermissionPlaceholder
      v-else-if="!canView"
      :permission-value="t('label.view-entity', { entity: t('label.custom-property-plural') })"
    />
    <Alert
      v-else-if="typeError"
      type="warning"
      show-icon
      :message="typeError"
      data-testid="explore-preview-custom-properties-error"
    />
    <!-- Pin :98-117: docs-linked empty state when the type defines no
         custom properties at all. -->
    <div
      v-else-if="!defs.length && !searchText"
      class="preview-custom-properties__empty"
      data-testid="explore-preview-custom-properties-empty"
    >
      <Typography.Text>
        {{ t('explore.customPropertiesEmpty', { entity: entityLabel }) }}
      </Typography.Text>
      <a :href="ADD_CUSTOM_PROPERTIES_DOCS" target="_blank" rel="noopener">
        {{ t('label.documentation') }}
      </a>
    </div>
    <template v-else>
      <Input
        v-model:value="searchText"
        :placeholder="t('label.search-for-type', { type: t('label.custom-property') })"
        :aria-label="t('label.search-for-type', { type: t('label.custom-property') })"
        data-testid="searchbar"
      />
      <ul v-if="filteredDefs.length" class="preview-custom-properties__list" data-testid="custom-properties-list">
        <li
          v-for="def in filteredDefs"
          :key="def.name"
          class="preview-custom-properties__row"
          :data-testid="`custom-property-${def.name}-row`"
        >
          <span class="preview-custom-properties__type" data-testid="property-type">
            {{ typeLabel(def) }}
          </span>
          <span class="preview-custom-properties__body">
            <span class="preview-custom-properties__name" data-testid="property-name">
              {{ def.displayName || def.name }}
            </span>
            <!-- Pin CustomPropertyListItem: "No value yet" for empty
                 values, else the per-type value summary. -->
            <span
              class="preview-custom-properties__value"
              :class="{ 'preview-custom-properties__value--empty': valueText(def) === null }"
              data-testid="property-value"
            >
              {{ valueText(def) ?? t('label.no-value-yet') }}
            </span>
          </span>
          <!-- Pin: per-row edit icon, always visible on empty rows;
               without edit permission rows render read-only. The
               product's existing CustomPropertiesEditModal opens for
               the edit (whole-record form, prefilled from extension). -->
          <Button
            v-if="canEdit"
            type="text"
            size="small"
            :data-testid="`edit-custom-property-${def.name}`"
            :aria-label="t('label.edit')"
            @click="modalOpen = true"
          >
            {{ t('label.edit') }}
          </Button>
        </li>
      </ul>
      <!-- Pin: "no matching custom properties" when a search filters everything out. -->
      <div v-else data-testid="no-matching-custom-properties">
        {{ t('explore.customPropertiesNoMatch') }}
      </div>
    </template>
    <CustomPropertiesEditModal
      :open="modalOpen"
      :defs="defs"
      :values="extension"
      :saving="saving"
      @save="handleModalSave"
      @cancel="modalOpen = false"
    />
  </div>
</template>

<style scoped>
.preview-custom-properties {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.preview-custom-properties__empty {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.preview-custom-properties__list {
  margin: 0;
  padding: 0;
  list-style: none;
  border: 1px solid var(--sm-border-secondary);
  border-radius: var(--sm-border-radius);
}
.preview-custom-properties__row {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 8px 10px;
  border-bottom: 1px solid var(--sm-border-secondary);
}
.preview-custom-properties__row:last-child {
  border-bottom: 0;
}
.preview-custom-properties__type {
  flex-shrink: 0;
  width: 72px;
  color: var(--sm-text-tertiary);
  font-size: 12px;
}
.preview-custom-properties__body {
  display: flex;
  min-width: 0;
  flex: 1;
  flex-direction: column;
}
.preview-custom-properties__name {
  color: var(--sm-text-tertiary);
  font-size: 12px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.preview-custom-properties__value {
  font-size: 14px;
  overflow-wrap: break-word;
}
.preview-custom-properties__value--empty {
  color: var(--sm-text-tertiary);
}
</style>
