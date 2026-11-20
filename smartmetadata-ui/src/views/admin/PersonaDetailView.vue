<!--
  Copyright 2026 SmartMetadata authors.

  Licensed under the Apache License, Version 2.0.
-->
<!--
  Vue port of pin PersonaDetailsPage.tsx: hash-derived tabs
  (customize-ui / users), a page-local breadcrumb (list + entity
  name + optional category segment, no Settings prefix), entity
  permissions without the `deleted` option, a Manage menu (Rename +
  set/remove-default + Delete), a description preview with a
  field-gated edit affordance, and a users table. The customize-ui
  tab keeps the existing category-card entry behavior only: the
  editors, category table rebuild, and nested-route exit all belong
  to the C-4 batch (DEL-2/DEL-10/DEL-11 held). Description clears
  send a `remove` op (draft PER-D6/DEL-12), implemented by dropping
  undefined-valued keys from the merged record before diffing.
-->
<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { RouterLink, useRoute, useRouter } from 'vue-router';
import { Breadcrumb, Button, Modal, Spin, Tabs, message } from 'ant-design-vue';
import { EditOutlined, UserOutlined } from '@ant-design/icons-vue';
import { diffJsonPatch } from '@/admin/jsonPatch';
import { getPersonaByName, updatePersona } from '@/api/persona';
import { useEntityPermissions } from '@/composables/useEntityPermissions';
import NoDataPlaceholder from '@/components/shared/NoDataPlaceholder.vue';
import SmMarkdown from '@/components/shared/SmMarkdown.vue';
import { useAuthStore } from '@/stores/auth';
import type { EntityRef } from '@/types/api';
import type { Persona } from '@/types/persona';
import { CUSTOMIZE_PAGE_CATEGORIES } from './personaPage';
import { personaDetailBreadcrumbs } from '@/settings/breadcrumbExceptions';
import { settingsLocationResolver } from '@/settings/locationResolver';
import PersonaCustomizeGrid from './persona/PersonaCustomizeGrid.vue';
import { fetchCurrentUserForPersonaDetail } from './persona/currentUserRefresh';
import PersonaDescriptionModal from './persona/PersonaDescriptionModal.vue';
import PersonaManageMenu from './persona/PersonaManageMenu.vue';
import PersonaUsersTab from './persona/PersonaUsersTab.vue';
import UserSelectableList from './persona/UserSelectableList.vue';

const CUSTOMIZE_UI_KEY = 'customize-ui';

const props = defineProps<{ fqn: string }>();

const { t } = useI18n();
const router = useRouter();
const route = useRoute();
const authStore = useAuthStore();

const isLoading = ref(false);
const personaDetails = ref<Persona | null>(null);
const isDescriptionEditing = ref(false);
const isConfirmModalVisible = ref(false);
const isConfirmModalLoading = ref(false);

const hashParts = computed(() => (route.hash ? route.hash.replace('#', '') : '').split('.'));
const activeKey = computed(() => hashParts.value[0] || CUSTOMIZE_UI_KEY);
const activeCategory = computed(() => hashParts.value[1]);
const fullHash = computed(() => route.hash.replace('#', ''));
const breadcrumbs = computed(() =>
  personaDetailBreadcrumbs({
    personasLabel: t('settings.registry.persona.title'),
    entityName: personaDetails.value ? getEntityName(personaDetails.value) : '',
    personaListLocation: settingsLocationResolver('persona'),
    personaDetailLocation: {
      name: 'admin-settings-persona-detail',
      params: { fqn: props.fqn },
      hash: '#customize-ui',
    },
    customizeCategories: CUSTOMIZE_PAGE_CATEGORIES.map((category) => ({
      key: category.key,
      label: t(category.labelKey),
    })),
    activeCategory: activeCategory.value,
  }),
);

// Personas aren't soft-deletable through this page (the Manage menu is
// passed a hardcoded non-deleted state), so this call is deliberately
// ungated — no `deleted` option. (Pin PersonaDetailsPage.tsx:90-91.)
const { canEditAll, canEditDescription, canDelete: hasDeletePermission, error: permissionsError } =
  useEntityPermissions('persona', () => props.fqn);

watch(permissionsError, (error) => {
  if (error) {
    message.error(error instanceof Error ? error.message : String(error));
  }
});

function getEntityName(persona?: Persona | EntityRef | null): string {
  return persona?.displayName || persona?.name || '';
}


async function fetchPersonaDetails(): Promise<void> {
  try {
    isLoading.value = true;
    personaDetails.value = await getPersonaByName(props.fqn);
  } catch (error) {
    message.error(error instanceof Error ? error.message : String(error));
  } finally {
    isLoading.value = false;
  }
}

watch(
  () => props.fqn,
  () => {
    if (props.fqn) {
      void fetchPersonaDetails();
    }
  },
);

