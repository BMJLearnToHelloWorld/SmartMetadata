<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import {
  Button,
  Card,
  Dropdown,
  Form,
  Input,
  Select,
  Tag,
  message,
} from 'ant-design-vue';
import { EditOutlined, EllipsisOutlined } from '@ant-design/icons-vue';
import type { JsonPatchOp } from '@/admin/jsonPatch';
import { setFieldPatch } from '@/admin/jsonPatch';
import DeleteEntityModal from '@/features/crud/DeleteEntityModal.vue';
import FormModal from '@/components/shared/FormModal.vue';
import SmProfilePicture from '@/components/shared/SmProfilePicture.vue';
import UserPopOverCard from '@/components/shared/UserPopOverCard.vue';
import { getEntityName } from '@/components/shared/profilePictureUtils';
import { listRoles } from '@/api/roles';
import type { DeleteType } from '@/ingestion/serviceDelete';
import type { AdminEntityRef, AdminUser } from '@/types/admin';
import {
  assignUserDefaultPersonaPatch,
  assignUserDomainsPatch,
  assignUserPersonasPatch,
  assignUserRolesWithAdminPatch,
  assignUserTeamsPatch,
  type ChangePasswordPayload,
} from '@/api/users';
import { isValidPassword } from '@/auth/validation';
import { getPersonaDetailsPath, getRoleWithFqnPath, getTeamsWithFqnPath } from '@/utils/fqnPaths';
import MembersDomainLabel from './MembersDomainLabel.vue';
import MembersEntityPicker from './MembersEntityPicker.vue';
import {
  TERM_ADMIN,
  TERM_ADMIN_ID,
  buildRolesSave,
  getAdminPseudoOption,
  getUserOnlineStatus,
  isMaskedEmail,
  mergeDefaultPersonaOptions,
} from './userLogic';

/**
 * Left column of the user detail (pin Users.component left column,
 * 250px): Profile / Personas / Domains / Teams / Roles, in that
 * order. Gates per card, verbatim from the pin components:
 * - Profile menu: admin-or-self; Edit DisplayName self-only;
 *   Change Password provider-basic AND (admin-or-self) AND not
 *   deleted; Restore when deleted; Delete Profile admin-only and
 *   not deleted.
 * - Personas list edit: admin-only AND not deleted; default-persona
 *   edit: admin-or-self AND not deleted.
 * - Domains: admin AND not deleted (MembersDomainLabel card variant).
 * - Teams: admin AND not deleted; display filters deleted teams.
 * - Roles: admin-only (no deleted gate in the pin card); Admin
 *   pseudo-option filtered out on save, isAdmin sent as a boolean.
 *
 * PATCH writes emit `patch` (the view applies + refetches, matching
 * TeamHeaderSection); the edit UI closes on emit. Change-password,
 * delete and restore run through async function props so the modal
 * stays open on failure, matching the pin card's behaviour.
 *
 * Roles search adaptation: listRoles has no server search parameter
 * (api/roles.ts is outside 02 ownership), so the edit fetches the
 * first 100 roles once and filters client-side with the pin's 300ms
 * debounce, matching the AddAttributeModal pattern. Server-side
 * role search is a residual (see the batch report).
 */

const props = defineProps<{
  user: AdminUser;
  isLoggedInUser: boolean;
  isAdminUser: boolean;
  isAuthProviderBasic: boolean;
  changePasswordRequest: (payload: ChangePasswordPayload) => Promise<void>;
  deleteUser: (deleteType: DeleteType) => Promise<void>;
  restoreUser: () => Promise<void>;
}>();

const emit = defineEmits<{
  patch: [ops: JsonPatchOp[]];
}>();

const { t } = useI18n();

