<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute, useRouter } from 'vue-router';
import {
  Breadcrumb,
  Button,
  Dropdown,
  Spin,
  Switch,
  Tabs,
  message,
} from 'ant-design-vue';
import { EllipsisOutlined } from '@ant-design/icons-vue';
import type { JsonPatchOp } from '@/admin/jsonPatch';
import { setFieldPatch } from '@/admin/jsonPatch';
import ExplorePreview from '@/features/explore/ExplorePreview.vue';
import AssetCustomPropertiesPanel from '@/features/crud/AssetCustomPropertiesPanel.vue';
import CustomPropertiesEditModal from '@/features/crud/CustomPropertiesEditModal.vue';
import DeleteEntityModal from '@/features/crud/DeleteEntityModal.vue';
import FormModal from '@/components/shared/FormModal.vue';
import NoDataPlaceholder from '@/components/shared/NoDataPlaceholder.vue';
import PermissionPlaceholder from '@/components/shared/PermissionPlaceholder.vue';
import { getEntityName } from '@/components/shared/profilePictureUtils';
import { extensionPatch } from '@/governance/assetPatch';
import { listCustomProperties } from '@/api/customProperties';
import type { CustomPropertyDef } from '@/types/collaboration';
import { markCsvJobOwned, notifyCsvJobsRefresh } from '@/api/csvJobs';
import type { DeleteType } from '@/ingestion/serviceDelete';
import { searchAssets } from '@/api/search';
import {
  TEAM_CHILD_FIELDS_ADVANCED,
  TEAM_DETAIL_FIELDS_ADVANCED,
  TEAM_DETAIL_FIELDS_BASIC,
  assignTeamDefaultRolesPatch,
  assignTeamParentsPatch,
  assignTeamPoliciesPatch,
  buildTeamChildSearchFilter,
  deleteTeam,
  exportTeam,
  exportUsersOfTeam,
  getTeamByName,
  getTeamsAssetCounts,
  listTeams,
  patchTeam,
  removeTeamUser,
  replaceTeamUsers,
  restoreTeam,
  searchTeams,
} from '@/api/teams';
import {
  assignUserTeamsPatch,
  getUserByName,
  patchUser,
} from '@/api/users';
import { useAuthStore } from '@/stores/auth';
import { usePermissionStore } from '@/stores/permissions';
import type { AdminEntityRef, AdminTeam, AdminUser } from '@/types/admin';
import type { SearchHit } from '@/types/api';
import { getEncodedFqn, getTeamsWithFqnPath } from '@/utils/fqnPaths';
import { splitTransElements } from '@/utils/emptyPlaceholder';
import {
  assetLocation,
  isDetailWired,
  lineageLocation,
  parentTableLocation,
} from '@/catalog/entityRoutes';
import AddTeamFormModal from './AddTeamFormModal.vue';
import MembersAssetList from './MembersAssetList.vue';
import TeamHeaderSection from './TeamHeaderSection.vue';
import TeamHierarchyTable from './TeamHierarchyTable.vue';
import TeamRolesPoliciesTab from './TeamRolesPoliciesTab.vue';
import TeamUserTab from './TeamUserTab.vue';
import { buildTeamAssetsCountQueryFilter, buildTeamAssetsQueryFilter } from './membersSearchFilters';
import {
  getTeamTabCounts,
  getTeamTabs,
  graftHierarchyChildren,
  isDropRestricted,
  toHierarchyNode,
} from './teamLogic';
import { useMembersPermissions } from './useMembersPermissions';

/**
 * TeamsPage equivalent (pin TeamsPage.tsx + TeamDetailsV1.tsx): the
 * team detail IS the page; there is no flat list (P1). Fetched by FQN
 * (route param `fqn`, falling back to the legacy `id` param value),
 * in two stages (basic then advanced field sets, same-id merge,
 * parent-chain load, freshness guards). The page-level view gate
 * renders the shared PermissionPlaceholder (permissionValue =
 * label.view-entity) and fetches nothing when denied; an empty team
 * renders a plain NoDataPlaceholder.
 *
 * Layout is direct (breadcrumb + header section + tabs), not
 * EntityDetailShell: the shell renders a static title that would
 * duplicate the editable TeamsHeadingLabel, and the pin page has no
 * generic shell here. Breadcrumbs follow the §2.1 note: Organization
 * gets the 3-level constructor output [Settings, Members, Teams];
 * other teams get the parent-chain slashed breadcrumb through the
 * same breadcrumb component.
 *
 * Raw `entityPermissions.Create` reads (pin §6.3, reproduced with
 * comments, never "fixed" to derivation): the Import menu item and
 * the hierarchy Add-button state (via the hierarchy table's
 * canCreateTeam prop).
 */

