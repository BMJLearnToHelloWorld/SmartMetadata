<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { message, Skeleton } from 'ant-design-vue';
import type { ChangeDescription } from '@/api/entities';
import { CUSTOM_PROPERTIES_DOCS } from '@/api/customProperties';
import PermissionPlaceholder from '@/components/shared/PermissionPlaceholder.vue';
import { useEntityTypeCustomProperties } from '@/composables/useEntityTypeCustomProperties';
import {
  getChangedEntityNewValue,
  getDiffByFieldName,
  getUpdatedExtensionDiffFields,
} from '@/ingestion/versionDiff';
import { getErrorText } from '@/views/admin/accessApiErrors';
import CustomPropertyVersionList from './CustomPropertyVersionList.vue';

/**
 * Official CustomPropertyTable. This cut lands the version-page path
 * (`isVersionView`) including type-def loading, extension diffs, and
 * typed read-only cells. Live-page card editing stays on the existing
 * AssetCustomPropertiesPanel surface.
 */
const props = withDefaults(
  defineProps<{
    entityType: string;
    hasEditAccess: boolean;
    hasPermission: boolean;
    isVersionView?: boolean;
    entityDetails?: {
      extension?: Record<string, unknown>;
      changeDescription?: ChangeDescription;
      fullyQualifiedName?: string;
    };
  }>(),
  { isVersionView: false },
);

const { t } = useI18n();
const { customProperties, isLoading, error } = useEntityTypeCustomProperties(
  computed(() => props.entityType),
);

watch(error, (err) => {
  if (err) {
    message.error(getErrorText(err, t('shared.loadFailed')));
  }
});

function parseAddedExtensionFields(newValues: unknown): Record<string, unknown> | undefined {
  try {
    const parsed = typeof newValues === 'string' ? JSON.parse(newValues) : newValues;
    const addedFields = Array.isArray(parsed) ? parsed[0] : undefined;
    if (addedFields && typeof addedFields === 'object') {
      return addedFields as Record<string, unknown>;
    }
  } catch {
    return undefined;
  }
  return undefined;
}

interface VersionExtensionState {
  extensionObject?: Record<string, unknown>;
  addedKeysList?: string[];
}

const extensionObject = computed<VersionExtensionState>(() => {
  if (props.isVersionView) {
    const changeDescription = props.entityDetails?.changeDescription;
    const extensionDiff = getDiffByFieldName('extension', changeDescription);
    const newValues = getChangedEntityNewValue(extensionDiff);

    if (extensionDiff.added) {
      const addedFields = parseAddedExtensionFields(newValues);
      if (addedFields) {
        return {
          extensionObject: props.entityDetails?.extension,
          addedKeysList: Object.keys(addedFields),
        };
      }
    }

    if (props.entityDetails && extensionDiff.updated) {
      return getUpdatedExtensionDiffFields(props.entityDetails, extensionDiff);
    }
  }

  return { extensionObject: props.entityDetails?.extension };
});

const showEmptyPlaceholder = computed(
  () =>
    customProperties.value.length === 0 &&
    props.entityDetails?.extension === undefined,
);

const entityLabel = computed(() =>
  props.entityType
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .toLowerCase(),
);
</script>

<template>
  <div
    v-if="isLoading"
    class="custom-property-table__loader"
    data-testid="custom-property-table-loader"
  >
    <Skeleton active :paragraph="{ rows: 3 }" :title="false" />
  </div>
  <PermissionPlaceholder
    v-else-if="!hasPermission"
    data-testid="permission-error-placeholder"
    :permission-value="t('label.view-entity', { entity: t('label.custom-property-plural') })"
  />
  <div
    v-else-if="showEmptyPlaceholder"
    class="custom-property-table__empty"
    data-testid="create-error-placeholder"
  >
    <h3>{{ t('label.no-custom-properties-defined') }}</h3>
    <p>
      {{ t('message.custom-property-empty-description', { entity: entityLabel }) }}
    </p>
    <a :href="CUSTOM_PROPERTIES_DOCS" target="_blank" rel="noreferrer" data-testid="custom-property-read-docs">
      {{ t('label.read-type', { type: t('label.doc-plural') }) }}
    </a>
  </div>
  <CustomPropertyVersionList
    v-else-if="isVersionView && customProperties.length > 0"
    :added-keys="extensionObject.addedKeysList"
    :extension="extensionObject.extensionObject"
    :properties="customProperties"
  />
</template>

<style scoped>
.custom-property-table__loader,
.custom-property-table__empty {
  padding: 24px;
  border: 1px solid var(--sm-color-border, rgba(0, 0, 0, 0.08));
  border-radius: 8px;
  background: var(--sm-color-bg, #fff);
}
.custom-property-table__empty h3 {
  margin: 0 0 8px;
  font-size: 16px;
  font-weight: 600;
  color: var(--sm-color-text, inherit);
}
.custom-property-table__empty p {
  margin: 0 0 12px;
  color: var(--sm-color-text-secondary, rgba(0, 0, 0, 0.45));
}
</style>
