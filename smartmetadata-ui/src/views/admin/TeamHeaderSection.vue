<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { Button, Input, Select, Tooltip, message } from 'ant-design-vue';
import { CheckOutlined, CloseOutlined, EditOutlined } from '@ant-design/icons-vue';
import { EMAIL_PATTERN } from '@/auth/validation';
import { getEntityName } from '@/components/shared/profilePictureUtils';
import SmMarkdown from '@/components/shared/SmMarkdown.vue';
import SmRichTextEditor from '@/components/shared/SmRichTextEditor.vue';
import FormModal from '@/components/shared/FormModal.vue';
import type { DerivedPermissionFlags } from '@/api/permissions';
import {
  assignTeamDefaultPersonaPatch,
  assignTeamDomainsPatch,
  assignTeamOwnersPatch,
  setTeamEmailPatch,
  setTeamSubscriptionPatch,
} from '@/api/teams';
import type { JsonPatchOp } from '@/admin/jsonPatch';
import { setFieldPatch } from '@/admin/jsonPatch';
import type { AdminEntityRef, AdminTeam } from '@/types/admin';
import { getPersonaDetailsPath, getTeamsWithFqnPath, getUserPath } from '@/utils/fqnPaths';
import MembersDomainLabel from './MembersDomainLabel.vue';
import MembersEntityPicker from './MembersEntityPicker.vue';
import {
  getFirstSubscription,
  getSubscriptionOptions,
  getTeamTypeEditOptions,
  isValidSubscriptionEndpoint,
} from './teamLogic';

/**
 * Team header section (pin TeamsInfo.component.tsx + TeamsHeadingLabel
 * + the Description block in TeamDetailsV1:1136-1144). Facet render
 * order is the pin's: Domains, Owners, Email, Subscription, TeamType,
 * Persona, Total Users. Title row first, description last.
 *
 * Gates (all gated derivation except the heading button's disabled
 * state, which uses the ungated derivation per TeamsHeadingLabel):
 * Domains -> canEditDomains; Owners -> canEditOwners; Email/TeamType/
 * Persona/title -> canEditAll; description -> canEditDescription;
 * subscription -> (canEditAll || isUserPartOfTeam) && !deleted.
 *
 * Owners multiplicity (entityRules canAddMultiple*) has no product
 * equivalent; the picker allows multiple users and teams (residual).
 */

const props = defineProps<{
  team: AdminTeam;
  parentTeams: AdminTeam[];
  flags: DerivedPermissionFlags;
  ungatedFlags: DerivedPermissionFlags;
  isAdminUser: boolean;
  isCurrentTeamOwner: boolean;
  isUserPartOfTeam: boolean;
  saving: boolean;
}>();

const emit = defineEmits<{
  patch: [ops: JsonPatchOp[], options?: { successMessageKey?: string }];
}>();

const { t } = useI18n();

const isOrganization = computed(() => props.team.teamType === 'Organization');
const isGroupType = computed(() => props.team.teamType === 'Group');
const isDeleted = computed(() => props.team.deleted ?? false);

// --- Title (TeamsHeadingLabel) ---
const heading = ref(props.team.displayName ?? '');
const isHeadingEditing = ref(false);

watch(
  () => props.team,
  (team) => {
    heading.value = team.displayName ?? team.name;
  },
);

const canEditHeading = computed(
  () => (props.isAdminUser || props.isCurrentTeamOwner) && !isDeleted.value,
);

function onHeadingSave(): void {
  if (!heading.value.trim()) {
    message.error(t('label.field-required', { field: t('label.display-name') }));
    return;
  }
  emit('patch', setFieldPatch('/displayName', props.team.displayName, heading.value));
  isHeadingEditing.value = false;
}

function onHeadingClose(): void {
  heading.value = getEntityName(props.team);
  isHeadingEditing.value = false;
}

// --- Email ---
const isEmailEditing = ref(false);
const emailDraft = ref(props.team.email ?? '');
const emailError = ref('');