const { t } = useI18n();
const route = useRoute();
const router = useRouter();
const authStore = useAuthStore();
const permissionStore = usePermissionStore();

const fqn = computed(() => String(route.params.fqn ?? route.params.id ?? ''));
const team = ref<AdminTeam | undefined>();
const parentTeams = ref<AdminTeam[]>([]);
const teamLoading = ref(false);
const teamBasicLoading = ref(false);
const teamError = ref(false);

const deletedRef = computed(() => team.value?.deleted ?? false);
const perms = useMembersPermissions('team', fqn, deletedRef);
const permsReady = computed(() => !perms.isLoading.value && perms.operations.value !== null);
const hasViewPermission = computed(
  () => permsReady.value && perms.flags.value.hasViewAccess,
);
const rawCreate = computed(() => perms.operations.value?.Create === true);

watch(
  () => perms.error.value,
  (error) => {
    if (error !== undefined) {
      message.error(error instanceof Error ? error.message : t('crud.loadFailed'));
    }
  },
);

// --- Two-stage detail fetch ---
let basicFetchId = 0;
let advancedFetchId = 0;

async function loadParentChain(current: AdminTeam): Promise<AdminTeam[]> {
  const chain: AdminTeam[] = [];
  const seen = new Set<string>([current.id]);
  let parents = current.parents ?? [];
  while (parents.length > 0) {
    const ref = parents[0];
    if (!ref || !ref.id || seen.has(ref.id)) {
      break;
    }
    seen.add(ref.id);
    try {
      const parent = await getTeamByName(ref.name, { fields: ['parents'], include: 'all' });
      chain.unshift(parent);
      parents = parent.parents ?? [];
    } catch {
      break;
    }
  }
  return chain;
}

async function fetchTeamBasicDetails(): Promise<void> {
  const id = ++basicFetchId;
  teamBasicLoading.value = true;
  try {
    const fetched = await getTeamByName(fqn.value, {
      fields: TEAM_DETAIL_FIELDS_BASIC,
      include: 'all',
    });
    if (id !== basicFetchId) {
      return;
    }
    team.value =
      team.value && team.value.id === fetched.id ? { ...team.value, ...fetched } : fetched;
    parentTeams.value = await loadParentChain(fetched);
  } catch {
    if (id === basicFetchId) {
      teamError.value = true;
    }
  } finally {
    if (id === basicFetchId) {
      teamBasicLoading.value = false;
    }
  }
}

async function fetchTeamAdvancedDetails(): Promise<void> {
  const id = ++advancedFetchId;
  try {
    const fetched = await getTeamByName(fqn.value, {
      fields: TEAM_DETAIL_FIELDS_ADVANCED,
      include: 'all',
    });
    if (id !== advancedFetchId) {
      return;
    }
    team.value =
      team.value && team.value.id === fetched.id ? { ...team.value, ...fetched } : fetched;
    if (fetched.teamType === 'Group') {
      void fetchAssetsCount(fetched);
    }
  } catch {
    // The basic stage already rendered the page; an advanced failure
    // leaves the basic data in place (pin chains without a catch that
    // clears the team).
  }
}

async function loadTeam(): Promise<void> {
  teamLoading.value = true;
  teamError.value = false;
  await fetchTeamBasicDetails();
  if (!teamError.value) {
    await fetchTeamAdvancedDetails();
  }
  teamLoading.value = false;
}

watch(
  hasViewPermission,
  (allowed) => {
    if (allowed) {
      void loadTeam();
      void fetchChildTeamsBasic(fqn.value);
      void fetchAssetCounts();
    }
  },
  { immediate: true },
);

// --- Assets count (Group only; tab badge) ---
const assetsCount = ref(0);

async function fetchAssetsCount(current: AdminTeam): Promise<void> {
  try {
    const result = await searchAssets('*', 0, 0, {
      index: 'all',
      query_filter: buildTeamAssetsCountQueryFilter(current.id),
    });
    assetsCount.value = result.total ?? 0;
  } catch {
    assetsCount.value = 0;
  }
}

// --- Child teams (two stages + freshness guards) ---
const childTeams = ref<AdminTeam[]>([]);
const childBasicLoading = ref(false);
const childAdvancedLoading = ref(false);
const showDeletedTeam = ref(false);
const assetCounts = ref<Record<string, number>>({});
const assetsLoading = ref(false);
let childBasicFetchId = 0;
let childAdvancedFetchId = 0;

async function fetchAssetCounts(): Promise<void> {
  assetsLoading.value = true;
  try {
    assetCounts.value = await getTeamsAssetCounts();
  } catch {
    assetCounts.value = {};
  } finally {
    assetsLoading.value = false;
  }
}

