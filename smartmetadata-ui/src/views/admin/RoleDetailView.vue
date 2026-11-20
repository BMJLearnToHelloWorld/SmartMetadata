<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { Button, Card, Modal, Space, message } from 'ant-design-vue';
import { getEntityName } from '@/components/shared/profilePictureUtils';
import NoDataPlaceholder from '@/components/shared/NoDataPlaceholder.vue';
import { setFieldPatch } from '@/admin/jsonPatch';
import { hardDeleteEntity } from '@/api/entityDelete';
import { getRoleByName, patchRole } from '@/api/roles';
import { getTeamByName, patchTeam } from '@/api/teams';
import { getUserByName, patchUser } from '@/api/users';
import { useEntityPermissions } from '@/composables/useEntityPermissions';
import EntityDetailShell from '@/features/crud/EntityDetailShell.vue';
import type { EntityBreadcrumb, EntityDetailTab } from '@/features/crud/types';
import type { AdminEntityRef, AdminRole } from '@/types/admin';
import AccessDescription from './AccessDescription.vue';
import AccessDetailList from './AccessDetailList.vue';
import AccessManageButton from './AccessManageButton.vue';
import AddAttributeModal from './AddAttributeModal.vue';
import { getErrorText } from './accessApiErrors';
import {
  policyDetailLocation,
  resolveDetailFqn,
  rolesListLocation,
} from './accessPaths';
import { newPatchReference, toPatchReference } from './accessRefs';

const props = defineProps<{ fqn?: string }>();
const { t } = useI18n();
const router = useRouter();

const fqn = computed(() => resolveDetailFqn(props));
const role = ref<AdminRole | null>(null);
const detailLoading = ref(false);
const loadedFqn = ref('');
const activeTab = ref('policies');
const isLoadingOnSave = ref(false);
const addPolicyOpen = ref(false);
const addPolicySaving = ref(false);
const entityToRemove = ref<{ record: AdminEntityRef; kind: 'policies' | 'teams' | 'users' } | null>(null);

const roleName = computed(() => getEntityName(role.value ?? { name: '' }));

// Pin useEntityPermissions(ROLE, fqn, {enabled: Boolean(fqn)}): no `deleted`.
const permissions = useEntityPermissions('role', fqn, {
  enabled: computed(() => Boolean(fqn.value)),
});

watch(permissions.error, (error) => {
  if (error) {
    message.error(error instanceof Error ? error.message : t('crud.loadFailed'));
  }
});

const isLoading = computed(() => permissions.isLoading.value || detailLoading.value);

const breadcrumbs = computed<EntityBreadcrumb[]>(() => [
  // CONFLICT-3 (a): pin builds this trail by hand as two items — the list
  // crumb linked to the list page, then the entity name unlinked — with no
  // Settings root and no Access Control level (RolesDetailPage.tsx:105-117).
  // Do not route it through the §9 constructor: that is the list pages' shape.
  { label: t('label.role-plural'), to: rolesListLocation() },
  { label: roleName.value },
]);

const tabs = computed<EntityDetailTab[]>(() => [
  { key: 'policies', label: t('label.policy-plural'), testId: 'policies' },
  { key: 'teams', label: t('label.team-plural'), testId: 'teams' },
  { key: 'users', label: t('label.user-plural'), testId: 'users' },
]);

async function fetchRole(nextFqn: string): Promise<void> {
  detailLoading.value = true;
  try {
    role.value = await getRoleByName(nextFqn, 'policies,teams,users');
  } catch (error) {
    role.value = null;
    message.error(getErrorText(error, t('crud.loadFailed')));
  } finally {
    detailLoading.value = false;
  }
}

// Pin fetch gate: only fetch once view access is known.
watch(
  [fqn, () => permissions.hasViewAccess.value],
  ([nextFqn, canView]) => {
    if (!nextFqn || !canView || loadedFqn.value === nextFqn) {
      return;
    }
    loadedFqn.value = nextFqn;
    role.value = null;
    void fetchRole(nextFqn);
  },
  { immediate: true },
);

async function onDescriptionUpdate(description: string): Promise<void> {
  const current = role.value;
  if (!current) {
    return;
  }
  try {
    const updated = await patchRole(
      current.id,
      setFieldPatch('/description', current.description, description),
    );
    role.value = { ...current, description: updated.description };
  } catch (error) {
    // Swallowed, like the pin handler: the toast fires and the modal closes.
    message.error(getErrorText(error, t('crud.loadFailed')));
  }
}