onMounted(() => {
  if (props.fqn) {
    void fetchPersonaDetails();
  }
  // Add #customize-ui to the URL when there is no hash (replace).
  if (!route.hash) {
    void router.replace({ hash: '#customize-ui' });
  }
});

function fetchCurrentUser(): Promise<void> {
  return fetchCurrentUserForPersonaDetail(authStore);
}

function stripUndefined(record: Record<string, unknown>): Record<string, unknown> {
  const cleaned: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(record)) {
    if (value !== undefined) {
      cleaned[key] = value;
    }
  }
  return cleaned;
}

async function handlePersonaUpdate(
  data: Partial<Persona>,
  shouldRefetch = false,
): Promise<boolean> {
  if (!personaDetails.value) {
    return false;
  }
  const merged: Record<string, unknown> = { ...personaDetails.value, ...data };
  for (const key of Object.keys(data)) {
    if (data[key as keyof Persona] === undefined) {
      delete merged[key];
    }
  }
  // mapPersona materializes absent fields as present-but-undefined keys;
  // stripping them from both sides makes the diff match pin's
  // fast-json-patch compare on the raw JSON (absent -> present yields
  // `add`, not `replace` on a path the server does not have).
  const diff = diffJsonPatch(
    stripUndefined(personaDetails.value as unknown as Record<string, unknown>),
    stripUndefined(merged),
  );
  try {
    const response = await updatePersona(personaDetails.value.id, diff);
    personaDetails.value = response;
    if (shouldRefetch) {
      await fetchCurrentUser();
    }
    return true;
  } catch (error) {
    message.error(error instanceof Error ? error.message : String(error));
    return false;
  }
}

function handleRemoveUser(userId: string): void {
  const updatedUsers = personaDetails.value?.users?.filter((user) => user.id !== userId);
  void handlePersonaUpdate({ users: updatedUsers }, true);
}

async function handleAfterDeleteAction(): Promise<void> {
  await fetchCurrentUser();
  await router.push({ name: 'admin-settings-persona' });
}

function handleDefaultActionClick(): void {
  isConfirmModalVisible.value = true;
}

async function handleConfirmDefaultAction(): Promise<void> {
  if (!personaDetails.value) {
    return;
  }
  try {
    isConfirmModalLoading.value = true;
    const isCurrentlyDefault = personaDetails.value.default === true;
    const updatedPersona = { ...personaDetails.value, default: !isCurrentlyDefault };
    const jsonPatch = diffJsonPatch(
      stripUndefined(personaDetails.value as unknown as Record<string, unknown>),
      stripUndefined(updatedPersona as unknown as Record<string, unknown>),
    );
    const response = await updatePersona(personaDetails.value.id, jsonPatch);
    const successMessage = isCurrentlyDefault
      ? t('message.default-persona-removed-successfully')
      : t('message.default-persona-set-successfully');
    personaDetails.value = response;
    message.success(successMessage);
    isConfirmModalVisible.value = false;
    await fetchCurrentUser();
  } catch {
    message.error(t('message.default-persona-update-error'));
  } finally {
    isConfirmModalLoading.value = false;
  }
}

function handleTabClick(key: string): void {
  if (fullHash.value === key) {
    return;
  }
  void router.push({ hash: `#${key}` });
}

function handleActiveTabLabelClick(key: string): void {
  // Clicking the active tab emits no Tabs change event, but pin still
  // navigates when the hash carries a category segment (dropping it).
  if (key === activeKey.value && fullHash.value !== key) {
    handleTabClick(key);
  }
}


async function handleDescriptionSave(content: string): Promise<void> {
  const ok = await handlePersonaUpdate({
    description: content ? content : undefined,
  });
  if (ok) {
    isDescriptionEditing.value = false;
  }
}
</script>

