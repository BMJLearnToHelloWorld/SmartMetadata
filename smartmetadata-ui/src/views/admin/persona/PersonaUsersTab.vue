<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<!--
  Vue port of pin UsersTab (UsersTabs.component.tsx) plus the column
  definitions of pin Users.util.tsx `commonUserDetailColumns`. Each
  member is fetched individually (fields teams,roles, no include);
  per-user failures drop that row silently (allSettled, fulfilled
  only). While loading, the member references are the rows and the
  Teams/Roles cells render skeletons. Teams/Roles show the first
  reference plus a `+N more` bottom popover; an empty list renders
  `label.no-entity` + team/role — NOT the shared D10 reference-list
  empty text `'-- '`, which pin does not use here. The remove column
  (width 90) renders only when an onRemoveUser callback is passed.
  Team/role links navigate by route name: the shared FQN path
  constructors build `/settings/...` paths the current router does
  not resolve (see the batch report).
-->
<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { RouterLink } from 'vue-router';
import { Button, Modal, Popover, Skeleton, Table, Tooltip } from 'ant-design-vue';
import removeIconUrl from '@/assets/svg/ic-remove.svg';
import botIconUrl from '@/assets/svg/bot.svg';
import { getUserById } from '@/api/users';
import CreatePlaceholder from '@/components/shared/CreatePlaceholder.vue';
import UserPopOverCard from '@/components/shared/UserPopOverCard.vue';
import type { AdminUser } from '@/types/admin';
import type { EntityRef } from '@/types/api';

const LIST_CAP = 1;

type UserRow = EntityRef & Partial<AdminUser>;

const props = defineProps<{
  users: EntityRef[];
  onRemoveUser?: (id: string) => void;
}>();

const { t } = useI18n();

const isDetailsLoading = ref(true);
const additionalUsersDetails = ref<AdminUser[]>([]);
const removeUserDetails = ref<{ state: boolean; user: UserRow } | undefined>(undefined);

function getEntityName(entity?: { name?: string; displayName?: string }): string {
  return entity?.displayName || entity?.name || '';
}

async function fetchUsersAdditionalDetails(): Promise<void> {
  try {
    isDetailsLoading.value = true;
    const results = await Promise.allSettled(
      props.users.map((user) =>
        getUserById(user.id ?? '', { fields: ['teams', 'roles'] }),
      ),
    );
    additionalUsersDetails.value = results
      .filter((result): result is PromiseFulfilledResult<AdminUser> => result.status === 'fulfilled')
      .map((result) => result.value);
  } catch {
    // Pin swallows here: allSettled never rejects, and per-user
    // failures only drop rows.
  } finally {
    isDetailsLoading.value = false;
  }
}

watch(
  () => props.users,
  () => {
    void fetchUsersAdditionalDetails();
  },
  { immediate: true },
);

function rows(): UserRow[] {
  return isDetailsLoading.value ? props.users : additionalUsersDetails.value;
}

function handleRemoveButtonClick(user: UserRow): void {
  removeUserDetails.value = { state: true, user };
}

function handleRemoveCancel(): void {
  removeUserDetails.value = undefined;
}

function handleRemoveConfirm(): void {
  if (removeUserDetails.value && props.onRemoveUser) {
    props.onRemoveUser(removeUserDetails.value.user.id ?? '');
  }
  handleRemoveCancel();
}

const columns = computed(() => [
  { title: t('label.username'), dataIndex: 'username', key: 'username' },
  { title: t('label.name'), dataIndex: 'name', key: 'name' },
  { title: t('label.team-plural'), dataIndex: 'teams', key: 'teams' },
  { title: t('label.role-plural'), dataIndex: 'roles', key: 'roles' },
  { title: t('label.action-plural'), dataIndex: 'id', key: 'id', width: 90 },
]);
</script>

