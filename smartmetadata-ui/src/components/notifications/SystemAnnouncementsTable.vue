<!--
Copyright 2026 SmartMetadata authors.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the Apache License at

    http://www.apache.org/licenses/LICENSE-2.0
-->
<script setup lang="ts">
import {
  CopyOutlined,
  DeleteOutlined,
  EditOutlined,
  ExclamationCircleOutlined,
  MoreOutlined,
  SearchOutlined,
  SoundOutlined,
} from '@ant-design/icons-vue';
import {
  Badge,
  Button,
  Card,
  Dropdown,
  Input,
  Pagination,
  Select,
  Skeleton,
  Table,
  Tag,
  Tooltip,
  Typography,
  type TableProps,
} from 'ant-design-vue';
import { computed, h, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import AnnouncementDeleteDialog from '@/components/notifications/AnnouncementDeleteDialog.vue';
import NoDataPlaceholder from '@/components/shared/NoDataPlaceholder.vue';
import NoSearchResultsPlaceholder from '@/components/shared/NoSearchResultsPlaceholder.vue';
import SmProfilePicture from '@/components/shared/SmProfilePicture.vue';
import SomethingWentWrongPlaceholder from '@/components/shared/SomethingWentWrongPlaceholder.vue';
import type { Announcement, AnnouncementType } from '@/types/collaboration';
import { formatAnnouncementDate } from '@/utils/notifications/alertDates';
import type { TranslateFn } from '@/utils/notifications/alertUtils';
import type { AlertSearchHooks } from '@/utils/notifications/alertSourceSearch';
import {
  ANNOUNCEMENT_TYPE_CONFIG,
  ANNOUNCEMENT_TYPE_ORDER,
  getAnnouncementStatus,
  getAnnouncementTypeConfig,
  getAnnouncementTypeLabel,
  SYSTEM_ANNOUNCEMENT_PAGE_SIZES,
  SYSTEM_ANNOUNCEMENT_STATUS_LABEL_KEYS,
  SYSTEM_ANNOUNCEMENT_STATUS_ORDER,
  type AnnouncementStatusValue,
} from '@/utils/notifications/announcementUtils';
import {
  ANNOUNCEMENT_FAMILY_TAG_COLOR,
  ANNOUNCEMENT_TYPE_ICONS,
} from '@/utils/notifications/announcementPresentation';
import type { SystemAnnouncementsListState } from '@/views/collaboration/useSystemAnnouncements';
import { deleteSystemAnnouncement } from '@/views/collaboration/useSystemAnnouncements';

/**
 * Pin `SystemAnnouncementsTable` (547 lines): server-side status/type
 * filters, client title search, newest-start-first order, client
 * paging, and Edit / Duplicate / Delete per row. It navigates
 * nowhere itself — the surface says where Add, Edit and Duplicate
 * lead. The doc comment claims server-side search and cursor paging;
 * the code does client search and client paging, and the code wins.
 * The popover delete confirmation belongs to the settings-modal
 * surface only; the route page confirms with the dialog.
 */
const props = defineProps<{
  list: SystemAnnouncementsListState;
  hooks: AlertSearchHooks;
  notifySuccess: (message: string) => void;
}>();
const emit = defineEmits<{
  add: [];
  edit: [announcement: Announcement];
  duplicate: [announcement: Announcement];
}>();

const { t, locale } = useI18n();
const translate = t as unknown as TranslateFn;

const pendingDelete = ref<Announcement | undefined>(undefined);
const isDeleting = ref(false);

const columns = computed(() => [
  { key: 'type', dataIndex: 'type', title: t('label.type'), width: 128 },
  { key: 'title', dataIndex: 'title', title: t('label.title') },
  { key: 'author', dataIndex: 'author', title: t('label.author'), width: 144 },
  { key: 'startTime', dataIndex: 'startTime', title: t('label.start-date'), width: 128 },
  { key: 'endTime', dataIndex: 'endTime', title: t('label.end-date'), width: 128 },
  { key: 'status', dataIndex: 'status', title: t('label.status'), width: 128 },
  { key: 'actions', dataIndex: 'actions', title: t('label.action-plural'), width: 56 },
]);

const statusOptions = computed(() =>
  SYSTEM_ANNOUNCEMENT_STATUS_ORDER.map((status) => ({
    value: status,
    label: t(SYSTEM_ANNOUNCEMENT_STATUS_LABEL_KEYS[status]),
  })),
);
const typeOptions = computed(() =>
  ANNOUNCEMENT_TYPE_ORDER.map((type) => ({
    value: type,
    label: t(ANNOUNCEMENT_TYPE_CONFIG[type].labelKey),
  })),
);

const searchLabel = computed(() =>
  t('label.search-for-type', { type: t('label.announcement-plural') }),
);

function announcementTitle(announcement: Announcement): string {
  return announcement.displayName ?? announcement.name ?? '';
}

function announcementKey(announcement: Announcement): string {
  return announcement.name ?? announcement.id;
}

/** The table's body-cell slot types its record as an untyped record; the rows are announcements. */
function asAnnouncement(record: unknown): Announcement {
  return record as Announcement;
}

/**
 * Row test ids. The table's row-props type only admits HTML
 * attributes, so the `data-testid` rides a cast — at runtime antd
 * spreads these props onto the `<tr>` verbatim.
 */
const customRow = ((record: unknown) => ({
  'data-testid': `announcement-row-${announcementKey(asAnnouncement(record))}`,
})) as TableProps['customRow'];

function statusBadgeStatus(status: AnnouncementStatusValue): 'success' | 'processing' | 'default' {
  if (status === 'Active') {
    return 'success';
  }
  if (status === 'Scheduled') {
    return 'processing';
  }
  return 'default';
}

function rowClassName(announcement: Announcement): string {
  return getAnnouncementStatus(announcement) === 'Expired'
    ? 'system-announcements-table__row--expired'
    : '';
}

function onPaginationChange(page: number, size: number): void {
  if (size !== props.list.pageSize.value) {
    props.list.setPageSize(size);
  } else {
    props.list.goToPage(page);
  }
}

function menuItems() {
  return [
    {
      key: 'edit',
      label: h('span', { 'data-testid': 'edit-announcement' }, t('label.edit')),
      icon: h(EditOutlined),
    },
    {
      key: 'duplicate',
      label: h('span', { 'data-testid': 'duplicate-announcement' }, t('label.duplicate')),
      icon: h(CopyOutlined),
    },
    { key: 'divider', type: 'divider' as const },
    {
      key: 'delete',
      label: h('span', { 'data-testid': 'delete-announcement' }, t('label.delete')),
      icon: h(DeleteOutlined),
    },
  ];
}

function onMenuClick(announcement: Announcement, key: string): void {
  if (key === 'edit') {
    emit('edit', announcement);
  } else if (key === 'duplicate') {
    emit('duplicate', announcement);
  } else if (key === 'delete') {
    pendingDelete.value = announcement;
  }
}

async function onConfirmDelete(): Promise<void> {
  const target = pendingDelete.value;
  if (!target) {
    return;
  }
  isDeleting.value = true;
  try {
    await deleteSystemAnnouncement({
      id: target.id,
      hooks: props.hooks,
      t: translate,
      notifySuccess: props.notifySuccess,
      onDeleted: () => {
        pendingDelete.value = undefined;
        void props.list.refetch();
      },
    });
  } finally {
    isDeleting.value = false;
  }
}

function closeDelete(): void {
  pendingDelete.value = undefined;
}
</script>

<template>
  <Card data-testid="system-announcements-table" class="system-announcements-table">
    <div class="system-announcements-table__toolbar">
      <Input
        :value="props.list.filters.value.search"
        :aria-label="searchLabel"
        :placeholder="`${searchLabel}…`"
        data-testid="announcement-search"
        class="system-announcements-table__search"
        @update:value="props.list.updateFilters({ search: $event })"
      >
        <template #prefix>
          <SearchOutlined />
        </template>
      </Input>
      <div class="system-announcements-table__filters">
        <Button
          v-if="props.list.hasFilters.value"
          type="link"
          size="small"
          data-testid="announcement-clear-filters"
          @click="props.list.clearFilters()"
        >
          {{ t('label.clear') }}
        </Button>
        <Select
          :value="props.list.filters.value.status"
          :options="statusOptions"
          :placeholder="t('label.status')"
          allow-clear
          data-testid="announcement-status-filter"
          class="system-announcements-table__filter"
          @change="(value) => props.list.updateFilters({ status: value as AnnouncementStatusValue | undefined })"
        />
        <Select
          :value="props.list.filters.value.type"
          :options="typeOptions"
          :placeholder="t('label.type')"
          allow-clear
          data-testid="announcement-type-filter"
          class="system-announcements-table__filter"
          @change="(value) => props.list.updateFilters({ type: value as AnnouncementType | undefined })"
        />
      </div>
    </div>

    <div class="system-announcements-table__scroll">
      <Table
        :columns="columns"
        :data-source="props.list.isLoading.value ? [] : props.list.announcements.value"
        :pagination="false"
        :row-key="(record: Announcement) => record.id"
        :row-class-name="rowClassName"
        :custom-row="customRow"
        :aria-label="t('label.announcement-plural')"
        data-testid="system-announcements-list"
        size="small"
        table-layout="fixed"
      >
        <template #headerCell="{ column }">
          <span v-if="column.key === 'actions'" class="system-announcements-table__sr-only">
            {{ column.title }}
          </span>
          <template v-else>{{ column.title }}</template>
        </template>
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'type'">
            <Tag
              :color="ANNOUNCEMENT_FAMILY_TAG_COLOR[getAnnouncementTypeConfig(asAnnouncement(record)).color]"
              class="system-announcements-table__type-tag"
            >
              <template #icon>
                <component :is="ANNOUNCEMENT_TYPE_ICONS[getAnnouncementTypeConfig(asAnnouncement(record)).iconKey]" />
              </template>
              <span class="system-announcements-table__type-label">
                {{ getAnnouncementTypeLabel(getAnnouncementTypeConfig(asAnnouncement(record)), translate) }}
              </span>
            </Tag>
          </template>
          <template v-else-if="column.key === 'title'">
            <Tooltip :title="announcementTitle(asAnnouncement(record))" placement="top">
              <Button
                type="link"
                size="small"
                class="system-announcements-table__title-btn"
                :data-testid="`announcement-title-${announcementKey(asAnnouncement(record))}`"
                @click="emit('edit', asAnnouncement(record))"
              >
                {{ announcementTitle(asAnnouncement(record)) }}
              </Button>
            </Tooltip>
          </template>
          <template v-else-if="column.key === 'author'">
            <span v-if="record.createdBy" class="system-announcements-table__author">
              <SmProfilePicture :name="record.createdBy" size="xs" />
              <Typography.Text type="secondary" class="system-announcements-table__author-name">
                {{ record.createdBy }}
              </Typography.Text>
            </span>
          </template>
          <template v-else-if="column.key === 'startTime'">
            <Typography.Text>{{ formatAnnouncementDate(record.startTime ?? 0, locale) }}</Typography.Text>
          </template>
          <template v-else-if="column.key === 'endTime'">
            <Typography.Text>{{ formatAnnouncementDate(record.endTime ?? 0, locale) }}</Typography.Text>
          </template>
          <template v-else-if="column.key === 'status'">
            <Badge
              :status="statusBadgeStatus(getAnnouncementStatus(asAnnouncement(record)))"
              :text="t(SYSTEM_ANNOUNCEMENT_STATUS_LABEL_KEYS[getAnnouncementStatus(asAnnouncement(record))])"
            />
          </template>
          <template v-else-if="column.key === 'actions'">
            <Dropdown
              :trigger="['click']"
              placement="bottomRight"
              :menu="{ items: menuItems(), onClick: ({ key }) => onMenuClick(asAnnouncement(record), String(key)) }"
            >
              <Button
                type="text"
                size="small"
                :data-testid="`announcement-actions-${announcementKey(asAnnouncement(record))}`"
                :aria-label="t('label.action-plural')"
              >
                <MoreOutlined />
              </Button>
            </Dropdown>
          </template>
        </template>
        <template #emptyText>
          <div v-if="props.list.isLoading.value" class="system-announcements-table__skeletons">
            <Skeleton v-for="i in 5" :key="i" :paragraph="{ rows: 1 }" :title="false" active />
          </div>
          <div
            v-else-if="props.list.isError.value && props.list.total.value === 0"
            class="system-announcements-table__placeholder"
          >
            <SomethingWentWrongPlaceholder
              test-id="announcements-error"
              :icon="ExclamationCircleOutlined"
              :title="t('server.entity-fetch-error', { entity: t('label.announcement-plural') })"
              :actions="[
                { key: 'retry', label: t('label.retry'), color: 'primary', onPress: () => props.list.refetch() },
              ]"
            />
          </div>
          <div
            v-else-if="props.list.hasFilters.value"
            class="system-announcements-table__placeholder"
          >
            <NoSearchResultsPlaceholder
              test-id="announcements-no-match"
              :title="t('label.no-matching-results')"
              :description="t('message.check-spelling-or-try-different-term')"
            />
          </div>
          <div v-else class="system-announcements-table__placeholder">
            <NoDataPlaceholder
              test-id="announcements-empty"
              :icon="SoundOutlined"
              :title="t('label.no-entity-found', { entity: t('label.announcement-plural') })"
              :description="t('message.no-system-announcements-description')"
              :actions="[
                { key: 'add-announcement', label: t('label.add-entity', { entity: t('label.announcement') }), color: 'primary', onPress: () => emit('add') },
              ]"
            />
          </div>
        </template>
      </Table>
    </div>

    <div v-if="props.list.total.value > props.list.pageSize.value" class="system-announcements-table__pager">
      <Pagination
        :current="props.list.page.value"
        :total="props.list.total.value"
        :page-size="props.list.pageSize.value"
        :page-size-options="SYSTEM_ANNOUNCEMENT_PAGE_SIZES.map(String)"
        show-size-changer
        @change="onPaginationChange"
      />
    </div>
  </Card>

  <AnnouncementDeleteDialog
    :open="Boolean(pendingDelete)"
    :deleting="isDeleting"
    @cancel="closeDelete"
    @confirm="onConfirmDelete"
  />
</template>

<style scoped>
.system-announcements-table__toolbar {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 12px;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--sm-border-secondary);
}

.system-announcements-table__search {
  max-width: 320px;
}

.system-announcements-table__filters {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-left: auto;
}

.system-announcements-table__filter {
  width: 160px;
}

.system-announcements-table__scroll {
  overflow-x: auto;
}

.system-announcements-table__scroll :deep(.ant-table) {
  min-width: 880px;
}

.system-announcements-table__sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
}

.system-announcements-table__type-tag {
  display: inline-flex;
  align-items: center;
  max-width: 100%;
}

.system-announcements-table__type-label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.system-announcements-table__title-btn {
  max-width: 100%;
  justify-content: flex-start;
  text-align: left;
  padding-left: 0;
  padding-right: 0;
}

.system-announcements-table__title-btn :deep(> span) {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.system-announcements-table__author {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.system-announcements-table__author-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.system-announcements-table__row--expired {
  opacity: 0.6;
}

.system-announcements-table__skeletons {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px;
}

.system-announcements-table__placeholder {
  position: relative;
  min-height: 240px;
}

.system-announcements-table__pager {
  display: flex;
  justify-content: flex-end;
  padding-top: 12px;
}
</style>
