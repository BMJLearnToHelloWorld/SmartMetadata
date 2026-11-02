<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { Alert, Button, Card, Form, Input, Typography } from 'ant-design-vue';
import { signupUser } from '@/api/auth';
import { fetchAuthConfig } from '@/api/system';
import { EMAIL_PATTERN, PASSWORD_PATTERN } from '@/auth/validation';
import { requiredField } from '@/features/crud/formRules';

/**
 * Basic self-registration page (official BasicSignup line), NOT the
 * SSO complete-profile page: the product has no AuthProvider newUser
 * concept, so the SSO join flow stays residual and this page serves
 * the basic signup API (POST /v1/users/signup) only. When the server
 * explicitly disables self-registration (enableSelfSignup === false)
 * the form is withheld and only an informational alert renders.
 */
const router = useRouter();
const { t } = useI18n();

const form = reactive({ firstName: '', lastName: '', email: '', password: '', confirmPassword: '' });

function confirmPasswordValidator(_rule: unknown, value: string): Promise<void> {
  return value === form.password ? Promise.resolve() : Promise.reject(t('auth.passwordMismatch'));
}
const submitting = ref(false);
const errorMessage = ref('');
const selfSignupDisabled = ref(false);

async function loadAuthConfig(): Promise<void> {
  try {
    const config = await fetchAuthConfig();
    selfSignupDisabled.value = config.enableSelfSignup === false;
  } catch {
    selfSignupDisabled.value = false;
  }
}

async function onSubmit(): Promise<void> {
  errorMessage.value = '';
  submitting.value = true;
  try {
    await signupUser({
      firstName: form.firstName.trim(),
      lastName: form.lastName.trim(),
      email: form.email.trim(),
      password: form.password,
    });
    await router.replace({ name: 'login' });
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : t('auth.signUpFailed');
  } finally {
    submitting.value = false;
  }
}

onMounted(() => {
  void loadAuthConfig();
});
</script>

<template>
  <div class="auth-page">
    <Card class="auth-page__card">
      <Typography.Title :level="3">{{ t('auth.signUpTitle') }}</Typography.Title>
      <Typography.Paragraph type="secondary">{{ t('auth.signUpLead') }}</Typography.Paragraph>
      <Alert
        v-if="selfSignupDisabled"
        data-testid="signup-disabled"
        type="info"
        show-icon
        :message="t('auth.signUpDisabled')"
      />
      <Alert
        v-if="errorMessage"
        data-testid="signup-error"
        type="error"
        show-icon
        :message="errorMessage"
        class="auth-page__alert"
      />
      <Form v-if="!selfSignupDisabled" layout="vertical" :model="form" @finish="onSubmit">
        <Form.Item :label="t('auth.firstName')" name="firstName" :rules="requiredField(t, t('auth.firstName'))">
          <Input v-model:value="form.firstName" data-testid="signup-first-name" autocomplete="given-name" />
        </Form.Item>
        <Form.Item :label="t('auth.lastName')" name="lastName" :rules="requiredField(t, t('auth.lastName'))">
          <Input v-model:value="form.lastName" data-testid="signup-last-name" autocomplete="family-name" />
        </Form.Item>
        <Form.Item
          :label="t('auth.email')"
          name="email"
          :rules="[...requiredField(t, t('auth.email')), { pattern: EMAIL_PATTERN, message: t('auth.emailInvalid') }]"
        >
          <Input v-model:value="form.email" data-testid="signup-email" autocomplete="username" />
        </Form.Item>
        <Form.Item
          :label="t('auth.password')"
          name="password"
          :rules="[...requiredField(t, t('auth.password')), { pattern: PASSWORD_PATTERN, message: t('auth.passwordInvalid') }]"
        >
          <Input.Password v-model:value="form.password" data-testid="signup-password" autocomplete="new-password" />
        </Form.Item>
        <Form.Item
          :label="t('auth.confirmPassword')"
          name="confirmPassword"
          :rules="[...requiredField(t, t('auth.confirmPassword')), { validator: confirmPasswordValidator }]"
        >
          <Input.Password v-model:value="form.confirmPassword" data-testid="signup-confirm-password" autocomplete="new-password" />
        </Form.Item>
        <Button type="primary" html-type="submit" block :loading="submitting" data-testid="signup-submit">
          {{ t('auth.submitSignUp') }}
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
