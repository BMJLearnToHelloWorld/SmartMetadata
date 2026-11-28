<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { Button, message, Spin } from 'ant-design-vue';
import ObservabilityGradientPageHeader from '@/components/observability/ObservabilityGradientPageHeader.vue';
import ObservabilityPageShell from '@/components/observability/ObservabilityPageShell.vue';
import { useI18n } from 'vue-i18n';
import { useRoute, useRouter } from 'vue-router';
import { ApiError } from '@/api/client';
import { getAllAlerts, getAlertsFromName } from '@/api/eventSubscriptions';
import { getLimitByResource } from '@/api/limits';
import { getDerivedPermissionFlags, type OperationPermissions } from '@/api/permissions';
import LimitWrapper from '@/components/shared/LimitWrapper.vue';
import PageHeader from '@/components/shared/PageHeader.vue';
import PageLayout from '@/components/shared/PageLayout.vue';
import SmBreadcrumb from '@/components/shared/SmBreadcrumb.vue';
import { buildSettingsBreadcrumbCatalog, getSettingPageBreadcrumbs, toSmBreadcrumbItems } from '@/settings/breadcrumbs';
import { resolveSettingsLocation } from '@/settings/locationResolver';
import {
  SETTINGS_BREADCRUMB_NAMES,
  findSettingsRegistryItem,
  registryTitle,
  type SettingsTranslator,
} from '@/settings/registry';
import { useCursorPagedList } from '@/composables/useCursorPagedList';
import { useAuthStore } from '@/stores/auth';
import { usePermissionStore } from '@/stores/permissions';
import type { EventSubscription } from '@/types/quality';
import type { PagingHandlerParams } from '@/utils/pagination';
import AlertDeleteModal from '@/components/notifications/AlertDeleteModal.vue';
import AlertListTable, { type AlertRowPermission } from '@/components/notifications/AlertListTable.vue';
import { ACTIVITY_FEED_ALERT_NAME } from '@/utils/notifications/alertConstants';
import { hardDeleteAlert } from '@/utils/notifications/alertDelete';
import { getAlertAddPath, resolveAlertFace } from '@/utils/notifications/alertPaths';
import { getObservabilityAlertsListBreadcrumbs } from '@/utils/notifications/notificationBreadcrumbs';
import { reportErrorToast, type AlertSearchHooks } from '@/utils/notifications/alertSourceSearch';
import { getEntityName, type TranslateFn } from '@/utils/notifications/alertUtils';


/**
 * Alert lists, both faces (D-N1): the settings face
 * (/settings/notifications/alerts, NotificationListPage) and the
 * observability face (/observability/alerts, AlertsPage.tsx) share the
 * table and differ in the fetch
 * chain, the permission sets, the empty-state mode, and the CTA
 * gates. The face comes from the route path; the router maps both
 * paths to this view.
 *
 * A chain (settings): getAllAlerts first, then — only when the
 * request carries no `after` cursor — the system ActivityFeedAlert
 * is fetched SERIALLY and prepended, in the same try/catch: any
 * failure sets the error, toasts one string message, and leaves the
 * previous rows in place (the table hides them behind the error).
 * Row permissions cover the page data WITHOUT the prepended row.
 *
 * C chain (observability): list fetching is cursor-driven
 * (useCursorPagedList), matching pin's getAllAlerts paging; the
 * page-NUMBER check (isFirstPage) and Promise.all in pin's
 * useObservabilityAlerts gate ONLY the system-alert fetch, which
 * is disabled by default (includeSystemAlerts=false, call site
 * passes no args), so no system fetch runs and provider-System
 * rows are filtered out. A list failure clears the visible rows
 * with NO toast. Row permissions cover the whole displayed list.
 */
const { t } = useI18n();
const translate = t as unknown as TranslateFn;
const route = useRoute();
const router = useRouter();
const permissionStore = usePermissionStore();
const authStore = useAuthStore();

