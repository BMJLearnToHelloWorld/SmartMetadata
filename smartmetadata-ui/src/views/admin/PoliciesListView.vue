<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { DeleteOutlined } from '@ant-design/icons-vue';
import { Button, Tooltip, message } from 'ant-design-vue';
import { hardDeleteEntity } from '@/api/entityDelete';
import { permissionFlags, type OperationPermissions } from '@/api/permissions';
import { listPolicies } from '@/api/policies';
import DescriptionCell from '@/components/shared/DescriptionCell.vue';
import EntityNameLink from '@/components/shared/EntityNameLink.vue';
import ReferenceListCell from '@/components/shared/ReferenceListCell.vue';
import SmBreadcrumb, { type SmBreadcrumbItem } from '@/components/shared/SmBreadcrumb.vue';
import { getEntityName } from '@/components/shared/profilePictureUtils';
import EntityListShell from '@/features/crud/EntityListShell.vue';
import { confirmDelete } from '@/features/crud/confirmDelete';
import {
  canGoNext,
  canGoPrev,
  createCursorPager,
  goNext,
  goPrev,
  resetCursor,
  type CursorPager,
} from '@/features/crud/paging';
import type { EntityListColumn } from '@/features/crud/types';
import { useAuthStore } from '@/stores/auth';
import { usePermissionStore } from '@/stores/permissions';
import type { AdminPolicy } from '@/types/admin';
import {
  actionTooltipTitle,
  descriptionColumnDef,
  entityNameColumnDef,
  referenceListColumnDef,
} from '@/utils/columns';
import { readGlobalPageSize } from '@/utils/userPageSizePreference';
import { getErrorText } from './accessApiErrors';
import { addPolicyLocation, policyDetailLocation, roleDetailLocation } from './accessPaths';

const { t } = useI18n();
const router = useRouter();
const permissionStore = usePermissionStore();
const loading = ref(false);
const errorMessage = ref('');
const policies = ref<AdminPolicy[]>([]);
const total = ref<number | undefined>();
const pageAfter = ref<string | undefined>();
const cursor = ref<CursorPager>(createCursorPager());
const policyOps = ref<OperationPermissions>({});
const roleOps = ref<OperationPermissions>({});

// T-5 (03 §6.1/§3.3): the page size is the stored global preference,
// default 15; the shell pager has no size selector, so it is read once.
const pageSize = readGlobalPageSize(window.localStorage, useAuthStore().user?.name);

const canAdd = computed(() => permissionFlags(policyOps.value).canCreate);
const canDelete = computed(() => permissionFlags(policyOps.value).canDelete);
const canViewRoles = computed(() => permissionFlags(roleOps.value).hasViewAccess);

const breadcrumbItems = computed<SmBreadcrumbItem[]>(() => [
  { label: t('label.setting-plural'), routeName: 'admin-settings' },
  { label: t('label.access-control') },
  { label: t('label.policy-plural') },
]);

// Exactly four columns (03 §6.1): name + description + roles + actions.
// The shell row-actions usage (show-row-actions/show-edit-action/
// show-delete-action) is removed from this page: the shell would append
// a fifth column duplicating the Name link and the Actions column. The
// shell component itself is untouched (CSV 03:#12).
const columns = computed<EntityListColumn[]>(() => [
  ...entityNameColumnDef(t('label.name')),
  ...descriptionColumnDef(t('label.description')),
  ...referenceListColumnDef(t('label.role-plural'), 'roles'),
  { title: t('label.action-plural'), dataIndex: 'actions', key: 'actions', width: 80 },
]);

const hasNext = computed(() => canGoNext(pageAfter.value));
const hasPrev = computed(() => canGoPrev(cursor.value));

async function loadPermissions(): Promise<void> {
  const [policy, role] = await Promise.all([
    permissionStore.getResourcePermission('policy').catch(() => ({}) as OperationPermissions),
    permissionStore.getResourcePermission('role').catch(() => ({}) as OperationPermissions),
  ]);
  policyOps.value = policy;
  roleOps.value = role;
}

async function load(): Promise<void> {
  loading.value = true;
  errorMessage.value = '';
  try {
    const page = await listPolicies({ limit: pageSize, after: cursor.value.after, fields: 'roles' });
    policies.value = page.data;
    total.value = page.total;
    pageAfter.value = page.after;
  } catch (error) {
    policies.value = [];
    errorMessage.value = error instanceof Error ? error.message : t('crud.loadFailed');
  } finally {
    loading.value = false;
  }
}

