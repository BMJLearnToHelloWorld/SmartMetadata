<!--
Copyright 2026 SmartMetadata authors.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0
-->
<script setup lang="ts">
import { BellOutlined, DeleteOutlined, EditOutlined, SyncOutlined } from '@ant-design/icons-vue';
import { Button, message, Modal, Skeleton, Spin, Tooltip } from 'ant-design-vue';
import { computed, reactive, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute } from 'vue-router';
import EntityDetailShell from '@/features/crud/EntityDetailShell.vue';
import { buildSettingsBreadcrumbCatalog, toSmBreadcrumbItems } from '@/settings/breadcrumbs';
import { alertDetailBreadcrumbs } from '@/settings/breadcrumbExceptions';
import { resolveSettingsLocation } from '@/settings/locationResolver';
import {
  SETTINGS_BREADCRUMB_NAMES,
  findSettingsRegistryItem,
  registryTitle,
  type SettingsTranslator,
} from '@/settings/registry';
import { entityLabel } from '@/features/crud/paging';
import type { EntityBreadcrumb, EntityDetailTab } from '@/features/crud/types';
import AlertConfigDetails from '@/components/notifications/AlertConfigDetails.vue';
import AlertDeleteModal from '@/components/notifications/AlertDeleteModal.vue';
import AlertDiagnosticInfoTab from '@/components/notifications/AlertDiagnosticInfoTab.vue';
import AlertExtraInfo from '@/components/notifications/AlertExtraInfo.vue';
import AlertOwnersEditor from '@/components/notifications/AlertOwnersEditor.vue';
import AlertRecentEventsTab from '@/components/notifications/AlertRecentEventsTab.vue';
import NoDataPlaceholder from '@/components/shared/NoDataPlaceholder.vue';
import PageLayout from '@/components/shared/PageLayout.vue';
import PermissionPlaceholder from '@/components/shared/PermissionPlaceholder.vue';
import SmBreadcrumb from '@/components/shared/SmBreadcrumb.vue';
import SmMarkdown from '@/components/shared/SmMarkdown.vue';
import SmProfilePicture from '@/components/shared/SmProfilePicture.vue';
import SmRichTextEditor from '@/components/shared/SmRichTextEditor.vue';
import SomethingWentWrongPlaceholder from '@/components/shared/SomethingWentWrongPlaceholder.vue';
import { isDescriptionContentEmpty } from '@/utils/richTextUtils';
import { ALERT_DETAIL_TABS, type AlertDetailTab } from '@/types/notifications';
import { getEntityName, type TranslateFn } from '@/utils/notifications/alertUtils';
import { hardDeleteAlert } from '@/utils/notifications/alertDelete';
import { resolveAlertFace } from '@/utils/notifications/alertPaths';
import type { AlertSearchHooks } from '@/utils/notifications/alertSourceSearch';
import { useAlertDetailsData } from './useAlertDetailsData';

/**
 * Pin `AlertDetailsPage` + `AlertDetailsContent` (AlertDetailsPage.tsx:39-107,
 * AlertDetailsContent.tsx:52-246): the error split renders instead of the
 * shell — no view permission yields the permission placeholder with no
 * breadcrumb, while a missing alert yields the breadcrumb plus the 404 /
 * 403 / generic placeholder. Inside the shell, the owners row (hidden when
 * there are no owners and no edit permission), the event counts, the
 * always-rendered Sync button, the hidden-unless-permitted Edit/Delete
 * icon buttons, the description block, and the three tabs with
 * visited-tab keep-alive.
 *
 * The view reads the final route contract (`:fqn` / `:tab`); the `:id`
 * fallback keeps it mounted under the current route until the router
 * rewiring lands. The face comes from the route path.
 */
const route = useRoute();
const { t } = useI18n();
const translate = t as unknown as TranslateFn;

const face = computed(() => resolveAlertFace(route.path));
const fqn = computed(() => String(route.params.fqn ?? route.params.id ?? ''));
const routeTab = computed(() => String(route.params.tab ?? ''));