const hooks: AlertSearchHooks = {
  t: translate,
  notifyError: (text: string) => message.error(text),
  notifyWarning: (text: string) => message.warning(text),
};

const face = computed(() => resolveAlertFace(route.path));
const isNotificationFace = computed(() => face.value === 'Notification');
const alertType = computed(() => face.value);

const alertsError = ref<ApiError | undefined>(undefined);
const hasResourcePermissionError = ref(false);
const alertResourcePermission = ref<OperationPermissions | undefined>(undefined);
const alertPermissions = ref<AlertRowPermission[] | undefined>(undefined);
const permissionLoadingCount = ref(0);
const selectedAlert = ref<EventSubscription | undefined>(undefined);
const isDeleting = ref(false);
const resetKey = ref(0);
// The rows the next row-permission fetch covers, stashed by the page
// fetch: the A chain fetches permissions for the page data without
// the prepended system row; the C chain for the displayed list.
const permissionFetchInput = ref<EventSubscription[]>([]);

async function fetchAlertResourcePermission(): Promise<void> {
  permissionLoadingCount.value += 1;
  try {
    hasResourcePermissionError.value = false;
    alertResourcePermission.value = await permissionStore.getResourcePermission(
      'eventsubscription',
    );
  } catch (error) {
    if (!isNotificationFace.value) {
      // A GET, so showErrorToast suppresses its 401/403 responses.
      // The failure is tracked explicitly so the empty state can show
      // an error + retry cue instead of a silent create-less page.
      hasResourcePermissionError.value = true;
      reportErrorToast(error, hooks);
    }
    // The settings face swallows the failure silently.
  } finally {
    permissionLoadingCount.value -= 1;
  }
}

async function fetchAlertPermissionByFqn(
  alert: EventSubscription,
): Promise<AlertRowPermission> {
  const permission = await permissionStore.getEntityPermissionByFqn(
    'eventsubscription',
    alert.fullyQualifiedName ?? '',
  );
  return {
    id: alert.id,
    edit: getDerivedPermissionFlags(permission).canEditAll,
    delete: permission.Delete,
  };
}

async function fetchAllAlertsPermission(alerts: EventSubscription[]): Promise<void> {
  permissionLoadingCount.value += 1;
  try {
    alertPermissions.value = await Promise.all(alerts.map(fetchAlertPermissionByFqn));
  } catch {
    // Any single failure leaves the previous permissions in place;
    // the rows render `--` once settled instead of per-row denials.
  } finally {
    permissionLoadingCount.value -= 1;
  }
}

const isObservabilityFace = resolveAlertFace(route.path) === 'Observability';

const { items, paging, isLoading, page, pageSize, onPageChange, onPageSizeChange } =
  useCursorPagedList<EventSubscription>(
    async ({ after, before, limit }) => {
      alertsError.value = undefined;
      const paged = await getAllAlerts({
        after,
        before,
        limit,
        alertType: alertType.value,
      });
      let list = paged.data;
      if (isNotificationFace.value) {
        permissionFetchInput.value = paged.data;
        if (after === undefined) {
          const systemAlert = await getAlertsFromName(ACTIVITY_FEED_ALERT_NAME);
          list = [systemAlert, ...paged.data];
        }
      } else {
        list = paged.data.filter((alert) => alert.provider !== 'system');
        permissionFetchInput.value = list;
      }
      return {
        data: list,
        paging: { after: paged.after, before: paged.before, total: paged.total ?? 0 },
      };
    },
    {
      onError: (error) => {
        alertsError.value =
          error instanceof ApiError ? error : new ApiError(0, '', String(error));
        if (isNotificationFace.value) {
          message.error(
            t('server.entity-fetch-error', { entity: t('label.alert-plural') }),
          );
        }
      },
      // Official useObservabilityAlerts + usePaging: no localStorage persistence.
      persistence:
        isObservabilityFace
          ? undefined
          : { storage: localStorage, userName: () => authStore.user?.name },
      resetKey: () => resetKey.value,
    },
  );