function onNext(): void {
  if (!pageAfter.value) {
    return;
  }
  cursor.value = goNext(cursor.value, pageAfter.value);
  void load();
}

function onPrev(): void {
  cursor.value = goPrev(cursor.value);
  void load();
}

function goAdd(): void {
  void router.push(addPolicyLocation());
}

function rolePathFor(ref: { fullyQualifiedName?: string; name?: string }) {
  return roleDetailLocation(ref.fullyQualifiedName ?? ref.name ?? '');
}

function deleteTooltipTitle(): string {
  // D-DEV-1: the pin tooltip interpolates the SINGULAR label.policy
  // here (PoliciesListPage.tsx:242-244), unlike the Roles list, which
  // uses the plural. The asymmetry is pin-native; keep it.
  return actionTooltipTitle(
    canDelete.value,
    t('label.delete-entity', { entity: t('label.policy') }),
    t('message.no-permission-for-action'),
  );
}

async function onDelete(record: AdminPolicy): Promise<void> {
  // 03 §6.2 asymmetry: the pin renders this page's delete modal only
  // when `selectedPolicy && deletePolicyPermission`. The button is
  // disabled without the grant; this guard is the modal-render gate,
  // and the Roles list deliberately has no equivalent.
  if (!canDelete.value) {
    return;
  }
  const entityName = getEntityName(record);
  let deleted = false;
  const confirmed = await confirmDelete({
    title: `${t('label.delete')} ${entityName}`,
    content: t('message.permanently-delete-common-message', { entity: entityName.toLowerCase() }),
    okText: t('label.delete'),
    cancelText: t('label.cancel'),
    onOk: async () => {
      deleted = await hardDeleteEntity(record.id, 'policy', {
        onSuccess: () => message.success(t('server.entity-deleted-successfully', { entity: entityName })),
        onError: (error) =>
          message.error(getErrorText(error, t('server.delete-entity-error', { entity: entityName }))),
      });
    },
  });
  if (confirmed && deleted) {
    cursor.value = resetCursor();
    await load();
  }
}

onMounted(() => {
  void loadPermissions();
  void load();
});
</script>

<template>
  <SmBreadcrumb :items="breadcrumbItems" />
  <EntityListShell
    :title="t('label.policy-plural')"
    :lead="t('message.page-sub-header-for-policies')"
    learning-page-id="policies"
    :loading="loading"
    :error="errorMessage"
    :columns="columns"
    :data-source="policies"
    row-key="id"
    table-test-id="admin-policies-table"
    :total="total"
    :has-next="hasNext"
    :has-prev="hasPrev"
    @refresh="load"
    @next="onNext"
    @prev="onPrev"
  >
    <template #actions>
      <Button v-if="canAdd" type="primary" data-testid="add-policy" @click="goAdd">
        {{ t('label.add-entity', { entity: t('label.policy') }) }}
      </Button>
    </template>
    <template #emptyExtra>
      <Button v-if="canAdd" type="primary" data-testid="add-policy-empty" @click="goAdd">
        {{ t('label.add-entity', { entity: t('label.policy') }) }}
      </Button>
    </template>
    <template #bodyCell="{ column, record }">
      <template v-if="column.key === 'name'">
        <EntityNameLink
          :record="record as AdminPolicy"
          :to="policyDetailLocation((record as AdminPolicy).fullyQualifiedName ?? (record as AdminPolicy).name)"
          test-id="policy-name"
        />
      </template>
      <template v-else-if="column.key === 'description'">
        <DescriptionCell :markdown="(record as AdminPolicy).description" />
      </template>
      <template v-else-if="column.key === 'roles'">
        <ReferenceListCell
          :references="(record as AdminPolicy).roles"
          :has-view-permission="canViewRoles"
          :path-for="rolePathFor"
        />
      </template>
      <template v-else-if="column.key === 'actions'">
        <Tooltip :title="deleteTooltipTitle()" placement="left">
          <span>
            <Button
              type="text"
              size="small"
              :disabled="!canDelete"
              :data-testid="`delete-action-${getEntityName(record as AdminPolicy)}`"
              @click="onDelete(record as AdminPolicy)"
            >
              <template #icon><DeleteOutlined /></template>
            </Button>
          </span>
        </Tooltip>
      </template>
    </template>
  </EntityListShell>
</template>
