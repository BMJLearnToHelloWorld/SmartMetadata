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
import type { ApiError } from '@/api/client';
import {
  createNotificationAlert,
  createObservabilityAlert,
  getAlertsFromName,
  getObservabilityAlertByFQN,
  updateNotificationAlert,
  updateObservabilityAlert,
} from '@/api/eventSubscriptions';
import { getLimitByResource } from '@/api/limits';
import { useAuthStore } from '@/stores/auth';
import type { AlertFace, AlertFormValue } from '@/types/notifications';
import type { EventSubscription } from '@/types/quality';
import {
  getModifiedAlertDataForForm,
  handleAlertSave,
  type InlineAlertDetails,
  type ModifiedAlertData,
} from '@/utils/notifications/alertSave';
import type { TranslateFn } from '@/utils/notifications/alertUtils';
import { getAlertDetailsPath } from '@/utils/notifications/alertPaths';
import { getAlertFormBreadcrumbs } from '@/utils/notifications/notificationBreadcrumbs';
import type { AlertSearchHooks } from '@/utils/notifications/alertSourceSearch';

/**
 * Pin `useAlertFormData` (useAlertFormData.ts:61-264), minus the template
 * chain (OSS extension widgets are empty, so it never starts) and minus
 * the selection (the view owns the live form state, so it builds the
 * selection itself and composes the D-chain loading flag). The edit fetch
 * is per-face by name with no field params — unlike the detail fetch,
 * which always uses the observability ByFQN call with `fields: 'owners'`.
 * A `getModifiedAlertDataForForm` throw lands in the same catch as a
 * fetch failure. Save navigates to the saved alert's detail page after a
 * create-only limit refresh; save errors surface through the inline alert
 * and the outer catch swallows.
 */
export function useAlertFormData(options: {
  face: AlertFace;
  fqn: () => string;
  hooks: AlertSearchHooks;
  notifySuccess: (message: string) => void;
}) {
  const { t } = useI18n();
  const translate = t as unknown as TranslateFn;
  const router = useRouter();
  const authStore = useAuthStore();

  const alert = ref<ModifiedAlertData | undefined>(undefined);
  const alertError = ref<ApiError | undefined>(undefined);
  const initialData = ref<EventSubscription | undefined>(undefined);
  const alertLoading = ref(false);
  const saving = ref(false);
  const inlineAlertDetails = ref<InlineAlertDetails | undefined>(undefined);

  const isEditMode = computed(() => options.fqn().length > 0);
  const isNotification = options.face === 'Notification';
  const areRulesReadOnly = computed(() => Boolean(alert.value?.hasRulesWithoutSelections));

  const breadcrumb = computed(() =>
    getAlertFormBreadcrumbs(options.face, isEditMode.value, translate),
  );

  async function fetchAlert(): Promise<void> {
    alertLoading.value = true;
    alertError.value = undefined;
    try {
      const fetched = isNotification
        ? await getAlertsFromName(options.fqn())
        : await getObservabilityAlertByFQN(options.fqn());
      initialData.value = fetched;
      alert.value = getModifiedAlertDataForForm(fetched);
    } catch (error) {
      alertError.value = error as ApiError;
    } finally {
      alertLoading.value = false;
    }
  }

  watch(
    () => options.fqn(),
    (nextFqn) => {
      if (nextFqn) {
        void fetchAlert();
      }
    },
    { immediate: true },
  );

  async function handleSave(data: AlertFormValue): Promise<void> {
    saving.value = true;
    try {
      await handleAlertSave({
        data,
        fqn: options.fqn(),
        initialData: initialData.value,
        currentUserId: authStore.user?.id,
        createAlertAPI: isNotification ? createNotificationAlert : createObservabilityAlert,
        updateAlertAPI: isNotification ? updateNotificationAlert : updateObservabilityAlert,
        afterSaveAction: async (savedFqn: string) => {
          if (!isEditMode.value) {
            await getLimitByResource('eventsubscription');
          }
          await router.push(getAlertDetailsPath(options.face, savedFqn));
        },
        setInlineAlertDetails: (details) => {
          inlineAlertDetails.value = details;
        },
        t: translate,
        notifySuccess: options.notifySuccess,
      });
    } catch {
      // Error handling done in `handleAlertSave`.
    } finally {
      saving.value = false;
    }
  }

  function handleCancel(): void {
    router.back();
  }

  return {
    alert,
    alertError,
    areRulesReadOnly,
    breadcrumb,
    fetchAlert,
    handleCancel,
    handleSave,
    inlineAlertDetails,
    isEditMode,
    alertLoading,
    saving,
  };
}
