<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { Button, Descriptions } from 'ant-design-vue';
import { LeftOutlined } from '@ant-design/icons-vue';
import { getApp } from '@/api/apps';
import EntityDetailShell from '@/features/crud/EntityDetailShell.vue';
import { applicationDetailChrome } from '@/settings/breadcrumbExceptions';
import { resolveSettingsLocation } from '@/settings/locationResolver';
import { entityLabel } from '@/features/crud/paging';
import type { EntityBreadcrumb } from '@/features/crud/types';
import type { AdminApp } from '@/types/admin';

const props = defineProps<{ id: string }>();
const { t } = useI18n();
const loading = ref(false);
const errorMessage = ref('');
const app = ref<AdminApp | null>(null);

const router = useRouter();
const appDetailChrome = computed(() =>
  applicationDetailChrome({
    browseAppsLabel: t('apps.detail.browseApps'),
    appsListLocation: resolveSettingsLocation('apps'),
  }),
);
const breadcrumbs = computed<EntityBreadcrumb[]>(() => appDetailChrome.value.breadcrumbs);

function goBrowseApps(): void {
  void router.push(appDetailChrome.value.browseAppsButton.to);
}

async function load(): Promise<void> {
  loading.value = true;
  errorMessage.value = '';
  try {
    app.value = await getApp(props.id);
  } catch (error) {
    app.value = null;
    errorMessage.value = error instanceof Error ? error.message : t('crud.loadFailed');
  } finally {
    loading.value = false;
  }
}

onMounted(() => {
  void load();
});

watch(
  () => props.id,
  () => {
    void load();
  },
);
</script>

<template>
  <EntityDetailShell
    :title="entityLabel(app) || t('admin.apps.title')"
    :name="app?.name"
    :lead="t('admin.apps.detailLead')"
    :loading="loading"
    :error="errorMessage"
    :empty="!app && !loading && !errorMessage"
    :breadcrumbs="breadcrumbs"
  >
    <template #actions>
      <Button type="text" data-testid="admin-app-browse-apps" @click="goBrowseApps">
        <template #icon><LeftOutlined /></template>
        {{ appDetailChrome.browseAppsButton.label }}
      </Button>
    </template>
    <Descriptions v-if="app" bordered :column="1" size="small" data-testid="admin-app-overview">
      <Descriptions.Item :label="t('crud.name')">{{ app.name }}</Descriptions.Item>
      <Descriptions.Item :label="t('crud.displayName')">{{ app.displayName || '—' }}</Descriptions.Item>
      <Descriptions.Item :label="t('crud.description')">{{ app.description || '—' }}</Descriptions.Item>
      <Descriptions.Item :label="t('admin.apps.appType')">{{ app.appType || '—' }}</Descriptions.Item>
      <Descriptions.Item :label="t('admin.apps.scheduleType')">{{ app.scheduleType || '—' }}</Descriptions.Item>
      <Descriptions.Item :label="t('crud.fqn')">{{ app.fullyQualifiedName || '—' }}</Descriptions.Item>
    </Descriptions>
  </EntityDetailShell>
</template>