watch(items, () => {
  void fetchAllAlertsPermission(permissionFetchInput.value);
});

onMounted(() => {
  void fetchAlertResourcePermission();
});

const combinedLoading = computed(() => isLoading.value || permissionLoadingCount.value > 0);
// usePaging's showPagination: a cursor, a total beyond the page, or a
// non-default page size. The composable's own formula lacks the last
// clause, so the view computes it.
const showPagination = computed(
  () =>
    Boolean(paging.value.after || paging.value.before) ||
    paging.value.total > pageSize.value ||
    pageSize.value !== 15,
);

const canCreateHeaderCta = computed(() =>
  Boolean(alertResourcePermission.value?.Create || alertResourcePermission.value?.All),
);
const canCreateEmptyCta = computed(() =>
  isNotificationFace.value
    ? alertResourcePermission.value
      ? getDerivedPermissionFlags(alertResourcePermission.value).canCreate
      : false
    : canCreateHeaderCta.value,
);

const replaceWithPlaceholder = computed(
  () =>
    !isNotificationFace.value &&
    !isLoading.value &&
    permissionLoadingCount.value === 0 &&
    (alertsError.value !== undefined || items.value.length === 0),
);

function handleAddAlert(): void {
  void router.push(getAlertAddPath(face.value));
}

function fetchCurrentPage(): void {
  onPageChange(page.value);
}

function pagingHandler(params: PagingHandlerParams): void {
  onPageChange(params.currentPage);
}

async function handleAlertDelete(): Promise<void> {
  selectedAlert.value = undefined;
  try {
    await getLimitByResource('eventsubscription');
    if (isNotificationFace.value) {
      // Pin fetches page 1 while leaving the pager state untouched;
      // the restart keeps the data and the pager coherent.
      resetKey.value += 1;
    } else {
      fetchCurrentPage();
    }
  } catch (error) {
    reportErrorToast(error, hooks);
  }
}

async function handleAlertHardDelete(): Promise<void> {
  isDeleting.value = true;
  const isSuccess = await hardDeleteAlert(
    getEntityName(selectedAlert.value),
    selectedAlert.value?.id ?? '',
    { ...hooks, notifySuccess: (text: string) => message.success(text) },
  );
  if (isSuccess) {
    await handleAlertDelete();
  } else {
    selectedAlert.value = undefined;
  }
  isDeleting.value = false;
}

const settingsTranslator = ((key: string, params?: Record<string, string>) => t(key, params ?? {})) as SettingsTranslator;
const registryEntry = findSettingsRegistryItem('notifications.alerts');
if (!registryEntry) {
  throw new Error('Missing settings registry entry: notifications.alerts');
}
const breadcrumbs = computed(() =>
  toSmBreadcrumbItems(
    getSettingPageBreadcrumbs(
      buildSettingsBreadcrumbCatalog('settings.title', SETTINGS_BREADCRUMB_NAMES, settingsTranslator),
      resolveSettingsLocation,
      'notifications',
      registryTitle(settingsTranslator, registryEntry),
    ),
  ),
);
const observabilityBreadcrumbs = computed(() =>
  getObservabilityAlertsListBreadcrumbs(translate),
);
/** AlertsPage.tsx: full-page loader while resource permission is unresolved. */
const observabilityInitialLoading = computed(
  () =>
    !isNotificationFace.value &&
    permissionLoadingCount.value > 0 &&
    alertResourcePermission.value === undefined &&
    !hasResourcePermissionError.value,
);
</script>

