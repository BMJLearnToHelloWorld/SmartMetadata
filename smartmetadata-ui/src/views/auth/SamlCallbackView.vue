<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute, useRouter } from 'vue-router';
import { Alert, Button, Card, Spin, Typography } from 'ant-design-vue';
import { fetchAuthConfig } from '@/api/system';
import { useAuthStore } from '@/stores/auth';

/**
 * SAML/OIDC callback page, mirroring official SamlCallback: the
 * id_token is read from the URL hash first (the official
 * getSamlCallbackParams prefers the fragment when it carries
 * id_token), otherwise from the query string; name/email ride along
 * for the profile display only.
 *
 * Deliberate deviation from the official page: when no id_token is
 * present, the official page returns early and stays on a fullscreen
 * loader forever. This page renders an honest error state with a
 * back-to-sign-in button instead.
 *
 * R7: the IdP redirect is now initiated by the login page's SSO button
 * (server-driven /api/v1/auth/login), and a 404 profile with self-signup
 * not disabled routes to the SSO complete-profile page (official
 * AuthProvider 404 -> newUser -> SIGNUP). SDK-based initiation (Okta /
 * MSAL / Auth0) and the IdP configuration itself remain server-side
 * residuals, unverified without a live deployment.
 */
const route = useRoute();
const router = useRouter();
const auth = useAuthStore();
const { t } = useI18n();

const errorMessage = ref('');
const processing = ref(true);

function callbackParams(): URLSearchParams {
  const hash = typeof route.hash === 'string' ? route.hash.replace(/^#/, '') : '';
  const fragment = new URLSearchParams(hash);
  if (fragment.has('id_token')) {
    return fragment;
  }
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(route.query)) {
    if (typeof value === 'string') {
      query.set(key, value);
    }
  }
  return query;
}

onMounted(async () => {
  const params = callbackParams();
  const idToken = params.get('id_token') ?? '';
  if (!idToken) {
    errorMessage.value = t('auth.samlMissingToken');
    processing.value = false;
    return;
  }
  try {
    let enableSelfSignup: boolean | undefined;
    try {
      enableSelfSignup = (await fetchAuthConfig()).enableSelfSignup;
    } catch {
      enableSelfSignup = undefined;
    }
    const outcome = await auth.loginWithOidc(idToken, params.get('email') ?? '', { enableSelfSignup });
    if (outcome === 'needs-signup') {
      await router.replace({ name: 'sso-signup' });
      return;
    }
    const redirect = typeof route.query.redirect === 'string' ? route.query.redirect : '/my-data';
    await router.replace(redirect);
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : t('auth.samlFailed');
    processing.value = false;
  }
});
</script>

<template>
  <div class="auth-page">
    <Card class="auth-page__card">
      <Typography.Title :level="3">{{ t('auth.samlTitle') }}</Typography.Title>
      <div v-if="processing" data-testid="saml-processing">
        <Spin />
        <Typography.Paragraph type="secondary">{{ t('auth.samlProcessing') }}</Typography.Paragraph>
      </div>
      <Alert
        v-if="errorMessage"
        data-testid="saml-error"
        type="error"
        show-icon
        :message="errorMessage"
      />
      <Button v-if="errorMessage" type="primary" block @click="router.push({ name: 'login' })">
        {{ t('auth.backToLogin') }}
      </Button>
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