<template>
  <div>
    <Table
      :columns="columns"
      :data-source="rows()"
      :loading="isDetailsLoading"
      :pagination="false"
      row-key="name"
      size="small"
    >
      <template #bodyCell="{ column, record }">
        <template v-if="column.key === 'username'">
          <span style="display: inline-flex; align-items: center; gap: 4px">
            <Tooltip v-if="(record as UserRow).isBot" :title="t('label.bot')">
              <img
                :src="botIconUrl"
                :aria-label="t('label.bot')"
                data-testid="bot-icon"
                alt=""
                width="16"
                height="16"
              />
            </Tooltip>
            <span v-if="(record as UserRow).name">
              <UserPopOverCard
                :user-name="(record as UserRow).name ?? ''"
                :show-user-name="true"
                :profile-width="16"
              />
            </span>
            <span v-else>{{ getEntityName(record as UserRow) }}</span>
          </span>
        </template>
        <template v-else-if="column.key === 'name'">
          {{ getEntityName(record as UserRow) }}
        </template>
        <template v-else-if="column.key === 'teams' || column.key === 'roles'">
          <Skeleton
            v-if="isDetailsLoading"
            :title="false"
            :paragraph="{ rows: 1, width: '100%' }"
            active
          />
          <span
            v-else-if="
              !((record as UserRow)[column.key as 'teams' | 'roles'] ?? []).length
            "
          >
            {{
              t('label.no-entity', {
                entity: t(column.key === 'teams' ? 'label.team' : 'label.role'),
              })
            }}
          </span>
          <span
            v-else
            data-testid="policy-link"
            style="display: inline-flex; flex-wrap: wrap; align-items: center; gap: 4px"
          >
            <RouterLink
              v-for="ref in ((record as UserRow)[column.key as 'teams' | 'roles'] ?? []).slice(
                0,
                LIST_CAP,
              )"
              :key="ref.id ?? ref.name"
              :to="{
                name: column.key === 'teams' ? 'admin-team' : 'admin-role',
                params:
                  column.key === 'teams'
                    ? { id: ref.fullyQualifiedName ?? '' }
                    : { fqn: ref.fullyQualifiedName ?? '' },
              }"
            >
              {{ getEntityName(ref) }}
            </RouterLink>
            <Popover
              v-if="((record as UserRow)[column.key as 'teams' | 'roles'] ?? []).length > LIST_CAP"
              placement="bottom"
              trigger="click"
            >
              <template #content>
                <span
                  style="display: inline-flex; flex-wrap: wrap; align-items: center; gap: 4px"
                >
                  <RouterLink
                    v-for="ref in ((record as UserRow)[column.key as 'teams' | 'roles'] ?? []).slice(
                      LIST_CAP,
                    )"
                    :key="ref.id ?? ref.name"
                    :to="{
                      name: column.key === 'teams' ? 'admin-team' : 'admin-role',
                      params:
                        column.key === 'teams'
                          ? { id: ref.fullyQualifiedName ?? '' }
                          : { fqn: ref.fullyQualifiedName ?? '' },
                    }"
                  >
                    {{ getEntityName(ref) }}
                  </RouterLink>
                </span>
              </template>
              <button
                type="button"
                data-testid="plus-more-count"
                style="
                  cursor: pointer;
                  border: 0;
                  border-radius: 6px;
                  padding: 0 6px;
                  background: var(--sm-surface-muted, #f0f0f0);
                "
              >
                +{{
                  ((record as UserRow)[column.key as 'teams' | 'roles'] ?? []).length - LIST_CAP
                }}
                more
              </button>
            </Popover>
          </span>
        </template>
        <template v-else-if="column.key === 'id'">
          <Tooltip
            v-if="onRemoveUser"
            :title="t('label.remove-entity', { entity: t('label.user') })"
          >
            <Button
              type="text"
              size="small"
              data-testid="remove-user-btn"
              @click="handleRemoveButtonClick(record as UserRow)"
            >
              <img :src="removeIconUrl" alt="" width="16" height="16" />
            </Button>
          </Tooltip>
        </template>
      </template>
      <template #emptyText>
        <div style="position: relative; height: 100%; width: 100%; min-height: 240px">
          <CreatePlaceholder
            :permission="true"
            :test-id="`assign-error-placeholder-${t('label.user')}`"
            :heading="t('label.user')"
            :permission-value="t('label.create-entity', { entity: t('label.user') })"
          />
        </div>
      </template>
    </Table>
    <Modal
      :open="Boolean(removeUserDetails?.state)"
      :title="t('label.removing-user')"
      :ok-text="t('label.confirm')"
      :cancel-text="t('label.cancel')"
      @ok="handleRemoveConfirm"
      @cancel="handleRemoveCancel"
    >
      <div data-testid="remove-confirmation-modal">
        {{
          t('message.are-you-sure-want-to-text', {
            text: t('label.remove-entity-lowercase', {
              entity: removeUserDetails?.user.name ?? '',
            }),
          })
        }}
      </div>
    </Modal>
  </div>
</template>