async function fetchChildTeamsAdvanced(
  parentTeam?: string,
  updateChildNode = false,
  bumpFetchId = true,
): Promise<void> {
  const id = bumpFetchId ? ++childAdvancedFetchId : childAdvancedFetchId;
  childAdvancedLoading.value = true;
  try {
    const page = await listTeams({
      parentTeam: parentTeam ?? 'organization',
      include: showDeletedTeam.value ? 'deleted' : 'non-deleted',
      fields: TEAM_CHILD_FIELDS_ADVANCED,
    });
    if (bumpFetchId && id !== childAdvancedFetchId) {
      return;
    }
    const nodes = page.data.map(toHierarchyNode);
    if (updateChildNode && parentTeam) {
      childTeams.value = graftHierarchyChildren(childTeams.value, parentTeam, nodes);
    } else {
      childTeams.value = nodes;
    }
  } finally {
    if (!bumpFetchId || id === childAdvancedFetchId) {
      childAdvancedLoading.value = false;
    }
  }
}

async function fetchChildTeamsBasic(parentTeam?: string): Promise<void> {
  const id = ++childBasicFetchId;
  childBasicLoading.value = true;
  try {
    const page = await listTeams({
      parentTeam: parentTeam ?? 'organization',
      include: showDeletedTeam.value ? 'deleted' : 'non-deleted',
      fields: '',
    });
    if (id !== childBasicFetchId) {
      return;
    }
    childTeams.value = page.data.map(toHierarchyNode);
    await fetchChildTeamsAdvanced(parentTeam);
  } finally {
    if (id === childBasicFetchId) {
      childBasicLoading.value = false;
    }
  }
}

function onChildSearch(term: string): void {
  if (!term) {
    void fetchChildTeamsBasic(fqn.value);
    return;
  }
  void (async () => {
    const current = team.value;
    if (!current) {
      return;
    }
    childBasicLoading.value = true;
    try {
      const page = await searchTeams(`*${term}*`, 0, 10, buildTeamChildSearchFilter(current.id), {
        includeDeleted: showDeletedTeam.value,
      });
      childTeams.value = page.data;
    } finally {
      childBasicLoading.value = false;
    }
  })();
}

function onToggleDeleted(value: boolean): void {
  showDeletedTeam.value = value;
  void fetchChildTeamsBasic(fqn.value);
}

function onExpandChild(fqnToExpand: string): void {
  // Expand lazy-loads without bumping the fetch id (pin onTeamExpand).
  void fetchChildTeamsAdvanced(fqnToExpand, true, false);
}

// --- Tabs ---
// Labels verbatim from pin getTabs (TeamDetailsV1.utils.tsx:18-72).
const TEAM_TAB_LABEL_KEYS: Record<string, string> = {
  teams: 'label.team-plural',
  users: 'label.user-plural',
  assets: 'label.asset-plural',
  roles: 'label.role-plural',
  policies: 'label.policy-plural',
  custom_properties: 'label.custom-property-plural',
};
const tabKeys = computed(() => getTeamTabs(team.value?.teamType ?? 'Organization'));
const tabCounts = computed(() =>
  getTeamTabCounts(
    team.value ?? { users: [], defaultRoles: [], policies: [] },
    childTeams.value.length,
    assetsCount.value,
  ),
);
const tabItems = computed(() =>
  tabKeys.value.map((key) => {
    const count = (tabCounts.value as Record<string, number | undefined>)[key];
    const label = t(TEAM_TAB_LABEL_KEYS[key] ?? key);
    return { key, label: count !== undefined ? `${label} (${count})` : label };
  }),
);
const activeTabParam = computed(() =>
  typeof route.query.activeTab === 'string' ? route.query.activeTab : undefined,
);
const currentTab = computed(() => activeTabParam.value ?? tabKeys.value[0] ?? '');

function onTabChange(key: string): void {
  void router.replace({ query: { ...route.query, activeTab: key } });
}

// --- Breadcrumbs (§2.1 note) ---
const breadcrumbs = computed<Array<{ label: string; to?: unknown }>>(() => {
  if (!team.value) {
    return [];
  }
  if (team.value.teamType === 'Organization') {
    return [
      { label: t('label.setting-plural'), to: { name: 'admin-settings' } },
      { label: t('label.member-plural') },
      { label: t('label.team-plural') },
    ];
  }
  const items: Array<{ label: string; to?: string }> = parentTeams.value.map((parent) => ({
    label: getEntityName(parent),
    to: getTeamsWithFqnPath(parent.fullyQualifiedName ?? parent.name),
  }));
  items.push({ label: getEntityName(team.value) });
  return items;
});

