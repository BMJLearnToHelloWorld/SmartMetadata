<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { Button, Card, Dropdown, Modal, Space, Tooltip, Typography, message } from 'ant-design-vue';
import { MoreOutlined } from '@ant-design/icons-vue';
import { getEntityName } from '@/components/shared/profilePictureUtils';
import NoDataPlaceholder from '@/components/shared/NoDataPlaceholder.vue';
import SmMarkdown from '@/components/shared/SmMarkdown.vue';
import { setFieldPatch } from '@/admin/jsonPatch';
import { hardDeleteEntity } from '@/api/entityDelete';
import { getPolicyByName, patchPolicy } from '@/api/policies';
import { getRoleByName, patchRole } from '@/api/roles';
import { getTeamByName, patchTeam } from '@/api/teams';
import { useEntityPermissions } from '@/composables/useEntityPermissions';
import EntityDetailShell from '@/features/crud/EntityDetailShell.vue';
import type { EntityBreadcrumb, EntityDetailTab } from '@/features/crud/types';
import type { AdminEntityRef, AdminPolicy, PolicyRule } from '@/types/admin';
import AccessDescription from './AccessDescription.vue';
import AccessDetailList from './AccessDetailList.vue';
import AccessManageButton from './AccessManageButton.vue';
import { getErrorText } from './accessApiErrors';
import {
  addRuleLocation,
  editRuleLocation,
  policiesListLocation,
  resolveDetailFqn,
  roleDetailLocation,
} from './accessPaths';
import { toPatchReference, toRulePatchValue } from './accessRefs';
import { startCase } from '@/utils/text';

const props = defineProps<{ fqn?: string }>();
const { t } = useI18n();
const router = useRouter();

const fqn = computed(() => resolveDetailFqn(props));
const policy = ref<AdminPolicy | null>(null);
const detailLoading = ref(false);
const loadedFqn = ref('');
const activeTab = ref('rules');
const isLoadingOnSave = ref(false);
const entityToRemove = ref<{ record: AdminEntityRef; kind: 'roles' | 'teams' } | null>(null);
const openRuleMenu = ref<string | null>(null);

const policyName = computed(() => getEntityName(policy.value ?? { name: '' }));

// Pin useEntityPermissions(POLICY, fqn, {enabled: Boolean(fqn)}): no `deleted`.
const permissions = useEntityPermissions('policy', fqn, {
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
  // Settings root and no Access Control level (PoliciesDetailPage.tsx:114-126).
  // Do not route it through the §9 constructor: that is the list pages' shape.
  { label: t('label.policy-plural'), to: policiesListLocation() },
  { label: policyName.value },
]);

const tabs = computed<EntityDetailTab[]>(() => [
  { key: 'rules', label: t('label.rule-plural'), testId: 'rules' },
  { key: 'roles', label: t('label.role-plural'), testId: 'roles' },
  { key: 'teams', label: t('label.team-plural'), testId: 'teams' },
]);

async function fetchPolicy(nextFqn: string): Promise<void> {
  detailLoading.value = true;
  try {
    policy.value = await getPolicyByName(nextFqn, 'owners,location,teams,roles');
  } catch (error) {
    policy.value = null;
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
    policy.value = null;
    void fetchPolicy(nextFqn);
  },
  { immediate: true },
);

async function onDescriptionUpdate(description: string): Promise<void> {
  const current = policy.value;
  if (!current) {
    return;
  }
  try {
    const updated = await patchPolicy(
      current.id,
      setFieldPatch('/description', current.description, description),
    );
    policy.value = { ...current, description: updated.description };
  } catch (error) {
    // Swallowed, like the pin handler: the toast fires and the modal closes.
    message.error(getErrorText(error, t('crud.loadFailed')));
  }
}

async function onEditDisplayName(data: { name: string; displayName: string }): Promise<void> {
  const current = policy.value;
  if (!current) {
    return;
  }
  if (data.displayName === (current.displayName ?? '') || !current.id) {
    return;
  }
  const updated = await patchPolicy(
    current.id,
    setFieldPatch('/displayName', current.displayName, data.displayName),
  );
  policy.value = updated;
}

async function removePolicyFromRole(record: AdminEntityRef): Promise<void> {
  const current = policy.value;
  try {
    const role = await getRoleByName(record.fullyQualifiedName ?? record.name ?? '', 'policies');
    const remaining = role.policies.filter((rolePolicy) => rolePolicy.id !== current?.id);
    await patchRole(
      role.id,
      setFieldPatch('/policies', role.policies, remaining.map(toPatchReference)),
    );
    if (current) {
      policy.value = { ...current, roles: current.roles.filter((roleRef) => roleRef.id !== record.id) };
    }
  } catch (error) {
    message.error(getErrorText(error, t('crud.loadFailed')));
  } finally {
    isLoadingOnSave.value = false;
  }
}

