<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute, useRouter } from 'vue-router';
import { Alert, Button, Card, Spin, Typography } from 'ant-design-vue';
import { confirmRegistration } from '@/api/auth';

/**
 * Account activation confirmation, mirroring official
 * account-activation-confirmation.component.tsx at the official route
 * /users/registrationConfirmation: PUT registrationConfirmation?token=...
 * A non-empty response means verified (success alert + back-to-login);
 * an empty or failed response means the token-expired state (error alert
 * + regenerate-token button). Both buttons navigate back to sign-in,
 * exactly as the official handleBackToLogin does for both — no token
 * regeneration request is invented. A missing token skips the request
 * and renders the expired state directly.
 */
const route = useRoute();
const router = useRouter();
const { t } = useI18n();

const verifying = ref(true);
const verified = ref(false);

function backToLogin(): void {
  void router.push({ name: 'login' });
}

onMounted(async () => {
  const token = typeof route.query.token === 'string' ? route.query.token : '';
  if (!token) {
    verifying.value = false;
    return;
  }
  try {
    const result = await confirmRegistration(token);
    verified.value = result !== null && result !== undefined && result !== '';
  } catch {
    verified.value = false;
  } finally {
    verifying.value = false;
  }
});
</script>

<template>
  <div class="auth-page">
    <Card class="auth-page__card">
      <Typography.Title :level="3">{{ t('auth.registrationTitle') }}</Typography.Title>
      <div v-if="verifying" data-testid="registration-verifying">
        <Spin />
        <Typography.Paragraph type="secondary">{{ t('auth.registrationVerifying') }}</Typography.Paragraph>
      </div>
      <template v-else-if="verified">
        <Alert
          data-testid="registration-verified"
          type="success"
          show-icon
          :message="t('auth.registrationVerified')"
        />
        <Button type="link" block data-testid="registration-back-to-login" @click="backToLogin">
          {{ t('auth.backToLogin') }}
        </Button>
      </template>
      <template v-else>
        <Alert
          data-testid="registration-expired"
          type="error"
          show-icon
          :message="t('auth.registrationExpired')"
        />
        <Button type="link" block data-testid="registration-regenerate" @click="backToLogin">
          {{ t('auth.regenerateToken') }}
        </Button>
      </template>
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
