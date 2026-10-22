<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { Alert, Button, Card, Form, Input, Typography } from 'ant-design-vue';
import { isSsoOnlyProvider, ssoProviderLabel, supportsPasswordLogin } from '@/admin/authProvider';
import { fetchAuthConfig } from '@/api/system';
import { useAuthStore } from '@/stores/auth';
import type { AuthConfiguration } from '@/types/admin';

const router = useRouter();
const route = useRoute();
const auth = useAuthStore();

const form = reactive({
  email: '',
  password: '',
});
const submitting = ref(false);
const errorMessage = ref('');
const authConfig = ref<AuthConfiguration | null>(null);
const authConfigError = ref('');

const passwordLogin = computed(() => supportsPasswordLogin(authConfig.value?.provider));
const ssoOnly = computed(() => isSsoOnlyProvider(authConfig.value?.provider));

async function loadAuthConfig(): Promise<void> {
  try {
    authConfig.value = await fetchAuthConfig();
  } catch (error) {
    authConfigError.value =
      error instanceof Error ? error.message : 'Could not read GET /api/v1/system/config/auth';
  }
}

async function onSubmit(): Promise<void> {
  errorMessage.value = '';
  submitting.value = true;
  try {
    await auth.login(form.email.trim(), form.password);
    const redirect = typeof route.query.redirect === 'string' ? route.query.redirect : '/search';
    await router.replace(redirect);
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : 'Login failed';
  } finally {
    submitting.value = false;
  }
}

onMounted(() => {
  void loadAuthConfig();
});
</script>

<template>
  <div class="login">
    <Card class="login__card">
      <Typography.Title :level="3">SmartMetadata</Typography.Title>
      <Typography.Paragraph type="secondary">
        Sign in against the server login API. The password is Base64-encoded in the request body as
        required by <code>POST /api/v1/users/login</code>.
      </Typography.Paragraph>
      <Alert
        v-if="authConfigError"
        type="warning"
        show-icon
        :message="`Auth provider lookup failed (${authConfigError}). Showing the password form because stock servers use basic login.`"
        class="login__error"
      />
      <Alert
        v-if="ssoOnly"
        data-testid="sso-only-message"
        type="info"
        show-icon
        class="login__error"
        :message="`This server is configured for ${ssoProviderLabel(authConfig?.provider, authConfig?.providerName)} authentication. Username/password login is not available.`"
      >
        <template #description>
          <p>
            The console does not invent an OIDC/SAML browser callback or client secret. Use a JWT from
            your identity provider, or reconfigure the server for basic/LDAP login.
          </p>
          <p v-if="authConfig?.authority">Authority: {{ authConfig.authority }}</p>
          <p v-if="authConfig?.callbackUrl">Callback URL advertised by the server: {{ authConfig.callbackUrl }}</p>
        </template>
      </Alert>
      <Alert
        v-if="errorMessage"
        data-testid="login-error"
        type="error"
        show-icon
        :message="errorMessage"
        class="login__error"
      />
      <Form v-if="passwordLogin" layout="vertical" :model="form" @finish="onSubmit">
        <Form.Item label="Email" name="email" :rules="[{ required: true, message: 'Email is required' }]">
          <Input
            v-model:value="form.email"
            data-testid="login-email"
            autocomplete="username"
            placeholder="admin@open-metadata.org"
          />
        </Form.Item>
        <Form.Item label="Password" name="password" :rules="[{ required: true, message: 'Password is required' }]">
          <Input.Password
            v-model:value="form.password"
            data-testid="login-password"
            autocomplete="current-password"
          />
        </Form.Item>
        <Button
          type="primary"
          html-type="submit"
          block
          :loading="submitting"
          data-testid="login-submit"
        >
          Sign in
        </Button>
      </Form>
    </Card>
  </div>
</template>

<style scoped>
.login {
  min-height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 32px 16px;
}
.login__card {
  width: 100%;
  max-width: 420px;
}
.login__error {
  margin-bottom: 16px;
}
</style>