// --- Patch (pin updateTeamHandler: no success toast, error toast) ---
const patchSaving = ref(false);

async function applyTeamPatch(
  ops: JsonPatchOp[],
  options?: { successMessageKey?: string },
): Promise<void> {
  const current = team.value;
  if (!current) {
    return;
  }
  patchSaving.value = true;
  try {
    await patchTeam(current.id, ops);
    await fetchTeamBasicDetails();
    await fetchTeamAdvancedDetails();
    if (options?.successMessageKey) {
      message.success(t(options.successMessageKey));
    }
  } catch (error) {
    message.error(
      error instanceof Error
        ? error.message
        : t('server.entity-updating-error', { entity: t('label.team') }),
    );
  } finally {
    patchSaving.value = false;
  }
}

// --- Roles / Policies ---
function onAttributeSave(attribute: 'defaultRoles' | 'policies', ids: string[]): void {
  const current = team.value;
  if (!current) {
    return;
  }
  const ops =
    attribute === 'defaultRoles'
      ? assignTeamDefaultRolesPatch(current.defaultRoles, ids)
      : assignTeamPoliciesPatch(current.policies, ids);
  void applyTeamPatch(ops);
}

function onAttributeRemove(attribute: 'defaultRoles' | 'policies', record: AdminEntityRef): void {
  const current = team.value;
  if (!current) {
    return;
  }
  const remaining = (
    attribute === 'defaultRoles' ? (current.defaultRoles ?? []) : (current.policies ?? [])
  ).filter((item) => item.id !== record.id);
  onAttributeSave(
    attribute,
    remaining.flatMap((item) => (item.id === undefined ? [] : [item.id])),
  );
}

// --- UserTab add / remove ---
const memberSaving = ref(false);

async function onAddUsers(ids: string[]): Promise<void> {
  const current = team.value;
  if (!current) {
    return;
  }
  memberSaving.value = true;
  try {
    await replaceTeamUsers(current.id, ids);
    await fetchTeamAdvancedDetails();
  } catch (error) {
    message.error(error instanceof Error ? error.message : t('crud.updateFailed'));
  } finally {
    memberSaving.value = false;
  }
}

async function onRemoveUser(user: AdminUser): Promise<void> {
  const current = team.value;
  if (!current) {
    return;
  }
  memberSaving.value = true;
  try {
    await removeTeamUser(current.id, user.id);
    // Pin updates users + userCount locally after a remove.
    team.value = {
      ...current,
      users: (current.users ?? []).filter((member) => member.id !== user.id),
      userCount: Math.max(0, (current.userCount ?? 0) - 1),
    };
  } catch (error) {
    message.error(error instanceof Error ? error.message : t('crud.deleteFailed'));
  } finally {
    memberSaving.value = false;
  }
}

// --- Drag to re-parent ---
const dragConfirm = ref<{ dragged: AdminTeam; target: AdminTeam | null } | undefined>();
const dragSaving = ref(false);

// Drag-confirm transfer message (Trans <0> elements, bold team names).
// Pin renders message.entity-transfer-message with Transi18next
// renderElement={<strong />} and entity=t('label.team-lowercase')
// (TeamHierarchy.tsx:379-389). The locale value carries two <0> pairs,
// so the single-pair splitTransElement cannot render it; split it with
// the multi-pair helper instead. Locale values stay untouched.
const transferMessage = computed(() =>
  t('message.entity-transfer-message', {
    from: dragConfirm.value ? getEntityName(dragConfirm.value.dragged) : '',
    to: dragConfirm.value?.target
      ? getEntityName(dragConfirm.value.target)
      : team.value
        ? getEntityName(team.value)
        : '',
    entity: t('label.team-lowercase'),
  }),
);
const transferMessageParts = computed(() => splitTransElements(transferMessage.value));

function onHierarchyDrop(payload: { dragged: AdminTeam; target: AdminTeam | null }): void {
  if (isDropRestricted(payload.dragged.teamType, payload.target?.teamType)) {
    message.error(t('message.error-team-transfer-message'));
    return;
  }
  dragConfirm.value = payload;
}

async function confirmDrop(): Promise<void> {
  const pending = dragConfirm.value;
  const current = team.value;
  if (!pending || !current) {
    return;
  }
  dragSaving.value = true;
  try {
    const dragged = await getTeamByName(pending.dragged.name, {
      fields: ['users', 'defaultRoles', 'policies', 'owners', 'parents', 'children'],
      include: 'all',
    });
    await patchTeam(
      dragged.id,
      assignTeamParentsPatch(dragged.parents, pending.target?.id),
    );
    message.success(t('message.team-moved-success'));
    dragConfirm.value = undefined;
    await fetchChildTeamsBasic(current.name);
  } catch {
    message.error(t('server.team-moved-error'));
  } finally {
    dragSaving.value = false;
  }
}