const deleted = computed(() => props.user.deleted ?? false);
const onlineStatus = computed(() => getUserOnlineStatus(props.user));
const onlineStatusText = computed(() =>
  onlineStatus.value === 'online-now'
    ? t('label.online-now')
    : onlineStatus.value === 'active-recently'
      ? t('label.active-recently')
      : '',
);
const hasEditPermission = computed(
  () => (props.isAdminUser || props.isLoggedInUser) && !deleted.value,
);
const showChangePassword = computed(
  () => props.isAuthProviderBasic && hasEditPermission.value,
);
const showManageMenu = computed(() => props.isAdminUser || props.isLoggedInUser);

// --- Edit display name ---
const editNameOpen = ref(false);
const displayNameDraft = ref('');

function openEditName(): void {
  displayNameDraft.value = props.user.displayName ?? props.user.name;
  editNameOpen.value = true;
}

function saveDisplayName(): void {
  const next = displayNameDraft.value.trim();
  if (!next) {
    return;
  }
  editNameOpen.value = false;
  emit('patch', setFieldPatch('/displayName', props.user.displayName, next));
}

// --- Change password (pin ChangePasswordForm; shouldUnregister: the
// oldPassword field exists only for self) ---
const changePasswordOpen = ref(false);
const oldPassword = ref('');
const newPassword = ref('');
const confirmPassword = ref('');
const changingPassword = ref(false);
const passwordError = ref('');

function openChangePassword(): void {
  oldPassword.value = '';
  newPassword.value = '';
  confirmPassword.value = '';
  passwordError.value = '';
  changePasswordOpen.value = true;
}

async function submitChangePassword(): Promise<void> {
  // Pin ChangePasswordForm rules: required fields, fresh-regex pattern
  // check (the product pattern has no /g, so the shared test is safe),
  // confirm must match.
  if (props.isLoggedInUser && !oldPassword.value) {
    passwordError.value = t('message.field-text-is-required', {
      fieldText: t('label.old-password'),
    });
    return;
  }
  if (!newPassword.value) {
    passwordError.value = t('message.field-text-is-required', {
      fieldText: t('label.new-password'),
    });
    return;
  }
  if (!isValidPassword(newPassword.value)) {
    passwordError.value = t('message.password-error-message');
    return;
  }
  if (newPassword.value !== confirmPassword.value) {
    passwordError.value = t('label.password-not-match');
    return;
  }
  passwordError.value = '';
  changingPassword.value = true;
  try {
    await props.changePasswordRequest({
      username: props.user.name,
      requestType: props.isLoggedInUser ? 'SELF' : 'USER',
      ...(props.isLoggedInUser ? { oldPassword: oldPassword.value } : {}),
      newPassword: newPassword.value,
      confirmPassword: confirmPassword.value,
    });
    changePasswordOpen.value = false;
  } finally {
    changingPassword.value = false;
  }
}

// --- Delete / restore ---
const deleteOpen = ref(false);
const deleteLoading = ref(false);
const restoreOpen = ref(false);
const restoreLoading = ref(false);

async function confirmDelete(deleteType: DeleteType): Promise<void> {
  deleteLoading.value = true;
  try {
    await props.deleteUser(deleteType);
    deleteOpen.value = false;
  } finally {
    deleteLoading.value = false;
  }
}

async function confirmRestore(): Promise<void> {
  restoreLoading.value = true;
  try {
    await props.restoreUser();
    restoreOpen.value = false;
  } finally {
    restoreLoading.value = false;
  }
}

// --- Personas ---
const personaPickerOpen = ref(false);
const defaultPersonaEditing = ref(false);

const defaultPersonaOptions = computed(() =>
  mergeDefaultPersonaOptions(
    props.user.personas ?? [],
    props.user.inheritedPersonas ?? [],
    props.user.defaultPersona,
  ),
);

function onPersonasSave(ids: string[]): void {
  personaPickerOpen.value = false;
  emit('patch', assignUserPersonasPatch(props.user.personas, ids));
}

function onDefaultPersonaChange(personaId: string | undefined): void {
  defaultPersonaEditing.value = false;
  emit('patch', assignUserDefaultPersonaPatch(props.user.defaultPersona, personaId));
}

