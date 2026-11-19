<!--
Copyright 2026 SmartMetadata authors.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the Apache License at

    http://www.apache.org/licenses/LICENSE-2.0
-->
<script setup lang="ts">
import { message, Spin } from 'ant-design-vue';
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute, useRouter } from 'vue-router';
import SystemAnnouncementForm from '@/components/notifications/SystemAnnouncementForm.vue';
import NoDataPlaceholder from '@/components/shared/NoDataPlaceholder.vue';
import PageHeader from '@/components/shared/PageHeader.vue';
import PageLayout from '@/components/shared/PageLayout.vue';
import SmBreadcrumb from '@/components/shared/SmBreadcrumb.vue';
import type { TranslateFn } from '@/utils/notifications/alertUtils';
import type { AlertSearchHooks } from '@/utils/notifications/alertSourceSearch';
import {
  ANNOUNCEMENTS_LIST_PATH,
  type SystemAnnouncementFormMode,
} from '@/utils/notifications/announcementUtils';
import { getAnnouncementFormBreadcrumbs } from '@/utils/notifications/notificationBreadcrumbs';
import { useSystemAnnouncement } from './useSystemAnnouncements';

/**
 * Pin `SystemAnnouncementFormPage` + `SystemAnnouncementFormLoader`:
 * add, edit or duplicate a system announcement as its own settings
 * page. The loader fetches the announcement an edit or duplicate
 * starts from, then mounts the form — the form reads its defaults
 * once, so it must not mount before they arrive. A deleted
 * announcement, or one that is not system-wide (it carries an
 * entityLink), renders the not-found placeholder. Cancel and Save
 * both return to the list.
 */
const route = useRoute();
const router = useRouter();
const { t } = useI18n();
const translate = t as unknown as TranslateFn;

const hooks: AlertSearchHooks = {
  t: translate,
  notifyError: (text: string) => void message.error(text),
  notifyWarning: (text: string) => void message.warning(text),
};
const notifySuccess = (text: string): void => void message.success(text);

const mode = computed<SystemAnnouncementFormMode>(() => {
  if (route.path.includes('/duplicate/')) {
    return 'duplicate';
  }
  if (route.path.includes('/edit/')) {
    return 'edit';
  }
  return 'create';
});
const id = computed(() => String(route.params.id ?? ''));
const needsSource = computed(() => mode.value !== 'create');

const title = computed(() =>
  mode.value === 'edit'
    ? t('label.edit-entity', { entity: t('label.announcement') })
    : t('label.add-entity', { entity: t('label.announcement') }),
);
const breadcrumbs = computed(() => getAnnouncementFormBreadcrumbs(title.value, translate));

const source = useSystemAnnouncement({
  id: () => (needsSource.value ? id.value || undefined : undefined),
  needsSource: () => needsSource.value,
});

const showNotFound = computed(
  () =>
    needsSource.value &&
    !source.isLoading.value &&
    (source.isError.value || !source.data.value || Boolean(source.data.value.entityLink)),
);

function backToList(): void {
  void router.push(ANNOUNCEMENTS_LIST_PATH);
}
</script>

<template>
  <PageLayout :document-title="title" data-testid="system-announcement-form-page">
    <SmBreadcrumb :items="breadcrumbs" />
    <PageHeader
      :header="title"
      :sub-header="t('message.system-announcements-description')"
    />
    <div v-if="needsSource && source.isLoading.value" class="announcement-form-view__loader">
      <Spin />
    </div>
    <div v-else-if="showNotFound" class="announcement-form-view__placeholder">
      <NoDataPlaceholder
        test-id="announcement-not-found"
        :title="t('label.no-entity-found', { entity: t('label.announcement') })"
      />
    </div>
    <SystemAnnouncementForm
      v-else
      :key="source.data.value?.id ?? 'new'"
      :mode="mode"
      :announcement="needsSource ? source.data.value : undefined"
      :hooks="hooks"
      :notify-success="notifySuccess"
      @cancel="backToList"
      @saved="backToList"
    />
  </PageLayout>
</template>

<style scoped>
.announcement-form-view__loader {
  display: flex;
  justify-content: center;
  padding: 48px 0;
}

.announcement-form-view__placeholder {
  position: relative;
  min-height: 240px;
}
</style>