const hooks: AlertSearchHooks = {
  t: translate,
  notifyError: (text: string) => void message.error(text),
  notifyWarning: (text: string) => void message.warning(text),
};

const details = useAlertDetailsData({
  fqn: () => fqn.value,
  face: () => face.value,
  hooks,
  notifySuccess: (text: string) => void message.success(text),
});

// getRenderedActiveTab (CustomizePageEntityTabUtils.ts:82-89): the route tab
// when it names a tab, else the first tab (configuration).
const activeTab = computed<AlertDetailTab>(() =>
  (ALERT_DETAIL_TABS as readonly string[]).includes(routeTab.value)
    ? (routeTab.value as AlertDetailTab)
    : 'configuration',
);

const settingsTranslator = ((key: string, params?: Record<string, string>) => t(key, params ?? {})) as SettingsTranslator;
const alertsRegistryEntry = findSettingsRegistryItem('notifications.alerts');
if (!alertsRegistryEntry) {
  throw new Error('Missing settings registry entry: notifications.alerts');
}
// R-WIRE-7: the pin four-item array lives in the named adapter; the
// view only resolves the catalog, the registry title, and the entity
// name (with its pre-existing fallback). The adapter covers the
// notification face only; the observability face keeps the pin's
// Observability › Alerts trail from the local builder.
const registryBreadcrumbs = computed<EntityBreadcrumb[]>(() =>
  alertDetailBreadcrumbs(
    buildSettingsBreadcrumbCatalog(
      'settings.title',
      SETTINGS_BREADCRUMB_NAMES,
      settingsTranslator,
    ),
    resolveSettingsLocation,
    registryTitle(settingsTranslator, alertsRegistryEntry),
    entityLabel(details.alertDetails.value) || t('observability.alerts.title'),
  ),
);

// useVisitedTabs: tabs mount lazily on first visit and stay mounted, so the
// recent-events filter and page survive tab switches. The shell force-renders
// every pane, so the gate lives inside each tab slot.
const visitedTabs = reactive(new Set<string>([activeTab.value]));
watch(activeTab, (tab) => {
  visitedTabs.add(tab);
});

const tabs = computed<EntityDetailTab[]>(() => [
  { key: 'configuration', label: t('label.configuration') },
  { key: 'recentEvents', label: t('label.recent-event-plural') },
  { key: 'diagnostic-info', label: t('label.diagnostic-info') },
]);

const shellBreadcrumbs = computed<EntityBreadcrumb[]>(() =>
  face.value === 'Notification'
    ? registryBreadcrumbs.value
    : details.breadcrumb.value.map((item) =>
        item.routeName ? { label: item.label, to: { name: item.routeName, params: item.routeParams } } : { label: item.label },
      ),
);

const smBreadcrumbs = computed(() =>
  face.value === 'Notification'
    ? toSmBreadcrumbItems(shellBreadcrumbs.value)
    : details.breadcrumb.value,
);

const showNoViewPermission = computed(
  () => details.loadingCount.value === 0 && details.viewPermission.value === false,
);
const showLoadError = computed(
  () => details.loadingCount.value === 0 && details.alertDetails.value === undefined,
);
const loadErrorStatus = computed(() => details.alertDetailsError.value?.status);

const isNotificationAlert = computed(() => face.value === 'Notification');
const hasOwners = computed(() => (details.alertDetails.value?.owners?.length ?? 0) > 0);
const showOwners = computed(() => hasOwners.value || details.editOwnersPermission.value);
const canShowActions = computed(
  () => details.alertDetails.value?.provider !== 'system',
);

const isDeleting = ref(false);

async function handleAlertHardDelete(): Promise<void> {
  isDeleting.value = true;
  const deleted = await hardDeleteAlert(
    getEntityName(details.alertDetails.value),
    details.alertDetails.value?.id ?? '',
    { ...hooks, notifySuccess: (text: string) => void message.success(text) },
  );
  if (deleted) {
    await details.handleAlertDelete();
  }
  details.hideDeleteModal();
  isDeleting.value = false;
}

