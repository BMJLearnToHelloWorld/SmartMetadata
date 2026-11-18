<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { Button, Tooltip } from 'ant-design-vue';
import { DeleteOutlined } from '@ant-design/icons-vue';
import { getEntityName } from '@/components/shared/profilePictureUtils';
import CreatePlaceholder from '@/components/shared/CreatePlaceholder.vue';
import DescriptionCell from '@/components/shared/DescriptionCell.vue';
import EntityNameLink from '@/components/shared/EntityNameLink.vue';
import FormModal from '@/components/shared/FormModal.vue';
import SmTable from '@/components/shared/SmTable.vue';
import { getPolicyWithFqnPath, getRoleWithFqnPath } from '@/utils/fqnPaths';
import type { AdminEntityRef, AdminTeam } from '@/types/admin';
import AddAttributeModal from './AddAttributeModal.vue';
import { rolesPoliciesColumns } from './membersColumns';

/**
 * Roles / Policies tabs (pin TeamDetailsV1:860-1006), one component
 * parameterised by attribute name — never two copies. Empty state is
 * an assign placeholder whose `permission` uses the UNGATED derivation
 * (a deleted team's admin must not see a no-permission placeholder);
 * the Roles tab passes the ROLE_DOCS doc link, the Policies tab passes
 * none (pin asymmetry, preserved). Remove goes through the shared
 * confirm modal (non-dismissable, title remove-entity + from-lowercase
 * + team name, OK label.confirm).
 */

const props = defineProps<{
  team: AdminTeam;
  attribute: 'defaultRoles' | 'policies';
  canEditAll: boolean;
  ungatedCanEditAll: boolean;
  saving: boolean;
}>();

const emit = defineEmits<{
  save: [attribute: 'defaultRoles' | 'policies', ids: string[]];
  remove: [attribute: 'defaultRoles' | 'policies', record: AdminEntityRef];
}>();

const { t } = useI18n();

const isRoles = computed(() => props.attribute === 'defaultRoles');
const items = computed<AdminEntityRef[]>(() =>
  isRoles.value ? (props.team.defaultRoles ?? []) : (props.team.policies ?? []),
);
const showAddModal = ref(false);
const removing = ref<AdminEntityRef | undefined>();

const columns = computed(() =>
  rolesPoliciesColumns(
    {
      name: t('label.name'),
      description: t('label.description'),
      actions: t('label.action-plural'),
    },
    props.team.deleted !== true,
  ),
);

function namePath(ref: AdminEntityRef): string {
  const fqn = ref.fullyQualifiedName ?? '';
  return isRoles.value ? getRoleWithFqnPath(fqn) : getPolicyWithFqnPath(fqn);
}

function onModalSave(ids: string[]): void {
  showAddModal.value = false;
  emit('save', props.attribute, ids);
}
</script>

<template>
  <div>
    <CreatePlaceholder
      v-if="items.length === 0"
      :permission="ungatedCanEditAll"
      :heading="isRoles ? t('label.role') : t('label.policy')"
      :description="
        t('message.assigning-team-entity-description', {
          entity: isRoles ? t('label.role-lowercase') : t('label.policy-lowercase-plural'),
          name: team.name,
        })
      "
      :permission-value="
        t('label.edit-entity', { entity: isRoles ? t('label.role') : t('label.policy') })
      "
      :doc="
        isRoles
          ? 'https://docs.open-metadata.org/latest/main-concepts/metadata-standard/schemas/entity/teams/role'
          : undefined
      "
      :test-id="`assign-error-placeholder-${isRoles ? t('label.role') : t('label.policy')}`"
    >
      <template #footer>
        <Tooltip
          :title="
            team.deleted
              ? t('message.this-action-is-not-allowed-for-deleted-entities')
              : t('label.add-entity', { entity: isRoles ? t('label.role') : t('label.policy') })
          "
        >
          <Button
            type="primary"
            size="small"
            :disabled="team.deleted ?? false"
            data-testid="add-placeholder-button"
            @click="showAddModal = true"
          >
            {{ t('label.add') }}
          </Button>
        </Tooltip>
      </template>
    </CreatePlaceholder>
    <template v-else>
      <div v-if="canEditAll" class="roles-policies-tab__actions">
        <Button type="primary" data-testid="add-role-policy-button" @click="showAddModal = true">
          {{
            t('label.add-entity', {
              entity: isRoles ? t('label.role') : t('label.policy'),
            })
          }}
        </Button>
      </div>
      <SmTable
        :columns="columns"
        :data-source="items"
        row-key="id"
        :pagination="false"
        test-id="roles-policies-table"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'name'">
            <EntityNameLink
              :record="record as AdminEntityRef"
              :to="namePath(record as AdminEntityRef)"
              test-id="entity-name"
            />
          </template>
          <template v-else-if="column.key === 'description'">
            <DescriptionCell :markdown="(record as AdminEntityRef).description" />
          </template>
          <template v-else-if="column.key === 'actions'">
            <Tooltip :title="canEditAll ? t('label.remove') : t('message.no-permission-for-action')">
              <Button
                type="text"
                size="small"
                danger
                :disabled="!canEditAll"
                :data-testid="`remove-${isRoles ? 'role' : 'policy'}-${(record as AdminEntityRef).name}`"
                @click="removing = record as AdminEntityRef"
              >
                <DeleteOutlined />
              </Button>
            </Tooltip>
          </template>
        </template>
      </SmTable>
    </template>

    <AddAttributeModal
      :open="showAddModal"
      :type="isRoles ? 'role' : 'policy'"
      :title="`${t('label.add')} ${isRoles ? 'role' : 'policy'}`"
      :selected-keys="items.flatMap((item) => (item.id === undefined ? [] : [item.id]))"
      :saving="saving"
      @cancel="showAddModal = false"
      @save="onModalSave"
    />
    <FormModal
      :open="removing !== undefined"
      :title="`${t('label.remove-entity', { entity: removing ? getEntityName(removing) : '' })} ${t('label.from-lowercase')} ${getEntityName(team)}`"
      :ok-text="t('label.confirm')"
      :cancel-text="t('crud.cancel')"
      :confirm-loading="saving"
      test-id="remove-attribute-modal"
      @ok="removing && emit('remove', attribute, removing)"
      @cancel="removing = undefined"
    >
      <p>
        {{
          t('message.are-you-sure-you-want-to-remove-child-from-parent', {
            child: removing ? getEntityName(removing) : '',
            parent: getEntityName(team),
          })
        }}
      </p>
    </FormModal>
  </div>
</template>

<style scoped>
.roles-policies-tab__actions {
  display: flex;
  justify-content: flex-end;
  margin-bottom: 12px;
}
</style>
