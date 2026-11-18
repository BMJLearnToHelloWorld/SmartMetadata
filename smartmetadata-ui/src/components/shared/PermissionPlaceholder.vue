<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { Empty } from 'ant-design-vue';
import { useI18n } from 'vue-i18n';

/**
 * Shared access-denied placeholder (DESIGN §5.4), the product
 * equivalent of the official PermissionPlaceholder
 * (openmetadata-ui components/common/EmptyPlaceholder/
 * PermissionPlaceholder.tsx): title, one description sentence with
 * the permission entity interpolated, no action buttons. The
 * `permissionValue` prop is the already-translated entity text
 * (for example the translated word for "View" on a guard denial);
 * the component supplies no default, so every caller names the
 * entity it denied. Copy keys settings.shell.accessDenied and
 * settings.shell.noAccessPlaceholder are landed by the i18n flow.
 */
defineProps<{ permissionValue: string }>();

const { t } = useI18n();
</script>

<template>
  <div data-testid="permission-error-placeholder" class="permission-placeholder">
    <h3>{{ t('settings.shell.accessDenied') }}</h3>
    <Empty
      :description="t('settings.shell.noAccessPlaceholder', { entity: permissionValue })"
    />
  </div>
</template>

<style scoped>
.permission-placeholder {
  padding: 48px 16px;
  text-align: center;
}

.permission-placeholder h3 {
  margin-bottom: 8px;
}
</style>