<template>
  <PageLayout
    :document-title="
      isNotificationFace ? t('label.alert-plural') : t('label.observability-alert')
    "
  >
    <Spin v-if="observabilityInitialLoading" class="alerts-list-view__initial-loader" size="large" />
    <template v-else>
      <div v-if="isNotificationFace">
        <SmBreadcrumb :items="breadcrumbs" />
        <div class="alerts-list-view__header">
          <PageHeader
            :header="t('label.notification-plural')"
            :sub-header="t('message.alerts-description')"
            learning-page-id="alerts"
          />
          <LimitWrapper v-if="canCreateHeaderCta" resource="eventsubscription">
            <Button type="primary" data-testid="create-notification" @click="handleAddAlert">
              {{ t('label.add-entity', { entity: t('label.alert') }) }}
            </Button>
          </LimitWrapper>
        </div>
      </div>
      <template v-if="isNotificationFace">
        <AlertListTable
          :face="face"
          :alerts="items"
          :alerts-error="alertsError"
          :has-resource-permission-error="hasResourcePermissionError"
          :alert-permissions="alertPermissions"
          :actions-loading="combinedLoading"
          :table-loading="combinedLoading"
          :blank-while-loading="false"
          :replace-with-placeholder="replaceWithPlaceholder"
          :can-create-empty-cta="canCreateEmptyCta"
          :show-pagination="showPagination"
          :paging="paging"
          :page-size="pageSize"
          :current-page="page"
          :pager-loading="combinedLoading"
          :paging-handler="pagingHandler"
          :on-show-size-change="onPageSizeChange"
          @select-alert="(alert) => (selectedAlert = alert)"
          @add-alert="handleAddAlert"
          @retry="fetchCurrentPage"
          @retry-permission="fetchAlertResourcePermission"
        />
      </template>

      <ObservabilityPageShell
        v-else
        :page-title="t('label.observability-alert')"
      >
        <template #header>
          <ObservabilityGradientPageHeader>
            <template #breadcrumb>
              <SmBreadcrumb :items="observabilityBreadcrumbs" />
            </template>
            <PageHeader
              :header="t('label.observability-alert')"
              :sub-header="t('message.alerts-description')"
              learning-page-id="dataObservability"
            />
            <template #actions>
              <LimitWrapper v-if="canCreateHeaderCta" resource="eventsubscription">
                <Button type="primary" data-testid="add-alert-button" @click="handleAddAlert">
                  {{ t('label.add-entity', { entity: t('label.alert') }) }}
                </Button>
              </LimitWrapper>
            </template>
          </ObservabilityGradientPageHeader>
        </template>
        <AlertListTable
          :face="face"
          :alerts="items"
          :alerts-error="alertsError"
          :has-resource-permission-error="hasResourcePermissionError"
          :alert-permissions="alertPermissions"
          :actions-loading="permissionLoadingCount > 0"
          :table-loading="false"
          :blank-while-loading="true"
          :replace-with-placeholder="replaceWithPlaceholder"
          :can-create-empty-cta="canCreateEmptyCta"
          :show-pagination="showPagination"
          :paging="paging"
          :page-size="pageSize"
          :current-page="page"
          :pager-loading="isLoading"
          :paging-handler="pagingHandler"
          :on-show-size-change="onPageSizeChange"
          @select-alert="(alert) => (selectedAlert = alert)"
          @add-alert="handleAddAlert"
          @retry="fetchCurrentPage"
          @retry-permission="fetchAlertResourcePermission"
        />
      </ObservabilityPageShell>

      <AlertDeleteModal
        :open="Boolean(selectedAlert)"
        :entity-title="getEntityName(selectedAlert)"
        :message="
          t('message.delete-entity-message', {
            entity: getEntityName(selectedAlert) ?? '',
          })
        "
        :deleting="isDeleting"
        @cancel="selectedAlert = undefined"
        @confirm="handleAlertHardDelete"
      />
    </template>
  </PageLayout>
</template>

<style scoped>
.alerts-list-view__header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
}

.alerts-list-view__initial-loader {
  display: flex;
  justify-content: center;
  padding: 48px 0;
  width: 100%;
}
</style>
