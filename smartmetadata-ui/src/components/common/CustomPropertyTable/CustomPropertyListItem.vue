<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed, useSlots } from 'vue';
import { useI18n } from 'vue-i18n';
import type { CustomPropertyDef } from '@/types/collaboration';
import { getEntityName } from '@/components/shared/profilePictureUtils';
import { isCustomPropertyValueEmpty, summarizeCustomPropertyValue } from '@/features/explore/previewCustomProperties';

/**
 * Official CustomPropertyListItem, used read-only on the version-page
 * Custom Properties tab (`hasEditPermissions` is false there). Edit
 * affordances stay off this surface; the live widget already has its
 * own editor.
 */
const props = withDefaults(
  defineProps<{
    property: CustomPropertyDef;
    value?: unknown;
    hasEditPermissions?: boolean;
  }>(),
  { hasEditPermissions: false },
);

const { t } = useI18n();
const slots = useSlots();
const hasValueContent = computed(() => Boolean(slots.value));
const typeName = computed(() => props.property.propertyType);
const propertyLabel = computed(
  () => getEntityName(props.property) || props.property.displayName || props.property.name,
);
const isEmptyValue = computed(() => isCustomPropertyValueEmpty(typeName.value, props.value));
const summary = computed(() =>
  isEmptyValue.value
    ? t('label.not-set')
    : summarizeCustomPropertyValue(typeName.value, props.value, t),
);
</script>

<template>
  <li
    :data-testid="`custom-property-${property.name}-row`"
    class="custom-property-list-item"
  >
    <div class="custom-property-list-item__body">
      <span class="custom-property-list-item__name" data-testid="property-name">
        {{ propertyLabel }}
      </span>
      <div v-if="hasValueContent" class="custom-property-list-item__value" data-testid="property-value">
        <slot name="value" />
      </div>
      <span
        v-else
        class="custom-property-list-item__value"
        :class="{ 'is-empty': isEmptyValue }"
        data-testid="property-value"
      >
        {{ summary }}
      </span>
    </div>
  </li>
</template>

<style scoped>
.custom-property-list-item {
  list-style: none;
  min-width: 0;
  padding: 12px 16px;
  border: 1px solid var(--sm-color-border, rgba(0, 0, 0, 0.08));
  border-radius: 12px;
  background: var(--sm-color-bg, #fff);
}
.custom-property-list-item__body {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 4px;
}
.custom-property-list-item__name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12px;
  color: var(--sm-color-text-secondary, rgba(0, 0, 0, 0.45));
}
.custom-property-list-item__value {
  min-width: 0;
  font-size: 12px;
  color: var(--sm-color-text, inherit);
  word-break: break-word;
}
.custom-property-list-item__value.is-empty {
  color: var(--sm-color-text-secondary, rgba(0, 0, 0, 0.45));
}
</style>
