<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute, useRouter } from 'vue-router';
import { Alert, Button, Form, Input } from 'ant-design-vue';
import { buildSsoLoginUrl, isSsoOnlyProvider, ssoBrandName, ssoProviderLabel, supportsPasswordLogin } from '@/admin/authProvider';
import { apiBaseUrl } from '@/api/client';
import { requiredField } from '@/features/crud/formRules';
import { fetchAuthConfig } from '@/api/system';
import { setAppLocale } from '@/i18n';
import { useAuthStore } from '@/stores/auth';
import type { AuthConfiguration } from '@/types/admin';
import logoUrl from '@/assets/iqvia-logo.svg';

const router = useRouter();
const route = useRoute();
const auth = useAuthStore();
const { t, locale } = useI18n();

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
const ssoBrand = computed(() =>
  ssoBrandName(authConfig.value?.provider, authConfig.value?.providerName),
);
// Official SignInPage auto-redirect guard: fire at most once per page load.
const autoRedirectFired = ref(false);

/**
 * Re-applied on the dev_ui login card: the SSO sign-in chain and the
 * auto-redirect guard, which the redesign dropped (it kept only the
 * sso-only message). Without these, SSO-only users have no way to sign in.
 */
function startSsoLogin(): void {
  window.location.assign(
    buildSsoLoginUrl(apiBaseUrl(), authConfig.value?.callbackUrl, window.location.origin),
  );
}

async function loadAuthConfig(): Promise<void> {
  try {
    authConfig.value = await fetchAuthConfig();
    if (
      authConfig.value.enableAutoRedirect &&
      ssoOnly.value &&
      !auth.isAuthenticated &&
      !autoRedirectFired.value
    ) {
      autoRedirectFired.value = true;
      startSsoLogin();
    }
  } catch (error) {
    authConfigError.value = error instanceof Error ? error.message : t('login.authConfigMissing');
  }
}

async function onSubmit(): Promise<void> {
  errorMessage.value = '';
  submitting.value = true;
  try {
    await auth.login(form.email.trim(), form.password);
    // No stored redirect means the app entry: resolve through the root
    // route, where PersonaLandingRedirect applies the selected
    // persona's default landing page (official post-sign-in behavior).
    // A stored deep link still wins over the persona landing page.
    const redirect = typeof route.query.redirect === 'string' ? route.query.redirect : '/';
    await router.replace(redirect);
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : t('login.failed');
  } finally {
    submitting.value = false;
  }
}

const nextLocaleLabel = computed(() => (locale.value === 'zh-CN' ? t('chrome.localeEn') : t('chrome.localeZh')));
const localeMark = computed(() => (locale.value.startsWith('zh') ? 'ZH' : 'EN'));

function toggleLocale(): void {
  setAppLocale(locale.value === 'zh-CN' ? 'en-US' : 'zh-CN', locale);
}

onMounted(() => {
  void loadAuthConfig();
});
</script>