// --- Domains ---
function onDomainsSave(ids: string[]): void {
  emit('patch', assignUserDomainsPatch(props.user.domains, ids));
}

// --- Teams ---
const teamPickerOpen = ref(false);
const visibleTeams = computed(() => (props.user.teams ?? []).filter((team) => !team.deleted));

function onTeamsSave(ids: string[]): void {
  teamPickerOpen.value = false;
  emit('patch', assignUserTeamsPatch(props.user.teams, ids));
}

// --- Roles (inline edit, pin UserProfileRoles) ---
const rolesEditing = ref(false);
const roleOptions = ref<AdminEntityRef[]>([]);
const roleSearch = ref('');
const selectedRoleIds = ref<string[]>([]);
let roleSearchTimer: ReturnType<typeof setTimeout> | undefined;

const filteredRoleOptions = computed(() => {
  const term = roleSearch.value.trim().toLowerCase();
  const options = [getAdminPseudoOption(), ...roleOptions.value];
  if (!term) {
    return options;
  }
  return options.filter((option) =>
    getEntityName(option).toLowerCase().includes(term),
  );
});

async function openRolesEdit(): Promise<void> {
  selectedRoleIds.value = [
    ...(props.user.roles ?? []).flatMap((role) => (role.id === undefined ? [] : [role.id])),
    ...(props.user.isAdmin ? [TERM_ADMIN_ID] : []),
  ];
  roleSearch.value = '';
  rolesEditing.value = true;
  try {
    const page = await listRoles(100);
    roleOptions.value = page.data.map((role) => ({
      id: role.id,
      name: role.name,
      displayName: role.displayName,
      type: 'role',
      fullyQualifiedName: role.fullyQualifiedName,
    }));
  } catch (error) {
    message.error(error instanceof Error ? error.message : t('crud.loadFailed'));
  }
}

function onRoleSearch(value: string): void {
  if (roleSearchTimer !== undefined) {
    clearTimeout(roleSearchTimer);
  }
  roleSearchTimer = setTimeout(() => {
    roleSearch.value = value;
  }, 300);
}

function saveRoles(): void {
  // Resolve against every known option, not the narrowed search list,
  // so a selection made before searching is never dropped on save.
  const known = new Map<string, AdminEntityRef>();
  for (const option of [
    getAdminPseudoOption(),
    ...roleOptions.value,
    ...(props.user.roles ?? []),
  ]) {
    if (option.id !== undefined) {
      known.set(option.id, option);
    }
  }
  const selected = selectedRoleIds.value
    .map((id) => known.get(id))
    .filter((option): option is AdminEntityRef => option !== undefined);
  const { roleIds, isAdmin } = buildRolesSave(selected);
  rolesEditing.value = false;
  emit(
    'patch',
    assignUserRolesWithAdminPatch(props.user.roles, props.user.isAdmin, roleIds, isAdmin),
  );
}

watch(
  () => props.user.id,
  () => {
    rolesEditing.value = false;
    defaultPersonaEditing.value = false;
  },
);
</script>

