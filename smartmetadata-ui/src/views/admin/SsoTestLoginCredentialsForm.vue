<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { Button, Form, Input } from 'ant-design-vue';
import { reactive } from 'vue';
import { useI18n } from 'vue-i18n';
import { EMAIL_PATTERN } from '@/auth/validation';
import { requiredField } from '@/features/crud/formRules';

/**
 * LDAP and Basic sign in with a password, not a redirect, so their Test
 * Login asks for the credentials here. They are sent once to the
 * admin-only credentials endpoint and never stored.
 */
const props = defineProps<{
  isSubmitting: boolean;
}>();

const emit = defineEmits<{
  submit: [email: string, password: string];
}>();

const { t } = useI18n();
const form = reactive({ email: '', password: '' });

const emailRules = [
  ...requiredField(t, t('sso.testLogin.identity.email')),
  { pattern: EMAIL_PATTERN, message: t('auth.emailInvalid') },
];
const passwordRules = [...requiredField(t, t('login.password'))];

function onFinish(): void {
  emit('submit', form.email, form.password);
}
</script>

<template>
  <Form
    :model="form"
    layout="vertical"
    data-testid="sso-test-login-credentials-form"
    @finish="onFinish"
  >
    <p>{{ t('sso.testLogin.credentialsDescription') }}</p>
    <Form.Item :label="t('sso.testLogin.identity.email')" name="email" :rules="emailRules">
      <Input
        v-model:value="form.email"
        data-testid="sso-test-login-email"
        autocomplete="off"
      />
    </Form.Item>
    <Form.Item :label="t('login.password')" name="password" :rules="passwordRules">
      <Input.Password
        v-model:value="form.password"
        data-testid="sso-test-login-password"
        autocomplete="new-password"
      />
    </Form.Item>
    <Form.Item>
      <Button
        type="primary"
        html-type="submit"
        data-testid="sso-test-login-submit-credentials"
        :disabled="props.isSubmitting"
        :loading="props.isSubmitting"
      >
        {{ t('sso.testLogin.testSignIn') }}
      </Button>
    </Form.Item>
  </Form>
</template>
