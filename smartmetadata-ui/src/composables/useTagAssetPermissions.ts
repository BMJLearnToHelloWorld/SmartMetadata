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
import { getDerivedPermissionFlags } from '@/api/permissions';
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
 * Named residual (product-level, needs Bai's acceptance or a separate
 * item to unify the derivation — this lane does not change it): pin
 * ORs EditAll into the per-type EditTags grant
 * (checkPermissionEntityResource with checkEditAllPermission=true,
 * PermissionsUtils.ts:55-70), so EditTags=deny + EditAll=allow on one
 * resource still counts as having permission. The product derivation
 * (api/permissions.ts prioritizedEditPermission) is field-priority:
 * an explicit EditTags key wins and EditAll never falls through, so
 * this composable denies that type. The fork case is pinned by a
 * test in useTagAssetPermissions.test.ts.
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
      const results = await Promise.all(
        TAG_ASSET_EDIT_PERMISSION_ENTITY_TYPES.map(async (resource) => ({
          resource,
          granted: getDerivedPermissionFlags(await store.getResourcePermission(resource))
            .canEditTags,
        })),
      );
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