function onEmailSave(): void {
  const value = emailDraft.value.trim();
  if (value && !EMAIL_PATTERN.test(value)) {
    emailError.value = t('message.field-text-is-invalid', { fieldText: t('label.email') });
    return;
  }
  emailError.value = '';
  emit('patch', setTeamEmailPatch(props.team.email, value));
  isEmailEditing.value = false;
}

// --- Owners ---
const showOwnersPicker = ref(false);

function ownerPath(owner: AdminEntityRef): string {
  return owner.type === 'team'
    ? getTeamsWithFqnPath(owner.fullyQualifiedName ?? '')
    : getUserPath(owner.fullyQualifiedName ?? owner.name ?? '');
}

function onOwnersSave(_ids: string[], options: Array<{ id: string; type: string }>): void {
  showOwnersPicker.value = false;
  emit(
    'patch',
    assignTeamOwnersPatch(
      props.team.owners,
      options.map((option) => ({ id: option.id, type: option.type })),
    ),
  );
}

// --- Domains ---
function onDomainsSave(ids: string[]): void {
  emit('patch', assignTeamDomainsPatch(props.team.domains, ids));
}

// --- Subscription ---
const showSubscriptionModal = ref(false);
const subscriptionWebhook = ref('none');
const subscriptionEndpoint = ref('');
const subscriptionError = ref('');

const subscriptionOptions = computed(() =>
  getSubscriptionOptions().map((option) => ({ value: option.value, label: t(option.labelKey) })),
);
const currentSubscription = computed(() => getFirstSubscription(props.team.profile));
const canEditSubscription = computed(
  () => (props.flags.canEditAll || props.isUserPartOfTeam) && !isDeleted.value,
);

function openSubscriptionModal(): void {
  const current = currentSubscription.value;
  subscriptionWebhook.value = current ? current.webhook : 'none';
  subscriptionEndpoint.value = current?.endpoint ?? '';
  subscriptionError.value = '';
  showSubscriptionModal.value = true;
}

watch(subscriptionWebhook, (value) => {
  if (value === 'none') {
    subscriptionEndpoint.value = '';
    subscriptionError.value = '';
  }
});

function onSubscriptionSave(): void {
  if (subscriptionWebhook.value === 'none') {
    emit('patch', setTeamSubscriptionPatch(props.team.profile, undefined, undefined));
    showSubscriptionModal.value = false;
    return;
  }
  if (!subscriptionEndpoint.value.trim()) {
    subscriptionError.value = t('label.field-required-plural', { field: t('label.endpoint') });
    return;
  }
  if (!isValidSubscriptionEndpoint(subscriptionEndpoint.value)) {
    subscriptionError.value = t('message.endpoint-should-be-valid');
    return;
  }
  subscriptionError.value = '';
  emit(
    'patch',
    setTeamSubscriptionPatch(
      props.team.profile,
      subscriptionWebhook.value,
      subscriptionEndpoint.value.trim(),
    ),
  );
  showSubscriptionModal.value = false;
}

// --- Team type ---
const isTypeEditing = ref(false);
const typeDraft = ref(props.team.teamType);

const parentTeamType = computed(
  () => props.parentTeams[props.parentTeams.length - 1]?.teamType ?? 'Organization',
);
const typeOptions = computed(() =>
  getTeamTypeEditOptions({
    teamType: props.team.teamType,
    parentType: parentTeamType.value,
    childrenCount: props.team.childrenCount ?? 0,
  }),
);
const canChangeType = computed(
  () => !isOrganization.value && !isGroupType.value && props.flags.canEditAll && !isDeleted.value,
);

function onTypeSave(): void {
  emit('patch', setFieldPatch('/teamType', props.team.teamType, typeDraft.value));
  isTypeEditing.value = false;
}

// --- Default persona (Group only) ---
const showPersonaPicker = ref(false);

