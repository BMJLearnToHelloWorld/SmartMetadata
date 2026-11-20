/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { permissionFlags } from '@/api/permissions';
import { serviceCategoryByKind } from '@/ingestion/serviceCategories';
import { usePermissionStore } from '@/stores/permissions';
import { computed, ref, unref, watchEffect, type MaybeRef, type Ref } from 'vue';
import { useRouter } from 'vue-router';

/**
 * The add-service action for one connections category, mirroring
 * official components/integration/ConnectionsPage/useAddServiceAction:
 * where it goes and whether the user may take it. Shared by the
 * services-list header and the My Data empty states so the two cannot
 * disagree — the button must always land on the add-service page of
 * the category it was clicked from, and must be absent when the user
 * cannot create that kind of service.
 *
 * Product adaptation: the wizard is one page with a kind selector, so
 * the 'all' action opens it on the 'all' sentinel and every other
 * category on its ServiceCategory enum value (D-17, pin
 * getAddServicePath) — only the permission check is per-category. The
 * 'all' check mirrors official canCreateAnyServiceCategory over the
 * eleven classic categories; llm/mcp are outside the connections
 * overview universe (official CONNECTIONS_ENTITY_TYPES), so they are
 * not counted.
 * ADR:2026-11-08-my-data-add-service-action
 */
export type AddServiceCategory =
  | 'all'
  | 'database'
  | 'messaging'
  | 'pipeline'
  | 'dashboard'
  | 'mlmodel'
  | 'storage'
  | 'api'
  | 'metadata'
  | 'search'
  | 'drive'
  | 'security';

const RESOURCE_BY_CATEGORY: Record<Exclude<AddServiceCategory, 'all'>, string> = {
  database: 'databaseService',
  messaging: 'messagingService',
  pipeline: 'pipelineService',
  dashboard: 'dashboardService',
  mlmodel: 'mlmodelService',
  storage: 'storageService',
  api: 'apiService',
  metadata: 'metadataService',
  search: 'searchService',
  drive: 'driveService',
  security: 'securityService',
};

const ALL_CATEGORIES = Object.keys(RESOURCE_BY_CATEGORY) as Array<
  Exclude<AddServiceCategory, 'all'>
>;

export function useAddServiceAction(category: MaybeRef<AddServiceCategory>): {
  addService: () => void;
  canAddService: Ref<boolean>;
} {
  const router = useRouter();
  const permissions = usePermissionStore();
  const canAddService = ref(false);

  async function refresh(): Promise<void> {
    const current = unref(category);
    const resources =
      current === 'all'
        ? ALL_CATEGORIES.map((key) => RESOURCE_BY_CATEGORY[key])
        : [RESOURCE_BY_CATEGORY[current]];
    const flags = await Promise.all(
      resources.map(async (resource) => permissionFlags(await permissions.getResourcePermission(resource))),
    );
    canAddService.value = flags.some((flag) => flag.canCreate);
  }

  watchEffect(() => {
    // A ref category re-runs the permission check when the tab changes
    // (the Connections page scopes its Add button to the tab in view);
    // a plain category behaves exactly as before.
    void refresh();
  });

  function addService(): void {
    // D-17: the official `/:serviceCategory/add-service` form — the
    // ServiceCategory enum value, or the 'all' sentinel.
    const current = unref(category);
    const serviceCategory =
      current === 'all' ? 'all' : (serviceCategoryByKind(current)?.enumValue ?? 'all');
    void router.push({ name: 'ingestion-service-add', params: { serviceCategory } });
  }

  return { addService, canAddService: computed(() => canAddService.value) };
}
