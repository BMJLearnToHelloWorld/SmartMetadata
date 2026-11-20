<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute, useRouter } from 'vue-router';
import { Button, Spin, Tabs, Tooltip, message } from 'ant-design-vue';
import type { JsonPatchOp } from '@/admin/jsonPatch';
import ExplorePreview from '@/features/explore/ExplorePreview.vue';
import AssetCustomPropertiesPanel from '@/features/crud/AssetCustomPropertiesPanel.vue';
import CustomPropertiesEditModal from '@/features/crud/CustomPropertiesEditModal.vue';
import NoDataPlaceholder from '@/components/shared/NoDataPlaceholder.vue';
import { getEntityName } from '@/components/shared/profilePictureUtils';
import { extensionPatch } from '@/governance/assetPatch';
import { listCustomProperties } from '@/api/customProperties';
import type { CustomPropertyDef } from '@/types/collaboration';
import { fetchAuthConfig } from '@/api/system';
import { getLimitByResource } from '@/api/limits';
import type { DeleteType } from '@/ingestion/serviceDelete';
import {
  USER_DETAIL_FIELDS,
  changePassword,
  deactivateUser,
  getUserByName,
  patchUser,
  restoreUser,
  type ChangePasswordPayload,
} from '@/api/users';
import { useAuthStore } from '@/stores/auth';
import { usePermissionStore } from '@/stores/permissions';
import type { AdminUser } from '@/types/admin';
import type { SearchHit } from '@/types/api';
import { splitTransElement } from '@/utils/emptyPlaceholder';
import { getUserPath } from '@/utils/fqnPaths';
import { assetLocation, isDetailWired, parentTableLocation } from '@/catalog/entityRoutes';
import MembersAccessTokenCard from './MembersAccessTokenCard.vue';
import MembersAssetList from './MembersAssetList.vue';
import UserLeftColumn from './UserLeftColumn.vue';
import UserPermissionsPanel from './UserPermissionsPanel.vue';
import { buildFollowingQueryFilter, buildMyDataQueryFilter } from './membersSearchFilters';
import {
  USER_TAB_ACCESS_TOKEN,
  USER_TAB_ACTIVITY,
  USER_TAB_CUSTOM_PROPERTIES,
  USER_TAB_FOLLOWING,
  USER_TAB_MY_DATA,
  USER_TAB_PERMISSIONS,
  USER_TAB_TASK,
  getUserTabs,
  resolveEffectiveUserTab,
  shouldRedirectAccessToken,
} from './userLogic';
import { useMembersPermissions } from './useMembersPermissions';

/**
 * UserPage + Users.component equivalent (pin pages/UserPage +
 * components/Settings/Users/Users.component.tsx). Top-level detail:
 * NO breadcrumb (P7), NO page-level permission gate (the pin routes
 * are bare-mounted), NO shell constructor. Fetched by name with the
 * 9-field set + include All; a fetch failure toasts
 * server.entity-fetch-error and renders the no-username placeholder
 * only when there is no user data.
 *
 * Layout: 250px left column + tabs area. Tab keys come from the URL
 * segments (/users/:fqn/:tab/:subTab); an unknown tab renders the
 * first tab with the URL unchanged; MENTIONS/TASKS subTabs force the
 * TASK tab; a non-self direct visit to access-token redirects to
 * Activity. The Access Token tab is disabled (with the pin's
 * hardcoded "You have reached the limit" tooltip) when the user
 * limit's disabledFields include personalAccessToken.
 *
 * Activity/Tasks tabs are HELD: no embeddable feed-tab equivalent
 * exists (ActivityFeedView is a full page, ActivityFeedWidget is a
 * digest, listActivityEvents has no user filter), and §7 forbids a
 * second feed. The tabs keep full URL semantics; the panels render
 * empty held containers with no fake content.
 *
 * Entity permissions are fetched ONLY for the custom-properties tab
 * gates (pin useEntityPermissions(USER, username, {deleted})); the
 * view gate uses hasViewAccess as the canViewCustomFields
 * equivalent (the product derivation has no separate view-custom-
 * fields flag).
 */

const { t, locale } = useI18n();
const route = useRoute();
const router = useRouter();
const authStore = useAuthStore();
const permissionStore = usePermissionStore();

const username = computed(() => String(route.params.fqn ?? ''));
const tabParam = computed(() =>
  typeof route.params.tab === 'string' ? route.params.tab : undefined,
);
const subTabParam = computed(() =>
  typeof route.params.subTab === 'string' ? route.params.subTab : undefined,
);

