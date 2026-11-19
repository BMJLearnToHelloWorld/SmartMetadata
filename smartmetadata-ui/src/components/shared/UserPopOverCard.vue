<!--
  Copyright 2026 SmartMetadata authors.

  Licensed under the Apache License, Version 2.0 (the "License");
  you may not use this file except in compliance with the License.
  You may obtain a copy of the License at

      http://www.apache.org/licenses/LICENSE-2.0
-->
<!--
  Vue port of official components/common/PopOverCard/UserPopOverCard.tsx
  plus PopoverTitle/TeamPopoverTitle/PopoverContent/TeamPopoverContent/
  UserTeams/UserRoles, in one file (the official pieces share one data
  hook call here; the query-key dedup makes two calls equivalent).

  Deliberate divergences, all ruled:
  - No getSettingsLink: default links and title navigation use the
    fqnPaths helpers directly (no AI-shell hash; brief + t363 staged
    contract). The caller-provided `to` prop is honored verbatim.
  - `displayName` is a string prop (05-doc Q12), not a ReactNode.
  - `onTitleClick` is a zero-arg function prop, called after
    preventDefault (trigger link) / stopPropagation (title button),
    exactly as official calls `onTitleClick()` with no arguments.
  - Team description renders with the existing SmMarkdown temporarily
    (05-doc ruling); the final description contract follows the editor
    cluster. Never plain text.
  - Undeclared HTML attributes are discarded: inheritAttrs is false and
    no rest-props spread exists (official interface extends
    HTMLAttributes but the component spreads nothing).
  - The no-name guard stays at call points (05-doc Q14): an empty
    userName still renders the default link (`/users/` for USER, the
    teams list path for TEAM) and the card collapses to no-data.
-->
<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter, type RouteLocationRaw } from 'vue-router';
import { TeamOutlined, UserOutlined } from '@ant-design/icons-vue';
import { getTeamAndUserDetailsPath, getUserPath } from '@/utils/fqnPaths';
import HoverCard from './HoverCard.vue';
import { getEntityName, TERM_ADMIN } from './profilePictureUtils';
import SmMarkdown from './SmMarkdown.vue';
import SmProfilePicture from './SmProfilePicture.vue';
import { useEntityPopoverData, type PopoverOwnerType } from './useEntityPopoverData';
import type { PopoverEntityRef, PopoverTeam, PopoverUser } from './popoverTypes';

defineOptions({ inheritAttrs: false });

const props = withDefaults(
  defineProps<{
    userName: string;
    displayName?: string;
    type?: PopoverOwnerType;
    showUserName?: boolean;
    showUserProfile?: boolean;
    className?: string;
    profileWidth?: number;
    to?: RouteLocationRaw;
    onTitleClick?: () => void;
  }>(),
  {
    type: 'user',
    showUserName: false,
    showUserProfile: true,
    profileWidth: 24,
  }
);

const { t } = useI18n();
const router = useRouter();

const isTeam = computed(() => props.type === 'team');

const { data, loading } = useEntityPopoverData(() => props.userName, props.type);

const userData = computed(() => (isTeam.value ? undefined : (data.value as PopoverUser | undefined)));
const teamData = computed(() => (isTeam.value ? (data.value as PopoverTeam | undefined) : undefined));

function isEmptyValue(value: unknown): boolean {
  if (value === null || value === undefined) {
    return true;
  }
  if (typeof value === 'string' || Array.isArray(value)) {
    return value.length === 0;
  }
  if (typeof value === 'object') {
    return Object.keys(value).length === 0;
  }
  return false;
}

function defaultPath(name: string): string {
  return isTeam.value ? getTeamAndUserDetailsPath(name) : getUserPath(name);
}

function handleTitleClick(event: MouseEvent): void {
  if (props.onTitleClick) {
    event.preventDefault();
    props.onTitleClick();
  }
}

const fetchedName = computed(() => userData.value?.name ?? '');
const fetchedDisplayName = computed(() => getEntityName(userData.value));

function onUserTitleClick(event: MouseEvent): void {
  event.stopPropagation();
  if (props.onTitleClick) {
    props.onTitleClick();
    return;
  }
  void router.push(getUserPath(fetchedName.value));
}

const teamName = computed(() => teamData.value?.name ?? props.userName);
const teamDisplayName = computed(() => getEntityName(teamData.value));

function onTeamTitleClick(event: MouseEvent): void {
  event.stopPropagation();
  // TeamPopoverTitle never intercepts onTitleClick: it always navigates.
  void router.push(getTeamAndUserDetailsPath(teamName.value));
}

// Official getNonDeletedTeams (utils/TeamUtils.ts:102-104).
const nonDeletedTeams = computed(() =>
  (userData.value?.teams ?? []).filter((team: PopoverEntityRef) => !team.deleted)
);
const roles = computed(() => userData.value?.roles ?? []);
const isAdmin = computed(() => userData.value?.isAdmin === true);

const userCountLabel = computed(() =>
  `${teamData.value?.userCount ?? 0} ${t(teamData.value?.userCount === 1 ? 'label.user' : 'label.user-plural')}`
);
</script>