// --- Manage menu (DET-3 data table) ---
const showDeleteModal = ref(false);
const deleteLoading = ref(false);
const showCreateModal = ref(false);
const leaveConfirm = ref(false);
const joinLeaveLoading = ref(false);

const isOrganization = computed(() => team.value?.teamType === 'Organization');
const isGroupType = computed(() => team.value?.teamType === 'Group');
const parentDeleted = computed(() => parentTeams.value[0]?.deleted ?? false);

const menuItems = computed(() => {
  const current = team.value;
  if (!current) {
    return [];
  }
  const deleted = current.deleted ?? false;
  const items: Array<{ key: string; label: string; description?: string; testId?: string; danger?: boolean }> = [];
  if (!isGroupType.value && !deleted) {
    if (rawCreate.value) {
      items.push({ key: 'import', label: t('label.import') });
    }
    items.push({ key: 'export', label: t('label.export') });
  }
  if (!parentDeleted.value && deleted) {
    // Pin extraDropdownContent: ManageButtonItemLabel with the restore
    // description, name restore-entity{team}, id restore-team-dropdown.
    items.push({
      key: 'restore',
      label: t('label.restore-entity', { entity: t('label.team') }),
      description: t('message.restore-deleted-team'),
      testId: 'restore-team-dropdown',
    });
  }
  if (!deleted) {
    // Pin extraDropdownContent: the public-team item carries the
    // access-to-collaborate description (id open-group-dropdown).
    items.push({
      key: 'public',
      label: t('label.public-team'),
      description: t('message.access-to-collaborate'),
      testId: 'open-group-dropdown',
    });
  }
  if (!isOrganization.value) {
    items.push({ key: 'delete', label: t('label.delete'), danger: true });
  }
  return items;
});

const canSeeManageMenu = computed(
  () => menuItems.value.length > 0 && perms.ungatedFlags.value.canEditAll,
);

async function onMenuClick(key: string): Promise<void> {
  const current = team.value;
  if (!current) {
    return;
  }
  if (key === 'import') {
    void router.push(
      `/settings/members/teams/${getEncodedFqn(current.fullyQualifiedName ?? current.name)}/import?type=teams`,
    );
  } else if (key === 'export') {
    await exportTeamByName(current);
  } else if (key === 'restore') {
    await restoreCurrentTeam(current);
  } else if (key === 'public') {
    await applyTeamPatch(setFieldPatch('/isJoinable', current.isJoinable, !current.isJoinable));
  } else if (key === 'delete') {
    showDeleteModal.value = true;
  }
}

async function exportTeamByName(current: AdminTeam): Promise<void> {
  try {
    const { jobId } = await exportTeam(current.name);
    if (jobId) {
      markCsvJobOwned(jobId);
    }
    notifyCsvJobsRefresh();
  } catch (error) {
    message.error(error instanceof Error ? error.message : t('crud.loadFailed'));
  }
}

async function exportUsersOfCurrentTeam(): Promise<void> {
  const current = team.value;
  if (!current) {
    return;
  }
  try {
    const { jobId } = await exportUsersOfTeam(current.name);
    if (jobId) {
      markCsvJobOwned(jobId);
    }
    notifyCsvJobsRefresh();
  } catch (error) {
    message.error(error instanceof Error ? error.message : t('crud.loadFailed'));
  }
}

function importUsers(): void {
  const current = team.value;
  if (!current) {
    return;
  }
  void router.push(
    `/settings/members/teams/${getEncodedFqn(current.fullyQualifiedName ?? current.name)}/import?type=users`,
  );
}

async function restoreCurrentTeam(current: AdminTeam): Promise<void> {
  try {
    await restoreTeam(current.id);
    message.success(t('message.entity-restored-success', { entity: t('label.team') }));
    handleToggleDelete();
  } catch {
    message.error(t('message.entity-restored-error', { entity: t('label.team') }));
  }
}

function handleToggleDelete(): void {
  if (team.value) {
    team.value = { ...team.value, deleted: !team.value.deleted };
  }
  childTeams.value = childTeams.value.map((child) => ({ ...child, deleted: !child.deleted }));
}

async function handleDelete(deleteType: DeleteType): Promise<void> {
  const current = team.value;
  if (!current) {
    return;
  }
  deleteLoading.value = true;
  try {
    await deleteTeam(current.id, {
      hardDelete: deleteType === 'hard-delete',
      recursive: true,
    });
    message.success(t('server.entity-deleted-successfully'));
    showDeleteModal.value = false;
    if (deleteType === 'hard-delete') {
      void router.push(getTeamsWithFqnPath('Organization'));
    } else {
      handleToggleDelete();
    }
  } catch {
    message.error(t('server.delete-entity-error'));
  } finally {
    deleteLoading.value = false;
  }
}