<template>
  <div data-testid="persona-detail">
    <div v-if="isLoading" style="display: flex; justify-content: center; padding: 48px 0">
      <Spin size="large" />
    </div>
    <div
      v-else-if="!personaDetails"
      style="position: relative; height: 100%; width: 100%; min-height: 240px"
    >
      <!-- C-4 U-07(b): a failed persona fetch leaves the user on a bare
        placeholder with no in-app path back (pin's no-data branch is
        equally bare — PersonaDetailsPage.tsx — so the link is the
        spec's named addition, not a 1:1 restoration). The footer slot
        carries the link; the title is passed explicitly because the
        placeholder drops its default title whenever a footer slot is
        present. Destination is the persona list, the same route pin's
        breadcrumb crumb and post-delete navigation use. -->
      <NoDataPlaceholder
        test-id="no-data-placeholder"
        :title="t('message.no-data-available')"
      >
        <template #footer>
          <RouterLink
            :to="{ name: 'admin-settings-persona' }"
            data-testid="persona-detail-back-settings"
          >
            {{ t('persona.backToPersona') }}
          </RouterLink>
        </template>
      </NoDataPlaceholder>
    </div>
    <template v-else>
      <div style="display: flex; align-items: flex-start; justify-content: space-between">
        <div>
          <Breadcrumb data-testid="persona-breadcrumb">
            <Breadcrumb.Item v-for="(crumb, index) in breadcrumbs" :key="`${crumb.label}-${index}`">
              <RouterLink v-if="crumb.to" :to="crumb.to">{{ crumb.label }}</RouterLink>
              <span v-else>{{ crumb.label }}</span>
            </Breadcrumb.Item>
          </Breadcrumb>
          <div style="display: flex; align-items: center; gap: 12px; margin-top: 8px">
            <span
              style="
                display: flex;
                align-items: center;
                justify-content: center;
                width: 40px;
                height: 40px;
                border-radius: 50%;
                background: var(--sm-primary, #005587);
                color: #fff;
              "
            >
              <UserOutlined style="font-size: 20px" />
            </span>
            <h2 style="margin: 0" data-testid="persona-detail-name">{{ getEntityName(personaDetails) }}</h2>
          </div>
        </div>
        <PersonaManageMenu
          :persona="personaDetails"
          :can-edit-description="canEditDescription"
          :can-delete="canEditAll || hasDeletePermission"
          :on-edit-display-name="(data) => handlePersonaUpdate(data, true)"
          :on-default-action-click="handleDefaultActionClick"
          :after-delete-action="handleAfterDeleteAction"
        />
      </div>
      <div style="margin: 16px 0">
        <div style="display: flex; align-items: flex-start; gap: 8px">
          <div style="flex: 1; min-width: 0">
            <SmMarkdown :markdown="personaDetails.description ?? ''" />
          </div>
          <Button
            v-if="canEditDescription"
            type="text"
            size="small"
            data-testid="edit-description"
            :title="t('label.edit-entity', { entity: t('label.description') })"
            @click="isDescriptionEditing = true"
          >
            <EditOutlined />
          </Button>
        </div>
      </div>
      <div style="position: relative">
        <Tabs :active-key="activeKey" @change="(key) => handleTabClick(String(key))">
          <Tabs.TabPane :key="CUSTOMIZE_UI_KEY">
            <template #tab>
              <span :data-testid="CUSTOMIZE_UI_KEY" @click="handleActiveTabLabelClick(CUSTOMIZE_UI_KEY)">{{ t('label.customize-ui') }}</span>
            </template>
            <div v-if="activeKey === CUSTOMIZE_UI_KEY" data-testid="persona-tab-customize">
              <PersonaCustomizeGrid :persona-fqn="props.fqn" :active-category="activeCategory" />

            </div>
          </Tabs.TabPane>
          <Tabs.TabPane key="users">
            <template #tab>
              <span data-testid="users" @click="handleActiveTabLabelClick('users')">{{ t('label.user-plural') }}</span>
            </template>
            <div v-if="activeKey === 'users'" data-testid="persona-tab-users">
              <PersonaUsersTab
                :users="personaDetails.users ?? []"
                :on-remove-user="handleRemoveUser"
              />
            </div>
          </Tabs.TabPane>
        </Tabs>
        <div
          v-if="activeKey === 'users'"
          style="position: absolute; top: 0; right: 0"
        >
          <UserSelectableList
            :has-permission="true"
            :multi-select="true"
            :selected-users="personaDetails.users ?? []"
            :on-update="
              (users) => handlePersonaUpdate({ users: Array.isArray(users) ? users : [users] }, true).then(() => undefined)
            "
          >
            <Button type="primary" size="small" data-testid="add-persona-button">
              {{ t('label.add-entity', { entity: t('label.user') }) }}
            </Button>
          </UserSelectableList>
        </div>
      </div>
      <PersonaDescriptionModal
        :open="isDescriptionEditing"
        :header="t('label.edit-description-for', { entityName: personaDetails.name })"
        :placeholder="t('label.enter-entity', { entity: t('label.description') })"
        :value="personaDetails.description"
        :on-cancel="() => { isDescriptionEditing = false; }"
        :on-save="handleDescriptionSave"
      />
      <Modal
        :open="isConfirmModalVisible"
        :title="personaDetails.default ? t('label.remove-default') : t('label.set-as-default')"
        :ok-text="t('label.yes')"
        :cancel-text="t('label.cancel')"
        :confirm-loading="isConfirmModalLoading"
        @ok="void handleConfirmDefaultAction()"
        @cancel="isConfirmModalVisible = false"
      >
        <div data-testid="default-persona-confirmation-modal">
          {{
            personaDetails.default
              ? t('message.remove-default-persona-confirmation', {
                  persona: getEntityName(personaDetails),
                })
              : t('message.set-default-persona-confirmation', {
                  persona: getEntityName(personaDetails),
                })
          }}
        </div>
      </Modal>
    </template>
  </div>
</template>
