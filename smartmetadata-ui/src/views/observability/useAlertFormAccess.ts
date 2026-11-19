/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the Apache License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { ref, watch } from 'vue';
import { getDerivedPermissionFlags } from '@/api/permissions';
import { usePermissionStore } from '@/stores/permissions';

/**
 * Pin `useAlertFormAccess` (useAlertFormAccess.ts:19-41): create gates on
 * the resource Create operation, edit gates on the alert's derived
 * EditAll. A failed permission fetch is not a denial — it surfaces as a
 * reloadable error. Pin reads the create gate synchronously from the
 * provider; the product store fetches asynchronously, so the create path
 * shows the loading branch until its fetch settles.
 */
export function useAlertFormAccess(options: {
  isEditMode: () => boolean;
  fqn: () => string;
}) {
  const permissionStore = usePermissionStore();
  const hasAccess = ref(false);
  const isPermissionLoading = ref(false);
  const permissionError = ref(false);

  async function refreshPermission(): Promise<void> {
    isPermissionLoading.value = true;
    permissionError.value = false;
    try {
      if (options.isEditMode()) {
        const ops = await permissionStore.getEntityPermissionByFqn(
          'eventsubscription',
          options.fqn(),
        );
        hasAccess.value = getDerivedPermissionFlags(ops).canEditAll;
      } else {
        const ops = await permissionStore.getResourcePermission('eventsubscription');
        hasAccess.value = ops.Create === true || ops.All === true;
      }
    } catch {
      permissionError.value = true;
    } finally {
      isPermissionLoading.value = false;
    }
  }

  watch(
    [() => options.isEditMode(), () => options.fqn()],
    () => {
      void refreshPermission();
    },
    { immediate: true },
  );

  return { hasAccess, isPermissionLoading, permissionError, refreshPermission };
}