// --- Join / Leave ---
const currentUserDetail = ref<AdminUser | undefined>();

async function loadCurrentUserDetail(): Promise<void> {
  const name = authStore.user?.name;
  if (!name || currentUserDetail.value) {
    return;
  }
  try {
    currentUserDetail.value = await getUserByName(name, { fields: ['teams'] });
  } catch {
    currentUserDetail.value = undefined;
  }
}

watch(isGroupType, (isGroup) => {
  if (isGroup && authStore.user) {
    void loadCurrentUserDetail();
  }
});

const isJoined = computed(() =>
  (currentUserDetail.value?.teams ?? []).some((member) => member.id === team.value?.id),
);
const canManageMembership = computed(
  () => isGroupType.value && !isOrganization.value && authStore.user !== null,
);
const showJoin = computed(
  () =>
    canManageMembership.value &&
    !isJoined.value &&
    (team.value?.isJoinable === true || permissionStore.isAdminUser),
);
const showLeave = computed(() => canManageMembership.value && isJoined.value);

async function updateMembership(join: boolean): Promise<void> {
  const current = team.value;
  const user = currentUserDetail.value;
  if (!current || !user) {
    return;
  }
  joinLeaveLoading.value = true;
  try {
    const memberIds = (user.teams ?? []).flatMap((member) =>
      member.id === undefined ? [] : [member.id],
    );
    const nextIds = join
      ? [...memberIds, current.id]
      : memberIds.filter((id) => id !== current.id);
    await patchUser(user.id, assignUserTeamsPatch(user.teams, nextIds));
    await authStore.refreshUser();
    currentUserDetail.value = undefined;
    await loadCurrentUserDetail();
    message.success(t(join ? 'server.join-team-success' : 'server.leave-team-success'));
    await fetchTeamAdvancedDetails();
  } catch {
    message.error(t(join ? 'server.join-team-error' : 'server.leave-team-error'));
  } finally {
    joinLeaveLoading.value = false;
  }
}

// --- Create team ---
function onTeamCreated(): void {
  showCreateModal.value = false;
  void fetchChildTeamsBasic(fqn.value);
}

// --- Assets preview ---
const previewAsset = ref<SearchHit | undefined>();