async function removePolicyFromTeam(record: AdminEntityRef): Promise<void> {
  const current = policy.value;
  try {
    const team = await getTeamByName(record.fullyQualifiedName ?? record.name ?? '', {
      fields: 'policies',
    });
    const remaining = team.policies.filter((teamPolicy) => teamPolicy.id !== current?.id);
    await patchTeam(
      team.id,
      setFieldPatch('/policies', team.policies, remaining.map(toPatchReference)),
    );
    if (current) {
      policy.value = { ...current, teams: current.teams.filter((teamRef) => teamRef.id !== record.id) };
    }
  } catch (error) {
    message.error(getErrorText(error, t('crud.loadFailed')));
  } finally {
    isLoadingOnSave.value = false;
  }
}

async function handleDelete(record: AdminEntityRef, kind: 'roles' | 'teams'): Promise<void> {
  isLoadingOnSave.value = true;
  // Fire-and-forget, mirroring the pin handleDelete: the modal closes at
  // once and the reverse PATCH clears isLoadingOnSave in its own finally.
  if (kind === 'roles') {
    void removePolicyFromRole(record);
  } else {
    void removePolicyFromTeam(record);
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

async function onDeleteRule(rule: PolicyRule): Promise<void> {
  const current = policy.value;
  if (!current) {
    return;
  }
  openRuleMenu.value = null;
  try {
    const remaining = current.rules.filter((item) => item.name !== rule.name);
    const updated = await patchPolicy(
      current.id,
      setFieldPatch('/rules', current.rules, remaining.map(toRulePatchValue)),
    );
    policy.value = updated;
  } catch (error) {
    message.error(getErrorText(error, t('crud.loadFailed')));
  }
}

async function onDeletePolicy(): Promise<boolean> {
  const current = policy.value;
  if (!current) {
    return false;
  }
  return hardDeleteEntity(current.id, 'policy', {
    isRecursiveDelete: true,
    onSuccess: () => {
      message.success(t('server.entity-deleted-successfully', { entity: policyName.value }));
    },
    onError: (error) => {
      message.error(getErrorText(error, t('crud.loadFailed')));
    },
  });
}

function goToList(): void {
  void router.push(policiesListLocation());
}

function roleLinkFor(record: AdminEntityRef) {
  return roleDetailLocation(record.fullyQualifiedName ?? record.name ?? '');
}

function teamLinkFor(record: AdminEntityRef) {
  return { name: 'admin-team', params: { id: record.id } };
}
</script>

<template>
  <div data-testid="policy-details-container">
    <EntityDetailShell
      :title="policyName || t('label.entity-detail-plural', { entity: t('label.policy') })"
      :name="policy?.name"
      :fqn="policy?.fullyQualifiedName"
      :loading="isLoading"
      :empty="false"
      :breadcrumbs="breadcrumbs"
      :tabs="policy ? tabs : []"
      v-model:active-tab="activeTab"
    >
      <template v-if="policy" #actions>
        <AccessManageButton
          :name="policy.name"
          :display-name="policy.displayName"
          :entity-type-label="t('label.policy')"
          :can-delete="permissions.canDelete.value"
          :edit-display-name-permission="permissions.canEditDisplayName.value"
          :on-edit-display-name="onEditDisplayName"
          :on-delete="onDeletePolicy"
          :after-delete-action="goToList"
        />
      </template>
      <template v-if="policy" #meta>
        <AccessDescription
          :description="policy.description"
          :entity-name="policyName"
          :has-edit-access="true"
          :on-description-update="onDescriptionUpdate"
        />
      </template>
      <template v-if="policy" #rules>
        <Card>
          <div v-if="policy.rules.length === 0" style="position: relative; min-height: 240px">
            <NoDataPlaceholder test-id="no-data-placeholder" />
          </div>
          <div v-else>
            <Space style="display: flex; justify-content: flex-end; width: 100%; margin-bottom: 12px">
              <Button
                type="primary"
                data-testid="add-rule"
                @click="router.push(addRuleLocation(fqn))"
              >
                {{ t('label.add-entity', { entity: t('label.rule') }) }}
              </Button>
            </Space>
            <Space direction="vertical" :size="20" style="width: 100%">
              <Card v-for="rule in policy.rules" :key="rule.name || 'rule'" data-testid="rule-card">
                <div class="policy-rule-card__head">
                  <Typography.Text strong data-testid="rule-name">{{ rule.name }}</Typography.Text>
                  <Dropdown
                    :open="openRuleMenu === rule.name"
                    trigger="click"
                    @update:open="openRuleMenu = $event ? rule.name : null"
                  >
                    <Tooltip :title="t('label.manage-entity', { entity: t('label.rule') })">
                      <Button
                        type="text"
                        size="small"
                        :data-testid="`manage-button-${rule.name}`"
                        @click.prevent
                      >
                        <template #icon><MoreOutlined /></template>
                      </Button>
                    </Tooltip>
                    <template #overlay>
                      <div class="access-manage-menu">
                        <button
                          type="button"
                          data-testid="edit-rule"
                          class="access-manage-menu__item"
                          @click="router.push(editRuleLocation(fqn, rule.name))"
                        >
                          {{ t('label.edit') }}
                        </button>
                        <button
                          type="button"
                          data-testid="delete-rule"
                          class="access-manage-menu__item"
                          @click="onDeleteRule(rule)"
                        >
                          {{ t('label.delete') }}
                        </button>
                      </div>
                    </template>
                  </Dropdown>
                </div>
                <div class="policy-rule-card__rows">
                  <div v-if="rule.description" class="policy-rule-card__row" data-testid="description">
                    <Typography.Text type="secondary">{{ `${t('label.description')}:` }}</Typography.Text>
                    <SmMarkdown :markdown="rule.description" />
                  </div>
                  <div class="policy-rule-card__row" data-testid="resources">
                    <Typography.Text type="secondary">{{ `${t('label.resource-plural')}:` }}</Typography.Text>
                    <Typography.Text>{{
                      rule.resources.map((resource) => startCase(resource)).join(', ')
                    }}</Typography.Text>
                  </div>
                  <div class="policy-rule-card__row" data-testid="operations">
                    <Typography.Text type="secondary">{{ `${t('label.operation-plural')}:` }}</Typography.Text>
                    <Typography.Text>{{ rule.operations.join(', ') }}</Typography.Text>
                  </div>
                  <div class="policy-rule-card__row" data-testid="effect">
                    <Typography.Text type="secondary">{{ `${t('label.effect')}:` }}</Typography.Text>
                    <Typography.Text>{{ startCase(rule.effect ?? '') }}</Typography.Text>
                  </div>
                  <div v-if="rule.condition" class="policy-rule-card__row" data-testid="condition">
                    <Typography.Text type="secondary">{{ `${t('label.condition')}:` }}</Typography.Text>
                    <code>{{ rule.condition }}</code>
                  </div>
                </div>
              </Card>
            </Space>
          </div>
        </Card>
      </template>
      <template v-if="policy" #roles>
        <AccessDetailList
          :items="policy.roles"
          :has-access="true"
          :link-for="roleLinkFor"
          :on-remove="(record) => (entityToRemove = { record, kind: 'roles' })"
        />
      </template>
      <template v-if="policy" #teams>
        <AccessDetailList
          :items="policy.teams"
          :has-access="true"
          :link-for="teamLinkFor"
          :on-remove="(record) => (entityToRemove = { record, kind: 'teams' })"
        />
      </template>
      <template v-if="!policy && !isLoading" #default>
        <div style="position: relative; min-height: 240px">
          <NoDataPlaceholder
            test-id="no-data-placeholder"
            :title="t('message.no-entity-found-for-name', { entity: t('label.policy-lowercase'), name: fqn })"
          >
            <template #footer>
              <Button type="primary" size="small" @click="goToList">{{ t('label.go-back') }}</Button>
            </template>
          </NoDataPlaceholder>
        </div>
      </template>
    </EntityDetailShell>
    <Modal
      :open="entityToRemove !== null"
      :closable="false"
      :mask-closable="false"
      :keyboard="false"
      :title="
        entityToRemove
          ? `${t('label.remove-entity', { entity: getEntityName(entityToRemove.record) })} ${t('label.from-lowercase')} ${policyName}`
          : ''
      "
      @cancel="entityToRemove = null"
    >
      <p v-if="entityToRemove">
        {{
          t('message.are-you-sure-you-want-to-remove-child-from-parent', {
            child: getEntityName(entityToRemove.record),
            parent: policyName,
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

<style scoped>
.policy-rule-card__head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  padding-bottom: 12px;
}

.policy-rule-card__rows {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.policy-rule-card__row {
  display: grid;
  grid-template-columns: 2fr 22fr;
  gap: 8px;
}

.access-manage-menu {
  display: flex;
  flex-direction: column;
  min-width: 160px;
  padding: 4px;
  background: var(--sm-bg-container);
  border: 1px solid var(--sm-border-color);
  border-radius: 8px;
  box-shadow: 0 6px 16px rgb(0 0 0 / 8%);
}

.access-manage-menu__item {
  padding: 8px 12px;
  text-align: left;
  cursor: pointer;
  background: transparent;
  border: 0;
  border-radius: 6px;
}

.access-manage-menu__item:hover {
  background: rgb(0 0 0 / 4%);
}
</style>
