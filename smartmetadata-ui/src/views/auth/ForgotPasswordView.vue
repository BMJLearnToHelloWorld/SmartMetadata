<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { reactive, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { Alert, Button, Card, Form, Input, Typography } from 'ant-design-vue';
import { ApiError } from '@/api/client';
import { requestPasswordResetLink } from '@/api/auth';
import { EMAIL_PATTERN } from '@/auth/validation';
import { requiredField } from '@/features/crud/formRules';

/**
 * Forgot-password page, mirroring official ForgotPassword: one email
 * field, POST /v1/users/generatePasswordResetLink. The official error
 * split is kept: HTTP 424 maps to the mail-send error, anything else
 * to email-not-found. Success only renders a confirmation alert; the
 * page never claims more than "link sent".
 */
const router = useRouter();
const { t } = useI18n();

const form = reactive({ email: '' });
const submitting = ref(false);
const errorMessage = ref('');
const sent = ref(false);

async function onSubmit(): Promise<void> {
  errorMessage.value = '';
  submitting.value = true;
  try {
    await requestPasswordResetLink(form.email.trim());
    sent.value = true;
  } catch (error) {
    errorMessage.value =
      error instanceof ApiError && error.status === 424
        ? t('auth.emailSendError')
        : error instanceof ApiError && error.status === 404
          ? t('auth.emailNotFound')
          : error instanceof Error
            ? error.message
            : t('auth.forgotFailed');
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <div class="auth-page">
    <Card class="auth-page__card">
      <Typography.Title :level="3">{{ t('auth.forgotTitle') }}</Typography.Title>
      <Typography.Paragraph type="secondary">{{ t('auth.forgotLead') }}</Typography.Paragraph>
      <Alert
        v-if="sent"
        data-testid="forgot-sent"
        type="success"
        show-icon
        :message="t('auth.resetSent')"
        class="auth-page__alert"
      />
      <Alert
        v-if="errorMessage"
        data-testid="forgot-error"
        type="error"
        show-icon
        :message="errorMessage"
        class="auth-page__alert"
      />
      <Form v-if="!sent" layout="vertical" :model="form" @finish="onSubmit">
        <Form.Item
          :label="t('auth.email')"
          name="email"
          :rules="[...requiredField(t, t('auth.email')), { pattern: EMAIL_PATTERN, message: t('auth.emailInvalid') }]"
        >
          <Input v-model:value="form.email" data-testid="forgot-email" autocomplete="username" />
        </Form.Item>
        <Button type="primary" html-type="submit" block :loading="submitting" data-testid="forgot-submit">
          {{ t('auth.sendResetLink') }}
        </Button>
        <Button type="link" block @click="router.push({ name: 'login' })">{{ t('auth.backToLogin') }}</Button>
      </Form>
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
}
.auth-page__alert {
  margin-bottom: 16px;
}
</style>
