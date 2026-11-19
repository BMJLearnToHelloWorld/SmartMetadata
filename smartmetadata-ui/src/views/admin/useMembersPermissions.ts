/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { computed, ref, watch, type Ref } from 'vue';
import {
  getDerivedPermissionFlags,
  type DerivedPermissionFlags,
  type OperationPermissions,
} from '@/api/permissions';
import { usePermissionStore } from '@/stores/permissions';

/**
 * Entity-permission derivation for the Members surfaces, following the
 * existing pattern in these views: the permission store is queried
 * directly with the string resource ('team' | 'user') because the
 * `useEntityPermissions` ResourceEntity union does not include them.
 * Extending that union is an integration-line request; this composable
 * must not be mistaken for a second derivation policy — all flag
 * semantics come from getDerivedPermissionFlags.
 *
 * The pin uses two derivations on these pages: a deleted-gated one
 * (default) and an ungated one in exactly three places (ManageButton
 * host canEditAll, Roles/Policies assign placeholders, UserTab Group
 * empty state). Both are exposed so call sites pick deliberately.
 */
export interface MembersPermissions {
  operations: Ref<OperationPermissions | null>;
  /** Deleted-gated derivation (default). */
  flags: Ref<DerivedPermissionFlags>;
  /** Ungated derivation (deleted flag ignored); use only at the pin's three sites. */
  ungatedFlags: Ref<DerivedPermissionFlags>;
  isLoading: Ref<boolean>;
  /** Last permission-fetch failure, if any (pin toasts it at the page gate). */
  error: Ref<unknown>;
  refresh: () => Promise<void>;
}

const EMPTY_OPS: OperationPermissions = {};

export function useMembersPermissions(
  resource: 'team' | 'user',
  key: Ref<string>,
  deleted: Ref<boolean>,
  enabled: Ref<boolean> = ref(true),
): MembersPermissions {
  const store = usePermissionStore();
  const operations = ref<OperationPermissions | null>(null);
  const isLoading = ref(false);
  const error = ref<unknown>(undefined);
  let generation = 0;

  const flags = computed(() =>
    getDerivedPermissionFlags(operations.value ?? EMPTY_OPS, deleted.value),
  );
  const ungatedFlags = computed(() =>
    getDerivedPermissionFlags(operations.value ?? EMPTY_OPS, false),
  );

  async function refresh(): Promise<void> {
    if (!enabled.value || !key.value) {
      return;
    }
    const current = ++generation;
    isLoading.value = true;
    try {
      const ops = await store.getEntityPermissionByFqn(resource, key.value);
      if (current === generation) {
        operations.value = ops;
        error.value = undefined;
      }
    } catch (caught) {
      // A failed permission fetch denies nothing by itself: the flags
      // stay empty (all false) and the page shows its gated state.
      if (current === generation) {
        operations.value = EMPTY_OPS;
        error.value = caught;
      }
    } finally {
      if (current === generation) {
        isLoading.value = false;
      }
    }
  }

  watch([key, enabled], () => void refresh(), { immediate: true });

  return { operations, flags, ungatedFlags, isLoading, error, refresh };
}