<template>
  <div class="login-screen">
    <header class="login__bar">
      <img class="login__logo" :src="logoUrl" alt="iSmart" />
      <button
        type="button"
        data-testid="locale-switcher"
        class="login__locale"
        :aria-label="t('chrome.locale')"
        :title="nextLocaleLabel"
        @click="toggleLocale"
      >
        {{ localeMark }}
      </button>
    </header>

    <div class="login__stage">
      <section class="login__band" :aria-label="t('login.brandHeadline')">
        <h1 class="login__headline">{{ t('login.brandHeadline') }}</h1>
        <p class="login__sub">{{ t('login.brandSub') }}</p>
        <p class="login__foot">{{ t('login.brandFooter') }}</p>
      </section>

      <section class="login__card">
        <h2 class="login__welcome">{{ t('login.welcome') }}</h2>
        <p class="login__lead">{{ t('login.lead') }}</p>

        <Alert
          v-if="authConfigError"
          type="warning"
          show-icon
          :message="t('login.authConfigFailed', { error: authConfigError })"
          class="login__error"
        />
        <Alert
          v-if="ssoOnly"
          data-testid="sso-only-message"
          type="info"
          show-icon
          class="login__error"
          :message="
            t('login.ssoOnly', { provider: ssoProviderLabel(authConfig?.provider, authConfig?.providerName) })
          "
        >
          <template #description>
            <p>{{ t('login.ssoHelp') }}</p>
            <p v-if="authConfig?.authority">{{ t('login.authority', { value: authConfig.authority }) }}</p>
            <p v-if="authConfig?.callbackUrl">{{ t('login.callback', { value: authConfig.callbackUrl }) }}</p>
          </template>
        </Alert>
        <Button
          v-if="ssoOnly && ssoBrand"
          type="primary"
          block
          data-testid="sso-signin"
          class="login__error"
          @click="startSsoLogin"
        >
          {{ t('login.ssoSignIn', { brand: ssoBrand }) }}
        </Button>
        <Alert
          v-if="ssoOnly && !ssoBrand"
          data-testid="sso-unsupported"
          type="warning"
          show-icon
          class="login__error"
          :message="t('login.ssoUnsupported', { provider: ssoProviderLabel(authConfig?.provider, authConfig?.providerName) })"
        />
        <Alert
          v-if="errorMessage"
          data-testid="login-error"
          type="error"
          show-icon
          :message="errorMessage"
          class="login__error"
        />
        <Form v-if="passwordLogin" layout="vertical" :model="form" class="login__form" @finish="onSubmit">
          <Form.Item :label="t('login.email')" name="email" :rules="requiredField(t, t('login.email'))">
            <Input
              v-model:value="form.email"
              data-testid="login-email"
              autocomplete="username"
              :placeholder="t('login.email')"
            />
          </Form.Item>
          <Form.Item name="password" :rules="requiredField(t, t('login.password'))">
            <template #label>
              <span class="login__pw-label">
                <span>{{ t('login.password') }}</span>
                <button
                  type="button"
                  class="login__forgot"
                  data-testid="login-forgot-password"
                  @click="router.push({ name: 'forgot-password' })"
                >
                  {{ t('login.forgot') }}
                </button>
              </span>
            </template>
            <Input.Password
              v-model:value="form.password"
              data-testid="login-password"
              autocomplete="current-password"
              :placeholder="t('login.password')"
            />
          </Form.Item>
          <Button
            type="primary"
            html-type="submit"
            block
            :loading="submitting"
            data-testid="login-submit"
            class="login__submit"
          >
            <span>{{ t('login.submit') }}</span>
          </Button>
        </Form>
        <Button
          v-if="authConfig?.enableSelfSignup && passwordLogin"
          type="link"
          data-testid="login-signup"
          @click="router.push({ name: 'signup' })"
        >
          {{ t('login.signUp') }}
        </Button>
      </section>
    </div>
    <p class="login__legal">{{ t('login.legal') }}</p>
  </div>
</template>