<template>
  <div class="user-left-column">
    <!-- Profile card -->
    <Card class="user-left-column__card user-left-column__profile">
      <Dropdown v-if="showManageMenu" :trigger="['click']" class="user-left-column__menu">
        <Button
          type="text"
          :aria-label="t('label.manage-entity', { entity: t('label.profile') })"
          data-testid="user-profile-manage-btn"
        >
          <EllipsisOutlined />
        </Button>
        <template #overlay>
          <div class="user-left-column__menu-items">
            <button
              v-if="isLoggedInUser"
              type="button"
              data-testid="edit-displayname"
              @click="openEditName"
            >
              {{ t('label.edit-entity', { entity: t('label.display-name') }) }}
            </button>
            <button
              v-if="showChangePassword"
              type="button"
              data-testid="change-password-button"
              @click="openChangePassword"
            >
              {{ t('label.change-entity', { entity: t('label.password-lowercase') }) }}
            </button>
            <button v-if="deleted" type="button" @click="restoreOpen = true">
              {{ t('label.restore') }}
            </button>
            <button
              v-if="isAdminUser && !deleted"
              type="button"
              @click="deleteOpen = true"
            >
              {{ t('label.delete-profile') }}
            </button>
          </div>
        </template>
      </Dropdown>
      <div class="user-left-column__avatar">
        <UserPopOverCard :user-name="user.name">
          <SmProfilePicture :name="user.name" :display-name="user.displayName" width="80" />
        </UserPopOverCard>
      </div>
      <p class="user-left-column__name" data-testid="user-display-name">
        {{ getEntityName(user) }}
      </p>
      <p
        v-if="user.email && !isMaskedEmail(user.email)"
        class="user-left-column__email"
        data-testid="user-email-value"
      >
        {{ user.email }}
      </p>
      <p v-if="onlineStatus" class="user-left-column__online">
        <span data-testid="user-online-status">
          <Tag color="success">{{ onlineStatusText }}</Tag>
        </span>
      </p>
    </Card>

    <!-- Personas card -->
    <Card data-testid="persona-details-card" class="user-left-column__card">
      <div class="user-left-column__card-head">
        <span data-testid="persona-list">{{ t('label.persona') }}</span>
        <Button
          v-if="isAdminUser && !deleted"
          type="text"
          size="small"
          :title="t('label.edit-entity', { entity: t('label.persona-plural') })"
          @click="personaPickerOpen = true"
        >
          <EditOutlined />
        </Button>
      </div>
      <div v-if="(user.personas ?? []).length" class="user-left-column__chips">
        <RouterLink
          v-for="persona in user.personas"
          :key="persona.id"
          :to="getPersonaDetailsPath(persona.fullyQualifiedName ?? persona.name)"
        >
          <Tag>{{ getEntityName(persona) }}</Tag>
        </RouterLink>
      </div>
      <p v-else class="user-left-column__empty">{{ t('message.no-persona-assigned') }}</p>
      <div class="user-left-column__card-head">
        <span>{{ t('label.default-persona') }}</span>
        <Button
          v-if="(isAdminUser || isLoggedInUser) && !deleted && !defaultPersonaEditing"
          type="text"
          size="small"
          :title="t('label.edit-entity', { entity: t('label.default-persona') })"
          @click="defaultPersonaEditing = true"
        >
          <EditOutlined />
        </Button>
      </div>
      <Select
        v-if="defaultPersonaEditing"
        :value="user.defaultPersona?.id"
        allow-clear
        style="width: 100%"
        :placeholder="t('label.select-field', { field: t('label.default-persona') })"
        @change="onDefaultPersonaChange($event as string | undefined)"
      >
        <Select.Option
          v-for="option in defaultPersonaOptions"
          :key="option.id"
          :value="option.id"
        >
          {{ getEntityName(option) }}
        </Select.Option>
      </Select>
      <div v-else-if="user.defaultPersona">
        <Tag data-testid="default-persona-chip">{{ getEntityName(user.defaultPersona) }}</Tag>
      </div>
      <p v-else class="user-left-column__empty">{{ t('message.no-default-persona') }}</p>
    </Card>

    <!-- Domains card -->
    <MembersDomainLabel
      :domains="user.domains ?? []"
      :can-edit="isAdminUser && !deleted"
      variant="card"
      @save="onDomainsSave"
    />

    <!-- Teams card -->
    <Card data-testid="user-profile-teams" class="user-left-column__card">
      <div class="user-left-column__card-head">
        <span>{{ t('label.team-plural') }}</span>
        <Button
          v-if="isAdminUser && !deleted"
          type="text"
          size="small"
          data-testid="edit-teams-button"
          :title="t('label.edit-entity', { entity: t('label.team-plural') })"
          @click="teamPickerOpen = true"
        >
          <EditOutlined />
        </Button>
      </div>
      <div v-if="visibleTeams.length" class="user-left-column__chips">
        <RouterLink
          v-for="team in visibleTeams"
          :key="team.id"
          :to="getTeamsWithFqnPath(team.fullyQualifiedName ?? team.name)"
        >
          <Tag>{{ getEntityName(team) }}</Tag>
        </RouterLink>
      </div>
      <p v-else class="user-left-column__empty">{{ t('message.no-team-found') }}</p>
    </Card>

    <!-- Roles card -->
    <Card data-testid="user-profile-roles" class="user-left-column__card">
      <div class="user-left-column__card-head">
        <span>{{ t('label.role-plural') }}</span>
        <Button
          v-if="isAdminUser && !rolesEditing"
          type="text"
          size="small"
          data-testid="edit-roles-button"
          :title="t('label.edit-entity', { entity: t('label.role-plural') })"
          @click="openRolesEdit"
        >
          <EditOutlined />
        </Button>
      </div>
      <template v-if="rolesEditing">
        <div data-testid="user-profile-edit-popover">
        <Select
          v-model:value="selectedRoleIds"
          mode="multiple"
          show-search
          :filter-option="false"
          style="width: 100%"
          :placeholder="t('label.search-entity', { entity: t('label.role-plural') })"
          @search="onRoleSearch"
        >
          <Select.Option
            v-for="option in filteredRoleOptions"
            :key="option.id"
            :value="option.id"
          >
            {{ getEntityName(option) }}
          </Select.Option>
        </Select>
        <div class="user-left-column__edit-actions">
          <Button size="small" @click="rolesEditing = false">{{ t('label.cancel') }}</Button>
          <Button size="small" type="primary" @click="saveRoles">{{ t('label.save') }}</Button>
        </div>
        </div>
      </template>
      <template v-else>
        <div
          v-if="(user.roles ?? []).length || user.isAdmin"
          class="user-left-column__chips"
        >
          <Tag v-if="user.isAdmin">{{ TERM_ADMIN }}</Tag>
          <RouterLink
            v-for="role in user.roles"
            :key="role.id"
            :to="getRoleWithFqnPath(role.fullyQualifiedName ?? role.name)"
          >
            <Tag>{{ getEntityName(role) }}</Tag>
          </RouterLink>
        </div>
        <p v-else class="user-left-column__empty">{{ t('message.no-roles-assigned') }}</p>
      </template>
      <div data-testid="user-profile-inherited-roles" class="user-left-column__inherited">
        <div class="user-left-column__card-head">
          <span>{{ t('label.inherited-role-plural') }}</span>
        </div>
        <div v-if="(user.inheritedRoles ?? []).length" class="user-left-column__chips">
          <Tag v-for="role in user.inheritedRoles" :key="role.id">{{ getEntityName(role) }}</Tag>
        </div>
        <p v-else class="user-left-column__empty">{{ t('message.no-inherited-roles-found') }}</p>
      </div>
    </Card>

    <!-- Edit display name -->
    <FormModal
      :open="editNameOpen"
      :title="t('label.edit-entity', { entity: t('label.display-name') })"
      :ok-text="t('label.save')"
      :cancel-text="t('label.cancel')"
      :ok-disabled="!displayNameDraft.trim()"
      test-id="edit-display-name-modal"
      @ok="saveDisplayName"
      @cancel="editNameOpen = false"
    >
      <Input v-model:value="displayNameDraft" :aria-label="t('label.display-name')" />
    </FormModal>

    <!-- Change password -->
    <FormModal
      :open="changePasswordOpen"
      :title="t('label.change-entity', { entity: t('label.password') })"
      :ok-text="t('label.update-entity', { entity: t('label.password') })"
      :cancel-text="t('label.cancel')"
      :confirm-loading="changingPassword"
      test-id="change-password-modal"
      @ok="submitChangePassword"
      @cancel="changePasswordOpen = false"
    >
      <Form layout="vertical">
        <Form.Item v-if="isLoggedInUser" :label="t('label.old-password')">
          <Input.Password
            v-model:value="oldPassword"
            autocomplete="current-password"
            :placeholder="t('label.enter-type-password', { type: t('label.old') })"
            data-testid="input-oldPassword"
          />
        </Form.Item>
        <Form.Item :label="t('label.new-password')">
          <Input.Password
            v-model:value="newPassword"
            autocomplete="new-password"
            :placeholder="t('label.enter-type-password', { type: t('label.new') })"
            data-testid="input-newPassword"
          />
        </Form.Item>
        <Form.Item :label="t('label.confirm-new-password')">
          <Input.Password
            v-model:value="confirmPassword"
            autocomplete="new-password"
            :placeholder="t('label.confirm-new-password')"
            data-testid="input-confirm-newPassword"
          />
        </Form.Item>
        <p v-if="passwordError" class="user-left-column__error">{{ passwordError }}</p>
      </Form>
    </FormModal>

    <!-- Delete / restore -->
    <DeleteEntityModal
      :open="deleteOpen"
      :entity-name="getEntityName(user)"
      :entity-type-label="t('label.user')"
      :allow-soft-delete="!deleted"
      :loading="deleteLoading"
      @cancel="deleteOpen = false"
      @confirm="confirmDelete"
    />
    <FormModal
      :open="restoreOpen"
      :title="t('label.restore-entity', { entity: t('label.user') })"
      :ok-text="t('label.restore')"
      :cancel-text="t('label.cancel')"
      :confirm-loading="restoreLoading"
      test-id="restore-user-modal"
      @ok="confirmRestore"
      @cancel="restoreOpen = false"
    >
      <p>{{ t('message.are-you-want-to-restore') }}</p>
    </FormModal>

    <!-- Pickers -->
    <MembersEntityPicker
      :open="personaPickerOpen"
      kind="persona"
      multiple
      :selected-ids="(user.personas ?? []).flatMap((persona) => (persona.id === undefined ? [] : [persona.id]))"
      :title="t('label.persona-plural')"
      @cancel="personaPickerOpen = false"
      @save="onPersonasSave"
    />
    <MembersEntityPicker
      :open="teamPickerOpen"
      kind="team"
      multiple
      :selected-ids="(user.teams ?? []).flatMap((team) => (team.id === undefined ? [] : [team.id]))"
      :title="t('label.team-plural')"
      @cancel="teamPickerOpen = false"
      @save="onTeamsSave"
    />
  </div>
