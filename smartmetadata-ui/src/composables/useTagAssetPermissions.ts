/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { computed, onMounted, ref, toValue, type ComputedRef, type MaybeRefOrGetter, type Ref } from 'vue';
import { checkPermissionEntityResource, type UIPermission } from '@/api/permissions';
import { TAG_ASSET_EDIT_PERMISSION_ENTITY_TYPES } from '@/catalog/tagAssets';
import { usePermissionStore } from '@/stores/permissions';

/**
 * Pin TagPage asset-edit permission (pages/TagPage/TagPage.tsx:318-324):
 *
 *   haveAssetEditPermission =
 *     editTagsPermission || !isEmpty(entitiesHavingPermission)
 *
 * where editTagsPermission is the tag entity's own EditAll gated by
 * isEditable, and entitiesHavingPermission comes from
 * getExcludedIndexesBasedOnEntityTypeEditTagPermission — the
 * resource-level EditTags grant per asset entity type, read from
 * pin's single UIPermission object. The product has no bulk
 * permission object, so this composable fills the permission store's
 * resource cache with one bulk GET /permissions (once per
 * principal) and derives the same partition from it. The
 * not-having side feeds the asset picker's exclusion filter.
 *
 * Fail-closed: while loading, or when the bulk load fails, both
 * lists are empty, so haveAssetEditPermission falls back to the
 * tag-level grant alone.
 *
 * D-1 (a): the per-type EditTags grant uses pin's OR helper
 * (checkPermissionEntityResource with checkEditAllPermission=true,
 * PermissionsUtils.ts:55-70), so EditTags=deny + EditAll=allow on one
 * resource still counts as having permission. The field-priority
 * derived flags (api/permissions.ts prioritizedEditPermission) would
 * deny that type — this composable no longer uses them for the
 * per-type grant (getDerivedPermissionFlags stays field-priority for
 * every other surface). The OR case is pinned by a test in
 * useTagAssetPermissions.test.ts.
 */
export function useTagAssetPermissions(editTagsPermission: MaybeRefOrGetter<boolean>): {
  haveAssetEditPermission: ComputedRef<boolean>;
  entitiesHavingPermission: Ref<string[]>;
  entitiesNotHavingPermission: Ref<string[]>;
  isLoading: Ref<boolean>;
  error: Ref<unknown | null>;
} {
  const store = usePermissionStore();
  const entitiesHavingPermission = ref<string[]>([]);
  const entitiesNotHavingPermission = ref<string[]>([]);
  const isLoading = ref(false);
  const error = ref<unknown | null>(null);

  const haveAssetEditPermission = computed(
    () => toValue(editTagsPermission) || entitiesHavingPermission.value.length > 0,
  );

  async function load(): Promise<void> {
    isLoading.value = true;
    error.value = null;
    try {
      await store.loadLoggedInUserPermissions();
      // The 24 resource reads are independent — the store keys its
      // cache per resource and holds no shared mutable state across
      // resources (getResourcePermission only reads/writes its own
      // key) — so they run in parallel instead of serially. A single
      // rejection still fails the whole load closed, as before.
      const reads = await Promise.all(
        TAG_ASSET_EDIT_PERMISSION_ENTITY_TYPES.map(async (resource) => ({
          resource,
          ops: await store.getResourcePermission(resource),
        })),
      );
      // D-1 (a): the per-type EditTags grant uses pin's OR helper
      // (checkPermissionEntityResource with checkEditAllPermission=true,
      // PermissionsUtils.ts:55-70) — EditTags OR EditAll — not the
      // field-priority derived flags, which let an explicit EditTags
      // deny win over EditAll. The reads above re-assemble the
      // bulk-loaded UIPermission the helper reads from.
      const permissions: UIPermission = {};
      for (const { resource, ops } of reads) {
        permissions[resource] = ops;
      }
      const results = TAG_ASSET_EDIT_PERMISSION_ENTITY_TYPES.map((resource) => ({
        resource,
        granted: checkPermissionEntityResource('EditTags', resource, permissions, true),
      }));
      entitiesHavingPermission.value = results
        .filter((result) => result.granted)
        .map((result) => result.resource);
      entitiesNotHavingPermission.value = results
        .filter((result) => !result.granted)
        .map((result) => result.resource);
    } catch (err) {
      error.value = err;
      entitiesHavingPermission.value = [];
      entitiesNotHavingPermission.value = [];
    } finally {
      isLoading.value = false;
    }
  }

  onMounted(() => {
    void load();
  });

  return {
    haveAssetEditPermission,
    entitiesHavingPermission,
    entitiesNotHavingPermission,
    isLoading,
    error,
  };
}