<template>
  <HoverCard>
    <template #default>
      <slot v-if="$slots.default" />
      <RouterLink
        v-else
        :class="[
          'user-popover-card__assignee',
          !showUserName && showUserProfile && 'user-popover-card__assignee--spaced',
          className,
        ]"
        :data-testid="userName"
        :to="to ?? defaultPath(userName)"
        @click="handleTitleClick"
      >
        <SmProfilePicture
          v-if="showUserProfile"
          :is-team="isTeam"
          :name="userName"
          :width="`${profileWidth}`"
        />
        <span v-if="showUserName" class="user-popover-card__truncate">{{
          displayName ?? userName
        }}</span>
      </RouterLink>
    </template>
    <template #content>
      <div class="user-popover-card" data-testid="user-popover-card">
        <!-- Title row: avatar + name block, both types. -->
        <div class="user-popover-card__title-row">
          <SmProfilePicture :is-team="isTeam" :name="userName" :width="`${profileWidth}`" />
          <div v-if="isTeam" class="user-popover-card__title-names">
            <button
              type="button"
              class="user-popover-card__title-button"
              @click="onTeamTitleClick"
            >
              <span class="user-popover-card__title-name" data-testid="team-name">{{
                teamDisplayName || userName
              }}</span>
            </button>
            <span
              v-if="teamDisplayName && teamDisplayName !== teamName"
              class="user-popover-card__muted"
              >{{ teamName }}</span
            >
          </div>
          <div v-else class="user-popover-card__title-names">
            <button
              type="button"
              class="user-popover-card__title-button"
              @click="onUserTitleClick"
            >
              <span class="user-popover-card__title-name" data-testid="user-name">{{
                fetchedDisplayName
              }}</span>
            </button>
            <span v-if="fetchedDisplayName !== fetchedName" class="user-popover-card__muted">{{
              fetchedName
            }}</span>
            <span v-if="isEmptyValue(userData)">{{ userName }}</span>
          </div>
        </div>

        <!-- Content. -->
        <a-spin v-if="loading" size="small" />
        <template v-else-if="isTeam">
          <div v-if="isEmptyValue(teamData)" class="user-popover-card__content">
            <span>{{ t('message.no-data-available') }}</span>
          </div>
          <div v-else class="user-popover-card__content" data-testid="team-popover-content">
            <SmMarkdown v-if="teamData?.description" :markdown="teamData.description" />
            <span v-else class="user-popover-card__no-description">{{
              t('label.no-description')
            }}</span>
            <p class="user-popover-card__chips">
              <span v-if="teamData?.teamType" class="user-popover-card__chip" data-testid="team-type">{{
                teamData.teamType
              }}</span>
              <span class="user-popover-card__chip" data-testid="team-user-count">{{
                userCountLabel
              }}</span>
            </p>
            <div v-if="!isEmptyValue(teamData?.parents)" class="user-popover-card__parents" data-testid="team-parents">
              <p class="user-popover-card__section-head">
                <TeamOutlined />
                <span class="user-popover-card__section-label">{{ t('label.parent') }}</span>
              </p>
              <p class="user-popover-card__chips">
                <RouterLink
                  v-for="parent in teamData?.parents ?? []"
                  :key="parent.id ?? parent.name"
                  class="user-popover-card__chip"
                  :to="getTeamAndUserDetailsPath(parent.name ?? '')"
                >
                  {{ getEntityName(parent) }}
                </RouterLink>
              </p>
            </div>
          </div>
        </template>
        <template v-else>
          <div class="user-popover-card__content">
            <span v-if="isEmptyValue(userData)">{{ t('message.no-data-available') }}</span>
            <template v-else>
              <div v-if="nonDeletedTeams.length" class="user-popover-card__section">
                <p class="user-popover-card__section-head">
                  <TeamOutlined />
                  <span class="user-popover-card__section-label">{{ t('label.team-plural') }}</span>
                </p>
                <p class="user-popover-card__chips">
                  <span
                    v-for="team in nonDeletedTeams"
                    :key="team.id ?? team.name"
                    class="user-popover-card__chip"
                  >
                    {{ getEntityName(team) }}
                  </span>
                </p>
              </div>
              <div v-if="roles.length" class="user-popover-card__section">
                <p class="user-popover-card__section-head">
                  <UserOutlined />
                  <span class="user-popover-card__section-label">{{ t('label.role-plural') }}</span>
                </p>
                <p class="user-popover-card__chips">
                  <span v-if="isAdmin" class="user-popover-card__chip">{{ TERM_ADMIN }}</span>
                  <span
                    v-for="role in roles"
                    :key="role.id ?? role.name"
                    class="user-popover-card__chip"
                  >
                    {{ getEntityName(role) }}
                  </span>
                </p>
              </div>
            </template>
          </div>
        </template>
      </div>
    </template>
  </HoverCard>
</template>

<style scoped>
.user-popover-card {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.user-popover-card__assignee {
  display: flex;
  gap: 4px;
  align-items: center;
  cursor: pointer;
}
.user-popover-card__assignee--spaced {
  margin-right: 4px;
}
.user-popover-card__truncate {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.user-popover-card__title-row {
  display: flex;
  align-items: center;
  gap: 8px;
}
.user-popover-card__title-names {
  align-self: center;
}
.user-popover-card__title-button {
  padding: 0;
  background: none;
  border: none;
  cursor: pointer;
  color: var(--sm-color-primary);
}
.user-popover-card__title-name {
  font-weight: 500;
  margin-right: 4px;
}
.user-popover-card__muted {
  color: var(--sm-text-tertiary);
}
.user-popover-card__content {
  width: 160px;
}
.user-popover-card__no-description {
  color: var(--sm-text-secondary);
  font-size: 12px;
}
.user-popover-card__section {
  margin-top: 4px;
}
.user-popover-card__section-head {
  display: flex;
  align-items: center;
  margin: 0;
}
.user-popover-card__section-label {
  margin: 0 4px 0 2px;
  font-weight: 500;
}
.user-popover-card__chips {
  display: flex;
  flex-wrap: wrap;
  gap: 2px;
  margin: 2px 0 0;
}
.user-popover-card__chip {
  padding: 0 4px;
  font-size: 12px;
  color: var(--sm-text-secondary);
  background-color: var(--sm-bg-elevated);
  border-radius: 4px;
}
.user-popover-card__parents {
  margin-top: 4px;
}
</style>