const user = ref<AdminUser | undefined>();
const isError = ref(false);
const loading = ref(false);

const isLoggedInUser = computed(
  () => authStore.user?.name !== undefined && authStore.user.name === user.value?.name,
);

async function fetchUser(): Promise<void> {
  loading.value = true;
  isError.value = false;
  try {
    user.value = await getUserByName(username.value, {
      fields: USER_DETAIL_FIELDS,
      include: 'all',
    });
  } catch {
    isError.value = true;
    message.error(t('server.entity-fetch-error'));
  } finally {
    loading.value = false;
  }
}

onMounted(() => {
  void fetchUser();
});

watch(username, () => {
  void fetchUser();
});

// --- Tabs ---
const tabs = computed(() => getUserTabs(isLoggedInUser.value));
const effectiveTab = computed(() =>
  resolveEffectiveUserTab(tabParam.value, subTabParam.value, tabs.value),
);

const USER_TAB_LABEL_KEYS: Record<string, string> = {
  [USER_TAB_ACTIVITY]: 'label.activity',
  [USER_TAB_TASK]: 'label.task-plural',
  [USER_TAB_MY_DATA]: 'label.my-data',
  [USER_TAB_FOLLOWING]: 'label.following',
  [USER_TAB_PERMISSIONS]: 'label.permissions',
  [USER_TAB_CUSTOM_PROPERTIES]: 'label.custom-property-plural',
  [USER_TAB_ACCESS_TOKEN]: 'label.access-token',
};

watch(
  [tabParam, isLoggedInUser, () => user.value?.id],
  () => {
    if (user.value && shouldRedirectAccessToken(tabParam.value, isLoggedInUser.value)) {
      void router.replace(getUserPath(username.value, USER_TAB_ACTIVITY));
    }
  },
  { immediate: true },
);

function onTabChange(key: string): void {
  void router.push(getUserPath(username.value, key));
}

// --- Access-token tab disable (limit disabledFields) ---
const accessTokenDisabled = ref(false);

onMounted(async () => {
  try {
    const limit = await getLimitByResource('user');
    const status =
      limit.featureLimitStatuses.find((entry) => entry.name === 'user') ??
      limit.featureLimitStatuses[0];
    const configured = status?.configuredLimit;
    const disabled = configured?.disabledFields ?? configured?.disableFields ?? [];
    accessTokenDisabled.value = disabled.includes('personalAccessToken');
  } catch {
    accessTokenDisabled.value = false;
  }
});

const limitTooltip = computed(() =>
  locale.value.startsWith('zh') ? '你已达到上限' : 'You have reached the limit',
);

// --- Auth provider (change-password gating) ---
const isAuthProviderBasic = ref(false);

onMounted(async () => {
  try {
    const config = await fetchAuthConfig();
    isAuthProviderBasic.value = config.provider === 'basic' || config.provider === 'ldap';
  } catch {
    isAuthProviderBasic.value = false;
  }
});

// --- Custom-properties gates ---
const deletedRef = computed(() => user.value?.deleted ?? false);
const perms = useMembersPermissions('user', username, deletedRef);

// --- Patch (pin updateUserDetails: roles->isAdmin and teams->domains
// syncs arrive with the refetched user; defaultPersona set toasts;
// self-update syncs the current user) ---
async function applyUserPatch(ops: JsonPatchOp[]): Promise<void> {
  const current = user.value;
  if (!current) {
    return;
  }
  const setsDefaultPersona = ops.some(
    (op) => op.path === '/defaultPersona' && (op.op === 'add' || op.op === 'replace'),
  );
  try {
    await patchUser(current.id, ops);
    await fetchUser();
    if (setsDefaultPersona && user.value?.defaultPersona) {
      message.success(
        t('message.field-value-updated-notification', {
          fieldName: t('label.default-persona'),
          fieldValue: getEntityName(user.value.defaultPersona),
        }),
      );
    }
    if (isLoggedInUser.value) {
      await authStore.refreshUser();
    }
  } catch (error) {
    message.error(
      error instanceof Error
        ? error.message
        : t('server.entity-updating-error', { entity: t('label.user') }),
    );
  }
}

// --- Change password / delete / restore (function props: throw on
// failure so the column's modal stays open, matching the pin card) ---
async function requestChangePassword(payload: ChangePasswordPayload): Promise<void> {
  try {
    await changePassword(payload);
    message.success(t('server.update-entity-success', { entity: t('label.password') }));
  } catch (error) {
    message.error(error instanceof Error ? error.message : t('crud.updateFailed'));
    throw error;
  }
}