async function onEditDisplayName(data: { name: string; displayName: string }): Promise<void> {
  const current = role.value;
  if (!current) {
    return;
  }
  if (data.displayName === (current.displayName ?? '') || !current.id) {
    return;
  }
  const updated = await patchRole(
    current.id,
    setFieldPatch('/displayName', current.displayName, data.displayName),
  );
  role.value = updated;
}

async function removePolicyFromRole(record: AdminEntityRef): Promise<void> {
  const current = role.value;
  if (!current) {
    return;
  }
  try {
    const remaining = current.policies.filter((policy) => policy.id !== record.id);
    const updated = await patchRole(
      current.id,
      setFieldPatch('/policies', current.policies, remaining.map(toPatchReference)),
    );
    role.value = updated;
  } catch (error) {
    message.error(getErrorText(error, t('crud.loadFailed')));
  } finally {
    isLoadingOnSave.value = false;
  }
}

async function removeRoleFromTeam(record: AdminEntityRef): Promise<void> {
  const current = role.value;
  try {
    const team = await getTeamByName(record.fullyQualifiedName ?? record.name ?? '', {
      fields: 'defaultRoles',
    });
    const remaining = team.defaultRoles.filter((teamRole) => teamRole.id !== current?.id);
    await patchTeam(
      team.id,
      setFieldPatch('/defaultRoles', team.defaultRoles, remaining.map(toPatchReference)),
    );
    if (current) {
      role.value = { ...current, teams: current.teams.filter((teamRef) => teamRef.id !== record.id) };
    }
  } catch (error) {
    message.error(getErrorText(error, t('crud.loadFailed')));
  } finally {
    isLoadingOnSave.value = false;
  }
}

async function removeRoleFromUser(record: AdminEntityRef): Promise<void> {
  const current = role.value;
  try {
    const user = await getUserByName(record.fullyQualifiedName ?? record.name ?? '', {
      fields: 'roles',
    });
    const remaining = user.roles.filter((userRole) => userRole.id !== current?.id);
    await patchUser(
      user.id,
      setFieldPatch('/roles', user.roles, remaining.map(toPatchReference)),
    );
    if (current) {
      role.value = { ...current, users: current.users.filter((userRef) => userRef.id !== record.id) };
    }
  } catch (error) {
    message.error(getErrorText(error, t('crud.loadFailed')));
  } finally {
    isLoadingOnSave.value = false;
  }
}

async function handleDelete(record: AdminEntityRef, kind: 'policies' | 'teams' | 'users'): Promise<void> {
  isLoadingOnSave.value = true;
  if (kind === 'teams') {
    // Fire-and-forget, mirroring the pin: the modal closes at once and the
    // reverse PATCH clears isLoadingOnSave in its own finally.
    void removeRoleFromTeam(record);
  } else if (kind === 'users') {
    void removeRoleFromUser(record);
  } else {
    await removePolicyFromRole(record);
  }
}

async function confirmRemove(): Promise<void> {
  const pending = entityToRemove.value;
  if (!pending) {
    return;
  }
  await handleDelete(pending.record, pending.kind);
  entityToRemove.value = null;
}

async function onAddPolicies(selectedIds: string[]): Promise<void> {
  const current = role.value;
  if (!current) {
    return;
  }
  const currentIds = current.policies
    .map((policy) => policy.id)
    .filter((id): id is string => Boolean(id));
  if (
    selectedIds.length === currentIds.length &&
    selectedIds.every((id, index) => id === currentIds[index])
  ) {
    addPolicyOpen.value = false;
    return;
  }
  addPolicySaving.value = true;
  try {
    const refs = selectedIds.map((id) => {
      const existing = current.policies.find((policy) => policy.id === id);
      return existing ? toPatchReference(existing) : newPatchReference(id, 'policy');
    });
    const updated = await patchRole(
      current.id,
      setFieldPatch('/policies', current.policies, refs),
    );
    role.value = updated;
    addPolicyOpen.value = false;
  } catch (error) {
    message.error(getErrorText(error, t('crud.loadFailed')));
  } finally {
    addPolicySaving.value = false;
  }
}

async function onDeleteRole(): Promise<boolean> {
  const current = role.value;
  if (!current) {
    return false;
  }
  return hardDeleteEntity(current.id, 'role', {
    isRecursiveDelete: true,
    onSuccess: () => {
      message.success(t('server.entity-deleted-successfully', { entity: roleName.value }));
    },
    onError: (error) => {
      message.error(getErrorText(error, t('crud.loadFailed')));
    },
  });
}

function goToList(): void {
  void router.push(rolesListLocation());
}

