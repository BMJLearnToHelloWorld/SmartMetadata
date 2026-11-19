/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the Apache License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { diffJsonPatch, type JsonPatchOp } from '@/admin/jsonPatch';
import type { ApiError } from '@/api/client';
import {
  getAlertEventsDiagnosticsInfo,
  getObservabilityAlertByFQN,
  syncOffset,
  updateNotificationAlert,
  updateObservabilityAlert,
} from '@/api/eventSubscriptions';
import { getDerivedPermissionFlags } from '@/api/permissions';
import { usePermissionStore } from '@/stores/permissions';
import type { EntityRef } from '@/types/api';
import type { AlertFace } from '@/types/notifications';
import type { EventsRecord } from '@/types/notifications';
import type { EventSubscription } from '@/types/quality';
import { stripUndefinedTopLevel } from '@/utils/notifications/alertSave';
import type { TranslateFn } from '@/utils/notifications/alertUtils';
import { getAlertDetailsPath, getAlertEditPath, getAlertListPath } from '@/utils/notifications/alertPaths';
import { getAlertDetailsBreadcrumbs } from '@/utils/notifications/notificationBreadcrumbs';
import { reportErrorToast, type AlertSearchHooks } from '@/utils/notifications/alertSourceSearch';

/**
 * Pin `useAlertDetailsData` (useAlertDetailsData.ts:104-332): the detail
 * fetch is gated on the view permission and always uses the observability
 * ByFQN fetch for both faces; the event counts fetch fails silently; the
 * owners / description updates PATCH a `compare` diff through the
 * per-face update function; tab changes replace the route; delete
 * navigates back to the face's list with no limit refresh. The five
 * permission flags reuse `getDerivedPermissionFlags` (prioritized field
 * derivation — an explicit field false beats EditAll).
 */
export interface UseAlertDetailsDataOptions {
  fqn: () => string;
  face: () => AlertFace;
  hooks: AlertSearchHooks;
  notifySuccess: (message: string) => void;
}

