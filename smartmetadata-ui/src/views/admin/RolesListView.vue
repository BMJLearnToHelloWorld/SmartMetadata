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
import { permissionFlags, type OperationPermissions } from '@/api/permissions';
import { listRoles } from '@/api/roles';
import { hardDeleteEntity } from '@/api/entityDelete';
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
import type { AdminRole } from '@/types/admin';
import {
  actionTooltipTitle,
  descriptionColumnDef,
  entityNameColumnDef,
  referenceListColumnDef,
} from '@/utils/columns';
import { readGlobalPageSize } from '@/utils/userPageSizePreference';
import { getErrorText } from './accessApiErrors';
import { addRoleLocation, policyDetailLocation, roleDetailLocation } from './accessPaths';

const { t } = useI18n();
const router = useRouter();
const permissionStore = usePermissionStore();
const loading = ref(false);
const errorMessage = ref('');
const roles = ref<AdminRole[]>([]);
const total = ref<number | undefined>();
const pageAfter = ref<string | undefined>();
const cursor = ref<CursorPager>(createCursorPager());
const roleOps = ref<OperationPermissions>({});
const policyOps = ref<OperationPermissions>({});

// T-5 (03 §3.3): the page size is the stored global preference, default
// 15; the shell pager has no size selector, so the size is read once.
const pageSize = readGlobalPageSize(window.localStorage, useAuthStore().user?.name);

const canAdd = computed(() => permissionFlags(roleOps.value).canCreate);
const canDelete = computed(() => permissionFlags(roleOps.value).canDelete);
const canViewPolicies = computed(() => permissionFlags(policyOps.value).hasViewAccess);

const breadcrumbItems = computed<SmBreadcrumbItem[]>(() => [
  { label: t('label.setting-plural'), routeName: 'admin-settings' },
  { label: t('label.access-control') },
  { label: t('label.role-plural') },
]);

// Exactly four columns (03 §3.1): name + description + policies + actions.
const columns = computed<EntityListColumn[]>(() => [
  ...entityNameColumnDef(t('label.name')),
  ...descriptionColumnDef(t('label.description')),
  ...referenceListColumnDef(t('label.policy-plural'), 'policies'),
  { title: t('label.action-plural'), dataIndex: 'actions', key: 'actions', width: 80 },
]);

const hasNext = computed(() => canGoNext(pageAfter.value));
const hasPrev = computed(() => canGoPrev(cursor.value));

async function loadPermissions(): Promise<void> {
  const [role, policy] = await Promise.all([
    permissionStore.getResourcePermission('role').catch(() => ({}) as OperationPermissions),
    permissionStore.getResourcePermission('policy').catch(() => ({}) as OperationPermissions),
  ]);
  roleOps.value = role;
  policyOps.value = policy;
}

async function load(): Promise<void> {
  loading.value = true;
  errorMessage.value = '';
  try {
    const page = await listRoles(pageSize, cursor.value.after, 'policies');
    roles.value = page.data;
    total.value = page.total;
    pageAfter.value = page.after;
  } catch (error) {
    roles.value = [];
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
  void router.push(addRoleLocation());
}

function policyPathFor(ref: { fullyQualifiedName?: string; name?: string }) {
  return policyDetailLocation(ref.fullyQualifiedName ?? ref.name ?? '');
}

function deleteTooltipTitle(): string {
  return actionTooltipTitle(
    canDelete.value,
    t('label.delete-entity', { entity: t('label.role-plural') }),
    t('message.no-permission-for-action'),
  );
}

async function onDelete(record: AdminRole): Promise<void> {
  const entityName = getEntityName(record);
  let deleted = false;
  const confirmed = await confirmDelete({
    title: `${t('label.delete')} ${entityName}`,
    content: t('message.permanently-delete-common-message', { entity: entityName.toLowerCase() }),
    okText: t('label.delete'),
    cancelText: t('label.cancel'),
    onOk: async () => {
      deleted = await hardDeleteEntity(record.id, 'role', {
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
    :title="t('label.role-plural')"
    :lead="t('message.page-sub-header-for-roles')"
    learning-page-id="roles"
    :loading="loading"
    :error="errorMessage"
    :columns="columns"
    :data-source="roles"
    row-key="name"
    table-test-id="admin-roles-table"
    :total="total"
    :has-next="hasNext"
    :has-prev="hasPrev"
    @refresh="load"
    @next="onNext"
    @prev="onPrev"
  >
    <template #actions>
      <Button v-if="canAdd" type="primary" data-testid="add-role" @click="goAdd">
        {{ t('label.add-entity', { entity: t('label.role') }) }}
      </Button>
    </template>
    <template #emptyExtra>
      <Button v-if="canAdd" type="primary" data-testid="add-role-empty" @click="goAdd">
        {{ t('label.add-entity', { entity: t('label.role') }) }}
      </Button>
    </template>
    <template #bodyCell="{ column, record }">
      <template v-if="column.key === 'name'">
        <EntityNameLink
          :record="record as AdminRole"
          :to="roleDetailLocation((record as AdminRole).fullyQualifiedName ?? (record as AdminRole).name)"
          test-id="role-name"
        />
      </template>
      <template v-else-if="column.key === 'description'">
        <DescriptionCell :markdown="(record as AdminRole).description" />
      </template>
      <template v-else-if="column.key === 'policies'">
        <ReferenceListCell
          :references="(record as AdminRole).policies"
          :has-view-permission="canViewPolicies"
          :path-for="policyPathFor"
        />
      </template>
      <template v-else-if="column.key === 'actions'">
        <Tooltip :title="deleteTooltipTitle()" placement="left">
          <span>
            <Button
              type="text"
              size="small"
              :disabled="!canDelete"
              :data-testid="`delete-action-${getEntityName(record as AdminRole)}`"
              @click="onDelete(record as AdminRole)"
            >
              <template #icon><DeleteOutlined /></template>
            </Button>
          </span>
        </Tooltip>
      </template>
    </template>
  </EntityListShell>
</template>