function openPreviewAsset(hit: SearchHit): void {
  // Mirrors SearchView openHit: column hits go to the parent table,
  // wired types to their detail page, unwired hits only stay selected.
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

// D25: the preview lineage entry navigates to the lineage page for the hit.
function openPreviewLineage(hit: SearchHit): void {
  if (hit.fullyQualifiedName) {
    void router.push(lineageLocation(hit.entityType, hit.fullyQualifiedName));
  }
}

// --- Custom properties ---
const customPropDefs = ref<CustomPropertyDef[]>([]);
const customPropsError = ref('');
const customPropsOpen = ref(false);
const customPropsSaving = ref(false);

watch(
  () => team.value?.id,
  async () => {
    try {
      customPropDefs.value = await listCustomProperties('team');
      customPropsError.value = '';
    } catch (error) {
      customPropDefs.value = [];
      customPropsError.value = error instanceof Error ? error.message : t('crud.loadFailed');
    }
  },
  { immediate: true },
);

async function onSaveCustomProperties(next: Record<string, unknown>): Promise<void> {
  const current = team.value;
  if (!current) {
    return;
  }
  customPropsSaving.value = true;
  try {
    await patchTeam(current.id, extensionPatch(current.extension, next));
    customPropsOpen.value = false;
    await fetchTeamAdvancedDetails();
  } catch (error) {
    message.error(error instanceof Error ? error.message : t('asset.updateFailed'));
  } finally {
    customPropsSaving.value = false;
  }
}

// --- Header helpers ---
const isCurrentTeamOwner = computed(() => {
  const userId = authStore.user?.id;
  if (!userId) {
    return false;
  }
  return (team.value?.owners ?? []).some((owner) => owner.id === userId);
});
const isUserPartOfTeam = computed(
  () =>
    (currentUserDetail.value?.teams ?? []).some((member) => member.id === team.value?.id) ||
    isCurrentTeamOwner.value,
);

function onBreadcrumbNavigate(to: unknown): void {
  if (to) {
    void router.push(to as never);
  }
}
</script>

<template>
  <div class="team-detail">
    <Spin v-if="!permsReady || teamLoading" :spinning="true" data-testid="team-detail-loader" />
    <PermissionPlaceholder
      v-else-if="!hasViewPermission"
      :permission-value="t('label.view-entity', { entity: t('label.team-plural') })"
      test-id="permission-error-placeholder"
    />
    <NoDataPlaceholder v-else-if="!team" test-id="no-data-placeholder" />
    <template v-else>
      <Breadcrumb data-testid="entity-detail-breadcrumb">
        <Breadcrumb.Item v-for="(item, index) in breadcrumbs" :key="`${item.label}-${index}`">
          <a
            v-if="item.to"
            href="#"
            :data-testid="`entity-detail-crumb-${index}`"
            @click.prevent="onBreadcrumbNavigate(item.to)"
          >
            {{ item.label }}
          </a>
          <span v-else>{{ item.label }}</span>
        </Breadcrumb.Item>
      </Breadcrumb>

      <div class="team-detail__head">
        <TeamHeaderSection
          :team="team"
          :parent-teams="parentTeams"
          :flags="perms.flags.value"
          :ungated-flags="perms.ungatedFlags.value"
          :is-admin-user="permissionStore.isAdminUser"
          :is-current-team-owner="isCurrentTeamOwner"
          :is-user-part-of-team="isUserPartOfTeam"
          :saving="patchSaving"
          @patch="applyTeamPatch"
        />
        <div class="team-detail__actions">
          <Button
            v-if="showLeave"
            :loading="joinLeaveLoading"
            data-testid="leave-team-button"
            @click="leaveConfirm = true"
          >
            {{ t('label.leave-team') }}
          </Button>
          <Button
            v-if="showJoin"
            type="primary"
            :loading="joinLeaveLoading"
            data-testid="join-team-button"
            @click="updateMembership(true)"
          >
            {{ t('label.join-team') }}
          </Button>
          <Dropdown v-if="canSeeManageMenu" :trigger="['click']">
            <Button data-testid="manage-button"><EllipsisOutlined /></Button>
            <template #overlay>
              <div class="team-detail__menu">
                <button
                  v-for="item in menuItems"
                  :key="item.key"
                  type="button"
                  class="team-detail__menu-item"
                  :class="{ 'team-detail__menu-item--danger': item.danger }"
                  :data-testid="item.testId"
                  @click="onMenuClick(item.key)"
                >
                  <span :data-testid="item.key === 'public' ? 'open-group-label' : undefined">
                    {{ item.label }}
                  </span>
                  <small v-if="item.description" class="team-detail__menu-item-description">
                    {{ item.description }}
                  </small>
                  <Switch
                    v-if="item.key === 'public'"
                    :checked="team.isJoinable ?? false"
                    size="small"
                    class="team-detail__public-switch"
                  />
                </button>
              </div>
            </template>
          </Dropdown>
        </div>
      </div>

      <Tabs
        :active-key="currentTab"
        class="entity-detail-tabs"
        data-testid="team-detail-tabs"
        @change="onTabChange(String($event))"
      >
        <Tabs.TabPane v-for="tab in tabItems" :key="tab.key" :tab="tab.label">
          <TeamHierarchyTable
            v-if="tab.key === 'teams' && currentTab === 'teams'"
            :teams="childTeams"
            :team="team"
            :asset-counts="assetCounts"
            :assets-loading="assetsLoading"
            :advanced-loading="childAdvancedLoading"
            :basic-loading="childBasicLoading"
            :can-create-team="rawCreate"
            :is-team-deleted="team.deleted ?? false"
            @search="onChildSearch"
            @toggle-deleted="onToggleDeleted"
            @expand="onExpandChild"
            @drop="onHierarchyDrop"
            @add-team="showCreateModal = true"
          />
          <TeamUserTab
            v-if="tab.key === 'users' && currentTab === 'users'"
            :team="team"
            :is-group-type="isGroupType"
            :can-edit-users="perms.flags.value.can('EditUsers')"
            :ungated-can-edit-users="perms.ungatedFlags.value.can('EditUsers')"
            :can-edit-all="perms.flags.value.canEditAll"
            :saving="memberSaving"
            @add-users="onAddUsers"
            @remove-user="onRemoveUser"
            @export-users="exportUsersOfCurrentTeam"
            @import-users="importUsers"
          />
          <div
            v-if="tab.key === 'assets' && currentTab === 'assets'"
            class="team-detail__assets"
          >
            <div :class="previewAsset ? 'team-detail__assets-main--split' : 'team-detail__assets-main'">
              <MembersAssetList
                :query-filter="buildTeamAssetsQueryFilter(team.id)"
                asset-kind="team"
                :can-create="rawCreate"
                :summary-panel-open="true"
                @asset-click="previewAsset = $event"
                @add-asset="router.push({ name: 'search' })"
              />
            </div>
            <div v-if="previewAsset" class="team-detail__assets-preview">
              <ExplorePreview :hit="previewAsset" @open="openPreviewAsset" @open-lineage="openPreviewLineage" />
              <Button size="small" @click="previewAsset = undefined">{{ t('label.close') }}</Button>
            </div>
          </div>
          <TeamRolesPoliciesTab
            v-if="(tab.key === 'roles' || tab.key === 'policies') && currentTab === tab.key"
            :team="team"
            :attribute="tab.key === 'roles' ? 'defaultRoles' : 'policies'"
            :can-edit-all="perms.flags.value.canEditAll"
            :ungated-can-edit-all="perms.ungatedFlags.value.canEditAll"
            :saving="patchSaving"
            @save="onAttributeSave"
            @remove="onAttributeRemove"
          />
          <div v-if="tab.key === 'custom_properties' && currentTab === 'custom_properties'">
            <div style="margin-bottom: 12px">
              <Button
                data-testid="edit-team-custom-properties"
                :disabled="!perms.flags.value.canEditCustomFields || customPropDefs.length === 0"
                @click="customPropsOpen = true"
              >
                {{ t('asset.editCustomProperties') }}
              </Button>
            </div>
            <AssetCustomPropertiesPanel
              :defs="customPropDefs"
              :values="team.extension || {}"
              :error="customPropsError"
              entity-type="team"
            />
          </div>
        </Tabs.TabPane>
      </Tabs>
    </template>

    <AddTeamFormModal
      v-if="team"
      :open="showCreateModal"
      :parent-team="team"
      @cancel="showCreateModal = false"
      @created="onTeamCreated"
    />
    <DeleteEntityModal
      :open="showDeleteModal"
      :entity-name="team ? getEntityName(team) : ''"
      :entity-type-label="t('label.team')"
      :allow-soft-delete="!(team?.deleted ?? false)"
      :loading="deleteLoading"
      @cancel="showDeleteModal = false"
      @confirm="handleDelete"
    />
    <FormModal
      :open="dragConfirm !== undefined"
      :title="t('label.move-the-entity', { entity: t('label.team') })"
      :ok-text="t('label.confirm')"
      :cancel-text="t('label.cancel')"
      :confirm-loading="dragSaving"
      test-id="move-team-modal"
      @ok="confirmDrop"
      @cancel="dragConfirm = undefined"
    >
      <p>
        <template v-if="transferMessageParts">
          <template v-for="(segment, index) in transferMessageParts" :key="index">
            <strong v-if="segment.strong">{{ segment.text }}</strong>
            <template v-else>{{ segment.text }}</template>
          </template>
        </template>
        <template v-else>{{ transferMessage }}</template>
      </p>
    </FormModal>
    <FormModal
      :open="leaveConfirm"
      :title="t('label.leave-team')"
      :ok-text="t('label.confirm')"
      :cancel-text="t('label.cancel')"
      :confirm-loading="joinLeaveLoading"
      test-id="leave-team-modal"
      @ok="leaveConfirm = false; updateMembership(false)"
      @cancel="leaveConfirm = false"
    >
      <p>
        {{
          t('message.are-you-sure-want-to-text', {
            text: t('message.leave-the-team-team-name', {
              teamName: team?.displayName ?? team?.name ?? '',
            }),
          })
        }}
      </p>
    </FormModal>
    <CustomPropertiesEditModal
      :open="customPropsOpen"
      :defs="customPropDefs"
      :values="team?.extension || {}"
      :saving="customPropsSaving"
      @save="onSaveCustomProperties"
      @cancel="customPropsOpen = false"
    />
  </div>
</template>

<style scoped>
.team-detail__head {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  margin: 12px 0;
}
.team-detail__actions {
  display: flex;
  gap: 8px;
  flex: none;
  align-items: flex-start;
}
.team-detail__public-switch {
  margin-left: 8px;
  pointer-events: none;
}
.team-detail__menu {
  background: var(--sm-bg-elevated);
  border-radius: 8px;
  box-shadow: 0 6px 16px rgba(0, 0, 0, 0.12);
  padding: 4px;
  min-width: 160px;
}
.team-detail__menu-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  padding: 6px 12px;
  background: none;
  border: none;
  cursor: pointer;
  text-align: left;
}
.team-detail__menu-item--danger {
  color: var(--sm-color-error);
}
.team-detail__assets {
  display: flex;
  gap: 16px;
}
.team-detail__assets-main {
  flex: 1;
  min-width: 0;
}
.team-detail__assets-main--split {
  flex: 0 0 75%;
  min-width: 0;
}
.team-detail__assets-preview {
  flex: 0 0 25%;
  min-width: 0;
  border-left: 1px solid var(--sm-border-color);
  padding-left: 16px;
}
</style>