<style scoped>
.login-screen {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  padding: 28px 48px 32px;
  background: var(--sm-home-canvas);
  color: var(--sm-text-primary);
}
.login__bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: min(1080px, 100%);
  margin: 0 auto;
}
.login__logo {
  display: block;
  height: 32px;
  width: auto;
}
.login__locale {
  height: 36px;
  padding: 0 12px;
  border: 0;
  border-radius: 10px;
  background: transparent;
  color: var(--sm-text-secondary);
  font-size: 13px;
  font-weight: 600;
  letter-spacing: 0.06em;
  cursor: pointer;
}
.login__locale:hover {
  background: var(--sm-bg-base);
  color: var(--sm-color-primary);
  box-shadow: var(--sm-shadow-card);
}
.login__stage {
  display: grid;
  flex: 1;
  grid-template-columns: minmax(0, 1fr) 400px;
  align-items: center;
  width: min(1080px, 100%);
  margin: 0 auto;
}
.login__band {
  display: flex;
  flex-direction: column;
  justify-content: flex-start;
  min-height: 460px;
  margin-right: -72px;
  padding: 56px 112px 52px 48px;
  border-radius: 28px;
  background: var(--sm-color-primary);
}
.login__headline {
  margin: 0;
  color: var(--sm-text-on-primary);
  font-size: 44px;
  font-weight: 600;
  line-height: 1.15;
}
.login__sub {
  margin: 14px 0 0;
  color: var(--sm-color-primary-25);
  font-size: 18px;
  line-height: 1.5;
}
.login__foot {
  width: fit-content;
  margin: auto 0 0;
  color: var(--sm-text-on-primary);
  font-size: 12px;
  letter-spacing: 0.2em;
  text-transform: uppercase;
}
.login__foot::before {
  content: '';
  display: block;
  width: 40px;
  height: 3px;
  margin-bottom: 12px;
  border-radius: 1px;
  background: var(--sm-palette-bright-blue);
}
.login__card {
  position: relative;
  z-index: 1;
  box-sizing: border-box;
  width: 100%;
  padding: 32px 28px 28px;
  border-radius: 20px;
  background: var(--sm-bg-base);
  box-shadow: var(--sm-shadow-raised);
}
.login__welcome {
  margin: 0;
  color: var(--sm-text-primary);
  font-size: 22px;
  font-weight: 600;
  line-height: 1.35;
}
.login__lead {
  margin: 8px 0 0;
  color: var(--sm-text-tertiary);
  font-size: 14px;
  line-height: 1.5;
}
.login__error {
  margin-top: 16px;
}
.login__form {
  margin-top: 28px;
}
.login__form :deep(.ant-form-item) {
  margin-bottom: 18px;
}
.login__form :deep(.ant-form-item-label > label) {
  width: 100%;
  height: auto;
  color: var(--sm-text-primary);
  font-size: 14px;
  font-weight: 600;
}
.login__pw-label {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  gap: 12px;
}
.login__forgot {
  flex: 1;
  border: 0;
  padding: 0;
  background: none;
  color: var(--sm-color-primary);
  font-size: 13px;
  font-weight: 500;
  text-align: right;
  cursor: default;
}
.login__form :deep(.ant-input),
.login__form :deep(.ant-input-affix-wrapper) {
  min-height: 48px;
  padding: 12px 14px;
  border: 1px solid var(--sm-home-card-border);
  border-radius: 12px;
  background: var(--sm-bg-base);
  box-shadow: none;
}
.login__form :deep(.ant-input-affix-wrapper > .ant-input) {
  min-height: 0;
  height: auto;
  padding: 0;
  border: 0;
  border-radius: 0;
  background: transparent;
  box-shadow: none;
}
.login__form :deep(.ant-input:hover),
.login__form :deep(.ant-input-affix-wrapper:hover) {
  border-color: var(--sm-color-primary-50);
}
.login__form :deep(.ant-input:focus),
.login__form :deep(.ant-input-focused),
.login__form :deep(.ant-input-affix-wrapper-focused),
.login__form :deep(.ant-input-affix-wrapper:focus-within) {
  border-color: var(--sm-color-primary);
  box-shadow: none;
  outline: none;
}
.login__form :deep(.ant-btn) {
  height: 48px;
  margin-top: 8px;
  border: 0;
  border-radius: 12px;
  background: var(--sm-color-primary);
  font-size: 15px;
  font-weight: 600;
  box-shadow: none;
}
.login__form :deep(.ant-btn-primary:not(:disabled):hover) {
  background: var(--sm-color-primary-hover);
}
.login__legal {
  width: min(1080px, 100%);
  margin: 0 auto;
  color: var(--sm-text-quaternary);
  font-size: 12px;
}
@media (max-width: 1200px) {
  .login-screen {
    padding: 20px 16px 24px;
  }
  .login__stage {
    display: flex;
    flex-direction: column;
    align-items: stretch;
    width: 100%;
    margin-top: 20px;
  }
  .login__band {
    min-height: 0;
    margin-right: 0;
    padding: 36px 24px 88px;
  }
  .login__headline {
    font-size: 32px;
  }
  .login__foot {
    margin-top: 20px;
  }
  .login__card {
    width: 100%;
    margin-top: -64px;
  }
  .login__legal {
    margin-top: 20px;
  }
}
</style>
