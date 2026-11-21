<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import AssetCustomPropertiesPanel from '@/features/crud/AssetCustomPropertiesPanel.vue';
import type { CustomPropertyDef } from '@/types/collaboration';

/**
 * Shared custom-properties widget cell (D-2 batch 2): a thin wrapper
 * over `AssetCustomPropertiesPanel` so the widget has a stable
 * `data-testid` and the same `canEdit` / `onPropertySave` contract as
 * the other cells. Pin shape kept (`CustomPropertyTable`): per-property
 * inline edit in the right panel, read gate `canViewCustomFields`
 * (no access → `PermissionPlaceholder`, pending → nothing), write
 * gate `canEditCustomFields`. The caller derives `canView` /
 * `canEdit` (`isAdminUser || canViewCustomFields` /
 * `isAdminUser || canEditCustomFields`); `onPropertySave` throws on
 * failure so the row stays in edit mode. An empty value means the
 * caller deletes the key.
 */
withDefaults(
  defineProps<{
    defs: CustomPropertyDef[];
    values: Record<string, unknown>;
    error?: string;
    entityType: string;
    canView?: boolean | null;
    canEdit?: boolean;
    onPropertySave?: (name: string, value: unknown) => Promise<unknown> | unknown;
    testId?: string;
  }>(),
  { error: '', canView: true, canEdit: false, testId: 'widget-custom-properties-cell' },
);
</script>

<template>
  <div :data-testid="testId">
    <AssetCustomPropertiesPanel
      :defs="defs"
      :values="values"
      :error="error"
      :entity-type="entityType"
      :can-view="canView"
      :can-edit="canEdit"
      :on-property-save="onPropertySave"
    />
  </div>
</template>