function policyLinkFor(record: AdminEntityRef) {
  return policyDetailLocation(record.fullyQualifiedName ?? record.name ?? '');
}

function teamLinkFor(record: AdminEntityRef) {
  return { name: 'admin-team', params: { id: record.id } };
}

function userLinkFor(record: AdminEntityRef) {
  // B-9 (a1): the user detail route is :fqn-addressed, so link by the
  // fully qualified name (the username), never by UUID.
  return { name: 'admin-user', params: { fqn: record.fullyQualifiedName ?? record.name ?? '' } };
}
</script>

<template>
  <div data-testid="role-details-container">
    <EntityDetailShell
      :title="roleName || t('label.entity-detail-plural', { entity: t('label.role') })"
      :name="role?.name"
      :fqn="role?.fullyQualifiedName"
      :loading="isLoading"
      :empty="false"
      :breadcrumbs="breadcrumbs"
      :tabs="role ? tabs : []"
      v-model:active-tab="activeTab"
    >
      <template v-if="role" #actions>
        <AccessManageButton
          :name="role.name"
          :display-name="role.displayName"
          :entity-type-label="t('label.role')"
          :can-delete="permissions.canDelete.value"
          :edit-display-name-permission="permissions.canEditDisplayName.value"
          :on-edit-display-name="onEditDisplayName"
          :on-delete="onDeleteRole"
          :after-delete-action="goToList"
        />
      </template>
      <template v-if="role" #meta>
        <AccessDescription
          :description="role.description"
          :entity-name="roleName"
          :has-edit-access="true"
          :on-description-update="onDescriptionUpdate"
        />
      </template>
      <template v-if="role" #policies>
        <Card>
          <Space style="display: flex; justify-content: flex-end; width: 100%; margin-bottom: 12px">
            <Button
              type="primary"
              data-testid="add-policy"
              @click="addPolicyOpen = true"
            >
              {{ t('label.add-entity', { entity: t('label.policy') }) }}
            </Button>
          </Space>
          <AccessDetailList
            :items="role.policies"
            :has-access="true"
            :link-for="policyLinkFor"
            name-test-id="entity-name"
            :on-remove="(record) => (entityToRemove = { record, kind: 'policies' })"
          />
        </Card>
      </template>
      <template v-if="role" #teams>
        <AccessDetailList
          :items="role.teams"
          :has-access="true"
          :link-for="teamLinkFor"
          name-test-id="entity-name"
          :on-remove="(record) => (entityToRemove = { record, kind: 'teams' })"
        />
      </template>
      <template v-if="role" #users>
        <AccessDetailList
          :items="role.users"
          :has-access="true"
          :link-for="userLinkFor"
          name-test-id="entity-name"
          :on-remove="(record) => (entityToRemove = { record, kind: 'users' })"
        />
      </template>
      <template v-if="!role && !isLoading" #default>
        <div style="position: relative; min-height: 240px">
          <NoDataPlaceholder
            test-id="no-data-placeholder"
            :title="t('message.no-entity-found-for-name', { entity: t('label.role'), name: fqn })"
          >
            <template #footer>
              <Button type="primary" @click="goToList">{{ t('label.go-back') }}</Button>
            </template>
          </NoDataPlaceholder>
        </div>
      </template>
    </EntityDetailShell>
    <AddAttributeModal
      :open="addPolicyOpen"
      type="policy"
      :title="`${t('label.add')} policy`"
      :selected-keys="
        (role?.policies ?? [])
          .map((policy) => policy.id)
          .filter((id): id is string => Boolean(id))
      "
      :saving="addPolicySaving"
      @save="onAddPolicies"
      @cancel="addPolicyOpen = false"
    />
    <Modal
      :open="entityToRemove !== null"
      :closable="false"
      :mask-closable="false"
      :keyboard="false"
      :title="
        entityToRemove
          ? `${t('label.remove-entity', { entity: getEntityName(entityToRemove.record) })} ${t('label.from-lowercase')} ${roleName}`
          : ''
      "
      @cancel="entityToRemove = null"
    >
      <p v-if="entityToRemove">
        {{
          t('message.are-you-sure-you-want-to-remove-child-from-parent', {
            child: getEntityName(entityToRemove.record),
            parent: roleName,
          })
        }}
      </p>
      <template #footer>
        <Button @click="entityToRemove = null">{{ t('label.cancel') }}</Button>
        <Button type="primary" :loading="isLoadingOnSave" @click="confirmRemove">
          {{ t('label.confirm') }}
        </Button>
      </template>
    </Modal>
  </div>
</template>