function onPersonaSave(ids: string[]): void {
  showPersonaPicker.value = false;
  // Pin TeamsInfo handleDefaultPersonaUpdate:179-182: the persona save is
  // the one facet save with its own success toast.
  emit('patch', assignTeamDefaultPersonaPatch(props.team.defaultPersona, ids[0]), {
    successMessageKey: 'message.persona-updated-successfully',
  });
}

// --- Description ---
const isDescriptionEditing = ref(false);
const descriptionDraft = ref(props.team.description ?? '');

function onDescriptionSave(): void {
  emit('patch', setFieldPatch('/description', props.team.description, descriptionDraft.value));
  isDescriptionEditing.value = false;
}
</script>

<template>
  <div class="team-header">
    <div class="team-header__title-row">
      <template v-if="isHeadingEditing">
        <Input
          v-model:value="heading"
          :aria-label="t('label.display-name')"
          :placeholder="
            t('message.enter-comma-separated-field', { field: t('label.term-lowercase') })
          "
          data-testid="team-name-input"
          class="team-header__title-input"
        />
        <span data-testid="buttons" class="team-header__title-buttons">
          <Button
            type="primary"
            size="small"
            :disabled="saving"
            data-testid="cancelAssociatedTag"
            @mousedown="onHeadingClose"
          >
            <CloseOutlined />
          </Button>
          <Button
            type="primary"
            size="small"
            :loading="saving"
            data-testid="saveAssociatedTag"
            @mousedown="onHeadingSave"
          >
            <CheckOutlined />
          </Button>
        </span>
      </template>
      <template v-else>
        <h5 v-if="heading" data-testid="team-heading" class="team-header__heading">{{ heading }}</h5>
        <span v-else data-testid="team-heading" class="team-header__heading--empty">
          {{ t('label.no-entity', { entity: t('label.display-name') }) }}
        </span>
        <Tooltip
          v-if="canEditHeading"
          :title="
            ungatedFlags.canEditDisplayName
              ? t('label.edit-entity', { entity: t('label.display-name') })
              : t('message.no-permission-for-action')
          "
        >
          <Button
            type="text"
            size="small"
            :disabled="!ungatedFlags.canEditDisplayName"
            data-testid="edit-team-name"
            @click.stop="isHeadingEditing = true"
          >
            <EditOutlined />
          </Button>
        </Tooltip>
        <span v-if="isDeleted" data-testid="deleted-badge" class="team-header__deleted-badge">
          {{ t('label.deleted') }}
        </span>
      </template>
    </div>

    <dl class="team-header__facets">
      <div class="team-header__facet">
        <dt>{{ t('label.domain-plural') }}</dt>
        <dd>
          <MembersDomainLabel
            :domains="team.domains ?? []"
            :can-edit="flags.canEditDomains && !isDeleted"
            :saving="saving"
            @save="onDomainsSave"
          />
        </dd>
      </div>
      <div class="team-header__facet">
        <dt>{{ t('label.owner-plural') }}</dt>
        <dd>
          <span v-if="(team.owners ?? []).length === 0">{{
            t('label.no-entity', { entity: t('label.owner') })
          }}</span>
          <span v-else class="team-header__owners">
            <RouterLink v-for="owner in team.owners" :key="owner.id" :to="ownerPath(owner)">
              {{ getEntityName(owner) }}
            </RouterLink>
          </span>
          <Button
            v-if="flags.canEditOwners && !isDeleted"
            type="text"
            size="small"
            data-testid="edit-owners"
            :title="t('label.edit-entity', { entity: t('label.owner-plural') })"
            @click="showOwnersPicker = true"
          >
            <EditOutlined />
          </Button>
        </dd>
      </div>
      <div class="team-header__facet">
        <dt>{{ t('label.email') }}</dt>
        <dd>
          <template v-if="isEmailEditing">
            <Input
              v-model:value="emailDraft"
              :aria-label="t('label.email')"
              :placeholder="t('label.enter-entity-value', { entity: t('label.email-lowercase') })"
              data-testid="email-input"
              class="team-header__email-input"
            />
            <span v-if="emailError" class="team-header__error">{{ emailError }}</span>
            <Button size="small" data-testid="cancel-edit-email" @click="isEmailEditing = false">
              {{ t('label.cancel') }}
            </Button>
            <Button size="small" type="primary" data-testid="save-edit-email" @click="onEmailSave">
              {{ t('label.save') }}
            </Button>
          </template>
          <template v-else>
            <span data-testid="email-value">{{ team.email ?? '--' }}</span>
            <Button
              v-if="flags.canEditAll && !isDeleted"
              type="text"
              size="small"
              data-testid="edit-email"
              :title="t('label.edit-entity', { entity: t('label.email') })"
              @click="emailDraft = team.email ?? ''; isEmailEditing = true"
            >
              <EditOutlined />
            </Button>
          </template>
        </dd>
      </div>
      <div class="team-header__facet" data-testid="teams-subscription">
        <dt>{{ t('label.subscription') }}</dt>
        <dd>
          <span v-if="currentSubscription">
            <a :href="currentSubscription.endpoint" rel="noopener noreferrer" target="_blank">
              {{ currentSubscription.webhook }}
            </a>
          </span>
          <span v-else data-testid="subscription-no-data">
            {{ canEditSubscription ? t('label.none') : '--' }}
          </span>
          <Button
            v-if="canEditSubscription"
            type="text"
            size="small"
            data-testid="edit-team-subscription"
            :title="t('label.edit-entity', { entity: t('label.subscription') })"
            @click.stop="openSubscriptionModal"
          >
            <EditOutlined />
          </Button>
        </dd>
      </div>
      <div v-if="!isOrganization" class="team-header__facet">
        <dt>{{ t('label.type') }}</dt>
        <dd>
          <template v-if="isTypeEditing">
            <Select
              v-model:value="typeDraft"
              :options="typeOptions.map((option) => ({ value: option, label: option }))"
              data-testid="team-type-select"
              class="team-header__type-select"
            />
            <Button size="small" @click="isTypeEditing = false">{{ t('label.cancel') }}</Button>
            <Button size="small" type="primary" @click="onTypeSave">{{ t('label.save') }}</Button>
          </template>
          <template v-else>
            <span>{{ team.teamType }}</span>
            <Button
              v-if="canChangeType"
              type="text"
              size="small"
              data-testid="edit-team-type-icon"
              :title="t('label.edit-entity', { entity: t('label.team-type') })"
              @click="typeDraft = team.teamType; isTypeEditing = true"
            >
              <EditOutlined />
            </Button>
          </template>
        </dd>
      </div>
      <div v-if="isGroupType" class="team-header__facet" data-testid="team-persona">
        <dt>{{ t('label.persona') }}</dt>
        <dd>
          <RouterLink
            v-if="team.defaultPersona"
            :to="getPersonaDetailsPath(team.defaultPersona.fullyQualifiedName ?? '')"
          >
            {{ getEntityName(team.defaultPersona) }}
          </RouterLink>
          <span v-else>{{ t('message.no-persona-assigned') }}</span>
          <Button
            v-if="flags.canEditAll && !isDeleted"
            type="text"
            size="small"
            data-testid="edit-persona"
            :title="t('label.edit-entity', { entity: t('label.persona') })"
            @click="showPersonaPicker = true"
          >
            <EditOutlined />
          </Button>
        </dd>
      </div>
      <div class="team-header__facet">
        <dt>
          <Tooltip :title="t('message.team-distinct-user-description')">
            <span>{{ t('label.total-user-plural') }}</span>
          </Tooltip>
        </dt>
        <dd>{{ team.userCount ?? 0 }}</dd>
      </div>
    </dl>

    <div class="team-header__description">
      <template v-if="isDescriptionEditing">
        <SmRichTextEditor
          :initial-value="descriptionDraft"
          @text-change="descriptionDraft = $event"
        />
        <div class="team-header__description-actions">
          <Button size="small" @click="isDescriptionEditing = false">{{ t('label.cancel') }}</Button>
          <Button size="small" type="primary" @click="onDescriptionSave">{{ t('label.save') }}</Button>
        </div>
      </template>
      <template v-else>
        <SmMarkdown :markdown="team.description ?? ''" test-id="team-description" />
        <span v-if="!team.description">{{ t('label.no-description') }}</span>
        <Button
          v-if="flags.canEditDescription && !isDeleted"
          type="text"
          size="small"
          data-testid="edit-description"
          :title="t('label.edit-entity', { entity: t('label.description') })"
          @click="descriptionDraft = team.description ?? ''; isDescriptionEditing = true"
        >
          <EditOutlined />
        </Button>
      </template>
    </div>
  </div>

  <MembersEntityPicker
    :open="showOwnersPicker"
    kind="owner"
    :multiple="true"
    :selected-ids="(team.owners ?? []).flatMap((owner) => (owner.id === undefined ? [] : [owner.id]))"
    :title="t('label.edit-entity', { entity: t('label.owner-plural') })"
    :saving="saving"
    @cancel="showOwnersPicker = false"
    @save="onOwnersSave"
  />
  <MembersEntityPicker
    :open="showPersonaPicker"
    kind="persona"
    :multiple="false"
    :selected-ids="team.defaultPersona && team.defaultPersona.id !== undefined ? [team.defaultPersona.id] : []"
    :title="t('label.edit-entity', { entity: t('label.persona') })"
    :saving="saving"
    @cancel="showPersonaPicker = false"
    @save="onPersonaSave"
  />
  <FormModal
    :open="showSubscriptionModal"
    :title="t('label.add-entity', { entity: t('label.subscription') })"
    :ok-text="t('label.confirm')"
    :cancel-text="t('label.cancel')"
    :confirm-loading="saving"
    test-id="subscription-modal"
    @ok="onSubscriptionSave"
    @cancel="showSubscriptionModal = false"
  >
    <div class="team-header__subscription-form">
      <label>{{ t('label.webhook') }}</label>
      <Select
        v-model:value="subscriptionWebhook"
        :options="subscriptionOptions"
        :placeholder="t('label.select-field', { field: t('label.condition') })"
        data-testid="webhook-select"
      />
      <label>{{ t('label.endpoint') }}</label>
      <Input
        v-model:value="subscriptionEndpoint"
        :disabled="subscriptionWebhook === 'none'"
        :placeholder="t('label.enter-entity-value', { entity: t('label.endpoint') })"
        data-testid="endpoint"
      />
      <span v-if="subscriptionError" class="team-header__error">{{ subscriptionError }}</span>
    </div>
  </FormModal>
</template>

<style scoped>
.team-header__title-row {
  display: flex;
  align-items: center;
  gap: 8px;
}
.team-header__heading {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
}
.team-header__heading--empty {
  color: var(--sm-text-secondary);
}
.team-header__title-input {
  flex: 1;
  min-width: 0;
}
.team-header__title-buttons {
  display: inline-flex;
  gap: 4px;
  flex: none;
}
.team-header__deleted-badge {
  font-size: 12px;
  color: var(--sm-color-error);
}
.team-header__facets {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin: 12px 0;
}
.team-header__facet {
  display: flex;
  gap: 12px;
}
.team-header__facet dt {
  font-weight: 500;
  min-width: 120px;
}
.team-header__facet dd {
  margin: 0;
  display: flex;
  align-items: center;
  gap: 8px;
}
.team-header__owners {
  display: inline-flex;
  gap: 8px;
  flex-wrap: wrap;
}
.team-header__email-input {
  width: 280px;
}
.team-header__type-select {
  width: 200px;
}
.team-header__error {
  color: var(--sm-color-error);
}
.team-header__description {
  margin-top: 12px;
}
.team-header__description-actions {
  display: flex;
  gap: 8px;
  margin-top: 8px;
}
.team-header__subscription-form {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
</style>