const isDescriptionEdit = ref(false);
const descriptionDraft = ref('');

function openDescriptionEditor(): void {
  descriptionDraft.value = details.alertDetails.value?.description ?? '';
  isDescriptionEdit.value = true;
}

async function saveDescription(): Promise<void> {
  await details.onDescriptionUpdate(descriptionDraft.value);
  isDescriptionEdit.value = false;
}
</script>

<template>
  <div
    v-if="showNoViewPermission"
    class="alert-detail__no-view"
  >
    <PermissionPlaceholder
      test-id="permission-error-placeholder"
      :permission-value="t('label.view-entity', { entity: t('label.alert-detail-plural') })"
    />
  </div>
  <PageLayout
    v-else-if="showLoadError"
    :document-title="t('label.alert-detail-plural')"
  >
    <div class="alert-detail__error">
      <SmBreadcrumb :items="smBreadcrumbs" />
      <div class="alert-detail__error-box">
        <NoDataPlaceholder
          v-if="loadErrorStatus === 404"
          :icon="BellOutlined"
          :title="t('label.alert-not-found')"
          :description="t('message.alert-not-found-description')"
        />
        <PermissionPlaceholder
          v-else-if="loadErrorStatus === 403"
          :permission-value="t('label.view-entity', { entity: t('label.alert-detail-plural') })"
        />
        <SomethingWentWrongPlaceholder
          v-else
          :on-reload="details.fetchAlertDetails"
        />
      </div>
    </div>
  </PageLayout>
  <PageLayout v-else :document-title="getEntityName(details.alertDetails.value)">
    <div v-if="details.loadingCount.value > 0" class="alert-detail__loader">
      <Spin />
    </div>
    <EntityDetailShell
      v-else-if="details.alertDetails.value"
      :title="getEntityName(details.alertDetails.value)"
      :name="details.alertDetails.value?.name ?? ''"
      :fqn="details.alertDetails.value?.fullyQualifiedName ?? ''"
      :breadcrumbs="shellBreadcrumbs"
      :tabs="tabs"
      :active-tab="activeTab"
      @update:active-tab="details.handleTabChange"
    >
      <template #meta>
        <div class="alert-detail__meta-row">
          <Skeleton.Button
            v-if="details.ownerLoading.value"
            active
            :style="{ width: '80px', height: '40px' }"
          />
          <div v-else-if="showOwners" class="alert-detail__owners" data-testid="alert-owners">
            <span class="alert-detail__owners-label">{{ t('label.owner-plural') }}</span>
            <span v-if="hasOwners && !details.editOwnersPermission.value" class="alert-detail__owner-list">
              <span
                v-for="owner in details.alertDetails.value?.owners ?? []"
                :key="owner.id || owner.name"
                class="alert-detail__owner"
              >
                <SmProfilePicture :name="owner.name" :display-name="owner.displayName" />
                {{ getEntityName(owner) }}
              </span>
            </span>
            <AlertOwnersEditor
              v-if="details.editOwnersPermission.value"
              :model-value="details.alertDetails.value?.owners ?? []"
              @update:model-value="details.onOwnerUpdate"
            />
          </div>
          <AlertExtraInfo
            :loading="details.alertEventCountsLoading.value"
            :counts="details.alertEventCounts.value"
          />
        </div>
        <div class="alert-detail__description" data-testid="alert-description">
          <span class="alert-detail__description-head">
            <span>{{ t('label.description') }}</span>
            <Button
              v-if="details.editDescriptionPermission.value"
              type="text"
              size="small"
              data-testid="edit-description"
              :title="t('label.edit-entity', { entity: t('label.description') })"
              :aria-label="t('label.edit-entity', { entity: t('label.description') })"
              @click="openDescriptionEditor"
            >
              <EditOutlined />
            </Button>
          </span>
          <SmMarkdown
            v-if="!isDescriptionContentEmpty(details.alertDetails.value?.description)"
            :markdown="details.alertDetails.value?.description ?? ''"
          />
          <span v-else class="alert-detail__no-description">
            {{ t('label.no-description') }}
          </span>
        </div>
      </template>
      <template #actions>
        <Tooltip :title="t('label.sync-alert-offset', { entity: t('label.alert') })">
          <span>
            <Button
              type="text"
              size="large"
              data-testid="sync-button"
              :disabled="details.isSyncing.value"
              @click="details.handleAlertSync"
            >
              <SyncOutlined />
            </Button>
          </span>
        </Tooltip>
        <Tooltip
          v-if="details.editPermission.value && canShowActions"
          :title="t('label.edit-entity', { entity: t('label.alert') })"
        >
          <Button
            type="text"
            size="large"
            data-testid="edit-button"
            @click="details.handleAlertEdit"
          >
            <EditOutlined />
          </Button>
        </Tooltip>
        <Tooltip
          v-if="details.deletePermission.value && canShowActions"
          :title="t('label.delete-entity', { entity: t('label.alert') })"
        >
          <Button
            type="text"
            size="large"
            data-testid="delete-button"
            @click="details.setShowDeleteModal(true)"
          >
            <DeleteOutlined />
          </Button>
        </Tooltip>
      </template>
      <template #configuration>
        <AlertConfigDetails
          v-if="visitedTabs.has('configuration')"
          :alert-details="details.alertDetails.value"
          :is-notification-alert="isNotificationAlert"
          :hooks="hooks"
        />
      </template>
      <template #recentEvents>
        <AlertRecentEventsTab
          v-if="visitedTabs.has('recentEvents')"
          :alert-details="details.alertDetails.value"
          :hooks="hooks"
        />
      </template>
      <template #diagnostic-info>
        <AlertDiagnosticInfoTab
          v-if="visitedTabs.has('diagnostic-info')"
          :fqn="fqn"
          :hooks="hooks"
        />
      </template>
    </EntityDetailShell>
    <AlertDeleteModal
      :open="details.showDeleteModal.value"
      :entity-title="getEntityName(details.alertDetails.value)"
      :message="t('message.permanently-delete-common-message', { entity: getEntityName(details.alertDetails.value).toLowerCase() })"
      :deleting="isDeleting"
      @cancel="details.hideDeleteModal"
      @confirm="handleAlertHardDelete"
    />
    <Modal
      :open="isDescriptionEdit"
      :title="t('label.edit-description-for', { entityName: getEntityName(details.alertDetails.value) })"
      :ok-text="t('label.save')"
      :cancel-text="t('label.cancel')"
      destroy-on-close
      @ok="saveDescription"
      @cancel="isDescriptionEdit = false"
    >
      <SmRichTextEditor
        :initial-value="details.alertDetails.value?.description ?? ''"
        :place-holder="t('label.enter-entity', { entity: t('label.description') })"
        @text-change="descriptionDraft = $event"
      />
    </Modal>
  </PageLayout>
</template>

<style scoped>
.alert-detail__no-view {
  position: relative;
  height: 100%;
  width: 100%;
  min-height: 240px;
}

.alert-detail__error {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.alert-detail__error-box {
  position: relative;
  min-height: calc(100vh - 16rem);
  width: 100%;
}

.alert-detail__loader {
  display: flex;
  justify-content: center;
  padding: 48px 0;
}

.alert-detail__meta-row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}

.alert-detail__owners {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.alert-detail__owners-label {
  color: var(--sm-text-secondary);
  font-weight: 500;
  font-size: 14px;
}

.alert-detail__owner-list {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}

.alert-detail__owner {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.alert-detail__description {
  margin-top: 8px;
}

.alert-detail__description-head {
  display: flex;
  align-items: center;
  gap: 4px;
}

.alert-detail__no-description {
  color: var(--sm-text-secondary);
}
</style>
