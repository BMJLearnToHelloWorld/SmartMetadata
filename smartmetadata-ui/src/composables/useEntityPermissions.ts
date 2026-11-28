/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { computed, ref, toValue, watch, type ComputedRef, type MaybeRefOrGetter, type Ref } from 'vue';
import {
  getDerivedPermissionFlags,
  type DerivedPermissionFlags,
  type OperationPermissions,
} from '@/api/permissions';
import { usePermissionStore } from '@/stores/permissions';

/**
 * Official ResourceEntity (pin a3012259ca, enums/permissions.enum.ts) as a
 * string-literal union — the product has no runtime enum convention here.
 * G-23 stage 4 builds this composable once (REVIEW-W3-G-STAGES §5.1);
 * G-18 stage 2 consumes it for ONTOLOGY / ONTOLOGY_CONCEPT. No second
 * copy, no per-batch wrapper.
 * ADR:2026-11-10-custom-properties-stage-4-per-type-gate
 */
export type ResourceEntity =
  | 'type'
  | 'ontology'
  | 'ontologyConcept'
  | 'ontologyProperty'
  | 'ontologyAxiom'
  | 'ontologyRelease'
  | 'relationshipType'
  | 'glossary'
  | 'glossaryTerm'
  | 'role'
  | 'policy'
  | 'persona'
  // Detail-view resources (D-4): the full official ResourceEntity value
  // set the detail views address, so a view can never pass a resource
  // the server does not evaluate. `all` is deliberately absent: it is
  // a permission-scope wildcard, not an addressable entity resource.
  | 'table'
  | 'database'
  | 'databaseSchema'
  | 'dashboard'
  | 'pipeline'
  | 'topic'
  | 'container'
  | 'mlmodel'
  | 'searchIndex'
  | 'dashboardDataModel'
  | 'storedProcedure'
  | 'chart'
  | 'metric'
  | 'apiCollection'
  | 'apiEndpoint'
  | 'query'
  | 'domain'
  | 'dataProduct'
  | 'tag'
  | 'classification'
  | 'ingestionPipeline'
  | 'testCase'
  | 'testSuite'
  | 'testDefinition'
  | 'testCaseResolutionStatus'
  | 'kpi'
  | 'dataInsightChart'
  | 'feed'
  | 'report'
  | 'webhook'
  | 'page'
  | 'eventsubscription'
  | 'app'
  | 'task'
  | 'dataContract'
  | 'tableColumn'
  | 'auditLog'
  | 'notificationTemplate'
  | 'contextMemory'
  | 'ontologyChangeSet'
  | 'bot'
  | 'dashboardService'
  | 'databaseService'
  | 'searchService'
  | 'securityService'
  | 'messagingService'
  | 'metadataService'
  | 'mlmodelService'
  | 'pipelineService'
  | 'apiService'
  | 'driveService'
  | 'storageService'
  | 'ingestionRunner'
  | 'location'
  | 'directory'
  | 'file'
  | 'spreadsheet'
  | 'worksheet'
  // Members surfaces (02): the union admits the team/user resources so
  // future consumers type-check. The Members views keep
  // useMembersPermissions for now: they need the gated AND ungated
  // derivations simultaneously (pin's three ungated sites), which this
  // single-derivation composable does not expose — migrating them is a
  // convergence design decision, not a rename.
  | 'team'
  | 'user';

/** FQN as a plain string (primary); `{ id }` for call sites that only hold an entity id. */
export type EntityPermissionIdentifier = string | { id: string };

export interface UseEntityPermissionsOptions {
  /** Soft-deleted entity — edit flags forced false. */
  deleted?: boolean;
  /** Skip fetching (e.g. id not resolved yet). Default true. */
  enabled?: boolean;
}

export interface UseEntityPermissionsResult {
  hasViewAccess: ComputedRef<boolean>;
  canEditAll: ComputedRef<boolean>;
  canEditStatus: ComputedRef<boolean>;
  /** Field-key EditDescription prioritized over EditAll; derived by getDerivedPermissionFlags. */
  canEditDescription: ComputedRef<boolean>;
  /** Field-key EditDisplayName prioritized over EditAll (03 §2.5); derived by getDerivedPermissionFlags. */
  canEditDisplayName: ComputedRef<boolean>;
  canCreate: ComputedRef<boolean>;
  canDelete: ComputedRef<boolean>;
  canViewAll: ComputedRef<boolean>;
  canViewBasic: ComputedRef<boolean>;
  /**
   * Escape hatch for operations without a named flag. Applies the same
   * prioritization (field → EditAll / ViewAll) and deleted gating as
   * the named flags, so call sites never reimplement policy.
   */
  can: (operation: string) => boolean;
  permissions: Ref<OperationPermissions>;
  isLoading: Ref<boolean>;
  /**
   * `unknown | null`: null is "no error"; a fetch failure is surfaced
   * here, never swallowed — the caller toasts it while the flags stay
   * all-false (fail-closed).
   */
  error: Ref<unknown | null>;
  refresh: () => Promise<void>;
}

/**
 * Pin DEFAULT_ENTITY_PERMISSION: every operation denied until the fetch
 * resolves, so buttons stay hidden (fail-closed) while loading. It is
 * never mutated — flag derivation only reads it.
 */
export const DEFAULT_ENTITY_PERMISSION: OperationPermissions = {
  Create: false,
  Delete: false,
  EditAll: false,
  EditCustomFields: false,
  EditDataProfile: false,
  EditDescription: false,
  EditDisplayName: false,
  EditLineage: false,
  EditOwners: false,
  EditQueries: false,
  EditSampleData: false,
  EditTags: false,
  EditTests: false,
  EditTier: false,
  ViewAll: false,
  ViewBasic: false,
  ViewDataProfile: false,
  ViewQueries: false,
  ViewSampleData: false,
  ViewTests: false,
  ViewUsage: false,
};

