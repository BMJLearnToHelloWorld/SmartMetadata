/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import {
  getEntityPermissionByFqn as fetchEntityPermissionByFqn,
  getEntityPermissionById as fetchEntityPermissionById,
  getLoggedInUserPermissions,
  getResourcePermission as fetchResourcePermission,
  permissionFlags,
  toOperationPermissions,
  type OperationPermissions,
} from '@/api/permissions';
import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { useAuthStore } from './auth';

/**
 * PermissionProvider equivalent (official context/PermissionProvider):
 * the isAdminUser line from the auth store plus the permission-API line
 * (resource, per-entity by id, per-entity by fqn), with per-principal
 * caches. The official provider resets its cache at a login boundary;
 * this store does the same by keying every cache on the current
 * principal and dropping it the moment the principal changes, so a
 * stale grant can never survive a logout/login switch.
 */
export const usePermissionStore = defineStore('permissions', () => {
  const auth = useAuthStore();
  const resourceCache = ref(new Map<string, OperationPermissions>());
  const entityCache = ref(new Map<string, OperationPermissions>());
  const principal = ref<string | undefined>(undefined);

  /** Official useAuth: isAdminUser = currentUser?.isAdmin. */
  const isAdminUser = computed(() => auth.user?.isAdmin === true);

  function ensureFresh(): void {
    const current = auth.user?.name ?? auth.user?.id;
    if (principal.value !== current) {
      principal.value = current;
      resourceCache.value = new Map();
      entityCache.value = new Map();
    }
  }

  function resetPermissions(): void {
    principal.value = undefined;
    resourceCache.value = new Map();
    entityCache.value = new Map();
  }

  async function loadLoggedInUserPermissions(): Promise<void> {
    ensureFresh();
    const page = await getLoggedInUserPermissions();
    for (const entry of page.data) {
      resourceCache.value.set(entry.resource, toOperationPermissions(entry));
    }
  }

  async function getResourcePermission(resource: string): Promise<OperationPermissions> {
    ensureFresh();
    const cached = resourceCache.value.get(resource);
    if (cached) {
      return cached;
    }
    const ops = toOperationPermissions(await fetchResourcePermission(resource));
    resourceCache.value.set(resource, ops);
    return ops;
  }

  async function getEntityPermissionById(
    resource: string,
    entityId: string,
  ): Promise<OperationPermissions> {
    ensureFresh();
    const key = `${resource}:${entityId}`;
    const cached = entityCache.value.get(key);
    if (cached) {
      return cached;
    }
    const ops = toOperationPermissions(await fetchEntityPermissionById(resource, entityId));
    entityCache.value.set(key, ops);
    return ops;
  }

  async function getEntityPermissionByFqn(
    resource: string,
    entityFqn: string,
  ): Promise<OperationPermissions> {
    ensureFresh();
    const key = `${resource}:name:${entityFqn}`;
    const cached = entityCache.value.get(key);
    if (cached) {
      return cached;
    }
    const ops = toOperationPermissions(await fetchEntityPermissionByFqn(resource, entityFqn));
    entityCache.value.set(key, ops);
    return ops;
  }

  return {
    isAdminUser,
    resetPermissions,
    loadLoggedInUserPermissions,
    getResourcePermission,
    getEntityPermissionById,
    getEntityPermissionByFqn,
    permissionFlags,
  };
});
