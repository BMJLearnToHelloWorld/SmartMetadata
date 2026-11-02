<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed, reactive, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute, useRouter } from 'vue-router';
import { Alert, Button, Card, Form, Input, Typography } from 'ant-design-vue';
import { resetUserPassword } from '@/api/auth';
import { PASSWORD_PATTERN } from '@/auth/validation';
import { requiredField } from '@/features/crud/formRules';

/**
 * Reset-password page, mirroring official ResetPassword: token and
 * username come from the query string (official parses them the same
 * way). A link missing either renders an honest error state instead
 * of a form that could never succeed. On success the user is sent to
 * sign-in, exactly as the official page does.
 */
const route = useRoute();
const router = useRouter();
const { t } = useI18n();

const token = computed(() => (typeof route.query.token === 'string' ? route.query.token : ''));
const username = computed(() => (typeof route.query.user === 'string' ? route.query.user : ''));
const hasParams = computed(() => token.value.length > 0 && username.value.length > 0);

const form = reactive({ password: '', confirmPassword: '' });

function confirmPasswordValidator(_rule: unknown, value: string): Promise<void> {
  return value === form.password ? Promise.resolve() : Promise.reject(t('auth.passwordMismatch'));
}
const submitting = ref(false);
const errorMessage = ref('');

async function onSubmit(): Promise<void> {
  errorMessage.value = '';
  submitting.value = true;
  try {
    await resetUserPassword({
      token: token.value,
      username: username.value,
      password: form.password,
      confirmPassword: form.confirmPassword,
    });
    await router.replace({ name: 'login' });
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : t('auth.resetFailed');
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <div class="auth-page">
    <Card class="auth-page__card">
      <Typography.Title :level="3">{{ t('auth.resetTitle') }}</Typography.Title>
      <Typography.Paragraph type="secondary">{{ t('auth.resetLead') }}</Typography.Paragraph>
      <Alert
        v-if="!hasParams"
        data-testid="reset-missing-params"
        type="error"
        show-icon
        :message="t('auth.missingToken')"
      />
      <Alert
        v-if="errorMessage"
        data-testid="reset-error"
        type="error"
        show-icon
        :message="errorMessage"
        class="auth-page__alert"
      />
      <Form v-if="hasParams" layout="vertical" :model="form" @finish="onSubmit">
        <Form.Item
          :label="t('auth.newPassword')"
          name="password"
          :rules="[...requiredField(t, t('auth.newPassword')), { pattern: PASSWORD_PATTERN, message: t('auth.passwordInvalid') }]"
        >
          <Input.Password v-model:value="form.password" data-testid="reset-password" autocomplete="new-password" />
        </Form.Item>
        <Form.Item
          :label="t('auth.confirmNewPassword')"
          name="confirmPassword"
          :rules="[...requiredField(t, t('auth.confirmNewPassword')), { validator: confirmPasswordValidator }]"
        >
          <Input.Password v-model:value="form.confirmPassword" data-testid="reset-confirm-password" autocomplete="new-password" />
        </Form.Item>
        <Button type="primary" html-type="submit" block :loading="submitting" data-testid="reset-submit">
          {{ t('auth.resetTitle') }}
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