export function useAlertDetailsData(options: UseAlertDetailsDataOptions) {
  const { t } = useI18n();
  const translate = t as unknown as TranslateFn;
  const router = useRouter();
  const permissionStore = usePermissionStore();

  const alertDetails = ref<EventSubscription | undefined>(undefined);
  const alertDetailsError = ref<ApiError | undefined>(undefined);
  const alertEventCounts = ref<EventsRecord | undefined>(undefined);
  const fetchCount = ref(0);
  const ownerLoading = ref(false);
  const alertEventCountsLoading = ref(false);
  const showDeleteModal = ref(false);
  const isSyncing = ref(false);
  const permissionLoading = ref(false);

  const viewPermission = ref<boolean | undefined>(undefined);
  const editPermission = ref(false);
  const editOwnersPermission = ref(false);
  const editDescriptionPermission = ref(false);
  const deletePermission = ref(false);

  const loadingCount = computed(() => fetchCount.value + (permissionLoading.value ? 1 : 0));

  const breadcrumb = computed(() =>
    getAlertDetailsBreadcrumbs(options.face(), options.fqn(), alertDetails.value, translate),
  );

  async function fetchPermissions(): Promise<void> {
    permissionLoading.value = true;
    try {
      const ops = await permissionStore.getEntityPermissionByFqn(
        'eventsubscription',
        options.fqn(),
      );
      const flags = getDerivedPermissionFlags(ops);
      viewPermission.value = flags.hasViewAccess;
      editPermission.value = flags.canEditAll;
      editOwnersPermission.value = flags.canEditOwners;
      editDescriptionPermission.value = flags.canEditDescription;
      deletePermission.value = flags.canDelete;
    } catch {
      // A failed permission fetch denies the page: pin's entity-permission
      // hook surfaces the error through the same view-permission gate.
      viewPermission.value = false;
    } finally {
      permissionLoading.value = false;
    }
  }

  async function fetchAlertDetails(): Promise<void> {
    fetchCount.value += 1;
    alertDetailsError.value = undefined;
    try {
      alertDetails.value = await getObservabilityAlertByFQN(options.fqn(), {
        fields: 'owners',
      });
    } catch (error) {
      alertDetailsError.value = error as ApiError;
    } finally {
      fetchCount.value -= 1;
    }
  }

  async function fetchAlertEventDiagnosticCounts(): Promise<void> {
    alertEventCountsLoading.value = true;
    try {
      alertEventCounts.value = await getAlertEventsDiagnosticsInfo({
        fqn: options.fqn(),
        listCountOnly: true,
      });
    } catch {
      // Counts failure is fully silent in pin.
    } finally {
      alertEventCountsLoading.value = false;
    }
  }

  function patchAlert(
    updated: EventSubscription,
  ): Promise<EventSubscription> {
    const ops: JsonPatchOp[] = diffJsonPatch(
      stripUndefinedTopLevel((alertDetails.value ?? {}) as unknown as Record<string, unknown>),
      stripUndefinedTopLevel(updated as unknown as Record<string, unknown>),
    );
    const id = alertDetails.value?.id ?? '';
    return options.face() === 'Notification'
      ? updateNotificationAlert(id, ops)
      : updateObservabilityAlert(id, ops);
  }

  async function onOwnerUpdate(owners?: EntityRef[]): Promise<void> {
    const current = alertDetails.value;
    if (!current) {
      return;
    }
    ownerLoading.value = true;
    try {
      alertDetails.value = await patchAlert({ ...current, owners });
    } catch (error) {
      reportErrorToast(error, options.hooks);
    } finally {
      ownerLoading.value = false;
    }
  }

  async function onDescriptionUpdate(description: string): Promise<void> {
    const current = alertDetails.value;
    if (!current) {
      return;
    }
    try {
      alertDetails.value = await patchAlert({ ...current, description });
    } catch (error) {
      reportErrorToast(error, options.hooks);
    }
  }

  async function handleAlertSync(): Promise<void> {
    isSyncing.value = true;
    try {
      await syncOffset(options.fqn());
      options.notifySuccess(t('message.alert-synced-successfully'));
    } catch (error) {
      reportErrorToast(error, options.hooks);
    } finally {
      isSyncing.value = false;
    }
  }

  async function handleAlertDelete(): Promise<void> {
    await router.push(getAlertListPath(options.face()));
  }

  async function handleAlertEdit(): Promise<void> {
    await router.push(getAlertEditPath(options.face(), options.fqn()));
  }

  function handleTabChange(activeKey: string): void {
    void router.replace(getAlertDetailsPath(options.face(), options.fqn(), activeKey));
  }

  function hideDeleteModal(): void {
    showDeleteModal.value = false;
  }

  function setShowDeleteModal(show: boolean): void {
    showDeleteModal.value = show;
  }

  watch(
    () => options.fqn(),
    () => {
      alertDetails.value = undefined;
      alertDetailsError.value = undefined;
      viewPermission.value = undefined;
      void fetchPermissions();
    },
    { immediate: true },
  );

  watch(viewPermission, (allowed) => {
    if (allowed) {
      void fetchAlertDetails();
      void fetchAlertEventDiagnosticCounts();
    }
  });

  return {
    alertDetails,
    alertDetailsError,
    alertEventCounts,
    alertEventCountsLoading,
    breadcrumb,
    deletePermission,
    editDescriptionPermission,
    editOwnersPermission,
    editPermission,
    fetchAlertDetails,
    handleAlertDelete,
    handleAlertEdit,
    handleAlertSync,
    handleTabChange,
    hideDeleteModal,
    isSyncing,
    loadingCount,
    onDescriptionUpdate,
    onOwnerUpdate,
    ownerLoading,
    setShowDeleteModal,
    showDeleteModal,
    viewPermission,
  };
}
