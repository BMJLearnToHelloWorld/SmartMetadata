<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { Input, Modal, Select, Switch, message } from 'ant-design-vue';
import { EMAIL_PATTERN } from '@/auth/validation';
import SmRichTextEditor from '@/components/shared/SmRichTextEditor.vue';
import { createTeam, listTeams } from '@/api/teams';
import { useDomainStore } from '@/stores/domain';
import type { AdminTeam } from '@/types/admin';
import { ENTITY_NAME_REGEX } from '@/utils/entityName';
import MembersDomainLabel from './MembersDomainLabel.vue';
import {
  ENTITY_NAME_MAX_LENGTH,
  getTeamOptionsFromType,
  isDuplicateTeamName,
} from './teamLogic';

/**
 * Create-team form (pin AddTeamForm.tsx, hosted by TeamsPage). Modal,
 * non-dismissable, title add-entity{team}, OK label.save, width 750.
 * Fields: name (required + 128 + ENTITY_NAME_REGEX + case-insensitive
 * duplicate check against all teams fetched when visible), displayName
 * (required + 128), email (regex), teamType (options constrained by
 * the parent type, default Group), isJoinable (default false),
 * rich-text description, domains (multi-select, active-domain prefill).
 * Submit trims displayName and sends email || undefined; the payload
 * is exactly the 8 fields (P3) via createTeam(body, parentTeamId).
 * A 409 surfaces server.entity-already-exist.
 */

const props = defineProps<{
  open: boolean;
  parentTeam: AdminTeam;
}>();

const emit = defineEmits<{
  cancel: [];
  created: [team: AdminTeam];
}>();

const { t } = useI18n();
const domainStore = useDomainStore();

const saving = ref(false);
const name = ref('');
const displayName = ref('');
const email = ref('');
const teamType = ref('Group');
const isJoinable = ref(false);
const description = ref('');
const domainFqns = ref<string[]>([]);
const domainRefs = ref<Array<{ id: string; fullyQualifiedName?: string; name: string }>>([]);
const allTeams = ref<AdminTeam[]>([]);
const errors = ref<Record<string, string>>({});

const typeOptions = computed(() => getTeamOptionsFromType(props.parentTeam.teamType));

function reset(): void {
  name.value = '';
  displayName.value = '';
  email.value = '';
  teamType.value = 'Group';
  isJoinable.value = false;
  description.value = '';
  errors.value = {};
  const active = domainStore.activeDomain;
  domainFqns.value = active?.fullyQualifiedName ? [active.fullyQualifiedName] : [];
  domainRefs.value = active
    ? [{ id: active.id, name: active.name, fullyQualifiedName: active.fullyQualifiedName }]
    : [];
}

watch(
  () => props.open,
  async (open) => {
    if (!open) {
      return;
    }
    reset();
    try {
      const page = await listTeams({ limit: 100000 });
      allTeams.value = page.data;
    } catch {
      allTeams.value = [];
    }
  },
);

function validate(): boolean {
  const next: Record<string, string> = {};
  if (!name.value.trim()) {
    next.name = t('label.field-required', { field: t('label.name') });
  } else if (name.value.length > ENTITY_NAME_MAX_LENGTH) {
    next.name = t('message.entity-size-in-between', {
      entity: t('label.name'),
      min: 1,
      max: ENTITY_NAME_MAX_LENGTH,
    });
  } else if (!ENTITY_NAME_REGEX.test(name.value)) {
    next.name = t('message.entity-name-validation');
  } else if (isDuplicateTeamName(name.value, allTeams.value)) {
    next.name = t('message.entity-already-exists', { entity: t('label.name') });
  }
  if (!displayName.value.trim()) {
    next.displayName = t('message.field-text-is-required', { fieldText: t('label.display-name') });
  } else if (displayName.value.length > ENTITY_NAME_MAX_LENGTH) {
    next.displayName = t('message.entity-size-in-between', {
      entity: t('label.display-name'),
      min: 1,
      max: ENTITY_NAME_MAX_LENGTH,
    });
  }
  if (email.value.trim() && !EMAIL_PATTERN.test(email.value.trim())) {
    next.email = t('message.field-text-is-invalid', { fieldText: t('label.email') });
  }
  errors.value = next;
  return Object.keys(next).length === 0;
}

async function onSave(): Promise<void> {
  if (!validate()) {
    return;
  }
  saving.value = true;
  try {
    const created = await createTeam(
      {
        name: name.value.trim(),
        displayName: displayName.value.trim(),
        description: description.value || undefined,
        teamType: teamType.value,
        email: email.value.trim() || undefined,
        domains: domainFqns.value.length ? domainFqns.value : undefined,
        isJoinable: isJoinable.value,
      },
      props.parentTeam.id,
    );
    emit('created', created);
  } catch (error) {
    const status = (error as { status?: number })?.status;
    message.error(
      status === 409
        ? t('server.entity-already-exist')
        : error instanceof Error
          ? error.message
          : t('crud.createFailed'),
    );
  } finally {
    saving.value = false;
  }
}

function onDomainsSave(_ids: string[], options: Array<{ id: string; fullyQualifiedName?: string; name: string }>): void {
  domainFqns.value = options.map((option) => option.fullyQualifiedName ?? option.name);
  domainRefs.value = options;
}
</script>

<template>
  <Modal
    :open="open"
    :title="t('label.add-entity', { entity: t('label.team') })"
    :ok-text="t('label.save')"
    :cancel-text="t('crud.cancel')"
    :confirm-loading="saving"
    :mask-closable="false"
    width="750"
    data-testid="add-team-modal"
    @ok="onSave"
    @cancel="emit('cancel')"
  >
    <div class="add-team-form">
      <label>{{ t('label.name') }}</label>
      <Input
        v-model:value="name"
        :placeholder="t('label.enter-entity', { entity: t('label.name') })"
        data-testid="team-name-input"
      />
      <span v-if="errors.name" class="add-team-form__error">{{ errors.name }}</span>

      <label>{{ t('label.display-name') }}</label>
      <Input
        v-model:value="displayName"
        :placeholder="t('message.enter-display-name')"
        data-testid="team-display-name-input"
      />
      <span v-if="errors.displayName" class="add-team-form__error">{{ errors.displayName }}</span>

      <label>{{ t('label.email') }}</label>
      <Input
        v-model:value="email"
        :placeholder="t('label.enter-entity', { entity: t('label.email-lowercase') })"
        data-testid="team-email-input"
      />
      <span v-if="errors.email" class="add-team-form__error">{{ errors.email }}</span>

      <label>{{ t('label.team-type') }}</label>
      <Select
        v-model:value="teamType"
        :options="typeOptions.map((option) => ({ value: option, label: option }))"
        data-testid="team-type-select"
      />

      <label>{{ t('label.public-team') }}</label>
      <Switch v-model:checked="isJoinable" data-testid="isJoinable-switch-button" />
      <p class="add-team-form__helper">{{ t('message.access-to-collaborate') }}</p>

      <label>{{ t('label.description') }}</label>
      <SmRichTextEditor :initial-value="description" @text-change="description = $event" />

      <label>{{ t('label.domain-plural') }}</label>
      <MembersDomainLabel
        :domains="domainRefs"
        :can-edit="true"
        @save="onDomainsSave"
      />
    </div>
  </Modal>
</template>

<style scoped>
.add-team-form {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.add-team-form__error {
  color: var(--sm-color-error);
}
</style>
