<!--
Copyright 2026 SmartMetadata authors.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the Apache License at

    http://www.apache.org/licenses/LICENSE-2.0
-->
<script setup lang="ts">
import { Button, message } from 'ant-design-vue';
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import SystemAnnouncementsTable from '@/components/notifications/SystemAnnouncementsTable.vue';
import PageHeader from '@/components/shared/PageHeader.vue';
import PageLayout from '@/components/shared/PageLayout.vue';
import SmBreadcrumb from '@/components/shared/SmBreadcrumb.vue';
import type { Announcement } from '@/types/collaboration';
import type { TranslateFn } from '@/utils/notifications/alertUtils';
import type { AlertSearchHooks } from '@/utils/notifications/alertSourceSearch';
import { getAnnouncementFormPath } from '@/utils/notifications/announcementUtils';
import { getAnnouncementsBreadcrumbs } from '@/utils/notifications/notificationBreadcrumbs';
import { useSystemAnnouncementsList } from './useSystemAnnouncements';

/**
 * Pin `SystemAnnouncementsPage`: Settings → Notifications →
 * Announcements. The header carries the Add action; the list is the
 * same table every surface uses. Edit and Duplicate navigate by
 * announcement id — the form page loads its source by id, never
 * from the first page of the list.
 */
const router = useRouter();
const { t } = useI18n();
const translate = t as unknown as TranslateFn;

const hooks: AlertSearchHooks = {
  t: translate,
  notifyError: (text: string) => void message.error(text),
  notifyWarning: (text: string) => void message.warning(text),
};
const notifySuccess = (text: string): void => void message.success(text);

const list = useSystemAnnouncementsList();
const breadcrumbs = computed(() => getAnnouncementsBreadcrumbs(translate));

function openAdd(): void {
  void router.push(getAnnouncementFormPath('create'));
}

function openEdit(announcement: Announcement): void {
  void router.push(getAnnouncementFormPath('edit', announcement.id));
}

function openDuplicate(announcement: Announcement): void {
  void router.push(getAnnouncementFormPath('duplicate', announcement.id));
}
</script>

<template>
  <PageLayout
    :document-title="t('label.announcement-plural')"
    data-testid="system-announcements-page"
  >
    <SmBreadcrumb :items="breadcrumbs" />
    <div class="announcements-list-view__header">
      <PageHeader
        :header="t('label.announcement-plural')"
        :sub-header="t('message.system-announcements-description')"
      />
      <Button type="primary" data-testid="add-announcement" @click="openAdd">
        {{ t('label.add-entity', { entity: t('label.announcement') }) }}
      </Button>
    </div>
    <SystemAnnouncementsTable
      :list="list"
      :hooks="hooks"
      :notify-success="notifySuccess"
      @add="openAdd"
      @edit="openEdit"
      @duplicate="openDuplicate"
    />
  </PageLayout>
</template>

<style scoped>
.announcements-list-view__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}
</style>