/**
 * Official VERSION_VIEW_GLOSSARY_PERMISSION (mocks/Glossary.mock.ts):
 * ViewAll is true; every Create/Delete/Edit* and other View* flag is
 * false. GlossaryV1's isVersionsView bypass sets this object on the
 * header, details, and terms surfaces so version-view widgets stay
 * read-only.
 */
export const VERSION_VIEW_GLOSSARY_PERMISSION: OperationPermissions = {
  Create: false,
  Delete: false,
  EditAll: false,
  EditCustomFields: false,
  EditDataProfile: false,
  EditDescription: false,
  EditDisplayName: false,
  EditLineage: false,
  EditOwners: false,
  EditQueries: false,
  EditSampleData: false,
  EditTags: false,
  EditTests: false,
  EditTier: false,
  ViewAll: true,
  ViewBasic: false,
  ViewDataProfile: false,
  ViewQueries: false,
  ViewSampleData: false,
  ViewTests: false,
  ViewUsage: false,
};

/**
 * The single UI entry point for entity permissions — the frontend mirror
 * of the backend's authorizer.authorize(subject, operation, resource).
 * Components consume named flags; policy math lives in
 * getDerivedPermissionFlags; caching lives in the permission store
 * (per-principal, per-entity-key).
 *
 * Vue adaptation of pin's hook (hooks/useEntityPermissions.ts): pin
 * re-evaluates on every React render, so a plain `enabled: Boolean(id)`
 * re-gates when the id resolves; Vue setup runs once, so the identifier
 * and the options must be reactive (MaybeRefOrGetter) for the fetch to
 * start when the id resolves. A plain string / object / boolean works
 * exactly as in pin.
 */
export function useEntityPermissions(
  resource: MaybeRefOrGetter<ResourceEntity>,
  identifier: MaybeRefOrGetter<EntityPermissionIdentifier>,
  options?: {
    deleted?: MaybeRefOrGetter<boolean>;
    enabled?: MaybeRefOrGetter<boolean>;
  },
): UseEntityPermissionsResult {
  const store = usePermissionStore();
  const permissions = ref<OperationPermissions>(DEFAULT_ENTITY_PERMISSION);
  const isLoading = ref(false);
  const error = ref<unknown | null>(null);
  let generation = 0;

  // E-3a: the resource is reactive so a host that re-points the hook at
  // a different entity type (the Explore preview switching from a table
  // to a topic) refetches under the new resource instead of serving the
  // previous type's grant. Plain-string callers are unaffected
  // (`toValue` passes them through).
  const resourceRef = computed(() => toValue(resource));
  const key = computed(() => {
    const resolved = toValue(identifier);
    return typeof resolved === 'object' ? resolved.id : resolved;
  });
  const byId = computed(() => typeof toValue(identifier) === 'object');
  const isEnabled = computed(() => toValue(options?.enabled ?? true) && key.value.length > 0);
  const isDeleted = computed(() => toValue(options?.deleted ?? false));
  const flags: ComputedRef<DerivedPermissionFlags> = computed(() =>
    getDerivedPermissionFlags(permissions.value, isDeleted.value),
  );

  async function fetchPermissions(): Promise<void> {
    if (!isEnabled.value) {
      return;
    }
    const current = ++generation;
    isLoading.value = true;
    error.value = null;
    try {
      // Entity-level: the backend has evaluated conditions — the store
      // already maps to strict Allow only (toOperationPermissions).
      const ops = byId.value
        ? await store.getEntityPermissionById(resourceRef.value, key.value)
        : await store.getEntityPermissionByFqn(resourceRef.value, key.value);
      // A newer key may have started its own fetch while this one was in
      // flight, or the gate may have closed meanwhile; only the latest
      // generation while still enabled may publish.
      if (current !== generation || !isEnabled.value) {
        return;
      }
      permissions.value = ops;
    } catch (err) {
      if (current !== generation || !isEnabled.value) {
        return;
      }
      // Surfaced, not swallowed: the caller toasts it; the flags stay
      // all-false so the gated buttons stay hidden.
      error.value = err;
      permissions.value = DEFAULT_ENTITY_PERMISSION;
    } finally {
      if (current === generation) {
        isLoading.value = false;
      }
    }
  }

  watch(
    [key, isEnabled, resourceRef],
    () => {
      // A new key must never inherit the previous entity's grant while
      // its own permission is still loading (fail-closed).
      permissions.value = DEFAULT_ENTITY_PERMISSION;
      error.value = null;
      if (isEnabled.value) {
        void fetchPermissions();
      } else {
        isLoading.value = false;
      }
    },
    { immediate: true },
  );

  async function refresh(): Promise<void> {
    // Invalidate the store entry for this key so the next read re-fetches
    // instead of serving the cached grant — never bypass the store with
    // a direct API call.
    store.invalidateEntityPermission(resourceRef.value, toValue(identifier));
    await fetchPermissions();
  }

  return {
    hasViewAccess: computed(() => flags.value.hasViewAccess),
    canEditAll: computed(() => flags.value.canEditAll),
    canEditStatus: computed(() => flags.value.canEditStatus),
    canEditDescription: computed(() => flags.value.canEditDescription),
    canEditDisplayName: computed(() => flags.value.canEditDisplayName),
    canCreate: computed(() => flags.value.canCreate),
    canDelete: computed(() => flags.value.canDelete),
    canViewAll: computed(() => flags.value.canViewAll),
    canViewBasic: computed(() => flags.value.canViewBasic),
    can: (operation: string) => flags.value.can(operation),
    permissions,
    isLoading,
    error,
    refresh,
  };
}
