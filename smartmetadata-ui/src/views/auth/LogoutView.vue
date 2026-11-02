<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { onMounted } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { Card, Spin, Typography } from 'ant-design-vue';
import { useAuthStore } from '@/stores/auth';

/**
 * Logout route, mirroring official LogoutPage: mounting triggers the
 * logout and the page only renders a spinner meanwhile. The action is
 * the same auth.logout() the user menu uses — no second logout path.
 * A server-side failure still clears the local session (see
 * AppShell.onLogout) and lands on /login either way.
 */
const router = useRouter();
const auth = useAuthStore();
const { t } = useI18n();

onMounted(async () => {
  try {
    await auth.logout();
  } catch {
    auth.forgetLocalSession();
  }
  await router.replace({ name: 'login' });
});
</script>

<template>
  <div class="auth-page">
    <Card class="auth-page__card">
      <Typography.Title :level="3">{{ t('auth.logoutTitle') }}</Typography.Title>
      <Spin data-testid="logout-processing" />
      <Typography.Paragraph type="secondary">{{ t('auth.loggingOut') }}</Typography.Paragraph>
    </Card>
  </div>
</template>

<style scoped>
.auth-page {
  min-height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 32px 16px;
}
.auth-page__card {
  width: 100%;
  max-width: 480px;
  text-align: center;
}
</style>