</template>

<style scoped>
.user-left-column {
  display: flex;
  flex-direction: column;
  gap: 16px;
  flex: 0 0 250px;
  min-width: 0;
}
.user-left-column__card {
  position: relative;
}
.user-left-column__profile {
  text-align: center;
}
.user-left-column__menu {
  position: absolute;
  top: 8px;
  right: 8px;
}
.user-left-column__menu-items {
  background: var(--sm-bg-elevated);
  border-radius: 8px;
  box-shadow: 0 6px 16px rgba(0, 0, 0, 0.12);
  padding: 4px;
  min-width: 180px;
  display: flex;
  flex-direction: column;
}
.user-left-column__menu-items button {
  padding: 6px 12px;
  background: none;
  border: none;
  cursor: pointer;
  text-align: left;
}
.user-left-column__avatar {
  display: flex;
  justify-content: center;
  margin-top: 8px;
}
.user-left-column__name {
  font-size: 18px;
  font-weight: 600;
  margin: 12px 0 0;
  overflow-wrap: break-word;
}
.user-left-column__email {
  margin: 4px 0 0;
  color: var(--sm-text-secondary);
  overflow-wrap: break-word;
}
.user-left-column__online {
  margin: 8px 0 0;
}
.user-left-column__card-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-weight: 600;
  margin-bottom: 8px;
}
.user-left-column__chips {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}
.user-left-column__empty {
  color: var(--sm-text-secondary);
  margin: 0;
}
.user-left-column__inherited {
  margin-top: 16px;
}
.user-left-column__edit-actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
  margin-top: 8px;
}
.user-left-column__error {
  color: var(--sm-color-error);
  margin: 0;
}
</style>
