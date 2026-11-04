<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { Alert, Spin } from 'ant-design-vue';
import { debugMyPermissions, type PermissionDebugInfo } from '@/api/permissions';
import UserPermissionsPanel from '@/views/admin/UserPermissionsPanel.vue';

const props = defineProps<{ active: boolean }>();
const { t } = useI18n();

const loading = ref(false);
const errorMessage = ref('');
const info = ref<PermissionDebugInfo | null>(null);
const loaded = ref(false);

/**
 * Own-profile permissions, the official AccessControlUserPermissions
 * shape with isLoggedInUser=true: GET /v1/permissions/debug/me, the
 * client function already shipped with the admin debugger (#128).
 * No admin gate here — the endpoint only ever returns the viewer's
 * own data. A 403/401 surfaces as an error, never as empty data.
 * Loading is deferred until the tab first becomes active (the detail
 * shell force-renders all tab panes, so mount alone is not activation).
 */
async function load(): Promise<void> {
  if (loaded.value) {
    return;
  }
  loaded.value = true;
  loading.value = true;
  errorMessage.value = '';
  try {
    info.value = await debugMyPermissions();
  } catch (error) {
    info.value = null;
    errorMessage.value = error instanceof Error ? error.message : t('permissionDebugger.loadFailed');
  } finally {
    loading.value = false;
  }
}

watch(
  () => props.active,
  (active) => {
    if (active) {
      void load();
    }
  },
  { immediate: true },
);
</script>

<template>
  <Spin v-if="loading" data-testid="my-permissions-loading" />
  <Alert
    v-else-if="errorMessage"
    type="error"
    :message="errorMessage"
    data-testid="my-permissions-error"
  />
  <div v-else-if="info" data-testid="my-permissions-panel">
    <UserPermissionsPanel :info="info" />
  </div>
</template>
