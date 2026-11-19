<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed } from 'vue';
import { Button, Skeleton, Table, Tooltip } from 'ant-design-vue';
import {
  BellOutlined,
  DeleteOutlined,
  EditOutlined,
  EnvironmentOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons-vue';
import { RouterLink } from 'vue-router';
import { useI18n } from 'vue-i18n';
import type { ApiError } from '@/api/client';
import DescriptionCell from '@/components/shared/DescriptionCell.vue';
import FeaturesPlaceholder from '@/components/shared/FeaturesPlaceholder.vue';
import NextPrevious from '@/components/shared/NextPrevious.vue';
import PermissionPlaceholder from '@/components/shared/PermissionPlaceholder.vue';
import SomethingWentWrongPlaceholder from '@/components/shared/SomethingWentWrongPlaceholder.vue';
import type { EventSubscription } from '@/types/quality';
import type { AlertFace } from '@/types/notifications';
import type { Paging, PagingHandlerParams } from '@/utils/pagination';
import { ALERT_EMPTY_STATE_FEATURES, NO_DATA_PLACEHOLDER } from '@/utils/notifications/alertConstants';
import {
  getAlertDetailsPath,
  getAlertEditPath,
} from '@/utils/notifications/alertPaths';
import { getEntityName } from '@/utils/notifications/alertUtils';
import type { EmptyPlaceholderFeature } from '@/utils/emptyPlaceholder';

/**
 * Alert row permission, one entry per listed alert: edit from the
 * derived canEditAll flag (ungated on deleted), delete from the raw
 * Delete operation. Both faces derive the same shape; the faces
 * differ in which rows get one (the A chain fetches the page data
 * without the prepended system row; the C chain fetches the whole
 * displayed list).
 */
export interface AlertRowPermission {
  id: string;
  edit: boolean;
  delete: boolean | undefined;
}

/**
 * The shared alert table (D-N1): both list faces render the same
 * columns and actions, parameterized by face. The faces differ in
 * the name-link guard (the settings face renders no link without an
 * FQN; the observability face always links), the Edit System disable
 * (settings face only), the empty-state mode (in-table placeholder
 * vs. replacing the table), and the empty-state CTA gate — all of
 * which arrive as props so the difference stays visible at the call
 * site instead of hiding in a branch.
 */
const props = withDefaults(
  defineProps<{
    face: AlertFace;
    alerts: EventSubscription[];
    alertsError?: ApiError;
    hasResourcePermissionError?: boolean;
    alertPermissions?: AlertRowPermission[];
    /** Skeleton gate for the Actions cells (settings: combined count; observability: permission count). */
    actionsLoading?: boolean;
    /** antd table spinner (settings face only; the observability face shows a blank table). */
    tableLoading?: boolean;
    /** Show an empty table while loading (observability face). */
    blankWhileLoading?: boolean;
    /** Replace the table and pager with the empty/error placeholder (observability face). */
    replaceWithPlaceholder?: boolean;
    /** Empty-state CTA gate (settings: Create only; observability: Create or All). */
    canCreateEmptyCta?: boolean;
    showPagination?: boolean;
    paging: Paging;
    pageSize: number;
    currentPage: number;
    pagerLoading?: boolean;
    pagingHandler: (params: PagingHandlerParams) => void;
    onShowSizeChange: (pageSize: number) => void;
  }>(),
  {
    alertsError: undefined,
    hasResourcePermissionError: false,
    alertPermissions: undefined,
    actionsLoading: false,
    tableLoading: false,
    blankWhileLoading: false,
    replaceWithPlaceholder: false,
    canCreateEmptyCta: false,
    showPagination: false,
    pagerLoading: false,
  },
);
const emit = defineEmits<{
  'select-alert': [alert: EventSubscription];
  'add-alert': [];
  retry: [];
  'retry-permission': [];
}>();

const { t } = useI18n();

const FEATURE_ICONS = {
  trigger: ThunderboltOutlined,
  destination: EnvironmentOutlined,
  'stay-ahead': BellOutlined,
} as const;

const features = computed<EmptyPlaceholderFeature[]>(() =>
  ALERT_EMPTY_STATE_FEATURES.map((feature) => ({
    key: feature.key,
    icon: FEATURE_ICONS[feature.key],
    title: t(feature.titleKey),
    description: t(feature.descriptionKey),
  })),
);

const emptyActions = computed(() =>
  props.canCreateEmptyCta
    ? [
        {
          key: 'new-alert',
          label: t('label.new-entity', { entity: t('label.alert') }),
          color: 'primary' as const,
          onPress: () => emit('add-alert'),
        },
      ]
    : undefined,
);

const isForbidden = computed(() => props.alertsError?.status === 403);

const dataSource = computed(() => {
  if (props.alertsError) {
    return [];
  }
  if (props.blankWhileLoading && props.pagerLoading) {
    return [];
  }
  return props.alerts;
});

const columns = computed(() => [
  { title: t('label.name'), dataIndex: 'name', key: 'name', width: 200 },
  {
    title: t('label.trigger'),
    dataIndex: ['filteringRules', 'resources'],
    key: 'FilteringRules.resources',
    width: 200,
  },
  { title: t('label.description'), dataIndex: 'description', key: 'description' },
  {
    title: t('label.action-plural'),
    dataIndex: 'fullyQualifiedName',
    key: 'fullyQualifiedName',
    width: 90,
  },
]);

function permissionFor(record: EventSubscription): AlertRowPermission | undefined {
  return props.alertPermissions?.find((permission) => permission.id === record.id);
}

function triggerText(record: EventSubscription): string {
  return record.filteringRules?.resources?.join(', ') || NO_DATA_PLACEHOLDER;
}

function showNameLink(record: EventSubscription): boolean {
  return props.face === 'Observability' || Boolean(record.fullyQualifiedName);
}

function isEditDisabled(record: EventSubscription): boolean {
  return props.face === 'Notification' && record.provider === 'system';
}

function isDeleteDisabled(record: EventSubscription): boolean {
  return record.provider === 'system';
}
</script>

<template>
  <div v-if="replaceWithPlaceholder" class="alert-list-table__placeholder-box">
    <PermissionPlaceholder
      v-if="isForbidden"
      :permission-value="t('label.view-entity', { entity: t('label.alert-plural') })"
    />
    <SomethingWentWrongPlaceholder
      v-else-if="alertsError || hasResourcePermissionError"
      :on-reload="() => (alertsError ? emit('retry') : emit('retry-permission'))"
    />
    <FeaturesPlaceholder
      v-else
      :actions="emptyActions"
      :title="t('message.observability-alert-empty-heading')"
      :description="t('message.observability-alert-empty-description')"
      :features="features"
    />
  </div>
  <div v-else>
    <Table
      :columns="columns"
      :data-source="dataSource"
      :loading="tableLoading"
      :pagination="false"
      row-key="id"
      size="small"
      :data-testid="face === 'Observability' ? 'alert-table' : undefined"
      :aria-label="face === 'Observability' ? t('label.observability-alert') : undefined"
    >
      <template #bodyCell="{ column, record }">
        <template v-if="column.key === 'name'">
          <RouterLink
            v-if="showNameLink(record as EventSubscription)"
            class="alert-list-table__name"
            data-testid="alert-name"
            :title="getEntityName(record as EventSubscription)"
            :to="getAlertDetailsPath(face, (record as EventSubscription).fullyQualifiedName ?? '')"
          >
            {{ getEntityName(record as EventSubscription) }}
          </RouterLink>
        </template>
        <template v-else-if="column.key === 'FilteringRules.resources'">
          {{ triggerText(record as EventSubscription) }}
        </template>
        <template v-else-if="column.key === 'description'">
          <DescriptionCell :markdown="(record as EventSubscription).description ?? ''" />
        </template>
        <template v-else-if="column.key === 'fullyQualifiedName'">
          <div v-if="actionsLoading" class="alert-list-table__skeleton">
            <Skeleton :paragraph="false" active />
          </div>
          <span
            v-else-if="!permissionFor(record as EventSubscription) || (!permissionFor(record as EventSubscription)?.edit && !permissionFor(record as EventSubscription)?.delete)"
            class="alert-list-table__no-data"
          >
            {{ NO_DATA_PLACEHOLDER }}
          </span>
          <div v-else class="alert-list-table__actions">
            <template v-if="permissionFor(record as EventSubscription)?.edit">
              <Tooltip placement="bottom" :title="t('label.edit')">
                <RouterLink
                  v-if="!isEditDisabled(record as EventSubscription)"
                  :to="getAlertEditPath(face, (record as EventSubscription).fullyQualifiedName ?? '')"
                >
                  <Button type="text" :data-testid="`alert-edit-${(record as EventSubscription).name}`">
                    <EditOutlined />
                  </Button>
                </RouterLink>
                <span v-else>
                  <Button
                    type="text"
                    disabled
                    :data-testid="`alert-edit-${(record as EventSubscription).name}`"
                  >
                    <EditOutlined />
                  </Button>
                </span>
              </Tooltip>
            </template>
            <Tooltip
              v-if="permissionFor(record as EventSubscription)?.delete"
              placement="bottom"
              :title="t('label.delete')"
            >
              <span>
                <Button
                  type="text"
                  :disabled="isDeleteDisabled(record as EventSubscription)"
                  :data-testid="`alert-delete-${(record as EventSubscription).name}`"
                  @click="emit('select-alert', record as EventSubscription)"
                >
                  <DeleteOutlined />
                </Button>
              </span>
            </Tooltip>
          </div>
        </template>
      </template>
      <template #emptyText>
        <template v-if="face === 'Notification'">
          <div class="alert-list-table__placeholder-box">
            <PermissionPlaceholder
              v-if="isForbidden"
              :permission-value="t('label.view-entity', { entity: t('label.alert-plural') })"
            />
            <SomethingWentWrongPlaceholder
              v-else-if="alertsError"
              :on-reload="() => emit('retry')"
            />
            <FeaturesPlaceholder
              v-else
              :actions="emptyActions"
              :title="t('message.observability-alert-empty-heading')"
              :description="t('message.observability-alert-empty-description')"
              :features="features"
            />
          </div>
        </template>
      </template>
    </Table>
    <div v-if="showPagination" class="alert-list-table__pager">
      <NextPrevious
        :paging="paging"
        :paging-handler="pagingHandler"
        :page-size="pageSize"
        :current-page="currentPage"
        :is-loading="pagerLoading"
        :on-show-size-change="onShowSizeChange"
      />
    </div>
  </div>
</template>

<style scoped>
.alert-list-table__placeholder-box {
  position: relative;
  min-height: calc(100vh - 16rem);
  width: 100%;
}

.alert-list-table__name {
  display: block;
  max-width: 12rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.alert-list-table__skeleton {
  padding-right: 16px;
}

.alert-list-table__no-data {
  padding-left: 4px;
}

.alert-list-table__actions {
  display: flex;
  align-items: center;
}

.alert-list-table__pager {
  padding: 12px 0;
}
</style>