async function deleteCurrentUser(deleteType: DeleteType): Promise<void> {
  const current = user.value;
  if (!current) {
    return;
  }
  try {
    await deactivateUser(current.id, {
      hardDelete: deleteType === 'hard-delete',
      recursive: true,
    });
    message.success(t('server.entity-deleted-successfully'));
    if (deleteType === 'hard-delete') {
      void router.push('/');
    } else {
      user.value = { ...current, deleted: !current.deleted };
    }
  } catch (error) {
    message.error(t('server.delete-entity-error'));
    throw error;
  }
}

async function restoreCurrentUser(): Promise<void> {
  const current = user.value;
  if (!current) {
    return;
  }
  try {
    await restoreUser(current.id);
    message.success(t('message.entity-restored-success', { entity: t('label.user') }));
    await fetchUser();
  } catch (error) {
    message.error(t('message.entity-restored-error', { entity: t('label.user') }));
    throw error;
  }
}

// --- My Data / Following preview ---
const previewAsset = ref<SearchHit | undefined>();
const myDataFilter = computed(() =>
  user.value
    ? buildMyDataQueryFilter([
        ...(user.value.teams ?? []).flatMap((team) => (team.id === undefined ? [] : [team.id])),
        user.value.id,
      ])
    : '',
);
const followingFilter = computed(() =>
  user.value ? buildFollowingQueryFilter(user.value.id) : '',
);

function openPreviewAsset(hit: SearchHit): void {
  const parent = parentTableLocation(hit.entityType, hit.tableFqn);
  if (parent) {
    void router.push(parent);
    return;
  }
  if (!hit.fullyQualifiedName || !hit.entityType || !isDetailWired(hit.entityType)) {
    return;
  }
  void router.push(assetLocation(hit.entityType, hit.fullyQualifiedName));
}

watch(effectiveTab, () => {
  previewAsset.value = undefined;
});

// --- Permissions tab ---
// UserPermissionsPanel loads the debug info itself (own -> debugMyPermissions,
// other -> debugUserPermissions); the page only passes username + self flag.

// --- Custom properties tab ---
const customPropDefs = ref<CustomPropertyDef[]>([]);
const customPropsError = ref('');
const customPropsOpen = ref(false);
const customPropsSaving = ref(false);

watch(
  () => user.value?.id,
  async () => {
    try {
      customPropDefs.value = await listCustomProperties('user');
      customPropsError.value = '';
    } catch (error) {
      customPropDefs.value = [];
      customPropsError.value = error instanceof Error ? error.message : t('crud.loadFailed');
    }
  },
  { immediate: true },
);

async function onSaveCustomProperties(next: Record<string, unknown>): Promise<void> {
  const current = user.value;
  if (!current) {
    return;
  }
  customPropsSaving.value = true;
  try {
    await patchUser(current.id, extensionPatch(current.extension, next));
    customPropsOpen.value = false;
    await fetchUser();
  } catch (error) {
    message.error(error instanceof Error ? error.message : t('asset.updateFailed'));
  } finally {
    customPropsSaving.value = false;
  }
}

// --- No-username placeholder (Trans <0> element, bold username) ---
// The fallback branch renders the same message, so both branches share
// one interpolation (pin values={{ user }}; UserPage.component.tsx:95-112).
const noUsernameMessage = computed(() =>
  t('message.no-username-available', { user: username.value }),
);
const noUsernameParts = computed(() => splitTransElement(noUsernameMessage.value));
</script>

<template>
  <div class="user-detail">
    <Spin v-if="loading" :spinning="true" data-testid="user-detail-loader" />
    <NoDataPlaceholder v-else-if="isError && !user" test-id="no-data-placeholder">
      <template #title>
        <template v-if="noUsernameParts"
          >{{ noUsernameParts.before }}<strong>{{ noUsernameParts.inner }}</strong
          >{{ noUsernameParts.after }}</template
        >
        <template v-else>{{ noUsernameMessage }}</template>
      </template>
    </NoDataPlaceholder>
    <div v-else-if="user" class="user-detail__layout">
      <UserLeftColumn
        :user="user"
        :is-logged-in-user="isLoggedInUser"
        :is-admin-user="permissionStore.isAdminUser"
        :is-auth-provider-basic="isAuthProviderBasic"
        :change-password-request="requestChangePassword"
        :delete-user="deleteCurrentUser"
        :restore-user="restoreCurrentUser"
        @patch="applyUserPatch"
      />
      <div class="user-detail__tabs">
        <Tabs
          :active-key="effectiveTab"
          data-testid="user-detail-tabs"
          @change="onTabChange(String($event))"
        >
          <Tabs.TabPane
            v-for="tab in tabs"
            :key="tab"
            :disabled="tab === USER_TAB_ACCESS_TOKEN && accessTokenDisabled"
          >
            <template #tab>
              <Tooltip
                v-if="tab === USER_TAB_ACCESS_TOKEN && accessTokenDisabled"
                :title="limitTooltip"
              >
                <span>{{ t(USER_TAB_LABEL_KEYS[tab] ?? tab) }}</span>
              </Tooltip>
              <span v-else>{{ t(USER_TAB_LABEL_KEYS[tab] ?? tab) }}</span>
            </template>
            <!-- Activity / Tasks: HELD (see the header comment). The
                 containers stay empty; no fake feed content. -->
            <div
              v-if="tab === USER_TAB_ACTIVITY && effectiveTab === USER_TAB_ACTIVITY"
              data-testid="activity-tab-held"
            />
            <div
              v-if="tab === USER_TAB_TASK && effectiveTab === USER_TAB_TASK"
              data-testid="task-tab-held"
            />
            <div
              v-if="
                (tab === USER_TAB_MY_DATA || tab === USER_TAB_FOLLOWING) &&
                effectiveTab === tab
              "
              class="user-detail__assets"
            >
              <div class="user-detail__assets-main">
                <MembersAssetList
                  :query-filter="tab === USER_TAB_MY_DATA ? myDataFilter : followingFilter"
                  :asset-kind="tab === USER_TAB_MY_DATA ? 'my-data' : 'following'"
                  :can-create="true"
                  :summary-panel-open="Boolean(previewAsset)"
                  @asset-click="previewAsset = $event"
                  @add-asset="router.push({ name: 'search' })"
                />
              </div>
              <div v-if="previewAsset" class="user-detail__assets-preview">
                <ExplorePreview :hit="previewAsset" @open="openPreviewAsset" />
                <Button size="small" @click="previewAsset = undefined">{{
                  t('label.close')
                }}</Button>
              </div>
            </div>
            <div v-if="tab === USER_TAB_PERMISSIONS && effectiveTab === USER_TAB_PERMISSIONS">
              <UserPermissionsPanel :username="user.name" :is-logged-in-user="isLoggedInUser" />
            </div>
            <div
              v-if="
                tab === USER_TAB_CUSTOM_PROPERTIES &&
                effectiveTab === USER_TAB_CUSTOM_PROPERTIES &&
                perms.flags.value.hasViewAccess
              "
            >
              <div style="margin-bottom: 12px">
                <Button
                  data-testid="edit-user-custom-properties"
                  :disabled="!perms.flags.value.canEditCustomFields || customPropDefs.length === 0"
                  @click="customPropsOpen = true"
                >
                  {{ t('asset.editCustomProperties') }}
                </Button>
              </div>
              <AssetCustomPropertiesPanel
                :defs="customPropDefs"
                :values="user.extension || {}"
                :error="customPropsError"
                entity-type="user"
              />
            </div>
            <MembersAccessTokenCard
              v-if="tab === USER_TAB_ACCESS_TOKEN && effectiveTab === USER_TAB_ACCESS_TOKEN"
              :user="user"
            />
          </Tabs.TabPane>
        </Tabs>
      </div>
    </div>

    <CustomPropertiesEditModal
      :open="customPropsOpen"
      :defs="customPropDefs"
      :values="user?.extension || {}"
      :saving="customPropsSaving"
      @save="onSaveCustomProperties"
      @cancel="customPropsOpen = false"
    />
  </div>
</template>

<style scoped>
.user-detail__layout {
  display: flex;
  gap: 24px;
  align-items: flex-start;
}
.user-detail__tabs {
  flex: 1;
  min-width: 0;
}
.user-detail__assets {
  display: flex;
  gap: 16px;
}
.user-detail__assets-main {
  flex: 1;
  min-width: 0;
}
.user-detail__assets-preview {
  flex: 0 0 400px;
  min-width: 0;
  border-left: 1px solid var(--sm-border-color);
  padding-left: 16px;
}
</style>
